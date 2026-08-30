import React, { useEffect, useMemo, useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { AlertTriangle } from 'lucide-react'
import { compileTsxWidget } from '../lib/dynamicWidgetCompiler'

interface DynamicCanvasPlayerProps {
  widgetId: string
  widgetName: string
  tsxCode: string
  liveProps: Record<string, unknown>
  fps?: number
  durationInFrames?: number
  isPlaying: boolean
  currentFrame: number
  onFrameChange: (frame: number) => void
}

export const DynamicCanvasPlayer: React.FC<DynamicCanvasPlayerProps> = ({
  widgetId,
  widgetName,
  tsxCode,
  liveProps,
  fps = 30,
  durationInFrames = 300,
  isPlaying,
  currentFrame,
  onFrameChange,
}) => {
  const playerRef = useRef<PlayerRef>(null)

  const { Component, error } = useMemo(() => compileTsxWidget(tsxCode, widgetId), [tsxCode, widgetId])

  const isVertical = widgetId.includes('9x16') || widgetId.includes('9×16')
  const compWidth = isVertical ? 1080 : 1920
  const compHeight = isVertical ? 1920 : 1080

  // Синхронизация с кнопкой Play/Pause и таймлайном снизу
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
    if (Math.abs(playerRef.current.getCurrentFrame() - currentFrame) > 1) {
      playerRef.current.seekTo(currentFrame)
    }
  }, [currentFrame])

  // Публикация кадров плеера наружу (синхронизация таймлайна)
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const handler = (e: { frame: number }) => onFrameChange(e.frame)
    player.addEventListener('frameupdate', handler as never)
    return () => player.removeEventListener('frameupdate', handler as never)
  }, [onFrameChange])

  if (error || !Component) {
    return (
      <div className="w-full max-w-xl p-6 rounded-2xl bg-red-950/40 border border-red-500/30 backdrop-blur-xl text-center space-y-3 shadow-2xl">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto animate-pulse" />
        <h3 className="text-base font-bold text-red-200">Ошибка сборки виджета на холсте</h3>
        <p className="text-xs font-mono text-red-300/80 bg-black/60 p-3 rounded-lg border border-red-500/20 text-left overflow-x-auto">
          {error || 'Не удалось скомпилировать TSX код'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center w-full">
      <div
        className="relative rounded-2xl overflow-hidden shadow-2xl border border-indigo-500/20 bg-black/90 flex items-center justify-center"
        style={{
          width: isVertical ? 360 : 720,
          height: isVertical ? 640 : 405,
          aspectRatio: isVertical ? '9 / 16' : '16 / 9',
        }}
      >
        <Player
          ref={playerRef}
          component={Component}
          inputProps={liveProps}
          durationInFrames={durationInFrames}
          compositionWidth={compWidth}
          compositionHeight={compHeight}
          fps={fps}
          style={{ width: '100%', height: '100%' }}
          controls={false}
          autoPlay={isPlaying}
          loop
        />
      </div>
      <span className="sr-only">{widgetName}</span>
    </div>
  )
}
