import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { SceneFragment, BackgroundMusicSettings } from '@entities/project'
import { Button, IconButton } from '@shared/ui'
import { Play, Pause, ZoomIn, ZoomOut, Scissors, MousePointer, Copy, Trash2, Unlink, Link, Magnet, Split, Volume2, VolumeX, Video, Plus, Settings } from 'lucide-react'

type TimelineTool = 'select' | 'razor'

interface TimelineProps {
  fragments: SceneFragment[]
  videoRef: React.RefObject<HTMLVideoElement | null>
  audioRef?: React.RefObject<HTMLAudioElement | null>
  onUpdateBounds: (fragId: string, edge: 'start' | 'end', newTime: number, ripple?: boolean) => void
  onSplitFragment?: (fragId: string, splitTime: number) => void
  onDeleteFragment?: (fragId: string) => void
  onDuplicateFragment?: (fragId: string) => void
  onSelectFragment?: (fragId: string) => void
  selectedFragmentId?: string | null
  backgroundMusic?: BackgroundMusicSettings | null
  onUpdateBackgroundMusic?: (settings: BackgroundMusicSettings) => void
  onOpenMusicSettings?: () => void
  onOpenBRollModal?: (scope: 'fragment' | 'scene' | 'project', fragId?: string) => void
}

const resolveCssColor = (value: string) => {
  const match = value.match(/^var\((--[\w-]+)\)$/)
  if (!match) return value
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim()
  return resolved || value
}

const WaveformCanvas = React.memo(({ width, height = 36, seed, color = 'var(--color-primary)' }: { width: number; height?: number; seed: string; color?: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const clampedW = Math.max(1, Math.floor(width))
    ctx.clearRect(0, 0, clampedW, height)
    ctx.fillStyle = resolveCssColor(color)
    let h = Array.from(seed).reduce((a, b) => a + b.charCodeAt(0), 0) + 123
    const step = 4
    const barWidth = 2
    for (let x = 1; x < clampedW; x += step) {
      h = (h * 9301 + 49297) % 233280
      const barH = (10 + (h / 233280) * 80) * (height / 100)
      const y = (height - barH) / 2
      ctx.fillRect(x, y, barWidth, Math.max(2, barH))
    }
  }, [width, height, seed, color])
  return <canvas ref={canvasRef} width={Math.max(1, Math.floor(width))} height={height} className="w-full h-full opacity-70 block pointer-events-none" />
})

const computeFragments = (frags: SceneFragment[]) => {
  let current = 0
  return frags.map((f) => {
    const start = f.startTime ?? current
    const end = f.endTime ?? start + Math.max(f.text.split(' ').length / 2.5, 1)
    current = end
    return { ...f, computedStart: start, computedEnd: end }
  })
}

