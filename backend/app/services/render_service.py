"""Пайплайн видеомонтажа Remotion: изолированные entrypoint'ы, очередь рендера, дакинг, сборка."""

import asyncio
import io
import os
import shutil
import time
import zipfile
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.core.gpu import GPUManager
from app.core.logging import add_log
from app.core.ws import ws_manager
from app.domain.schemas.render import RenderRequest, VideoConcatRequest, ExportRequest
from app.infrastructure.media.ducking import mix_voice_and_music_ducking
from app.infrastructure.media.ffmpeg import AsyncFFmpegRunner
from app.infrastructure.remotion.asset_collector import isolate_task_assets
from app.infrastructure.remotion.runner import RemotionRunner, composition_id
from app.infrastructure.remotion.tsx_sanitizer import (
    namespace_static_file_paths,
    sanitize_tsx_for_missing_assets,
)
from app.infrastructure.storage.path_resolver import PathResolver
from app.services.render_task_manager import RenderTaskManager

_ENTRY_TEMPLATE = r"""import React from 'react';
import { registerRoot, Composition } from 'remotion';
import '../../style.css';
import * as JobScene from './scene';

class SceneErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || String(error) };
  }

  componentDidCatch(error: Error) {
    console.error('[Job Scene] Render crash caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            background: '#12071f',
            color: '#fecaca',
            fontFamily: 'sans-serif',
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Ошибка рендера сцены</div>
          <div
            style={{
              maxWidth: '70%',
              padding: '8px 14px',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'monospace',
              wordBreak: 'break-word',
            }}
          >
            {this.state.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SceneComponent: React.FC = (props) => {
  const m = JobScene as any;
  const Component =
    m.default || m.Scene ||
    Object.values(m).find((v) => typeof v === 'function') ||
    (() => null);
  return (
    <SceneErrorBoundary>
      <Component {...props} />
    </SceneErrorBoundary>
  );
};

export const JobRoot: React.FC = () => {
  return (
    <Composition
      id="__TASK_ID__"
      component={SceneComponent}
      calculateMetadata={async () => {
        const m = JobScene as any;
        const cfg = m.compositionConfig || {};
        const props = m.default || {};
        const vertical = !!(cfg.isVertical ?? m.isVertical ?? props.isVertical);
        const durationInFrames = cfg.durationInFrames ?? props.durationInFrames ?? 300;
        const fps = cfg.fps ?? 30;
        const width = cfg.width ?? (vertical ? 1080 : 1920);
        const height = cfg.height ?? (vertical ? 1920 : 1080);
        return { durationInFrames, fps, width, height };
      }}
    />
  );
};

registerRoot(JobRoot);
"""


