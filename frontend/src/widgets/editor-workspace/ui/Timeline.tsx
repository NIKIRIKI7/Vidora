import React, { useState, useEffect, useRef, useMemo } from 'react'
import type { SceneFragment } from '@entities/project'
import { Button } from '@shared/ui'
import { Play, Pause, ZoomIn, ZoomOut } from 'lucide-react'

interface TimelineProps {
  fragments: SceneFragment[]
  videoRef: React.RefObject<HTMLVideoElement | null>
  onUpdateBounds: (fragId: string, edge: 'start' | 'end', newTime: number) => void
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
    <div className="w-full h-full flex items-center justify-between px-0.5 gap-[1px] opacity-60">
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

export const Timeline = ({ fragments, videoRef, onUpdateBounds }: TimelineProps) => {
  const [zoom, setZoom] = useState(100)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [dragFragments, setDragFragments] = useState<SceneFragment[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<SceneFragment[] | null>(null)

  const computedFragments = useMemo(() => computeFragments(dragFragments ?? fragments), [dragFragments, fragments])
  const duration = Math.max(10, ...computedFragments.map((f) => f.computedEnd))

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ponytail: rAF poll of videoRef instead of play/pause event listeners —
  // listeners bind at mount and miss a video element that mounts after (post-render).
  // Only re-renders when time actually moves or play state flips.
  useEffect(() => {
    let raf: number
    const loop = () => {
      const v = videoRef.current
      if (v) {
        setCurrentTime(prev => Math.abs(prev - v.currentTime) > 0.01 ? v.currentTime : prev)
        setIsPlaying(prev => prev !== !v.paused ? !v.paused : prev)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [videoRef])

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) videoRef.current.play()
      else videoRef.current.pause()
    }
  }

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (dragId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const newTime = clickX / zoom
    if (videoRef.current) {
      videoRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  const handleMouseDown = (e: React.MouseEvent, id: string, edge: 'start' | 'end') => {
    e.preventDefault()
    e.stopPropagation()
    setDragId(id)

    const startX = e.clientX
    const frag = computedFragments.find((f) => f.id === id)!
    const initialTime = edge === 'start' ? frag.computedStart : frag.computedEnd
    const maxStart = frag.computedEnd - 0.1
    const minEnd = frag.computedStart + 0.1

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaTime = (moveEvent.clientX - startX) / zoom
      const base = dragRef.current ?? fragments
      const idx = base.findIndex((f) => f.id === id)
      if (idx === -1) return
      const next = [...base]
      let newTime = Math.max(0, initialTime + deltaTime)

      if (edge === 'start') {
        newTime = Math.min(newTime, maxStart)
        next[idx] = { ...next[idx], startTime: newTime }
        if (idx > 0) next[idx - 1] = { ...next[idx - 1], endTime: newTime }
      } else {
        newTime = Math.max(newTime, minEnd)
        next[idx] = { ...next[idx], endTime: newTime }
        if (idx < next.length - 1) next[idx + 1] = { ...next[idx + 1], startTime: newTime }
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
      onUpdateBounds(id, edge, finalTime)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    const ms = Math.floor((sec % 1) * 10)
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`
  }

  const renderTicks = () => {
    const ticks = []
    for (let i = 0; i <= Math.ceil(duration); i++) {
      ticks.push(
        <div key={i} className="absolute top-0 bottom-0 border-l border-white/20" style={{ left: i * zoom }}>
          <span className="absolute top-1 left-1 text-[9px] text-on-surface-variant select-none">{i}s</span>
        </div>
      )
    }
    return ticks
  }

  return (
    <div className="w-full h-full flex flex-col bg-surface-container/80 backdrop-blur-md">
      <div className="h-10 border-b border-white/5 flex items-center px-4 justify-between bg-surface-container-lowest/50 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="p-1 w-8 h-8 rounded-full" onClick={togglePlay}>
            {isPlaying ? <Pause size={20} className="text-primary" /> : <Play size={20} className="text-primary" />}
          </Button>
          <span className="font-mono text-sm text-primary tracking-widest">{formatTime(currentTime)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="p-1 w-7 h-7" onClick={() => setZoom((z) => Math.max(20, z - 20))}>
            <ZoomOut size={16} />
          </Button>
          <span className="text-[10px] text-on-surface-variant font-mono w-8 text-center">{zoom}%</span>
          <Button variant="ghost" className="p-1 w-7 h-7" onClick={() => setZoom((z) => Math.min(300, z + 20))}>
            <ZoomIn size={16} />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-28 shrink-0 border-r border-white/10 bg-surface-container-lowest/30 flex flex-col">
          <div className="h-8 border-b border-white/5" />
          <div className="h-12 flex items-center px-3 text-[10px] uppercase font-bold text-on-surface border-b border-white/5">Сценарий</div>
          <div className="h-12 flex items-center px-3 text-[10px] uppercase font-bold text-secondary border-b border-white/5">B-Roll</div>
          <div className="h-12 flex items-center px-3 text-[10px] uppercase font-bold text-primary border-b border-white/5">Аудио</div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative" ref={scrollRef}>
          <div className="relative h-full" style={{ width: Math.max(duration * zoom, containerWidth) }}>

            <div className="h-8 border-b border-white/5 relative cursor-text bg-white/5 hover:bg-white/10 transition-colors" onClick={handleTimelineClick}>
              {renderTicks()}
            </div>

            {['text', 'broll', 'audio'].map((track) => (
              <div key={track} className="h-12 border-b border-white/5 relative">
                {computedFragments.map((f) => {
                  const left = f.computedStart * zoom
                  const width = (f.computedEnd - f.computedStart) * zoom

                  let content = null
                  let bgColor = ''

                  if (track === 'text') {
                    bgColor = 'bg-surface-bright/80 border-outline-variant/50 text-on-surface'
                    content = <span className="truncate text-[10px] px-2 select-none pointer-events-none">{f.text}</span>
                  } else if (track === 'broll') {
                    if (!f.bRollFileName) return null
                    bgColor = 'bg-secondary/20 border-secondary/40 text-secondary'
                    content = <span className="truncate text-[10px] px-2 select-none pointer-events-none">{f.bRollFileName}</span>
                  } else if (track === 'audio') {
                    if (!f.audioFileName && !f.lastAudioHash) return null
                    bgColor = 'bg-primary/20 border-primary/40 text-primary'
                    content = <WaveformMock width={width} seed={f.id} />
                  }

                  return (
                    <div
                      key={f.id}
                      className={`absolute top-1.5 bottom-1.5 rounded border flex items-center overflow-hidden transition-colors ${bgColor}`}
                      style={{ left, width }}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 z-20 flex items-center justify-center group" onMouseDown={(e) => handleMouseDown(e, f.id, 'start')}>
                        <div className="w-[1px] h-3 bg-white/50 group-hover:bg-white transition-colors" />
                      </div>

                      {content}

                      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 z-20 flex items-center justify-center group" onMouseDown={(e) => handleMouseDown(e, f.id, 'end')}>
                        <div className="w-[1px] h-3 bg-white/50 group-hover:bg-white transition-colors" />
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            <div
              className="absolute top-0 bottom-0 w-[1px] bg-error z-30 pointer-events-none shadow-[0_0_10px_rgba(255,0,0,0.5)]"
              style={{ left: currentTime * zoom }}
            >
              <div className="w-3 h-3 bg-error rounded-sm -translate-x-1/2 -mt-0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}