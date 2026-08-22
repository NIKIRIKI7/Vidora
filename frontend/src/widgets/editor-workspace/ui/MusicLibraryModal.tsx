import { useState, useEffect, useRef } from 'react'
import { Modal, Button, Spinner } from '@shared/ui'
import { Play, Square, Upload, Sparkles, Check } from 'lucide-react'
import type { ProjectSettings, MusicCategory, MusicTrackItem } from '@entities/project'
import { API } from '@shared/lib'
import { getProjectPath } from '@widgets/editor-workspace/lib/helpers'

interface Props {
  isOpen: boolean
  onClose: () => void
  project: ProjectSettings
  activeTrackId?: string
  onSelectTrack: (track: MusicTrackItem) => void
}

export const MusicLibraryModal = ({ isOpen, onClose, project, activeTrackId, onSelectTrack }: Props) => {
  const [categories, setCategories] = useState<MusicCategory[]>([])
  const [customTracks, setCustomTracks] = useState<MusicTrackItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [playingTrackPath, setPlayingTrackPath] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) {
      audioRef.current?.pause()
      queueMicrotask(() => setPlayingTrackPath(null))
      return
    }
    const loadLibrary = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`${API}/api/v1/media/music-library?project_path=${encodeURIComponent(getProjectPath(project))}`)
        const data = await res.json()
        if (data.status === 'ok') {
          setCategories(data.categories || [])
          setCustomTracks(data.custom_tracks || [])
        }
      } catch {
        // молча
      } finally {
        setIsLoading(false)
      }
    }
    loadLibrary()
  }, [isOpen, project])

  const togglePlay = (path: string) => {
    if (playingTrackPath === path) {
      audioRef.current?.pause()
      setPlayingTrackPath(null)
    } else {
      setPlayingTrackPath(path)
      if (audioRef.current) {
        audioRef.current.src = `${API}/api/v1/render/media?path=${encodeURIComponent(path)}`
        audioRef.current.play().catch(() => {})
      }
    }
  }

  const handleUploadCustom = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('project_path', getProjectPath(project))
    try {
      const res = await fetch(`${API}/api/v1/media/upload-music`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.status === 'ok') {
        const newTrack: MusicTrackItem = {
          id: `custom_${data.filename}`,
          name: data.filename,
          duration: 0,
          path: data.path,
          is_custom: true,
        }
        setCustomTracks((prev) => [newTrack, ...prev])
        onSelectTrack(newTrack)
      }
    } catch {
      // молча
    }
    e.target.value = ''
  }

  const renderTrackRow = (t: MusicTrackItem) => (
    <div
      key={t.id}
      className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
        activeTrackId === t.id ? 'bg-primary/20 border-primary text-primary' : 'bg-surface-container-lowest border-white/5 hover:border-white/20 text-on-surface'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button type="button" onClick={() => togglePlay(t.path)} className="p-1.5 rounded-full bg-white/5 hover:bg-white/20 text-white shrink-0">
          {playingTrackPath === t.path ? <Square size={13} /> : <Play size={13} className="fill-current" />}
        </button>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium truncate">{t.name}</span>
          {t.duration > 0 && (
            <span className="text-[10px] opacity-60 font-mono">
              {Math.floor(t.duration / 60)}:{String(Math.floor(t.duration % 60)).padStart(2, '0')} {t.bpm ? `• ${t.bpm} BPM` : ''}
            </span>
          )}
        </div>
      </div>
      <Button variant={activeTrackId === t.id ? 'primary' : 'ghost'} onClick={() => onSelectTrack(t)} className="text-xs py-1 px-3 h-auto shrink-0">
        {activeTrackId === t.id ? <><Check size={13} className="mr-1" /> Выбран</> : 'Выбрать'}
      </Button>
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🎵 Библиотека Фоновой Музыки" className="max-w-2xl">
      <audio ref={audioRef} onEnded={() => setPlayingTrackPath(null)} className="hidden" />

      <div className="flex flex-col gap-5 pb-2">
        <div className="flex items-center justify-between gap-3">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="audio/*"
            onChange={handleUploadCustom}
          />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="text-xs shrink-0 py-2">
            <Upload size={14} className="mr-1.5" /> Загрузить свой трек
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12"><Spinner className="text-4xl" /></div>
        ) : (
          <div className="flex flex-col gap-6 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">
            {customTracks.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono uppercase text-accent font-bold">Ваши загруженные треки</span>
                <div className="flex flex-col gap-1.5">{customTracks.map(renderTrackRow)}</div>
              </div>
            )}

            {categories.map((cat) => (
              <div key={cat.category} className="flex flex-col gap-2">
                <span className="text-xs font-mono uppercase text-secondary font-bold flex items-center gap-1.5">
                  <Sparkles size={14} /> {cat.category_title}
                </span>
                <div className="flex flex-col gap-1.5">{cat.tracks.map(renderTrackRow)}</div>
              </div>
            ))}

            {!isLoading && customTracks.length === 0 && categories.length === 0 && (
              <div className="text-center text-xs text-on-surface-variant py-8">
                Библиотека пуста. Загрузите свой трек или положите MP3 в <span className="font-mono">backend/assets/music/&lt;категория&gt;/</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
