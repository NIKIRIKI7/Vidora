"""Модуль word-level распознавания (faster-whisper) и выравнивания таймингов фрагментов."""

import difflib
import gc
import time
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.domain.schemas.audio import SyncFragment
from app.utils.audio_utils import normalize_words


class WhisperModelCache:
    _model = None
    _model_name: Optional[str] = None
    _engine: Optional[str] = None
    _last_used: float = 0.0

    @classmethod
    def get_model(cls, model_name: str):
        cls._last_used = time.time()
        if cls._model is not None and cls._model_name == model_name:
            return cls._model, cls._engine

        cls.unload()
        cls._model_name = model_name

        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"

        # Приоритет 1: faster-whisper (CTranslate2 — стандарт проекта, чистые wheels под Windows)
        try:
            from faster_whisper import WhisperModel
            cls._model = WhisperModel(
                model_name,
                device=device,
                compute_type=compute_type,
                download_root=str(settings.AI_MODELS_DIR),
            )
            cls._engine = "faster-whisper"
            return cls._model, cls._engine
        except ImportError:
            pass

        # Приоритет 2: whisperx (только если случайно установлен в окружении)
        try:
            import whisperx
            cls._model = whisperx.load_model(
                model_name,
                device=device,
                compute_type=compute_type,
                download_root=str(settings.AI_MODELS_DIR),
            )
            cls._engine = "whisperx"
            return cls._model, cls._engine
        except ImportError:
            raise ImportError(
                "Движок транскрипции не найден. Установите faster-whisper: pip install faster-whisper"
            )

    @classmethod
    def transcribe_words(
        cls, audio_path: str, model_name: str = "small", language: str = "ru"
    ) -> List[Dict[str, Any]]:
        """Возвращает слова с таймингами [{'word', 'start', 'end'}]."""
        model, engine = cls.get_model(model_name)
        cls.touch()
        reco: List[Dict[str, Any]] = []

        if engine == "faster-whisper":
            segments, _ = model.transcribe(
                str(audio_path),
                word_timestamps=True,
                language=language,
                vad_filter=True,
            )
            for seg in segments:
                if hasattr(seg, "words") and seg.words:
                    for w in seg.words:
                        if w.start is not None and w.end is not None:
                            reco.append({"word": w.word, "start": float(w.start), "end": float(w.end)})
        elif engine == "whisperx":
            import whisperx
            audio_arr = whisperx.load_audio(str(audio_path))
            res = model.transcribe(audio_arr, batch_size=8, language=language)
            for seg in res.get("segments", []):
                for w in seg.get("words", []):
                    if "start" in w and "end" in w:
                        reco.append({"word": w.get("word", ""), "start": float(w["start"]), "end": float(w["end"])})

        return reco

    @classmethod
    def transcribe_text(
        cls, audio_path: str, model_name: str = "small", language: str = "ru"
    ) -> str:
        """Возвращает сплошной текст транскрипции аудиофайла."""
        model, engine = cls.get_model(model_name)
        cls.touch()

        if engine == "faster-whisper":
            segments, _ = model.transcribe(
                str(audio_path),
                language=language,
                vad_filter=True,
            )
            return " ".join(seg.text.strip() for seg in segments if seg.text).strip()
        elif engine == "whisperx":
            import whisperx
            audio_arr = whisperx.load_audio(str(audio_path))
            res = model.transcribe(audio_arr, batch_size=8, language=language)
            return " ".join(seg.get("text", "").strip() for seg in res.get("segments", [])).strip()

        return ""

    @classmethod
    def touch(cls) -> None:
        cls._last_used = time.time()

    @classmethod
    def unload(cls) -> None:
        if cls._model is not None:
            del cls._model
        cls._model = None
        cls._model_name = None
        cls._engine = None
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass


