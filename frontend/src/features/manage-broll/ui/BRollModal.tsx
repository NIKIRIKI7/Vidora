import { fetchClient, apiErrorMessage } from '@shared/api'
import { useState, useRef } from 'react'
import { Modal, Button, FieldGroup, Select, Spinner, Input, SegmentedControl, Tabs } from '@shared/ui'
import { Search, Sparkles, Check, MonitorPlay } from 'lucide-react'
import type { ProjectSettings, Scene, BRollAudioMode } from '@entities/project'
import { getProjectPath } from '@entities/project'

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
      const { data, error } = await fetchClient.GET('/api/v1/media/search-stock', {
        params: { query: { query: searchQuery, orientation } }
      })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status === 'ok') setStockVideos((data.videos || []) as unknown as StockVideo[])
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
        const { data: upData, error: upError } = await fetchClient.POST('/api/v1/media/upload', { body: fd as never })
        if (upError || upData === undefined) throw new Error(apiErrorMessage(upError))
        if (upData.status !== 'ok') throw new Error((upData as { detail?: string | null }).detail || 'Upload failed')
        resolvedSourcePath = upData.path ?? ''
        originalFilename = selectedFile.name
        fileDuration = upData.duration || 0
      } else if (sourceTab === 'pexels') {
        if (!selectedStockVideo) return
        const chosenFile = selectedStockVideo.video_files?.find(vf => vf.width === 1920 || vf.height === 1920) || selectedStockVideo.video_files?.[0]
        if (!chosenFile?.link) throw new Error('Нет прямой ссылки на видео')
        const filename = `pexels_${selectedStockVideo.id}_${Date.now()}.mp4`
        const { data: dlData, error: dlError } = await fetchClient.POST('/api/v1/media/download-stock', {
          body: { project_path: projectPath, url: chosenFile.link, filename, folder: 'b-roll-raw' }
        })
        if (dlError || dlData === undefined) throw new Error(apiErrorMessage(dlError))
        if (dlData.status !== 'ok') throw new Error('Download failed')
        resolvedSourcePath = dlData.path ?? ''
        originalFilename = filename
        fileDuration = (dlData as { duration?: number }).duration || selectedStockVideo.duration || 0
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
        <div className="bg-surface-container-lowest/60 p-4 rounded-xl border border-outline-variant/20 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
              <MonitorPlay size={14} className="text-secondary" /> Авто-подгонка под {project.format} ({project.resolution})
            </span>
            <span className="text-2xs text-on-surface-variant">FFmpeg нормализация с постоянным FPS</span>
          </div>
          <SegmentedControl
            options={[
              { value: 'cover', label: 'Cover (Без полос)' },
              { value: 'blur_pad', label: 'Blur Pad (Размытые поля)' },
            ]}
            value={fitMode}
            onChange={setFitMode}
          />
        </div>

        {/* Источник файла */}
        <Tabs
          fill
          variant="underline"
          value={sourceTab}
          onChange={(id) => setSourceTab(id as 'upload' | 'pexels')}
          items={[
            { id: 'upload', label: 'Локальный файл' },
            { id: 'pexels', label: 'Поиск на Pexels' },
          ]}
          className="border-b border-outline-variant/40"
        />

        {sourceTab === 'upload' ? (
          <div className="flex flex-col gap-3 py-2">
            <input type="file" ref={fileInputRef} accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && setSelectedFile(e.target.files[0])} />
            <Button variant="dashed" onClick={() => fileInputRef.current?.click()} className="w-full py-6 flex-col gap-2">
              <span className="text-sm font-semibold text-on-surface">{selectedFile ? selectedFile.name : 'Выберите видеофайл (.mp4, .mov, .mkv)'}</span>
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
                      isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-outline-variant/40 hover:border-outline-variant/100'
                    }`}
                  >
                    <img src={video.image} alt="preview" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 px-1 rounded bg-surface-container-lowest/70 text-3xs font-mono text-on-surface">
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

        <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/40">
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
