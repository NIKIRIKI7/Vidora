"""Сервис управления стоками Pexels, автоматического подбора B-roll и фоновой музыки."""

import json
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Tuple

import httpx

from app.core.config import settings
from app.domain.exceptions import ResourceNotFoundError, SecurityPathViolationError, ProviderExecutionError
from app.domain.schemas.media import AutoBRollRequest, ProcessBRollRequest, DownloadRequest
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.media.ffmpeg import AsyncFFmpegRunner
from app.infrastructure.storage.path_resolver import PathResolver
from app.utils.audio_utils import get_audio_duration_sync


class MediaService:
    AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}

    def __init__(self, llm_gateway: LLMGateway | None = None):
        self.llm_gateway = llm_gateway or LLMGateway()

    async def save_uploaded_media(
            self, project_path: str, folder: str, filename: str, content: bytes
    ) -> Dict[str, Any]:
        safe_folder = PathResolver.sanitize_folder(folder)
        safe_filename = PathResolver.sanitize_filename(filename)

        proj_dir = PathResolver.resolve(project_path) or Path(project_path).resolve()
        dest_dir = proj_dir / "assets" / safe_folder
        safe_dest = PathResolver.resolve(str(dest_dir), must_exist=False) or dest_dir.resolve()

        if not str(safe_dest).startswith(str(proj_dir)):
            raise SecurityPathViolationError("Недопустимый путь сохранения файла")

        safe_dest.mkdir(parents=True, exist_ok=True)
        file_path = safe_dest / safe_filename
        file_path.write_bytes(content)

        duration = 0.0
        if safe_filename.lower().endswith((".mp4", ".mov", ".mkv", ".webm")):
            meta = await AsyncFFmpegRunner.probe_video(file_path)
            duration = meta.get("duration", 0.0)

        return {
            "status": "ok",
            "path": str(file_path),
            "filename": safe_filename,
            "url": f"assets/{safe_folder}/{safe_filename}",
            "duration": round(duration, 3),
        }

    async def normalize_broll(self, req: ProcessBRollRequest) -> Dict[str, Any]:
        source = Path(req.source_path).resolve()
        if not source.exists():
            raise ResourceNotFoundError(f"Исходный B-Roll файл не найден: {source}")

        proj_dir = PathResolver.resolve(req.project_path) or Path(req.project_path).resolve()
        dest_dir = proj_dir / "assets" / "b-roll"
        voice_dir = proj_dir / "assets" / "voice"
        dest_dir.mkdir(parents=True, exist_ok=True)
        voice_dir.mkdir(parents=True, exist_ok=True)

        meta = await AsyncFFmpegRunner.probe_video(source)
        source_dur = meta.get("duration", 0.0)
        target_w, target_h = AsyncFFmpegRunner.get_target_dimensions(
            req.target_resolution, req.target_format
        )
        target_dur = req.target_duration if req.target_duration and req.target_duration > 0 else source_dur
        if target_dur <= 0:
            target_dur = 3.0

        slug = PathResolver.sanitize_filename(req.filename_prefix or "broll")[:30]
        out_filename = f"{slug}_{uuid.uuid4().hex[:6]}.mp4"
        out_filepath = dest_dir / out_filename

        if req.fit_mode == "blur_pad":
            filter_complex = (
                f"[0:v]scale={target_w}:{target_h},boxblur=25:5[bg];"
                f"[0:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease[fg];"
                f"[bg][fg]overlay=(W-w)/2:(H-h)/2[outv]"
            )
        else:
            filter_complex = (
                f"[0:v]scale='if(gt(a,{target_w}/{target_h}),-1,{target_w})':'if(gt(a,{target_w}/{target_h}),{target_h},-1)',"
                f"crop={target_w}:{target_h}[outv]"
            )

        cmd = ["ffmpeg", "-y"]
        if req.loop_if_shorter and source_dur > 0 and target_dur > source_dur:
            cmd.extend(["-stream_loop", "-1"])

        cmd.extend([
            "-ss", "0.0", "-t", str(round(target_dur, 3)), "-i", str(source),
            "-filter_complex", filter_complex, "-map", "[outv]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-g", "15",
            "-keyint_min", "15", "-sc_threshold", "0", "-r", str(req.fps), "-pix_fmt", "yuv420p",
        ])

        if req.keep_audio:
            cmd.extend(["-map", "0:a?", "-c:a", "aac", "-b:a", "192k"])
        else:
            cmd.append("-an")
        cmd.append(str(out_filepath))

        await AsyncFFmpegRunner.run(cmd, desc="B-Roll Normalize")

        extracted_audio_path = None
        if req.extract_audio:
            audio_filename = f"{slug}_audio_{uuid.uuid4().hex[:6]}.wav"
            extracted_audio_path = voice_dir / audio_filename
            audio_cmd = [
                "ffmpeg", "-y", "-ss", "0.0", "-t", str(round(target_dur, 3)),
                "-i", str(source), "-vn", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "1",
                str(extracted_audio_path),
            ]
            try:
                await AsyncFFmpegRunner.run(audio_cmd, desc="B-Roll Extract Audio")
            except Exception:
                extracted_audio_path = None

        final_meta = await AsyncFFmpegRunner.probe_video(out_filepath)
        return {
            "status": "ok",
            "filename": out_filename,
            "relative_path": f"assets/b-roll/{out_filename}",
            "absolute_path": str(out_filepath),
            "duration": round(final_meta.get("duration", target_dur), 3),
            "width": target_w,
            "height": target_h,
            "fps": req.fps,
            "extracted_audio_path": str(extracted_audio_path) if extracted_audio_path else None,
        }

    async def search_pexels_stock(
            self, query: str, per_page: int = 15, orientation: str = "portrait", api_key: str = ""
    ) -> Dict[str, Any]:
        key = api_key or settings.PEXELS_API_KEY
        if not key:
            raise ProviderExecutionError("PEXELS_API_KEY не настроен на сервере и не передан в запросе")

        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(
                f"https://api.pexels.com/videos/search?query={query}&per_page={per_page}&orientation={orientation}",
                headers={"Authorization": key},
            )
            if res.status_code != 200:
                raise ProviderExecutionError(f"Ошибка Pexels API ({res.status_code}): {res.text}")
            return {"status": "ok", "videos": res.json().get("videos", [])}

    async def download_pexels_stock(self, req: DownloadRequest, api_key: str = "") -> Dict[str, Any]:
        key = api_key or settings.PEXELS_API_KEY
        safe_folder = PathResolver.sanitize_folder(req.folder)
        safe_filename = PathResolver.sanitize_filename(req.filename)

        proj_dir = PathResolver.resolve(req.project_path) or Path(req.project_path).resolve()
        dest_dir = proj_dir / "assets" / safe_folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        file_path = dest_dir / safe_filename

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("GET", req.url, headers={"Authorization": key} if key else {}) as response:
                if response.status_code != 200:
                    raise ResourceNotFoundError(f"Не удалось скачать видео со стока ({response.status_code})")
                with open(file_path, "wb") as f:
                    async for chunk in response.aiter_bytes():
                        f.write(chunk)

        meta = await AsyncFFmpegRunner.probe_video(file_path)
        return {
            "status": "ok",
            "path": str(file_path),
            "filename": safe_filename,
            "url": f"assets/{safe_folder}/{safe_filename}",
            "duration": round(meta.get("duration", 0.0), 3),
        }

    async def auto_broll(self, req: AutoBRollRequest) -> Dict[str, Any]:
        """Автоматический подбор и скачивание B-Roll футажей с Pexels на основе анализа сцен через LLM."""
        key = req.api_keys.get("pexels") or settings.PEXELS_API_KEY
        if not key:
            raise ProviderExecutionError("PEXELS_API_KEY не задан")

        proj_dir = PathResolver.resolve(req.project_path) or Path(req.project_path).resolve()
        dest_dir = proj_dir / "assets" / "b-roll"
        dest_dir.mkdir(parents=True, exist_ok=True)

        orientation = "portrait" if req.format == "9:16" else "landscape"
        fragments_payload = []
        for f in req.fragments:
            dur = 3.0
            if f.start_time is not None and f.end_time is not None and f.end_time > f.start_time:
                dur = f.end_time - f.start_time
            elif f.duration and f.duration > 0:
                dur = f.duration
            fragments_payload.append({
                "id": PathResolver.sanitize_filename(f.id),
                "visual_note": f.visual_note,
                "text": f.text,
                "target_duration": round(dur, 2),
            })

        system_prompt = (
            "You are an expert video editor AI. Given a list of scene fragments with visual notes and voiceover text, "
            "extract concise English search keywords (2-4 words) for Pexels video search for each B-Roll fragment. "
            "Return STRICT JSON: {\"results\": [{\"id\": \"...\", \"is_broll\": true, \"query\": \"...\"}]}"
        )
        user_prompt = f"Analyze these scene fragments:\n{json.dumps(fragments_payload, ensure_ascii=False)}"

        gateway = LLMGateway(req.api_keys)
        llm_queries = {}
        try:
            raw_llm = await gateway.generate_text(
                prompt=user_prompt,
                system_prompt=system_prompt,
                engine=req.engine,
                json_mode=True,
            )
            match = re.search(r"\{.*\}", raw_llm or "", re.DOTALL)
            parsed_llm = json.loads(match.group(0)) if match else {"results": []}
            llm_queries = {item["id"]: item for item in parsed_llm.get("results", [])}
        except Exception as e:
            llm_queries = {}

        results = []
        async with httpx.AsyncClient(timeout=30.0) as client:
            for frag in fragments_payload:
                frag_id = frag["id"]
                target_dur = frag["target_duration"]
                query_info = llm_queries.get(frag_id, {})

                if query_info.get("is_broll") is False:
                    results.append(
                        {"fragment_id": frag_id, "matched": False, "reason": "Классифицировано как non-broll"})
                    continue

                query = query_info.get("query")
                if not query:
                    clean_note = re.sub(r"[\*\(\)]", "", frag["visual_note"])
                    clean_note = re.sub(r"^(B-roll|Экран|Фон|Визуал):\s*", "", clean_note, flags=re.IGNORECASE)
                    query = clean_note[:40].strip()

                if not query:
                    results.append({"fragment_id": frag_id, "matched": False, "reason": "Пустой поисковый запрос"})
                    continue

                try:
                    search_res = await client.get(
                        f"https://api.pexels.com/videos/search?query={query}&per_page=5&orientation={orientation}",
                        headers={"Authorization": key},
                    )
                    if search_res.status_code != 200:
                        results.append({"fragment_id": frag_id, "matched": False,
                                        "reason": f"Ошибка Pexels {search_res.status_code}"})
                        continue

                    videos = search_res.json().get("videos", [])
                    if not videos:
                        results.append(
                            {"fragment_id": frag_id, "matched": False, "reason": f"Нет видео по запросу '{query}'"})
                        continue

                    best_video = videos[0]
                    video_files = best_video.get("video_files", [])
                    chosen_link = next(
                        (vf.get("link") for vf in video_files if vf.get("width") == 1920 or vf.get("height") == 1920),
                        video_files[0].get("link") if video_files else None,
                    )

                    if not chosen_link:
                        results.append(
                            {"fragment_id": frag_id, "matched": False, "reason": "Нет прямой ссылки на файл"})
                        continue

                    clean_slug = PathResolver.sanitize_filename(re.sub(r"[^a-zA-Z0-9]", "_", query)[:20])
                    final_filename = f"broll_{clean_slug}_{uuid.uuid4().hex[:6]}.mp4"
                    final_filepath = dest_dir / final_filename

                    # Прямая нарезка видеопотока через FFmpeg
                    trim_cmd = [
                        "ffmpeg", "-y", "-ss", "0.0", "-t", str(target_dur),
                        "-i", chosen_link, "-c:v", "libx264", "-preset", "veryfast",
                        "-crf", "20", "-an", str(final_filepath),
                    ]
                    await AsyncFFmpegRunner.run(trim_cmd, desc="Auto B-Roll Stream Trim")

                    if final_filepath.exists() and final_filepath.stat().st_size > 1000:
                        results.append({
                            "fragment_id": frag_id,
                            "matched": True,
                            "query_used": query,
                            "filename": final_filename,
                            "file_path": str(final_filepath),
                            "trimmed_duration": target_dur,
                            "preview_image": best_video.get("image"),
                        })
                    else:
                        results.append(
                            {"fragment_id": frag_id, "matched": False, "reason": "FFmpeg trim не создал файл"})
                except Exception as frag_err:
                    results.append({"fragment_id": frag_id, "matched": False, "reason": str(frag_err)})

        return {"status": "ok", "results": results}

    def scan_music_library(self, project_path: str = "") -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        categories = []
        music_dir = settings.BASE_DIR / "assets" / "music"
        if music_dir.exists():
            for sub in sorted(music_dir.iterdir()):
                if not sub.is_dir():
                    continue
                tracks = []
                for f in sorted(sub.iterdir()):
                    if f.is_file() and f.suffix.lower() in self.AUDIO_EXTENSIONS:
                        tracks.append({
                            "id": f.stem,
                            "name": f.stem.replace("_", " ").title(),
                            "duration": get_audio_duration_sync(str(f)),
                            "path": f"assets/music/{sub.name}/{f.name}",
                            "is_custom": False,
                        })
                if tracks:
                    categories.append({
                        "category": sub.name,
                        "category_title": sub.name.replace("_", " ").title(),
                        "tracks": tracks,
                    })

        custom_tracks = []
        if project_path:
            p_music = Path(project_path) / "assets" / "music"
            if p_music.is_dir():
                for f in sorted(p_music.iterdir()):
                    if f.is_file() and f.suffix.lower() in self.AUDIO_EXTENSIONS:
                        custom_tracks.append({
                            "id": f"custom_{f.name}",
                            "name": f.name,
                            "duration": get_audio_duration_sync(str(f)),
                            "path": str(f),
                            "is_custom": True,
                        })

        return categories, custom_tracks
