import { useState, useMemo, type ReactNode } from 'react'
import { Flame, Clock, Award } from 'lucide-react'
import type { HeatmapPoint, VideoChapter } from '@shared/api'

interface RetentionHeatmapChartProps {
  heatmap: HeatmapPoint[]
  chapters?: VideoChapter[]
  totalDurationSeconds?: number
  onSeek?: (seconds: number) => void
  className?: string
}

const formatTime = (sec: number): string => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export const RetentionHeatmapChart = ({
  heatmap,
  chapters = [],
  totalDurationSeconds = 0,
  onSeek,
  className = '',
}: RetentionHeatmapChartProps): ReactNode => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const duration = useMemo(() => {
    if (totalDurationSeconds > 0) return totalDurationSeconds
    if (heatmap.length > 0) return heatmap[heatmap.length - 1].endSeconds
    return 1
  }, [totalDurationSeconds, heatmap])

  const { pointsStr, maxIntensity, peakPoint } = useMemo<{ pointsStr: string; maxIntensity: number; peakPoint: HeatmapPoint | null }>(() => {
    if (heatmap.length === 0) return { pointsStr: '', maxIntensity: 1, peakPoint: null }

    let max = 0
    let peak: HeatmapPoint | null = null
    heatmap.forEach((p) => {
      if (p.intensity > max) {
        max = p.intensity
        peak = p
      }
    })

    const safeMax = max > 0 ? max : 1
    const width = 1000
    const height = 180

    const coords = heatmap.map((p) => {
      const midSec = (p.startSeconds + p.endSeconds) / 2
      const x = (midSec / duration) * width
      const y = height - (p.intensity / safeMax) * (height - 30) - 10
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })

    return {
      pointsStr: `0,${height} ${coords.join(' ')} ${width},${height}`,
      maxIntensity: safeMax,
      peakPoint: peak,
    }
  }, [heatmap, duration])

  const activeHover = hoveredIndex !== null ? heatmap[hoveredIndex] : null

  const currentChapter = useMemo(() => {
    if (!activeHover) return null
    const sec = (activeHover.startSeconds + activeHover.endSeconds) / 2
    return chapters.find((c) => sec >= c.startSeconds && sec <= c.endSeconds)
  }, [activeHover, chapters])

  if (heatmap.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-surface-container-lowest/60 border border-outline-variant rounded-xl text-center">
        <Clock className="w-8 h-8 text-secondary mb-2 opacity-60" />
        <p className="text-sm text-on-surface/80">Heatmap пока недоступен для этого видео</p>
        <span className="text-xs text-on-surface-variant/50 mt-1">YouTube формирует метрики повторного просмотра после набора первичного пула зрителей</span>
      </div>
    )
  }

  return (
    <div className={`relative flex flex-col bg-surface border border-outline-variant rounded-xl p-4 backdrop-blur-xl ${className}`}>
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
            <Flame className="w-3.5 h-3.5 text-error" />
            Кривая удержания (Viewer Retention)
          </span>
          {peakPoint && (
            <span className="text-secondary bg-secondary/10 px-2 py-0.5 rounded-full border border-secondary/20 hidden sm:inline-flex items-center gap-1">
              <Award className="w-3 h-3" />
              Пик пересмотра: {formatTime((peakPoint.startSeconds + peakPoint.endSeconds) / 2)}
            </span>
          )}
        </div>
        <div className="text-on-surface-variant/70 font-mono text-[11px]">
          {activeHover ? (
            <span className="text-white font-bold">
              {formatTime(activeHover.startSeconds)} - {formatTime(activeHover.endSeconds)} | Интенсивность: {(activeHover.intensity * 100).toFixed(0)}%
            </span>
          ) : (
            <span>Наведите курсор на график</span>
          )}
        </div>
      </div>

      <div className="relative w-full h-[150px] overflow-hidden rounded-lg bg-surface-container-lowest border border-outline-variant/30">
        <div
          className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-primary/20 to-transparent border-r border-primary/40 pointer-events-none z-0"
          style={{ width: `${Math.min(100, (15 / duration) * 100)}%` }}
        >
          <span className="absolute top-1 left-1.5 text-[9px] font-mono text-primary uppercase tracking-wider bg-black/50 px-1 rounded">
            Хук 0-15s
          </span>
        </div>

        <svg viewBox="0 0 1000 180" className="w-full h-full preserve-3d cursor-crosshair z-10" preserveAspectRatio="none">
          <defs>
            <linearGradient id="retentionGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ddb7ff" stopOpacity="0.75" />
              <stop offset="50%" stopColor="#4fdbc8" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0b1326" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ddb7ff" />
              <stop offset="60%" stopColor="#4fdbc8" />
              <stop offset="100%" stopColor="#b76dff" />
            </linearGradient>
          </defs>

          <polygon points={pointsStr} fill="url(#retentionGradient)" />

          <polyline
            points={heatmap
              .map((p) => {
                const mid = (p.startSeconds + p.endSeconds) / 2
                const x = (mid / duration) * 1000
                const y = 180 - (p.intensity / maxIntensity) * 150 - 10
                return `${x.toFixed(1)},${y.toFixed(1)}`
              })
              .join(' ')}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {heatmap.map((p, idx) => {
            const startX = (p.startSeconds / duration) * 1000
            const w = Math.max(2, ((p.endSeconds - p.startSeconds) / duration) * 1000)
            const isHovered = hoveredIndex === idx

            return (
              <g key={idx}>
                <rect
                  x={startX}
                  y={0}
                  width={w}
                  height={180}
                  fill={isHovered ? 'rgba(221, 183, 255, 0.15)' : 'transparent'}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => onSeek?.(p.startSeconds)}
                />
                {isHovered && (
                  <line
                    x1={startX + w / 2}
                    y1={0}
                    x2={startX + w / 2}
                    y2={180}
                    stroke="#ddb7ff"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            )
          })}
        </svg>

        {activeHover && (
          <div
            className="absolute bottom-2 pointer-events-none transform -translate-x-1/2 bg-surface-container/90 border border-outline-variant text-white text-[11px] px-2.5 py-1 rounded-md shadow-2xl backdrop-blur-md z-20 flex items-center gap-1.5"
            style={{
              left: `${Math.max(8, Math.min(92, (((activeHover.startSeconds + activeHover.endSeconds) / 2) / duration) * 100))}%`,
            }}
          >
            <span className="text-secondary font-bold">{formatTime(activeHover.startSeconds)}</span>
            {currentChapter && <span className="text-on-surface-variant truncate max-w-[150px]">«{currentChapter.title}»</span>}
          </div>
        )}
      </div>

      {chapters.length > 0 && (
        <div className="mt-2 flex gap-1 w-full h-2 rounded overflow-hidden bg-black/40">
          {chapters.map((ch, i) => {
            const widthPct = Math.max(1, ((ch.endSeconds - ch.startSeconds) / duration) * 100)
            return (
              <div
                key={i}
                className="h-full bg-white/20 hover:bg-secondary transition-colors cursor-pointer relative group"
                style={{ width: `${widthPct}%` }}
                title={`${ch.title} (${formatTime(ch.startSeconds)})`}
                onClick={() => onSeek?.(ch.startSeconds)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
