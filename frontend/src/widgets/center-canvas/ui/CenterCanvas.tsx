import { fetchClient, apiErrorMessage } from '@shared/api'
import React, { useEffect, useState, useCallback } from 'react'
import type { ProjectSettings, Scene, VideoFormat } from '@entities/project'
import { useScenarioEngineStore } from '@entities/project'
import { Button, IconButton, SegmentedControl, Spinner, ProgressBar, TextArea } from '@shared/ui'
import { Camera, Clapperboard, Ban, ChevronLeft, ChevronRight } from 'lucide-react'
import { API } from '@entities/project'
import { CodeHistorySelector } from './CodeHistorySelector'

interface Props {
  centerView: 'player' | 'code' | 'split' | 'markdown'
  previewFormat: VideoFormat | null
  onChangeView: (view: 'player' | 'code' | 'split' | 'markdown') => void
  onPreviewFormatChange: (format: VideoFormat | null) => void
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
  onCaptureFrame: () => void
  showTimeline: boolean
  timeline?: React.ReactNode
}

export const CenterCanvas = ({
  centerView, previewFormat, onChangeView, onPreviewFormatChange,
  playingTargetId, renderedVideos, audioLoaded, activeScene, project, videoRef, audioRef, onUpdateCode,
  onCodeHistory, isRendering, isAutoPipelineRunning, pipelineStep, renderProgress, onCancelAll,
  onCaptureFrame, showTimeline, timeline,
}: Props) => {
  const isBusy = isRendering || isAutoPipelineRunning
  const hasRenderedVideo = Boolean(playingTargetId && renderedVideos[playingTargetId])
  const shouldRenderAudio = Boolean(audioLoaded && !hasRenderedVideo)

  // Тонкий клиент: Markdown-редактор связан со Шлюзом (AST-синк на бэкенде), а не с локальным парсером.
  const engineRawMarkdown = useScenarioEngineStore(s => s.rawMarkdown)
  const engineIsSyncing = useScenarioEngineStore(s => s.isSyncing)
  const engineUpdateMarkdown = useScenarioEngineStore(s => s.updateMarkdown)

  const currentFormat = previewFormat || project.format
  const [splitRatio, setSplitRatio] = useState(() => Number(localStorage.getItem('app:split-ratio')) || 50)

  // Ручные правки кода тоже уходят в историю версий на бэкенде
  const saveCodeRevision = () => {
    if (!activeScene?.remotionCode?.trim()) return
    fetchClient.POST('/api/v1/system/history', { body: { project_id: project.name, scene_id: activeScene.id, tsx_code: activeScene.remotionCode, prompt: 'Ручная правка' }     }).then(({ data, error }) => {
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      return data
    }).catch((err) => {
      console.error('CenterCanvas.saveCodeRevision:', err)
    })
  }

  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio || !shouldRenderAudio) return

    const handlePlay = () => { audio.play().catch(() => {}) }
    const handlePause = () => audio.pause()
    const handleSeek = () => { audio.currentTime = video.currentTime }
    const handleVolumeChange = () => {
      audio.muted = video.muted
      audio.volume = video.volume
    }

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
  }, [shouldRenderAudio, playingTargetId, videoRef, audioRef])

  const handleDrag = useCallback((e: MouseEvent) => {
    const container = document.getElementById('split-container')
    if (!container) return
    const rect = container.getBoundingClientRect()
    const newRatio = ((e.clientX - rect.left) / rect.width) * 100
    if (newRatio > 20 && newRatio < 80) {
      setSplitRatio(newRatio)
      localStorage.setItem('app:split-ratio', newRatio.toString())
    }
  }, [])

  const startDrag = () => {
    document.addEventListener('mousemove', handleDrag)
    document.addEventListener('mouseup', () => document.removeEventListener('mousemove', handleDrag), { once: true })
  }

  const renderPlayer = (fullSize: boolean = true) => {
    let sizeClasses = 'w-full h-full'
    if (fullSize) {
      sizeClasses = currentFormat === '9:16' 
        ? 'h-full max-h-[var(--layout-code)] aspect-[9/16]' 
        : 'w-full max-w-4xl max-h-full aspect-video'
    }

    return (
      <div className={`bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-2xl relative flex shrink-0 items-center justify-center overflow-hidden m-auto ${sizeClasses}`}>
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          <IconButton
            icon={Camera}
            size="md"
            accent="neutral"
            onClick={onCaptureFrame}
            title="Снять скриншот для превью (Thumbnail)"
            className="bg-surface-container-lowest/50 hover:bg-primary/50 backdrop-blur border border-outline-variant/80"
          />
        </div>

        {renderedVideos[playingTargetId || ''] ? (
          <video ref={videoRef} crossOrigin="anonymous" src={`${API}/api/v1/render/media?path=${encodeURIComponent(renderedVideos[playingTargetId || ''])}`} controls className="w-full h-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
            <div className="w-32 h-32 rounded-full bg-primary/20 blur-3xl absolute animate-pulse" />
            <Clapperboard size={60} className="text-primary/40 relative z-10" />
            <span className="text-on-surface-variant font-medium relative z-10 text-center">Сцена не отрендерена<br /><span className="text-xs opacity-60">Cmd+Enter для сборки</span></span>
          </div>
        )}
        {shouldRenderAudio && <audio ref={audioRef} src={`${API}/api/v1/render/media?path=${encodeURIComponent(audioLoaded!)}`} className="hidden" />}
      </div>
    )
  }

  const renderCode = () => (
    <div className="w-full h-full flex flex-col gap-2">
      {activeScene?.ignoreTsx ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container-lowest border border-outline-variant/40 rounded-xl text-on-surface-variant/60 font-mono text-sm gap-2">
          <Ban size={36} className="text-error" />
          <span>Игнорировать TSX включено</span>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center bg-surface-container-lowest border border-outline-variant/40 rounded-lg p-2 shrink-0">
            <span className="text-xs text-on-surface-variant ml-2">Версия: {(activeScene?.historyIndex ?? 0) + 1} / {Math.max(1, (activeScene?.remotionCodeHistory?.length || 0))}</span>
            <div className="flex items-center gap-1">
              {activeScene && <CodeHistorySelector projectId={project.name} sceneId={activeScene.id} onRestoreCode={onUpdateCode} />}
              <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => onCodeHistory(-1)} disabled={(activeScene?.historyIndex ?? 0) <= 0}><ChevronLeft size={16} /> Пред</Button>
              <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => onCodeHistory(1)} disabled={(activeScene?.historyIndex ?? 0) >= (activeScene?.remotionCodeHistory?.length || 1) - 1}>След <ChevronRight size={16} /></Button>
            </div>
          </div>
          <TextArea
            className="w-full h-full font-mono text-xs bg-surface-container-lowest/60 border border-outline-variant/40 p-4 rounded-xl text-on-surface resize-none outline-none focus:border-primary/50 custom-scrollbar"
            value={activeScene?.remotionCode || ''} onChange={e => onUpdateCode(e.target.value)} onBlur={saveCodeRevision} spellCheck={false}
          />
        </>
      )}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-hidden">
      <div className="h-12 border-b border-outline-variant/20 flex items-center px-4 justify-between bg-surface-container-lowest/50 shrink-0">
        <SegmentedControl
          options={[
            { value: 'player', label: '🎬 Видео' },
            { value: 'code', label: '💻 Код TSX' },
            { value: 'split', label: '🌓 Сплит-экран' },
            { value: 'markdown', label: '📝 Raw Script' },
          ]}
          value={centerView}
          onChange={onChangeView}
        />
        {(centerView === 'player' || centerView === 'split') && (
          <div className="flex gap-4 items-center">
            <SegmentedControl
              options={[
                { value: '16:9', label: '🖥️ 16:9' },
                { value: '9:16', label: '📱 9:16' },
              ]}
              value={currentFormat}
              onChange={onPreviewFormatChange}
            />
            {centerView === 'split' && <Button variant="ghost" className="text-xs py-1" onClick={() => setSplitRatio(50)}>50/50</Button>}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center items-center overflow-hidden">
        {isBusy ? (
          <div className="w-full max-w-4xl aspect-video bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-2xl flex flex-col items-center justify-center gap-6 p-8 relative overflow-hidden m-6">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-50"></div>
            <Spinner className="text-6xl" />
            <div className="text-center z-10 flex flex-col items-center">
              <h2 className="text-2xl font-semibold text-on-surface mb-2">{isAutoPipelineRunning ? pipelineStep || 'Сборка проекта...' : 'Рендеринг проекта...'}</h2>
              <p className="text-on-surface-variant text-sm mb-6">Пожалуйста, подождите. ИИ может исправлять ошибки в фоне.</p>
              {isRendering && <ProgressBar progress={renderProgress} className="w-64 mb-6" />}
              <Button variant="dashed" className="border-error/50 text-error hover:bg-error/10" onClick={onCancelAll}>Отменить процесс</Button>
            </div>
          </div>
        ) : centerView === 'split' ? (
          <div id="split-container" className="flex-1 flex w-full relative h-full">
            <div style={{ width: `${splitRatio}%` }} className="h-full flex flex-col relative p-4 pr-2">
              {renderPlayer(false)}
            </div>
            <div className="w-2 cursor-col-resize hover:bg-primary/50 active:bg-primary z-30 transition-colors absolute top-0 bottom-0 -ml-1" style={{ left: `${splitRatio}%` }} onMouseDown={startDrag} />
            <div style={{ width: `${100 - splitRatio}%` }} className="h-full flex flex-col p-4 pl-2">
              {renderCode()}
            </div>
          </div>
        ) : centerView === 'player' ? (
          <div className="p-6 w-full h-full flex overflow-y-auto custom-scrollbar">
            {renderPlayer(true)}
          </div>
        ) : centerView === 'markdown' ? (
          <div className="relative w-full h-full p-6 flex justify-center overflow-y-auto custom-scrollbar">
            {engineIsSyncing && (
              <div className="absolute top-3 right-6 z-10 text-xxs text-secondary font-mono flex items-center gap-1.5 bg-surface-container-lowest/40 border border-outline-variant/40 rounded-full px-3 py-1 animate-pulse">
                <Spinner className="w-3 h-3" /> Синхронизация AST…
              </div>
            )}
            <TextArea
              className="w-full h-full max-w-5xl p-6 font-mono text-sm leading-relaxed bg-surface-container-lowest/60 text-on-surface border border-outline-variant/40 rounded-xl resize-none outline-none focus:border-primary/50 custom-scrollbar"
              value={engineRawMarkdown}
              onChange={e => engineUpdateMarkdown(e.target.value)}
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="p-6 w-full h-full flex justify-center overflow-y-auto custom-scrollbar">
            <div className="w-full h-full max-w-5xl flex flex-col gap-2">{renderCode()}</div>
          </div>
        )}
      </div>

      {showTimeline && !isBusy && (centerView === 'player' || centerView === 'split') && timeline && (
        <div className="w-full h-[var(--layout-card)] shrink-0 border-t border-outline-variant/40 bg-background z-20">
          {timeline}
        </div>
      )}
    </div>
  )
}
