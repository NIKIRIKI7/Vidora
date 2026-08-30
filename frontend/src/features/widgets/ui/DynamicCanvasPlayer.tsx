import React, { useEffect, useMemo, useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { AlertCircle } from 'lucide-react'
import { compileTsxWidget } from '../lib/dynamicWidgetCompiler'

interface DynamicCanvasPlayerProps {
  widgetId: string
  tsxCode: string
  liveProps: Record<string, unknown>
  aspectRatio?: '16:9' | '9:16'
  fps?: number
  durationInFrames?: number
  isPlaying: boolean
  currentFrame: number
  onFrameChange: (frame: number) => void
}

export const DynamicCanvasPlayer: React.FC<DynamicCanvasPlayerProps> = ({
  widgetId,
  tsxCode,
  liveProps,
  aspectRatio = '16:9',
  fps = 30,
  durationInFrames = 300,
  isPlaying,
  currentFrame,
  onFrameChange,
}) => {
  const playerRef = useRef<PlayerRef>(null)

  const { Component, error } = useMemo(() => compileTsxWidget(tsxCode, widgetId), [tsxCode, widgetId])

  const isVertical = aspectRatio === '9:16' || widgetId.includes('9x16') || widgetId.includes('9×16')
  const compWidth = isVertical ? 1080 : 1920
  const compHeight = isVertical ? 1920 : 1080
  const safeDuration = Number.isFinite(durationInFrames) && durationInFrames > 0 ? durationInFrames : 300
  const safeFrame = Number.isFinite(currentFrame) ? Math.min(safeDuration, Math.max(0, currentFrame)) : 0

  useEffect(() => {
    if (!playerRef.current) return
    if (isPlaying && !playerRef.current.isPlaying()) {
      playerRef.current.play()
    } else if (!isPlaying && playerRef.current.isPlaying()) {
      playerRef.current.pause()
    }
  }, [isPlaying])

  useEffect(() => {
    if (!playerRef.current) return
    if (Math.abs(playerRef.current.getCurrentFrame() - safeFrame) > 1) {
      playerRef.current.seekTo(safeFrame)
    }
  }, [safeFrame])

  // Публикация кадров плеера наружу (синхронизация таймлайна) с защитой от NaN
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const handler = (e: { frame: number }) => {
      const f = Number.isFinite(e.frame) ? Math.round(e.frame) : 0
      onFrameChange(f)
    }
    player.addEventListener('frameupdate', handler as never)
    return () => player.removeEventListener('frameupdate', handler as never)
  }, [onFrameChange])

  if (error || !Component) {
    return (
      <div className="w-full max-w-lg p-6 rounded-2xl bg-red-950/40 border border-red-500/30 backdrop-blur-xl text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
        <h4 className="text-sm font-semibold text-red-200">Ошибка сборки компонента</h4>
        <p className="text-xs font-mono text-red-300/80 bg-black/60 p-3 rounded-lg border border-red-500/20 text-left overflow-x-auto">
          {error || 'Не удалось скомпилировать TSX'}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center p-4 sm:p-6 select-none">
      <div
        className="relative rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-slate-800/80 bg-black flex items-center justify-center"
        style={{
          aspectRatio: isVertical ? '9 / 16' : '16 / 9',
          height: isVertical ? 'min(600px, 85%)' : 'min(420px, 85%)',
          maxWidth: '92%',
        }}
      >
        <Player
          ref={playerRef}
          component={Component}
          inputProps={liveProps}
          durationInFrames={safeDuration}
          compositionWidth={compWidth}
          compositionHeight={compHeight}
          fps={fps}
          style={{ width: '100%', height: '100%' }}
          controls={false}
          autoPlay={isPlaying}
          loop
        />
      </div>
    </div>
  )
}
