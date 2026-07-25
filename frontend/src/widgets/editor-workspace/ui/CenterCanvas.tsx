import React, { useEffect } from 'react'
import type { ProjectSettings, Scene } from '@entities/project'
import { Button, Icon, Spinner, ProgressBar } from '@shared/ui'
import { API } from '../lib/helpers'

interface Props {
  centerView: 'player' | 'code'
  onChangeView: (view: 'player' | 'code') => void
  playWithAudio: boolean
  onTogglePlayWithAudio: () => void
  playingTargetId: string | null
  renderedVideos: Record<string, string>
  audioLoaded: string | null
  activeScene: Scene | undefined
  project: ProjectSettings
  videoRef: React.RefObject<HTMLVideoElement | null>
  audioRef: React.RefObject<HTMLAudioElement | null>
  onUpdateCode: (code: string) => void
  isRendering: boolean
  renderType: 'scene' | 'project' | null
  isAutoPipelineRunning: boolean
  pipelineStep: string
  renderProgress: number
  onCancelAll: () => void
  isMerging?: boolean
}

export const CenterCanvas = ({
  centerView,
  onChangeView,
  playWithAudio,
  onTogglePlayWithAudio,
  playingTargetId,
  renderedVideos,
  audioLoaded,
  activeScene,
  videoRef,
  audioRef,
  onUpdateCode,
  isRendering,
  renderType,
  isAutoPipelineRunning,
  pipelineStep,
  renderProgress,
  onCancelAll,
  isMerging,
}: Props) => {
  const isBusy = isRendering || isAutoPipelineRunning || isMerging
  const hasRenderedVideo = Boolean(playingTargetId && renderedVideos[playingTargetId])
  const shouldRenderAudio = Boolean(audioLoaded && !hasRenderedVideo)

  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio || !shouldRenderAudio) return

    const handlePlay = () => { if (playWithAudio) audio.play().catch(() => {}) }
    const handlePause = () => audio.pause()
    const handleSeek = () => { audio.currentTime = video.currentTime }
    const handleVolumeChange = () => { audio.volume = playWithAudio ? 1 : 0 }

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('seeked', handleSeek)
    video.addEventListener('volumechange', handleVolumeChange)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('seeked', handleSeek)
      video.removeEventListener('volumechange', handleVolumeChange)
    }
  }, [shouldRenderAudio, playWithAudio, playingTargetId, videoRef, audioRef])

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-hidden">
      <div className="h-12 border-b border-white/5 flex items-center px-4 justify-between bg-surface-container-lowest/50">
        <div className="flex gap-2">
          <button
            onClick={() => onChangeView('player')}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${centerView === 'player' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}
          >
            🎬 Предпросмотр Видео
          </button>
          <button
            onClick={() => onChangeView('code')}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${centerView === 'code' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}
          >
            💻 Remotion TSX Код
          </button>
        </div>
        {centerView === 'player' && (
          <Button
            variant="ghost"
            icon={playWithAudio ? 'volume_up' : 'volume_off'}
            onClick={onTogglePlayWithAudio}
            className="text-xs"
          >
            {playWithAudio ? 'Звук: Вкл' : 'Звук: Выкл'}
          </Button>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-6 overflow-y-auto custom-scrollbar">
        {isBusy ? (
          <div className="w-full max-w-[840px] aspect-video bg-black rounded-xl border border-white/10 shadow-2xl flex flex-col items-center justify-center gap-6 p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-50"></div>
            <Spinner className="text-[64px]" />
            <div className="text-center z-10 flex flex-col items-center">
              <h2 className="text-2xl font-semibold text-white mb-2">
                {isAutoPipelineRunning ? pipelineStep || 'Сборка проекта...' : isMerging ? 'Объединение аудио и видео...' : 'Рендеринг проекта...'}
              </h2>
              <p className="text-on-surface-variant text-sm mb-6">Пожалуйста, подождите. Это может занять некоторое время.</p>
              {isRendering && <ProgressBar progress={renderProgress} className="w-64 mb-6" />}
              <Button variant="dashed" className="border-error/50 text-error hover:bg-error/10" onClick={onCancelAll}>
                Отменить процесс
              </Button>
            </div>
          </div>
        ) : centerView === 'player' ? (
          <div className="w-full max-w-[840px] aspect-video bg-black rounded-xl border border-white/10 shadow-2xl relative flex items-center justify-center overflow-hidden">
            {renderedVideos[playingTargetId || ''] ? (
              <video
                ref={videoRef}
                src={`${API}/api/v1/render/media?path=${encodeURIComponent(renderedVideos[playingTargetId || ''])}`}
                controls
                autoPlay={!playWithAudio}
                muted={!playWithAudio}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-on-surface-variant/50 font-medium flex flex-col items-center gap-3">
                <Icon name="movie" className="text-[56px] text-primary/40" />
                <span>Нажмите «Сгенерировать всё» или «Рендер всего проекта» для сборки</span>
              </div>
            )}

            {shouldRenderAudio && (
              <audio
                ref={audioRef}
                src={`${API}/api/v1/render/media?path=${encodeURIComponent(audioLoaded!)}`}
                className="hidden"
              />
            )}
          </div>
        ) : (
          <div className="w-full h-full max-w-[900px] flex flex-col gap-2">
            {activeScene?.ignoreTsx ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-black border border-white/10 rounded-xl text-on-surface-variant/60 font-mono text-sm gap-2">
                <Icon name="block" className="text-[32px] text-error" />
                <span>Сцена помечена как «Игнорировать TSX»</span>
                <span className="text-xs opacity-60">При рендере будет отображаться черный экран</span>
              </div>
            ) : (
              <textarea
                className="w-full h-full font-mono text-[12px] bg-surface-container-lowest/60 border border-white/10 p-4 rounded-xl text-on-surface resize-none outline-none focus:border-primary/50"
                value={activeScene?.remotionCode || ''}
                onChange={e => onUpdateCode(e.target.value)}
                placeholder="// TSX Код сцены..."
                spellCheck={false}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
