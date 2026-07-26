import { useRef, useState, type FC } from 'react'
import type { Scene, SceneFragment } from '@entities/project'
import { Icon } from '@shared/ui'

interface Props {
  activeScene: Scene | undefined
  currentTime: number
  onSeek: (time: number) => void
  onTimingChange: (fragId: string, startTime: number | undefined, endTime: number | undefined) => void
}

// ponytail: pixel-based drag, no snap, no zoom levels — global scale bar, calc per-scene zoom if many fragments
export const BottomTimeline: FC<Props> = ({ activeScene, currentTime, onSeek, onTimingChange }) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{ fragId: string; edge: 'start' | 'end' } | null>(null)

  if (!activeScene) return null

  const fragments = activeScene.fragments
  if (!fragments.length) return null

  const totalDuration = Math.max(
    ...fragments.map(f => f.endTime || 0),
    ...fragments.map(f => f.startTime || 0),
    5
  ) + 2

  const pxPerSec = 80
  const totalPx = totalDuration * pxPerSec

  const handleTrackClick = (e: React.MouseEvent) => {
    if (dragging) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const time = Math.max(0, x / pxPerSec)
    onSeek(time)
  }

  const handleEdgeMouseDown = (fragId: string, edge: 'start' | 'end') => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setDragging({ fragId, edge })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const time = Math.max(0, Math.round((x / pxPerSec) * 10) / 10)

    const idx = fragments.findIndex(f => f.id === dragging.fragId)
    if (idx === -1) return

    if (dragging.edge === 'start') {
      const maxStart = fragments[idx].endTime !== undefined ? fragments[idx].endTime! - 0.1 : time
      const clamped = Math.min(time, maxStart)
      onTimingChange(dragging.fragId, clamped, fragments[idx].endTime)
      if (idx > 0) {
        onTimingChange(fragments[idx - 1].id, fragments[idx - 1].startTime, clamped)
      }
    } else {
      const minEnd = fragments[idx].startTime !== undefined ? fragments[idx].startTime! + 0.1 : time
      const clamped = Math.max(time, minEnd)
      onTimingChange(dragging.fragId, fragments[idx].startTime, clamped)
      if (idx < fragments.length - 1) {
        onTimingChange(fragments[idx + 1].id, clamped, fragments[idx + 1].endTime)
      }
    }
  }

  const handleMouseUp = () => {
    setDragging(null)
  }

  const playheadLeft = (currentTime / totalDuration) * 100

  return (
    <div
      className="relative w-full overflow-x-auto border-t border-white/10 bg-surface-container/80 backdrop-blur-xl"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="px-4 py-2 text-[10px] text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
        <Icon name="timeline" className="text-[14px]" />
        Timeline
        <span className="text-primary font-mono ml-auto">{currentTime.toFixed(1)}s</span>
      </div>

      <div className="relative mx-4 mb-2" style={{ height: 48 }}>
        <div
          ref={trackRef}
          className="absolute inset-0 cursor-pointer"
          onClick={handleTrackClick}
          style={{ minWidth: totalPx }}
        >
          {/* bg ticks */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
              <div key={i} className="flex flex-col items-center flex-1 min-w-0">
                <div className="text-[9px] text-on-surface-variant/50 font-mono -mt-4">{i}s</div>
                <div className="w-px h-full bg-white/5" />
              </div>
            ))}
          </div>

          {/* fragment blocks */}
          {fragments.map((frag) => {
            const left = ((frag.startTime ?? 0) / totalDuration) * 100
            const width = (((frag.endTime ?? totalDuration) - (frag.startTime ?? 0)) / totalDuration) * 100
            return (
              <FragmentBlock
                key={frag.id}
                frag={frag}
                left={left}
                width={width}
                onEdgeMouseDown={handleEdgeMouseDown}
              />
            )
          })}

          {/* playhead */}
          <div
            className="absolute top-0 w-0.5 h-full bg-primary shadow-[0_0_8px_rgba(221,183,255,0.6)] pointer-events-none z-10"
            style={{ left: `${playheadLeft}%` }}
          />
        </div>
      </div>
    </div>
  )
}

const FragmentBlock: FC<{
  frag: SceneFragment
  left: number
  width: number
  onEdgeMouseDown: (fragId: string, edge: 'start' | 'end') => (e: React.MouseEvent) => void
}> = ({ frag, left, width, onEdgeMouseDown }) => (
  <div
    className="absolute top-1/2 -translate-y-1/2 h-6 rounded bg-secondary/20 border border-secondary/40 group"
    style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
    title={`${frag.visualNote} (${(frag.startTime ?? 0).toFixed(1)}s - ${(frag.endTime ?? 0).toFixed(1)}s)`}
  >
    <div
      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-secondary/0 hover:bg-secondary/60 rounded-l transition-colors"
      onMouseDown={onEdgeMouseDown(frag.id, 'start')}
    />
    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white/70 truncate px-3 pointer-events-none">
      {frag.visualNote}
    </span>
    <div
      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-secondary/0 hover:bg-secondary/60 rounded-r transition-colors"
      onMouseDown={onEdgeMouseDown(frag.id, 'end')}
    />
  </div>
)
