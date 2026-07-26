import React, { useEffect, useState } from 'react'
import type { ProjectSettings, Scene, VideoFormat } from '@entities/project'
import { Button, Icon, Spinner, ProgressBar } from '@shared/ui'
import { API } from '../lib/helpers'

interface Props {
  centerView: 'player' | 'code' | 'markdown'
  previewFormat: VideoFormat | null
  onChangeView: (view: 'player' | 'code' | 'markdown') => void
  onPreviewFormatChange: (format: VideoFormat | null) => void
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
  onCodeHistory: (step: number) => void
  isRendering: boolean
  isAutoPipelineRunning: boolean
  pipelineStep: string
  renderProgress: number
  onCancelAll: () => void
  onUpdateMarkdown: (md: string) => void
}

export const CenterCanvas = ({
  centerView,
  previewFormat,
  onChangeView,
  onPreviewFormatChange,
  playWithAudio,
  onTogglePlayWithAudio,
  playingTargetId,
  renderedVideos,
  audioLoaded,
  activeScene,
  project,
  videoRef,
  audioRef,
  onUpdateCode,
  onCodeHistory,
  isRendering,
  isAutoPipelineRunning,
  pipelineStep,
  renderProgress,
  onCancelAll,
  onUpdateMarkdown,
}: Props) => {
  const isBusy = isRendering || isAutoPipelineRunning
  const hasRenderedVideo = Boolean(playingTargetId && renderedVideos[playingTargetId])
  const shouldRenderAudio = Boolean(audioLoaded && !hasRenderedVideo)

  const [localMd, setLocalMd] = useState(project.rawMarkdown)
  const [prevProjectMd, setPrevProjectMd] = useState(project.rawMarkdown)
  const currentFormat = previewFormat || project.format
  
  if (project.rawMarkdown !== prevProjectMd) {
    setLocalMd(project.rawMarkdown)
    setPrevProjectMd(project.rawMarkdown)
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (localMd !== project.rawMarkdown) {
        onUpdateMarkdown(localMd)
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [localMd, project.rawMarkdown, onUpdateMarkdown])

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
            🎬 Видео
          </button>
          <button
            onClick={() => onChangeView('code')}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${centerView === 'code' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}
          >
            💻 Код TSX
          </button>
          <button
            onClick={() => onChangeView('markdown')}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${centerView === 'markdown' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}
          >
            📝 Raw Script
          </button>
        </div>
        
        {centerView === 'player' && (
          <div className="flex gap-4 items-center">
            <div className="flex gap-1 bg-surface-container-lowest border border-white/5 p-1 rounded-lg">
                <button 
                    onClick={() => onPreviewFormatChange('16:9')}
                    className={`px-3 py-1 text-xs rounded transition-colors ${currentFormat === '16:9' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}
                >🖥️ 16:9</button>
                <button 
                    onClick={() => onPreviewFormatChange('9:16')}
                    className={`px-3 py-1 text-xs rounded transition-colors ${currentFormat === '9:16' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}
                >📱 9:16</button>
            </div>
            <Button
              variant="ghost"
              icon={playWithAudio ? 'volume_up' : 'volume_off'}
              onClick={onTogglePlayWithAudio}
              className="text-xs py-1"
            >
              {playWithAudio ? 'Звук: Вкл' : 'Звук: Выкл'}
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-6 overflow-y-auto custom-scrollbar">
        {isBusy ? (
          <div className="w-full max-w-[840px] aspect-video bg-black rounded-xl border border-white/10 shadow-2xl flex flex-col items-center justify-center gap-6 p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-50"></div>
            <Spinner className="text-[64px]" />
            <div className="text-center z-10 flex flex-col items-center">
              <h2 className="text-2xl font-semibold text-white mb-2">
                {isAutoPipelineRunning ? pipelineStep || 'Сборка проекта...' : 'Рендеринг проекта...'}
              </h2>
              <p className="text-on-surface-variant text-sm mb-6">Пожалуйста, подождите. Это может занять некоторое время.</p>
              {isRendering && <ProgressBar progress={renderProgress} className="w-64 mb-6" />}
              <Button variant="dashed" className="border-error/50 text-error hover:bg-error/10" onClick={onCancelAll}>
                Отменить процесс
              </Button>
            </div>
          </div>
        ) : centerView === 'player' ? (
          <div className={`w-full bg-black rounded-xl border border-white/10 shadow-2xl relative flex items-center justify-center overflow-hidden ${currentFormat === '9:16' ? 'max-w-[400px] aspect-[9/16]' : 'max-w-[840px] aspect-video'}`}>
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
              <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
                <div className="w-32 h-32 rounded-full bg-primary/20 blur-3xl absolute animate-pulse" />
                <Icon name="movie_edit" className="text-[64px] text-primary/40 relative z-10" />
                <span className="text-on-surface-variant font-medium relative z-10">Сцена не отрендерена</span>
                <span className="text-xs text-on-surface-variant/50 relative z-10">Нажми Cmd+Enter для сборки</span>
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
        ) : centerView === 'markdown' ? (
          <textarea 
            className="w-full h-full max-w-[900px] p-6 font-mono text-[14px] leading-relaxed bg-surface-container-lowest/60 text-on-surface border border-white/10 rounded-xl resize-none outline-none focus:border-primary/50 custom-scrollbar"
            value={localMd}
            onChange={e => setLocalMd(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <div className="w-full h-full max-w-[900px] flex flex-col gap-2">
            {activeScene?.ignoreTsx ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-black border border-white/10 rounded-xl text-on-surface-variant/60 font-mono text-sm gap-2">
                <Icon name="block" className="text-[32px] text-error" />
                <span>Сцена помечена как «Игнорировать TSX»</span>
                <span className="text-xs opacity-60">При рендере будет отображаться черный экран</span>
              </div>
            ) : (
              <>
                 <div className="flex justify-between items-center bg-surface-container-lowest border border-white/10 rounded-lg p-2">
                      <span className="text-xs text-on-surface-variant ml-2">
                        Версия кода: {(activeScene?.historyIndex ?? 0) + 1} / {Math.max(1, (activeScene?.remotionCodeHistory?.length || 0))}
                      </span>
                      <div className="flex gap-1">
                          <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => onCodeHistory(-1)} disabled={(activeScene?.historyIndex ?? 0) <= 0}>
                              <Icon name="chevron_left" className="text-[16px]" /> Пред
                          </Button>
                          <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => onCodeHistory(1)} disabled={(activeScene?.historyIndex ?? 0) >= (activeScene?.remotionCodeHistory?.length || 1) - 1}>
                              След <Icon name="chevron_right" className="text-[16px]" />
                          </Button>
                      </div>
                 </div>
                 <textarea
                  className="w-full h-full font-mono text-[12px] bg-surface-container-lowest/60 border border-white/10 p-4 rounded-xl text-on-surface resize-none outline-none focus:border-primary/50 custom-scrollbar"
                  value={activeScene?.remotionCode || ''}
                  onChange={e => onUpdateCode(e.target.value)}
                  placeholder="import React from 'react'..."
                  spellCheck={false}
                 />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
