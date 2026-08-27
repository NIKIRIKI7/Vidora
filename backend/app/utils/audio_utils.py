import re
import subprocess
import wave
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional

_EMOTION_TAG_RE = re.compile(r"\[emotion:\s*([^\]]+)\]", re.IGNORECASE | re.DOTALL)
_INSTRUCT_TAG_RE = re.compile(r"\[instruct:\s*([^\]]+)\]", re.IGNORECASE | re.DOTALL)
_PAUSE_TAG_RE = re.compile(r"<break\s+time=[\"']?([0-9.]+)s?[\"']?\s*/?>", re.IGNORECASE)
_MINIMAX_EMOTIONS = frozenset({"happy", "sad", "angry", "fearful", "disgusted", "surprised", "calm"})


def split_emotion_tag(text: str) -> Tuple[str, Optional[str]]:
    match = _EMOTION_TAG_RE.search(text)
    if not match:
        return text, None
    clean_text = _EMOTION_TAG_RE.sub("", text).strip()
    emotion = match.group(1).lower()
    return clean_text, emotion if emotion in _MINIMAX_EMOTIONS else None


def extract_instruct_tag(text: str) -> Tuple[str, Optional[str]]:
    match = _INSTRUCT_TAG_RE.search(text)
    if not match:
        return text, None
    return _INSTRUCT_TAG_RE.sub("", text).strip(), match.group(1).strip()


def clean_voice_tags(text: str) -> str:
    if not text:
        return ""
    t = re.sub(r"\*\([\s\S]*?\)\*", " ", text)
    t = _EMOTION_TAG_RE.sub("", t)
    t = _INSTRUCT_TAG_RE.sub("", t)
    t = _PAUSE_TAG_RE.sub(" ", t)
    t = re.sub(r"\([a-z][a-z-]*\)", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def to_s2_text(text: str, design_prompt: Optional[str] = None) -> str:
    t = text or ""
    t = re.sub(r"\*\([\s\S]*?\)\*", " ", t)
    t = _INSTRUCT_TAG_RE.sub(lambda m: f"[{m.group(1).strip()}]", t)
    t = _EMOTION_TAG_RE.sub(lambda m: f"[{m.group(1).strip()}]", t)
    t = _PAUSE_TAG_RE.sub(" ", t)
    t = re.sub(r"\([a-z][a-z-]*\)", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    if design_prompt and design_prompt.strip():
        t = f"[{design_prompt.strip()}] {t}".strip()
    return t


def normalize_words(text: str) -> List[str]:
    clean = clean_voice_tags(text)
    return [w.lower() for w in re.findall(r"[\w\u0400-\u04FF]+", clean) if w.strip()]


def get_audio_duration_sync(path: str | Path) -> float:
    p = str(path)
    try:
        with wave.open(p, "r") as wav:
            return wav.getnframes() / float(wav.getframerate())
    except Exception:
        pass
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", p],
            capture_output=True,
            text=True,
        )
        return float(out.stdout.strip()) if out.stdout.strip() else 0.0
    except Exception:
        return 0.0


def extract_file_number(filename: str) -> Optional[int]:
    """Извлекает первый числовой индекс из имени файла ('voice_01.wav' -> 1, 'intro.wav' -> None)."""
    match = re.search(r"(?:^|[^\d])(\d+)(?:[^\d]|$)", Path(filename).stem)
    return int(match.group(1)) if match else None


def natural_sort_key(s: str) -> list:
    """Ключ естественной сортировки: 1, 2, 10 вместо лексикографических 1, 10, 2."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def map_scene_audio_files(
    scene_ids: List[str], files: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, str]], List[str]]:
    """Сопоставляет аудиофайлы сценам по номерам в имени или естественному порядку.

    files — список {"filename": str, "number": Optional[int]}. Если хоть у одного файла
    есть номер в имени — строгий маппинг (файл #N -> сцена N, 1-based). Иначе файлы
    сортируются естественно и раздаются по порядку сцен 1 к 1.
    Возвращает (matches, unmatched): matches = [{"scene_id", "filename"}].
    """
    if not files or not scene_ids:
        return [], [f["filename"] for f in files]

    has_numbers = any(f.get("number") is not None for f in files)
    matches, used = [], set()

    if has_numbers:
        for idx, scene_id in enumerate(scene_ids):
            target = idx + 1
            f = next(
                (x for x in files if x.get("number") == target and x["filename"] not in used),
                None,
            )
            if f:
                used.add(f["filename"])
                matches.append({"scene_id": scene_id, "filename": f["filename"]})
    else:
        for scene_id, f in zip(scene_ids, sorted(files, key=lambda x: natural_sort_key(x["filename"]))):
            used.add(f["filename"])
            matches.append({"scene_id": scene_id, "filename": f["filename"]})

    unmatched = [f["filename"] for f in files if f["filename"] not in used]
    return matches, unmatched