export const Timeline = ({
  fragments,
  videoRef,
  audioRef,
  onUpdateBounds,
  onSplitFragment,
  onDeleteFragment,
  onDuplicateFragment,
  onSelectFragment,
  selectedFragmentId,
  backgroundMusic,
  onUpdateBackgroundMusic,
  onOpenMusicSettings,
  onOpenBRollModal,
}: TimelineProps) => {
  const [zoom, setZoom] = useState(100)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeTool, setActiveTool] = useState<TimelineTool>('select')
  const [isAudioLinked, setIsAudioLinked] = useState(true)
  const [isSnapEnabled, setIsSnapEnabled] = useState(true)
  const [hoveredTime, setHoveredTime] = useState<number | null>(null)
  const [dragFragments, setDragFragments] = useState<SceneFragment[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timelineTracksRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<SceneFragment[] | null>(null)
  const lastTickRef = useRef(0)

  const computedFragments = useMemo(() => computeFragments(dragFragments ?? fragments), [dragFragments, fragments])
  // Длительность контента мемоизирована отдельно от плейхеда: `currentTime` меняется каждый
  // кадр, и раньше он тянул за собой пересоздание rAF-эффекта. Теперь эффект переподписывается
  // только при смене самого контента.
  const contentDuration = useMemo(() => Math.max(10, ...computedFragments.map((f) => f.computedEnd)), [computedFragments])
  const duration = Math.max(contentDuration, currentTime + 2)
  const hasAnyAudio = useMemo(() => fragments.some((f) => Boolean(f.audioFileName || f.lastAudioHash)), [fragments])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let raf: number
    const loop = (now: number) => {
      if (!isScrubbing) {
        const v = videoRef.current
        const a = audioRef?.current
        const media = (v && v.src) ? v : (a && a.src) ? a : null
        if (media) {
          setCurrentTime(prev => Math.abs(prev - media.currentTime) > 0.01 ? media.currentTime : prev)
          setIsPlaying(prev => prev !== !media.paused ? !media.paused : prev)
        } else if (isPlaying) {
          const deltaSec = (now - lastTickRef.current) / 1000
          lastTickRef.current = now
          setCurrentTime(prev => {
            const next = prev + deltaSec
            if (next >= contentDuration) { setIsPlaying(false); return 0 }
            return next
          })
        } else {
          lastTickRef.current = now
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [videoRef, audioRef, isScrubbing, isPlaying, contentDuration])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    const a = audioRef?.current
    const media = (v && v.src) ? v : (a && a.src) ? a : null
    if (media) {
      if (media.paused) media.play().catch(() => {})
      else media.pause()
    } else {
      lastTickRef.current = performance.now()
      setIsPlaying(prev => !prev)
    }
  }, [videoRef, audioRef])

  const seekTo = useCallback((newTime: number) => {
    const clampedTime = Math.max(0, Math.min(newTime, duration))
    if (videoRef.current) videoRef.current.currentTime = clampedTime
    if (audioRef?.current) audioRef.current.currentTime = clampedTime
    setCurrentTime(clampedTime)
  }, [videoRef, audioRef, duration])

  const snapTime = useCallback((time: number, thresholdSec = 0.15): number => {
    if (!isSnapEnabled) return time
    for (const f of computedFragments) {
      if (Math.abs(f.computedStart - time) < thresholdSec) return f.computedStart
      if (Math.abs(f.computedEnd - time) < thresholdSec) return f.computedEnd
    }
    const nearestSec = Math.round(time)
    if (Math.abs(nearestSec - time) < thresholdSec) return nearestSec
    return time
  }, [isSnapEnabled, computedFragments])

  const handleScrubStart = (e: React.MouseEvent) => {
    if (dragId) return
    if ((e.target as HTMLElement).closest('.timeline-frag')) return
    const rect = timelineTracksRef.current?.getBoundingClientRect()
    if (!rect) return
    setIsScrubbing(true)
    seekTo(snapTime(Math.max(0, (e.clientX - rect.left) / zoom)))
    const handleMouseMove = (moveEvent: MouseEvent) => {
      seekTo(snapTime(Math.max(0, (moveEvent.clientX - rect.left) / zoom)))
    }
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      setIsScrubbing(false)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleRazorCut = (fragId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = timelineTracksRef.current?.getBoundingClientRect()
    if (!rect) return
    const cutTime = snapTime(Math.max(0, (e.clientX - rect.left) / zoom))
    const targetFrag = computedFragments.find((f) => f.id === fragId)
    if (targetFrag && cutTime > targetFrag.computedStart + 0.2 && cutTime < targetFrag.computedEnd - 0.2) {
      onSplitFragment?.(fragId, cutTime)
      seekTo(cutTime)
    }
  }

  const handleMouseDownEdge = (e: React.MouseEvent, id: string, edge: 'start' | 'end') => {
    e.preventDefault()
    e.stopPropagation()
    setDragId(id)
    const startX = e.clientX
    const frag = computedFragments.find((f) => f.id === id)!
    const initialTime = edge === 'start' ? frag.computedStart : frag.computedEnd
    const maxStart = frag.computedEnd - 0.2
    const minEnd = frag.computedStart + 0.2
    const linked = isAudioLinked
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaTime = (moveEvent.clientX - startX) / zoom
      const base = dragRef.current ?? fragments
      const idx = base.findIndex((f) => f.id === id)
      if (idx === -1) return
      const next = [...base]
      let newTime = snapTime(Math.max(0, initialTime + deltaTime))
      if (edge === 'start') {
        newTime = Math.min(newTime, maxStart)
        next[idx] = { ...next[idx], startTime: newTime }
        if (idx > 0 && linked) next[idx - 1] = { ...next[idx - 1], endTime: newTime }
      } else {
        newTime = Math.max(newTime, minEnd)
        next[idx] = { ...next[idx], endTime: newTime }
        if (idx < next.length - 1 && linked) next[idx + 1] = { ...next[idx + 1], startTime: newTime }
      }
      dragRef.current = next
      setDragFragments(next)
    }
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      const finalFrag = (dragRef.current ?? fragments).find((f) => f.id === id)!
      setDragId(null)
      setDragFragments(null)
      dragRef.current = null
      const finalTime = edge === 'start' ? finalFrag.startTime! : finalFrag.endTime!
      onUpdateBounds(id, edge, finalTime, linked)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const ctx = useRef({ currentTime, computedFragments, selectedFragmentId })
  useEffect(() => {
    ctx.current = { currentTime, computedFragments, selectedFragmentId }
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const { currentTime, computedFragments, selectedFragmentId } = ctx.current
      if (e.code === 'KeyC') setActiveTool((t) => (t === 'razor' ? 'select' : 'razor'))
      else if (e.code === 'KeyV') setActiveTool('select')
      else if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      else if (e.code === 'KeyS' || (e.ctrlKey && e.code === 'KeyK')) {
        e.preventDefault()
        const frag = computedFragments.find((f) => currentTime > f.computedStart + 0.1 && currentTime < f.computedEnd - 0.1)
        if (frag) onSplitFragment?.(frag.id, currentTime)
      }
      else if ((e.code === 'Delete' || e.code === 'Backspace') && selectedFragmentId) {
        e.preventDefault()
        onDeleteFragment?.(selectedFragmentId)
      }
      else if (e.ctrlKey && e.code === 'KeyD' && selectedFragmentId) {
        e.preventDefault()
        onDuplicateFragment?.(selectedFragmentId)
      }
      else if (e.code === 'KeyM') setIsSnapEnabled((s) => !s)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, onSplitFragment, onDeleteFragment, onDuplicateFragment])

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    const ms = Math.floor((sec % 1) * 10)
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`
  }

  const ticks = useMemo(() => {
    const step = zoom < 50 ? 5 : zoom < 80 ? 2 : 1
    const result = []
    for (let i = 0; i <= Math.ceil(contentDuration); i += step) {
      result.push(
        <div key={i} className="absolute top-0 bottom-0 border-l border-outline-variant/80 pointer-events-none" style={{ left: i * zoom }}>
          <span className="absolute top-1 left-1.5 text-3xs font-mono text-on-surface-variant select-none opacity-60">{i}s</span>
        </div>
      )
    }
    return result
  }, [contentDuration, zoom])

  return (
    <div className="w-full h-full flex flex-col bg-surface-container/90 backdrop-blur-xl select-none border-t border-outline-variant/40">
      <div className="h-10 border-b border-outline-variant/40 flex items-center px-4 justify-between bg-surface-container-lowest/70 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="p-1 w-8 h-8 rounded-full hover:bg-primary/20" onClick={togglePlay} title="Воспроизведение (Space)">
            {isPlaying ? <Pause size={18} className="text-primary" /> : <Play size={18} className="text-primary fill-primary" />}
          </Button>
          <span className="font-mono text-xs text-primary font-bold tracking-widest bg-surface-container-lowest/40 px-2 py-1 rounded border border-primary/20">{formatTime(currentTime)}</span>
        </div>
        <div className="flex items-center gap-1 bg-surface-container-lowest border border-outline-variant/40 p-0.5 rounded-lg">
          <IconButton
            icon={MousePointer}
            accent="primary"
            active={activeTool === 'select'}
            onClick={() => setActiveTool('select')}
            title="Курсор выбора (V)"
          />
          <IconButton
            icon={Scissors}
            accent="error"
            active={activeTool === 'razor'}
            onClick={() => setActiveTool('razor')}
            title="Лезвие (C)"
          />
          <div className="w-px h-4 bg-on-surface/10 mx-1" />
          <IconButton
            icon={Split}
            accent="secondary"
            onClick={() => {
              const currentFrag = computedFragments.find(f => currentTime > f.computedStart + 0.1 && currentTime < f.computedEnd - 0.1)
              if (currentFrag) onSplitFragment?.(currentFrag.id, currentTime)
            }}
            title="Разрезать по плейхеду (S / Ctrl+K)"
          />
          <IconButton
            icon={Copy}
            accent="primary"
            disabled={!selectedFragmentId}
            onClick={() => selectedFragmentId && onDuplicateFragment?.(selectedFragmentId)}
            title="Дублировать (Ctrl+D)"
          />
          <IconButton
            icon={Trash2}
            accent="error"
            disabled={!selectedFragmentId}
            onClick={() => selectedFragmentId && onDeleteFragment?.(selectedFragmentId)}
            title="Удалить (Delete)"
          />
          <div className="w-px h-4 bg-on-surface/10 mx-1" />
          <IconButton
            icon={isAudioLinked ? Link : Unlink}
            accent={isAudioLinked ? 'primary' : 'warning'}
            active={isAudioLinked}
            onClick={() => setIsAudioLinked((l) => !l)}
            title="Связка аудио и визуала"
          />
          <IconButton
            icon={Magnet}
            accent="secondary"
            active={isSnapEnabled}
            onClick={() => setIsSnapEnabled((s) => !s)}
            title="Магнитная привязка (M)"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="p-1 w-7 h-7" onClick={() => setZoom((z) => Math.max(30, z - 20))}>
            <ZoomOut size={15} />
          </Button>
          <span className="text-xxs text-on-surface-variant font-mono w-10 text-center">{zoom}px/s</span>
          <Button variant="ghost" className="p-1 w-7 h-7" onClick={() => setZoom((z) => Math.min(300, z + 20))}>
            <ZoomIn size={15} />
          </Button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-28 shrink-0 border-r border-outline-variant/40 bg-surface-container-lowest/40 flex flex-col z-20">
          <div className="h-7 border-b border-outline-variant/20 px-3 flex items-center text-3xs font-mono uppercase text-on-surface-variant/60">Шкала</div>
          <div className="h-12 flex items-center px-3 text-xxs uppercase font-bold text-on-surface border-b border-outline-variant/20">Сценарий</div>
          <div className="h-12 flex items-center justify-between px-3 text-xxs uppercase font-bold text-secondary border-b border-outline-variant/20">
            <span>B-Roll</span>
            {onOpenBRollModal && (
              <IconButton
                icon={Plus}
                size="xs"
                accent="secondary"
                onClick={() => onOpenBRollModal('scene')}
                title="Добавить B-Roll на сцену"
              />
            )}
          </div>
          <div className="h-12 flex items-center px-3 text-xxs uppercase font-bold text-primary border-b border-outline-variant/20">Аудио</div>
          <div className="h-12 flex items-center justify-between px-3 text-xxs uppercase font-bold text-secondary border-b border-outline-variant/20">
            <span className="flex items-center gap-1"><Volume2 size={11} /> Музыка</span>
            {onOpenMusicSettings && (
              <IconButton icon={Settings} size="xs" accent="secondary" onClick={onOpenMusicSettings} title="Настройки музыки" />
            )}
          </div>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative bg-surface-container-lowest" ref={scrollRef}>
          <div
            ref={timelineTracksRef}
            className={`relative h-full ${activeTool === 'razor' ? 'cursor-crosshair' : 'cursor-default'}`}
            style={{ width: Math.max(duration * zoom + 200, containerWidth) }}
            onMouseMove={(e) => {
              const rect = timelineTracksRef.current?.getBoundingClientRect()
              if (rect) setHoveredTime(Math.max(0, (e.clientX - rect.left) / zoom))
            }}
            onMouseLeave={() => setHoveredTime(null)}
          >
            <div className="h-7 border-b border-outline-variant/40 relative bg-on-surface/5 hover:bg-on-surface/10 transition-colors cursor-pointer" onMouseDown={handleScrubStart}>
              {ticks}
            </div>
            {['text', 'broll', 'audio'].map((track) => (
              <div key={track} className="h-12 border-b border-outline-variant/20 relative" onMouseDown={activeTool === 'select' ? handleScrubStart : undefined}>
                {computedFragments.map((f) => {
                  const left = f.computedStart * zoom
                  const width = (f.computedEnd - f.computedStart) * zoom
                  const isSelected = selectedFragmentId === f.id
                  let content = null
                  let bgColor = ''
                  if (track === 'text') {
                    bgColor = isSelected
                      ? 'bg-primary/20 border-primary shadow-lg shadow-primary/30 text-on-surface'
                      : 'bg-surface-bright/80 border-outline-variant/60 text-on-surface hover:border-primary/50'
                    content = (
                      <span className="truncate text-xxs px-2 font-medium select-none pointer-events-none">
                        {f.text || <span className="opacity-40 italic">Пустой фрагмент</span>}
                      </span>
                    )
                  } else if (track === 'broll') {
                    bgColor = f.bRollFileName
                      ? 'bg-secondary/20 border-secondary/50 text-secondary cursor-pointer hover:bg-secondary/30'
                      : 'bg-transparent border-dashed border-outline-variant/20 hover:border-outline-variant/80 cursor-pointer'
                    content = f.bRollFileName ? (
                      <span className="truncate text-xxs px-2 select-none pointer-events-none font-mono flex items-center gap-1">
                        <Video size={12} /> {f.bRollFileName}
                      </span>
                    ) : (
                      <span className="text-3xs text-on-surface-variant/40 px-2 select-none">+ B-Roll</span>
                    )
                  } else if (track === 'audio') {
                    bgColor = hasAnyAudio || f.audioFileName
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-transparent border-dashed border-outline-variant/20'
                    content = (hasAnyAudio || f.audioFileName) ? <WaveformCanvas width={width} seed={f.id} color="var(--color-primary)" /> : null
                  }
                  return (
                    <div
                      key={f.id}
                      onClick={(e) => {
                        if (activeTool === 'razor') {
                          handleRazorCut(f.id, e)
                        } else if (track === 'broll' && onOpenBRollModal) {
                          e.stopPropagation()
                          onOpenBRollModal('fragment', f.id)
                        } else {
                          e.stopPropagation()
                          onSelectFragment?.(f.id)
                        }
                      }}
                      className={`timeline-frag absolute top-1 bottom-1 rounded-md border flex items-center overflow-hidden transition-all group ${bgColor} ${activeTool === 'razor' ? 'hover:brightness-125' : ''}`}
                      style={{ left, width }}
                    >
                      {activeTool === 'select' && (
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-on-surface/40 z-20 flex items-center justify-center group/handle"
                          onMouseDown={(e) => handleMouseDownEdge(e, f.id, 'start')}
                        >
                          <div className="w-px h-3.5 bg-on-surface/60 group-hover/handle:bg-on-surface" />
                        </div>
                      )}
                      {content}
                      {activeTool === 'select' && (
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-on-surface/40 z-20 flex items-center justify-center group/handle"
                          onMouseDown={(e) => handleMouseDownEdge(e, f.id, 'end')}
                        >
                          <div className="w-px h-3.5 bg-on-surface/60 group-hover/handle:bg-on-surface" />
                        </div>
                      )}
                      {activeTool === 'razor' && hoveredTime !== null && hoveredTime >= f.computedStart && hoveredTime <= f.computedEnd && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-error pointer-events-none shadow-lg shadow-error/80 z-30"
                          style={{ left: (hoveredTime - f.computedStart) * zoom }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
            <div key="music" className="h-12 border-b border-outline-variant/20 relative">
              {backgroundMusic?.enabled ? (
                <div
                  onClick={onOpenMusicSettings}
                  className="absolute top-1 bottom-1 left-0 rounded-md border border-secondary/40 bg-secondary/15 text-secondary flex items-center px-3 gap-2 cursor-pointer hover:bg-secondary/25 transition-all"
                  style={{ width: duration * zoom }}
                >
                  <span className="text-xxs font-mono font-bold shrink-0 truncate max-w-[var(--layout-label-lg)]">🎵 {backgroundMusic.trackName || 'Фоновая музыка'}</span>
                  <div className="flex-1 h-full overflow-hidden">
                    <WaveformCanvas width={duration * zoom} seed="bg_music_track" color="var(--color-error)" />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pointer-events-auto">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={backgroundMusic.baseVolume}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateBackgroundMusic?.({ ...backgroundMusic, baseVolume: Number(e.target.value) })}
                      className="w-16 h-1 accent-secondary"
                    />
                    <IconButton
                      icon={VolumeX}
                      size="xs"
                      accent="neutral"
                      onClick={(e) => { e.stopPropagation(); onUpdateBackgroundMusic?.({ ...backgroundMusic, enabled: false }) }}
                      title="Выключить музыку"
                    />
                  </div>
                </div>
              ) : (
                <div
                  onClick={onOpenMusicSettings}
                  className="absolute top-1 bottom-1 left-0 rounded-md border border-dashed border-outline-variant/40 flex items-center justify-center text-xxs text-on-surface-variant/40 hover:text-on-surface hover:border-outline-variant/100 cursor-pointer"
                  style={{ width: duration * zoom }}
                >
                  + Нажмите, чтобы добавить фоновую музыку
                </div>
              )}
            </div>
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-error z-40 pointer-events-none shadow-lg shadow-error/90 transition-all duration-75"
              style={{ left: currentTime * zoom }}
            >
              <div
                className="w-3.5 h-4 bg-error rounded-b-sm -translate-x-1.5 shadow-lg flex items-center justify-center cursor-ew-resize pointer-events-auto"
                onMouseDown={handleScrubStart}
              >
                <div className="w-1 h-2 bg-on-surface/80 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
