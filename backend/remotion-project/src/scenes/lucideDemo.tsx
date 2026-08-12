import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate, Easing, useVideoConfig } from 'remotion'
import { Cpu, Zap, Activity, MonitorPlay, Clapperboard, Sparkles, Gauge, User, Settings, Music, Film, Image } from 'lucide-react'

// ponytail: lucide smoke-test composition — proves lucide-react bundles and renders in Remotion
export const compositionConfig = {
  id: 'lucide-icons-test',
  durationInFrames: 60,
  fps: 30,
  width: 1920,
  height: 1080,
}

const ICONS = [
  { Icon: Cpu, color: '#00C7FD' },
  { Icon: Zap, color: '#FFD700' },
  { Icon: Activity, color: '#FF6B6B' },
  { Icon: MonitorPlay, color: '#A78BFA' },
  { Icon: Clapperboard, color: '#34D399' },
  { Icon: Sparkles, color: '#F472B6' },
  { Icon: Gauge, color: '#FBBF24' },
  { Icon: User, color: '#60A5FA' },
  { Icon: Settings, color: '#94A3B8' },
  { Icon: Music, color: '#2DD4BF' },
  { Icon: Film, color: '#C084FC' },
  { Icon: Image, color: '#4ADE80' },
] as const

export const Scene: React.FC = () => {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const cols = 6
  const size = width / cols

  return (
    <AbsoluteFill style={{ backgroundColor: '#050B14', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-evenly', padding: 60 }}>
      {ICONS.map(({ Icon, color }, i) => {
        const delay = i * 4
        const scale = interpolate(frame - delay, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(2)) })
        const opacity = interpolate(frame, [delay, delay + 2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        const pop = interpolate(frame - delay - 15, [0, 12], [1, 1.35], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin) })
        return (
          <div key={i} style={{ width: size * 0.42, height: size * 0.42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon
              strokeWidth={1.5}
              style={{ width: size * 0.3, height: size * 0.3, color, transform: `scale(${scale * pop})`, opacity, filter: `drop-shadow(0 0 ${24 * scale}px ${color}66)` }}
            />
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

export default Scene