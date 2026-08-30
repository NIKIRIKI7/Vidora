"""Сервис запуска пайплайна видеомонтажа (Remotion), дакинга и сборки проекта."""

import asyncio
import io
import os
import shutil
import zipfile
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.core.logging import add_log
from app.core.ws import ws_manager
from app.domain.schemas.render import RenderRequest, VideoConcatRequest, ExportRequest
from app.infrastructure.media.ducking import mix_voice_and_music_ducking
from app.infrastructure.remotion.widgets_registry import WidgetRegistry
from app.infrastructure.media.ffmpeg import AsyncFFmpegRunner
from app.infrastructure.remotion.asset_collector import prepare_remotion_public_assets
from app.infrastructure.remotion.runner import RemotionRunner
from app.infrastructure.remotion.tsx_sanitizer import sanitize_tsx_for_missing_assets
from app.infrastructure.storage.path_resolver import PathResolver


class RenderService:
    def __init__(self, remotion_runner: Optional[RemotionRunner] = None):
        self.runner = remotion_runner or RemotionRunner()

    def write_scene_file(self, tsx_code: str) -> Path:
        scene_file = settings.REMOTION_DIR / "src" / "scenes" / "current.tsx"
        scene_file.parent.mkdir(parents=True, exist_ok=True)
        safe_code = sanitize_tsx_for_missing_assets(tsx_code)
        scene_file.write_text(safe_code, encoding="utf-8")
        return scene_file

    async def mux_audio_video(self, video_path: Path, audio_path: Path, output_path: Path) -> Path:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-i", str(audio_path),
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-shortest", str(output_path),
        ]
        await AsyncFFmpegRunner.run(cmd, desc="Mux Audio Video")
        return output_path

    def save_rendered_artifact(
            self, source_file: Path, project_path: str, target: str, target_id: str
    ) -> Path:
        proj_dir = PathResolver.resolve(project_path) or Path(project_path)
        dest_dir = proj_dir / ("preview" if target == "project" else "assets/a-roll")
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_file = dest_dir / f"{PathResolver.sanitize_filename(target_id)}.mp4"
        shutil.copy2(source_file, dest_file)
        return dest_file

    def cleanup_artifacts(self, *paths: Optional[Path]) -> None:
        for p in paths:
            if p and p.exists():
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass

    async def execute_render_pipeline(self, task_id: str, req: RenderRequest) -> Path:
        temp_video = settings.REMOTION_DIR / "out" / f"{task_id}.mp4"
        merged_video = settings.REMOTION_DIR / "out" / f"{task_id}_merged.mp4"
        ducked_wav = settings.REMOTION_DIR / "out" / f"{task_id}_ducked.wav"

        add_log("INFO", "RENDER", f"Старт рендера [{task_id}] (Target: {req.target_id})")
        try:
            WidgetRegistry.sync_filesystem()

            scene_file = settings.REMOTION_DIR / "src" / "scenes" / "current.tsx"
            if req.tsx_code:
                self.write_scene_file(req.tsx_code)

            proj_dir = PathResolver.resolve(req.project_path) or settings.BASE_DIR / req.project_path
            await asyncio.to_thread(
                prepare_remotion_public_assets,
                proj_dir / "assets",
                req.broll_sources,
                req.tsx_code,
            )

            await self.runner.run(task_id, req, scene_file, temp_video)
            final_source = temp_video

            resolved_audio = (
                PathResolver.resolve(req.audio_path, req.project_path, must_exist=True)
                if req.audio_path
                else None
            )

            if resolved_audio and resolved_audio.exists():
                audio_to_merge = resolved_audio
                if req.background_music and req.background_music.enabled:
                    music_file = req.background_music.custom_track_path
                    if not music_file and req.background_music.track_id:
                        music_file = f"assets/music/{req.background_music.track_id}.mp3"
                    music_path = (
                        PathResolver.resolve(music_file or "", req.project_path, must_exist=True)
                        if music_file
                        else None
                    )
                    if music_path and music_path.exists():
                        try:
                            audio_to_merge = await mix_voice_and_music_ducking(
                                voice_path=resolved_audio,
                                music_path=music_path,
                                output_path=ducked_wav,
                                settings=req.background_music,
                            )
                        except Exception as duck_err:
                            add_log("WARN", "RENDER", f"Сбой наложения музыки: {duck_err}")

                await self.mux_audio_video(temp_video, audio_to_merge, merged_video)
                if merged_video.exists():
                    final_source = merged_video

            dest_file = self.save_rendered_artifact(
                final_source, req.project_path, req.target, req.target_id
            )
            add_log("SUCCESS", "RENDER", f"Рендер готов [{task_id}]: {dest_file.name}")
            await ws_manager.broadcast({
                "type": "RENDER_PROGRESS",
                "payload": {
                    "task_id": task_id,
                    "progress": 100,
                    "status": "done",
                    "target_id": req.target_id,
                    "target": req.target,
                    "output_path": str(dest_file),
                },
            })
            return dest_file
        except Exception as e:
            add_log("ERROR", "RENDER", f"Ошибка пайплайна рендера [{task_id}]: {str(e)}")
            await ws_manager.broadcast({
                "type": "RENDER_PROGRESS",
                "payload": {"task_id": task_id, "progress": 100, "status": "error", "error": str(e)},
            })
            raise
        finally:
            self.cleanup_artifacts(temp_video, merged_video, ducked_wav)

    async def concat_videos(self, req: VideoConcatRequest) -> str:
        out_path = Path(req.output_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        list_file = out_path.with_suffix(".list.txt")

        try:
            with open(list_file, "w", encoding="utf-8") as f:
                for p in req.video_paths:
                    abs_p = PathResolver.resolve(p, req.project_path, must_exist=True)
                    if abs_p and abs_p.exists():
                        f.write(f"file '{str(abs_p).replace(os.sep, '/')}'\n")

            try:
                await AsyncFFmpegRunner.run(
                    ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c:v", "copy", "-c:a", "aac",
                     "-b:a", "192k", str(out_path)],
                    desc="Concat Videos (Copy)",
                )
            except Exception:
                await AsyncFFmpegRunner.run(
                    ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c:v", "libx264", "-c:a",
                     "aac", "-b:a", "192k", str(out_path)],
                    desc="Concat Videos (Re-encode)",
                )
            return str(out_path)
        finally:
            if list_file.exists():
                list_file.unlink(missing_ok=True)

    async def export_project_zip(self, req: ExportRequest) -> io.BytesIO:
        def _zip():
            proj_dir = PathResolver.resolve(req.project_name) or settings.BASE_DIR / req.project_name
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                zip_file.writestr("SCENARIO.md", req.markdown)
                for folder in ["assets/a-roll", "assets/b-roll", "assets/voice", "code/a-roll", "music", "preview",
                               "out"]:
                    zip_file.writestr(zipfile.ZipInfo(folder + "/"), "")
                if proj_dir.exists():
                    for root, _, files in os.walk(proj_dir):
                        for file in files:
                            file_p = Path(root) / file
                            arcname = file_p.relative_to(proj_dir)
                            zip_file.write(file_p, str(arcname))
            zip_buffer.seek(0)
            return zip_buffer

        return await asyncio.to_thread(_zip)