class RenderService:
    def __init__(self, remotion_runner: Optional[RemotionRunner] = None):
        self.runner = remotion_runner or RemotionRunner()

    # ---------- Изоляция entrypoint и ассетов ----------

    @staticmethod
    def _job_dirs(task_id: str) -> tuple[Path, Path]:
        job_dir = settings.REMOTION_DIR / "src" / "jobs" / task_id
        job_public = settings.REMOTION_DIR / "public" / "jobs" / task_id
        return job_dir, job_public

    def create_job_entrypoint(self, task_id: str, req: RenderRequest, proj_dir: Path) -> Path:
        """Генерирует изолированный root-файл src/jobs/{task_id}/index.tsx без правки index.ts."""
        job_dir, _ = self._job_dirs(task_id)
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
        job_dir.mkdir(parents=True, exist_ok=True)

        ns_code = namespace_static_file_paths(req.tsx_code, task_id)
        job_public = isolate_task_assets(
            task_id, ns_code, proj_dir / "assets", req.broll_sources
        )
        safe_code = sanitize_tsx_for_missing_assets(
            ns_code, public_dir=settings.REMOTION_DIR / "public"
        )

        (job_dir / "scene.tsx").write_text(safe_code, encoding="utf-8")
        entry = job_dir / "index.tsx"
        entry.write_text(
            _ENTRY_TEMPLATE.replace("__TASK_ID__", composition_id(task_id)),
            encoding="utf-8",
        )
        return entry

    @staticmethod
    def cleanup_task_artifacts(task_id: str, *paths: Optional[Path]) -> None:
        """Удаляет изолированные entrypoint, namespace ассетов и временные файлы задачи."""
        job_dir, job_public = RenderService._job_dirs(task_id)
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
        if job_public.exists():
            shutil.rmtree(job_public, ignore_errors=True)
        for p in paths:
            if p and p.exists():
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass

    # ---------- Аудио/финальный артефакт ----------

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

    # ---------- Пайплайн ----------

    async def execute_render_pipeline(self, task_id: str, req: RenderRequest) -> Path:
        temp_video = settings.REMOTION_DIR / "out" / f"{task_id}_raw.mp4"
        merged_video = settings.REMOTION_DIR / "out" / f"{task_id}_merged.mp4"
        ducked_wav = settings.REMOTION_DIR / "out" / f"{task_id}_ducked.wav"
        job_entry_file: Optional[Path] = None

        proj_dir = PathResolver.resolve(req.project_path) or (settings.BASE_DIR / req.project_path)

        def _status(status: str, progress: int = 0, **kwargs) -> None:
            RenderTaskManager.set_status(
                task_id, status, progress, target_id=req.target_id, target=req.target, **kwargs
            )

        total_started = time.time()
        add_log("INFO", "RENDER", f"Старт изолированного рендера [{task_id}] (Target: {req.target_id})")
        try:
            # 1. Изолированные entrypoint + ассеты (копирование в public/jobs/{task_id})
            prep_started = time.time()
            job_entry_file = await asyncio.to_thread(
                self.create_job_entrypoint, task_id, req, proj_dir
            )
            _status("rendering", 0)
            prep_sec = round(time.time() - prep_started, 2)

            # 2. Очистка VRAM перед захватом GPU Chromium'ом
            GPUManager.clean_memory()

            # 3. Remotion под семафором (статус "queued", пока ждёт слота)
            def _started(tid: str) -> None:
                RenderTaskManager.set_status(
                    tid, "rendering", 0, target_id=req.target_id, target=req.target
                )

            def _progress(tid: str, status: str, progress: int) -> None:
                RenderTaskManager.set_status(
                    tid, status, progress, target_id=req.target_id, target=req.target
                )

            render_started = time.time()
            await self.runner.run(
                task_id, req, job_entry_file, temp_video,
                on_started=_started, on_progress=_progress,
            )
            render_sec = round(time.time() - render_started, 1)

            final_source = temp_video

            # 4. Наложение аудио / ducking
            resolved_audio = (
                PathResolver.resolve(req.audio_path, req.project_path, must_exist=True)
                if req.audio_path
                else None
            )

            if resolved_audio and resolved_audio.exists():
                _status("muxing", 100)
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

            # 5. Сохранение артефакта в проект
            dest_file = self.save_rendered_artifact(
                final_source, req.project_path, req.target, req.target_id
            )
            total_sec = round(time.time() - total_started, 1)
            add_log(
                "SUCCESS", "RENDER",
                f"Рендер готов [{task_id}] за {total_sec}s (prep {prep_sec}s, remotion {render_sec}s): {dest_file.name}",
            )
            _status("done", 100, output_path=str(dest_file))
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
            _status("error", 100, error=str(e))
            add_log("ERROR", "RENDER", f"Ошибка пайплайна рендера [{task_id}]: {str(e)}")
            await ws_manager.broadcast({
                "type": "RENDER_PROGRESS",
                "payload": {"task_id": task_id, "progress": 100, "status": "error", "error": str(e)},
            })
            raise
        finally:
            self.cleanup_task_artifacts(task_id, temp_video, merged_video, ducked_wav)

    # ---------- Конкатенация и экспорт ----------

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
