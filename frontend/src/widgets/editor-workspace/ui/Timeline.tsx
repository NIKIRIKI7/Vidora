import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { SceneFragment } from '@entities/project'
import { Button } from '@shared/ui'
import { Play, Pause, ZoomIn, ZoomOut, Scissors, MousePointer, Copy, Trash2, Unlink, Link, Magnet, Split } from 'lucide-react'

export type TimelineTool = 'select' | 'razor'

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
}

// ponytail: fake waveform, seed-based heights, no audio decode needed
const WaveformMock = ({ width, seed }: { width: number, seed: string }) => {
  const heights = useMemo(() => {
    const res = []
    let h = Array.from(seed).reduce((a, b) => a + b.charCodeAt(0), 0) + 123
    const count = Math.max(1, Math.floor(width / 4))
    for (let i = 0; i < count; i++) {
      h = (h * 9301 + 49297) % 233280
      res.push(10 + (h / 233280) * 80)
    }
    return res
  }, [width, seed])

  return (
    <div className="w-full h-full flex items-center justify-between px-0.5 gap-[1px] opacity-70">
      {heights.map((h, i) => (
        <div key={i} className="flex-1 bg-current rounded-full" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

// ponytail: estimate missing timings by chaining through fragments, 2.5 words/sec
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
  const duration = Math.max(10, ...computedFragments.map((f) => f.computedEnd), currentTime + 2)

  // Сцена озвучена (аудио может жить на сцене, а не на каждом фрагменте) — волна рисуется везде
  const hasAnyAudio = useMemo(() => fragments.some((f) => Boolean(f.audioFileName || f.lastAudioHash)), [fragments])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // КРАСНАЯ ЛИНИЯ: играющее видео -> его время; иначе аудио; если медиа ещё нет
  // (сцена не отрендерена) — виртуальный таймер двигает линию в реальном времени.
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
            if (next >= duration) { setIsPlaying(false); return 0 }
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
  }, [videoRef, audioRef, isScrubbing, isPlaying, duration])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    const a = audioRef?.current
    const media = (v && v.src) ? v : (a && a.src) ? a : null
    if (media) {
      if (media.paused) media.play().catch(() => {})
      else media.pause()
    } else {
      // Виртуальное воспроизведение: медиа нет — гоняем таймер превью
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

  // СКРАББИНГ: зажали и тянем плейхед (клики по фрагментам и ручкам ресайза не скраббят).
  // Работает на шкале ВСЕГДА (даже в режиме «Лезвие») и на дорожках в режиме выбора.
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

  const handleSplitAtPlayhead = () => {
    const currentFrag = computedFragments.find(
      (f) => currentTime > f.computedStart + 0.1 && currentTime < f.computedEnd - 0.1
    )
    if (currentFrag) onSplitFragment?.(currentFrag.id, currentTime)
  }

  // ИЗМЕНЕНИЕ ГРАНИЦ: связанные фрагменты двигают соседа (рипл), разъединённые — нет
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

  // Горячие клавиши: C/V — инструмент, S/Ctrl+K — разрез по плейхеду,
  // Space — play/pause, Delete — удалить, Ctrl+D — дублировать, M — магнит
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

  const renderTicks = () => {
    const ticks = []
    const step = zoom < 50 ? 5 : zoom < 80 ? 2 : 1
    for (let i = 0; i <= Math.ceil(duration); i += step) {
      ticks.push(
        <div key={i} className="absolute top-0 bottom-0 border-l border-white/20 pointer-events-none" style={{ left: i * zoom }}>
          <span className="absolute top-1 left-1.5 text-[9px] font-mono text-on-surface-variant select-none opacity-60">{i}s</span>
        </div>
      )
    }
    return ticks
  }

  return (
    <div className="w-full h-full flex flex-col bg-surface-container/90 backdrop-blur-xl select-none border-t border-white/10">
      {/* ПАНЕЛЬ ИНСТРУМЕНТОВ МОНТАЖА */}
      <div className="h-10 border-b border-white/10 flex items-center px-4 justify-between bg-surface-container-lowest/70 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="p-1 w-8 h-8 rounded-full hover:bg-primary/20" onClick={togglePlay} title="Воспроизведение (Space)">
            {isPlaying ? <Pause size={18} className="text-primary" /> : <Play size={18} className="text-primary fill-primary" />}
          </Button>
          <span className="font-mono text-xs text-primary font-bold tracking-widest bg-black/40 px-2 py-1 rounded border border-primary/20">{formatTime(currentTime)}</span>
        </div>

        <div className="flex items-center gap-1 bg-surface-container-lowest border border-white/10 p-0.5 rounded-lg">
          <button
            onClick={() => setActiveTool('select')}
            className={`p-1.5 rounded transition-all flex items-center gap-1 text-xs ${activeTool === 'select' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}
            title="Курсор выбора (V)"
          >
            <MousePointer size={14} /><span className="text-[10px] font-mono hidden lg:inline">Выбор (V)</span>
          </button>
          <button
            onClick={() => setActiveTool('razor')}
            className={`p-1.5 rounded transition-all flex items-center gap-1 text-xs ${activeTool === 'razor' ? 'bg-error/20 text-error border border-error/40' : 'text-on-surface-variant hover:text-white'}`}
            title="Лезвие (C) — клик по фрагменту разрезает его"
          >
            <Scissors size={14} /><span className="text-[10px] font-mono hidden lg:inline">Лезвие (C)</span>
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button
            onClick={handleSplitAtPlayhead}
            className="p-1.5 text-on-surface-variant hover:text-secondary hover:bg-white/5 rounded text-xs transition-colors flex items-center gap-1"
            title="Разрезать по плейхеду (S / Ctrl+K)"
          >
            <Split size={14} /><span className="text-[10px] hidden lg:inline">Разрезать (S)</span>
          </button>
          <button
            onClick={() => selectedFragmentId && onDuplicateFragment?.(selectedFragmentId)}
            disabled={!selectedFragmentId}
            className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-white/5 rounded text-xs transition-colors disabled:opacity-30"
            title="Дублировать выбранный фрагмент (Ctrl+D)"
          >
            <Copy size={14} />
          </button>
          <button
            onClick={() => selectedFragmentId && onDeleteFragment?.(selectedFragmentId)}
            disabled={!selectedFragmentId}
            className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded text-xs transition-colors disabled:opacity-30"
            title="Удалить выбранный фрагмент (Delete)"
          >
            <Trash2 size={14} />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button
            onClick={() => setIsAudioLinked((l) => !l)}
            className={`p-1.5 rounded transition-colors text-xs flex items-center gap-1 ${isAudioLinked ? 'text-primary hover:bg-primary/10' : 'text-warning bg-warning/10 border border-warning/30'}`}
            title={isAudioLinked ? 'Аудио и визуал связаны — изменение границы сдвигает соседа (клик: разъединить)' : 'Аудио и визуал разъединены — граница двигается свободно (клик: связать)'}
          >
            {isAudioLinked ? <Link size={14} /> : <Unlink size={14} />}
            <span className="text-[10px] hidden xl:inline">{isAudioLinked ? 'Связано' : 'Разъединено'}</span>
          </button>
          <button
            onClick={() => setIsSnapEnabled((s) => !s)}
            className={`p-1.5 rounded transition-colors ${isSnapEnabled ? 'text-secondary hover:bg-secondary/10' : 'text-on-surface-variant/50'}`}
            title="Магнитная привязка (M)"
          >
            <Magnet size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" className="p-1 w-7 h-7" onClick={() => setZoom((z) => Math.max(30, z - 20))} title="Уменьшить масштаб">
            <ZoomOut size={15} />
          </Button>
          <span className="text-[10px] text-on-surface-variant font-mono w-10 text-center">{zoom}px/s</span>
          <Button variant="ghost" className="p-1 w-7 h-7" onClick={() => setZoom((z) => Math.min(300, z + 20))} title="Увеличить масштаб">
            <ZoomIn size={15} />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-28 shrink-0 border-r border-white/10 bg-surface-container-lowest/40 flex flex-col z-20">
          <div className="h-7 border-b border-white/5 px-3 flex items-center text-[9px] font-mono uppercase text-on-surface-variant/60">Шкала</div>
          <div className="h-12 flex items-center px-3 text-[10px] uppercase font-bold text-on-surface border-b border-white/5">Сценарий</div>
          <div className="h-12 flex items-center px-3 text-[10px] uppercase font-bold text-secondary border-b border-white/5">B-Roll</div>
          <div className="h-12 flex items-center px-3 text-[10px] uppercase font-bold text-primary border-b border-white/5">Аудио</div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative bg-[#070b14]" ref={scrollRef}>
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
            {/* Шкала — клик/драг ВСЕГДА двигает плейхед, даже в режиме «Лезвие» */}
            <div
              className="h-7 border-b border-white/10 relative bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              onMouseDown={handleScrubStart}
            >
              {renderTicks()}
            </div>

            {['text', 'broll', 'audio'].map((track) => (
              <div key={track} className="h-12 border-b border-white/5 relative" onMouseDown={activeTool === 'select' ? handleScrubStart : undefined}>
                {computedFragments.map((f) => {
                  const left = f.computedStart * zoom
                  const width = (f.computedEnd - f.computedStart) * zoom
                  const isSelected = selectedFragmentId === f.id

                  let content = null
                  let bgColor = ''

                  if (track === 'text') {
                    bgColor = isSelected
                      ? 'bg-primary/20 border-primary shadow-[0_0_12px_rgba(221,183,255,0.3)] text-white'
                      : 'bg-surface-bright/80 border-outline-variant/60 text-on-surface hover:border-primary/50'
                    content = (
                      <span className="truncate text-[10px] px-2 font-medium select-none pointer-events-none">
                        {f.text || <span className="opacity-40 italic">Пустой фрагмент</span>}
                      </span>
                    )
                  } else if (track === 'broll') {
                    bgColor = f.bRollFileName
                      ? 'bg-secondary/20 border-secondary/50 text-secondary'
                      : 'bg-transparent border-dashed border-white/5'
                    content = f.bRollFileName && (
                      <span className="truncate text-[10px] px-2 select-none pointer-events-none font-mono">🎬 {f.bRollFileName}</span>
                    )
                  } else if (track === 'audio') {
                    // Сцена озвучена (хоть на одном фрагменте есть аудио) — волна рисуется везде
                    bgColor = hasAnyAudio || f.audioFileName
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-transparent border-dashed border-white/5'
                    content = (hasAnyAudio || f.audioFileName) ? <WaveformMock width={width} seed={f.id} /> : null
                  }

                  return (
                    <div
                      key={f.id}
                      onClick={(e) => {
                        if (activeTool === 'razor') handleRazorCut(f.id, e)
                        else { e.stopPropagation(); onSelectFragment?.(f.id) }
                      }}
                      className={`timeline-frag absolute top-1 bottom-1 rounded-md border flex items-center overflow-hidden transition-all group ${bgColor} ${activeTool === 'razor' ? 'hover:brightness-125' : ''}`}
                      style={{ left, width }}
                    >
                      {activeTool === 'select' && (
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-20 flex items-center justify-center group/handle"
                          onMouseDown={(e) => handleMouseDownEdge(e, f.id, 'start')}
                          title="Тяните для изменения начала"
                        >
                          <div className="w-[1px] h-3.5 bg-white/60 group-hover/handle:bg-white" />
                        </div>
                      )}

                      {content}

                      {activeTool === 'select' && (
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-20 flex items-center justify-center group/handle"
                          onMouseDown={(e) => handleMouseDownEdge(e, f.id, 'end')}
                          title="Тяните для изменения конца"
                        >
                          <div className="w-[1px] h-3.5 bg-white/60 group-hover/handle:bg-white" />
                        </div>
                      )}

                      {activeTool === 'razor' && hoveredTime !== null && hoveredTime >= f.computedStart && hoveredTime <= f.computedEnd && (
                        <div
                          className="absolute top-0 bottom-0 w-[2px] bg-error pointer-events-none shadow-[0_0_8px_rgba(255,0,0,0.8)] z-30"
                          style={{ left: (hoveredTime - f.computedStart) * zoom }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

            <div
              className="absolute top-0 bottom-0 w-[2px] bg-error z-40 pointer-events-none shadow-[0_0_12px_rgba(255,80,80,0.9)] transition-all duration-75"
              style={{ left: currentTime * zoom }}
            >
              <div
                className="w-3.5 h-4 bg-error rounded-b-sm -translate-x-[6px] shadow-lg flex items-center justify-center cursor-ew-resize pointer-events-auto"
                onMouseDown={handleScrubStart}
              >
                <div className="w-1 h-2 bg-white/80 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