def align_fragments_globally(
        fragments: List[SyncFragment], recognized_words: list, audio_dur: float
) -> List[Dict[str, Any]]:
    if not recognized_words:
        return make_fallback_response(fragments, audio_dur)

    frag_word_lists = [normalize_words(f.text) for f in fragments]
    script_words = []
    frag_ranges = []
    for wlist in frag_word_lists:
        start_idx = len(script_words)
        script_words.extend(wlist)
        frag_ranges.append((start_idx, len(script_words)))

    if not script_words:
        return make_fallback_response(fragments, audio_dur)

    reco_texts = []
    for w in recognized_words:
        nw = normalize_words(w.get("word", ""))
        reco_texts.append(nw[0] if nw else w.get("word", "").lower().strip())

    sm = difflib.SequenceMatcher(None, script_words, reco_texts)
    matching_blocks = sm.get_matching_blocks()
    script_to_reco = {}
    for i_block, j_block, size in matching_blocks:
        for offset in range(size):
            script_to_reco[i_block + offset] = recognized_words[j_block + offset]

    raw_timings = []
    for k, (s_start, s_end) in enumerate(frag_ranges):
        matched = [script_to_reco[i] for i in range(s_start, s_end) if i in script_to_reco]
        st = matched[0]["start"] if matched else None
        et = matched[-1]["end"] if matched else None
        raw_timings.append(
            {"id": fragments[k].id, "st": st, "et": et, "word_count": max(1, s_end - s_start)}
        )

    n = len(raw_timings)
    for i in range(n):
        if raw_timings[i]["st"] is None:
            prev_t = 0.0
            for prev_i in range(i - 1, -1, -1):
                if raw_timings[prev_i]["et"] is not None:
                    prev_t = raw_timings[prev_i]["et"]
                    break
            next_t = (
                audio_dur
                if audio_dur > 0
                else (prev_t + sum(raw_timings[x]["word_count"] * 0.4 for x in range(i, n)))
            )
            next_idx = n
            for next_i in range(i + 1, n):
                if raw_timings[next_i]["st"] is not None:
                    next_t = raw_timings[next_i]["st"]
                    next_idx = next_i
                    break

            missing_words = sum(raw_timings[x]["word_count"] for x in range(i, next_idx))
            avail_dur = max(0.5 * (next_idx - i), next_t - prev_t)
            curr_pos = prev_t
            for x in range(i, next_idx):
                frac = raw_timings[x]["word_count"] / float(max(1, missing_words))
                dur = avail_dur * frac
                raw_timings[x]["st"] = curr_pos
                raw_timings[x]["et"] = curr_pos + dur
                curr_pos += dur

    final_results = []
    cur_end = 0.0
    for idx, item in enumerate(raw_timings):
        st = max(cur_end, item["st"] if item["st"] is not None else cur_end)
        et = item["et"] if item["et"] is not None else (st + item["word_count"] * 0.4)
        if et <= st:
            et = st + max(0.5, item["word_count"] * 0.35)
        if idx == 0 and st < 0.4:
            st = 0.0
        if idx == n - 1 and audio_dur > 0:
            et = max(et, audio_dur)
        final_results.append(
            {"id": item["id"], "startTime": round(st, 3), "endTime": round(et, 3)}
        )
        cur_end = et

    return final_results


def make_fallback_response(
        fragments: List[SyncFragment], audio_dur: float
) -> List[Dict[str, Any]]:
    results, cur_time = [], 0.0
    total_words = sum(max(1, len(normalize_words(f.text))) for f in fragments)
    for idx, frag in enumerate(fragments):
        words_count = max(1, len(normalize_words(frag.text)))
        dur = (
            audio_dur * (words_count / total_words)
            if audio_dur > 0 and total_words > 0
            else max(words_count * 0.4, 1.0)
        )
        end_time = cur_time + dur
        if idx == len(fragments) - 1 and audio_dur > 0:
            end_time = max(end_time, audio_dur)
        results.append(
            {"id": frag.id, "startTime": round(cur_time, 3), "endTime": round(end_time, 3)}
        )
        cur_time = end_time
    return results
