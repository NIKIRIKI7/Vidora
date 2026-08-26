import { useState, useRef } from 'react'
import { Modal, Button, FieldGroup, Select, Spinner, Input } from '@shared/ui'
import { Search, Sparkles, Check, MonitorPlay } from 'lucide-react'
import type { ProjectSettings, Scene, BRollAudioMode } from '@entities/project'
import { API } from '@shared/lib'
import { getProjectPath } from '../lib/helpers'

interface StockVideo {
  id: number
  duration: number
  image: string
  video_files: { width: number; height: number; link: string }[]
}

export interface BRollApplyParams {
  scope: 'fragment' | 'scene' | 'project'
  sourcePath: string
  targetFragId?: string
  targetSceneId?: string
  fitMode: 'cover' | 'blur_pad'
  timingMode: 'ripple' | 'trim'
  audioMode: BRollAudioMode
  filename?: string
  duration?: number
}

interface Props {
  isOpen: boolean
  onClose: () => void
  project: ProjectSettings
  activeScene?: Scene
  activeFragmentId?: string | null
  initialScope?: 'fragment' | 'scene' | 'project'
  onApply: (params: BRollApplyParams) => Promise<void>
}

export const BRollModal = ({
  isOpen,
  onClose,
  project,
  activeScene,
  activeFragmentId,
  initialScope = 'fragment',
  onApply,
}: Props) => {
  const [scope, setScope] = useState<'fragment' | 'scene' | 'project'>(initialScope)
  const [sourceTab, setSourceTab] = useState<'upload' | 'pexels'>('upload')
  const [fitMode, setFitMode] = useState<'cover' | 'blur_pad'>('cover')
  const [timingMode, setTimingMode] = useState<'ripple' | 'trim'>('ripple')
  const [audioMode, setAudioMode] = useState<BRollAudioMode>('voice')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [stockVideos, setStockVideos] = useState<StockVideo[]>([])
  const [selectedStockVideo, setSelectedStockVideo] = useState<StockVideo | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handlePexelsSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    try {
      const orientation = project.format === '9:16' ? 'portrait' : 'landscape'
      const res = await fetch(`${API}/api/v1/media/search-stock?query=${encodeURIComponent(searchQuery)}&orientation=${orientation}`)
      const data = await res.json()
      if (data.status === 'ok') setStockVideos(data.videos || [])
    } catch {
      setStockVideos([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleSubmit = async () => {
    setIsProcessing(true)
    try {
      const projectPath = getProjectPath(project)
      let resolvedSourcePath = ''
      let originalFilename = ''
      let fileDuration = 0

      if (sourceTab === 'upload') {
        if (!selectedFile) return
        const fd = new FormData()
        fd.append('file', selectedFile)
        fd.append('project_path', projectPath)
        fd.append('folder', 'b-roll-raw')
        const upRes = await fetch(`${API}/api/v1/media/upload`, { method: 'POST', body: fd })
        const upData = await upRes.json()
        if (!upRes.ok || upData.status !== 'ok') throw new Error(upData.detail || 'Upload failed')
        resolvedSourcePath = upData.path
        originalFilename = selectedFile.name
        fileDuration = upData.duration || 0
      } else if (sourceTab === 'pexels') {
        if (!selectedStockVideo) return
        const chosenFile = selectedStockVideo.video_files?.find(vf => vf.width === 1920 || vf.height === 1920) || selectedStockVideo.video_files?.[0]
        if (!chosenFile?.link) throw new Error('Нет прямой ссылки на видео')
        const filename = `pexels_${selectedStockVideo.id}_${Date.now()}.mp4`
        const dlRes = await fetch(`${API}/api/v1/media/download-stock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_path: projectPath, url: chosenFile.link, filename, folder: 'b-roll-raw' }),
        })
        const dlData = await dlRes.json()
        if (!dlRes.ok || dlData.status !== 'ok') throw new Error('Download failed')
        resolvedSourcePath = dlData.path
        originalFilename = filename
        fileDuration = dlData.duration || selectedStockVideo.duration || 0
      }

      await onApply({
        scope,
        sourcePath: resolvedSourcePath,
        targetFragId: activeFragmentId || activeScene?.fragments[0]?.id,
        targetSceneId: activeScene?.id,
        fitMode,
        timingMode,
        audioMode,
        filename: originalFilename,
        duration: fileDuration,
      })

      onClose()
      setSelectedFile(null)
      setSelectedStockVideo(null)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🎞️ Добавление и Адаптация B-Roll" className="max-w-2xl">
      <div className="flex flex-col gap-5 pb-2">
        {/* Область применения */}
        <FieldGroup label="Масштаб применения B-Roll">
          <Select value={scope} onChange={e => setScope(e.target.value as 'fragment' | 'scene' | 'project')}>
            <option value="fragment">Текущий фрагмент ({activeFragmentId?.slice(0, 6) || 'выбранный'})</option>
            <option value="scene">Вся текущая сцена ({activeScene?.title || 'Сцена'})</option>
            <option value="project">Весь проект (Фоновый видеоряд)</option>
          </Select>
        </FieldGroup>

        {/* Настройки тайминга и звука */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FieldGroup label="⏱️ Управление длительностью">
            <Select value={timingMode} onChange={e => setTimingMode(e.target.value as 'ripple' | 'trim')}>
              <option value="ripple">⚡ Удлинить фрагмент под длительность B-Roll (Ripple)</option>
              <option value="trim">✂️ Обрезать B-Roll точно под тайминг сценария (Trim)</option>
            </Select>
          </FieldGroup>

          <FieldGroup label="🔊 Управление звуковой дорожкой">
            <Select value={audioMode} onChange={e => setAudioMode(e.target.value as BRollAudioMode)}>
              <option value="voice">🎙️ Оставить голос диктора (Заглушить B-Roll)</option>
              <option value="broll">🔊 Убрать голос, использовать звук с B-Roll</option>
              <option value="mix">🎚️ Микшировать (Голос диктора + звук B-Roll)</option>
            </Select>
          </FieldGroup>
        </div>

        {/* Геометрия кадра */}
        <div className="bg-surface-container-lowest/60 p-4 rounded-xl border border-white/5 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <MonitorPlay size={14} className="text-secondary" /> Авто-подгонка под {project.format} ({project.resolution})
            </span>
            <span className="text-[11px] text-on-surface-variant">FFmpeg нормализация с постоянным FPS</span>
          </div>
          <div className="flex bg-surface-container-lowest border border-white/10 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setFitMode('cover')}
              className={`text-xs px-3 py-1 rounded transition-all font-medium ${fitMode === 'cover' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}
            >
              Cover (Без полос)
            </button>
            <button
              type="button"
              onClick={() => setFitMode('blur_pad')}
              className={`text-xs px-3 py-1 rounded transition-all font-medium ${fitMode === 'blur_pad' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}
            >
              Blur Pad (Размытые поля)
            </button>
          </div>
        </div>

        {/* Источник файла */}
        <div className="flex border-b border-white/10">
          <button
            type="button"
            onClick={() => setSourceTab('upload')}
            className={`flex-1 py-2 text-xs font-bold border-b-2 transition-colors ${sourceTab === 'upload' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-white'}`}
          >
            Локальный файл
          </button>
          <button
            type="button"
            onClick={() => setSourceTab('pexels')}
            className={`flex-1 py-2 text-xs font-bold border-b-2 transition-colors ${sourceTab === 'pexels' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-white'}`}
          >
            Поиск на Pexels
          </button>
        </div>

        {sourceTab === 'upload' ? (
          <div className="flex flex-col gap-3 py-2">
            <input type="file" ref={fileInputRef} accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && setSelectedFile(e.target.files[0])} />
            <Button variant="dashed" onClick={() => fileInputRef.current?.click()} className="w-full py-6 flex-col gap-2">
              <span className="text-sm font-semibold text-white">{selectedFile ? selectedFile.name : 'Выберите видеофайл (.mp4, .mov, .mkv)'}</span>
              {selectedFile && <span className="text-xs text-secondary font-mono">Размер: {(selectedFile.size / 1024 / 1024).toFixed(1)} MB</span>}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex gap-2">
              <Input
                placeholder="Поиск футажей (например: server room, cyber neon, coding)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePexelsSearch()}
                className="text-xs flex-1"
              />
              <Button variant="secondary" onClick={handlePexelsSearch} disabled={isSearching} className="text-xs px-4">
                {isSearching ? <Spinner className="w-3.5 h-3.5" /> : <Search size={14} />}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scrollbar p-1">
              {stockVideos.map(video => {
                const isSelected = selectedStockVideo?.id === video.id
                return (
                  <div
                    key={video.id}
                    onClick={() => setSelectedStockVideo(video)}
                    className={`relative rounded-lg overflow-hidden aspect-video border cursor-pointer transition-all ${
                      isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img src={video.image} alt="preview" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 px-1 rounded bg-black/70 text-[9px] font-mono text-white">
                      {video.duration}s
                    </span>
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check size={20} className="text-primary drop-shadow" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>Отмена</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isProcessing || (sourceTab === 'upload' && !selectedFile) || (sourceTab === 'pexels' && !selectedStockVideo)}
            className="px-6"
          >
            {isProcessing ? <><Spinner className="w-4 h-4 mr-2" /> Обработка...</> : <><Sparkles size={16} className="mr-1.5" /> Применить B-Roll</>}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
