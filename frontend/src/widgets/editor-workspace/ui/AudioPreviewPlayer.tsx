import { useState, useRef, useEffect } from 'react'
import { Button, ProgressBar } from '@shared/ui'
import type { SceneFragment } from '@entities/project'
import { API } from '@widgets/editor-workspace/lib/helpers'

interface Props {
  audioPath: string | null
  fragments: SceneFragment[]
  activeFragmentId: string | null
  onActiveFragmentChange: (id: string) => void
}

export const AudioPreviewPlayer = ({ audioPath, fragments, activeFragmentId, onActiveFragmentChange }: Props) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!isPlaying) return
    let animationFrame: number
    const update = () => {
      const audio = audioRef.current
      if (!audio) return
      const time = audio.currentTime
      const dur = audio.duration || 1
      setProgress((time / dur) * 100)
      const active = fragments.find(f => time >= (f.startTime || 0) && time < (f.endTime || dur))
      if (active && active.id !== activeFragmentId) onActiveFragmentChange(active.id)
      animationFrame = requestAnimationFrame(update)
    }
    animationFrame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animationFrame)
  }, [isPlaying, fragments, activeFragmentId, onActiveFragmentChange])

  if (!audioPath) return null

  return (
    <div className="flex flex-col gap-2 p-3 bg-surface-container border border-white/10 rounded-xl">
      <audio ref={audioRef} src={`${API}/api/v1/render/media?path=${encodeURIComponent(audioPath)}`} onEnded={() => setIsPlaying(false)} />
      <div className="flex items-center gap-3">
        <Button variant="icon" icon={isPlaying ? 'pause' : 'play_arrow'} onClick={() => {
          const audio = audioRef.current
          if (!audio) return
          isPlaying ? audio.pause() : audio.play()
          setIsPlaying(!isPlaying)
        }} />
        <ProgressBar progress={progress} className="flex-1" />
      </div>
    </div>
  )
}
