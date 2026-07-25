import { useState, useRef, type ChangeEvent } from 'react'
import { Button, Input, Select, FieldGroup, Icon, Spinner } from '@shared/ui'
import { parseMarkdownFull } from '@entities/project'
import type { ProjectSettings, VideoFormat, Resolution } from '@entities/project'

interface Props {
  onCreate: (project: ProjectSettings) => void
  onCancel?: () => void
}

export const ProjectCreator = ({ onCreate, onCancel }: Props) => {
  const [name, setName] = useState('')
  const [format, setFormat] = useState<VideoFormat>('16:9')
  const [resolution, setResolution] = useState<Resolution>('1080p')
  const [file, setFile] = useState<File | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const openFileInputRef = useRef<HTMLInputElement>(null)

  const handleCreate = async () => {
    if (!name || !file) return
    setIsCreating(true)
    try {
      const text = await file.text()
      const parsed = parseMarkdownFull(text)
      onCreate({
        name,
        format,
        resolution,
        metadata: parsed.metadata ?? { title: '', description: '', tags: [] },
        montage: parsed.montage ?? {
          fps: '30',
          animationStyle: 'screencast',
          transitions: [],
          colors: { primary: '#ddb7ff', secondary: '#4fdbc8', background: '#0b1326', surface: '#171f33', accent: '#ffb4ab', text: '#dae2fd' },
          typography: { heading: 'Inter', body: 'Geist' },
        },
        scenes: parsed.scenes ?? [],
        rawMarkdown: text,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setIsCreating(false)
    }
  }

  const handleOpen = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return
    setIsCreating(true)
    try {
      const text = await selectedFile.text()
      const parsed = parseMarkdownFull(text)
      onCreate({
        name: parsed.metadata?.title || selectedFile.name.replace(/\.md$/i, ''),
        format: '16:9',
        resolution: '1080p',
        metadata: parsed.metadata ?? { title: '', description: '', tags: [] },
        montage: parsed.montage ?? {
          fps: '30',
          animationStyle: 'screencast',
          transitions: [],
          colors: { primary: '#ddb7ff', secondary: '#4fdbc8', background: '#0b1326', surface: '#171f33', accent: '#ffb4ab', text: '#dae2fd' },
          typography: { heading: 'Inter', body: 'Geist' },
        },
        scenes: parsed.scenes ?? [],
        rawMarkdown: text,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-6 pb-20 scroll-container relative">
      {onCancel && (
        <Button variant="ghost" icon="close" onClick={onCancel} className="absolute top-6 right-6">Отмена</Button>
      )}

      <div className="w-full max-w-[560px] bg-surface-container/40 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-[0_0_50px_rgba(221,183,255,0.1)] flex flex-col gap-6">
        <div className="text-center mb-2">
          <h1 className="text-[32px] font-bold text-primary tracking-tight mb-2">Vidora</h1>
          <p className="text-on-surface-variant text-sm">Настройка параметров проекта</p>
        </div>

        <FieldGroup label="Название проекта">
          <Input
            placeholder="Например: Обзор M4 Pro"
            value={name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          />
        </FieldGroup>

        <div className="grid grid-cols-2 gap-4">
          <FieldGroup label="Формат">
            <Select
              value={format}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormat(e.target.value as VideoFormat)}
            >
              <option value="16:9">YouTube (16:9)</option>
              <option value="9:16">Shorts / Reels (9:16)</option>
            </Select>
          </FieldGroup>
          <FieldGroup label="Разрешение">
            <Select
              value={resolution}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setResolution(e.target.value as Resolution)}
            >
              <option value="1080p">Full HD (1080p)</option>
              <option value="1440p">2K (1440p)</option>
              <option value="2160p">4K (2160p)</option>
            </Select>
          </FieldGroup>
        </div>

        <FieldGroup label="Сценарий (Markdown)">
          <input
            type="file"
            accept=".md"
            className="hidden"
            ref={fileInputRef}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] || null)}
          />
          <button
            className={`w-full py-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-colors ${file ? 'border-secondary/50 bg-secondary/5' : 'border-white/10 hover:border-primary/50 hover:bg-white/5'}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name={file ? 'task' : 'upload_file'} className={file ? 'text-secondary text-[32px]' : 'text-on-surface-variant text-[32px]'} />
            <span className="text-sm font-medium text-on-surface-variant">
              {file ? file.name : 'Загрузить .md файл'}
            </span>
          </button>
        </FieldGroup>

        <Button
          variant="primary"
          disabled={!name || !file || isCreating}
          onClick={handleCreate}
          className="mt-4"
        >
          {isCreating ? <><Spinner className="text-[16px]" /> Инициализация...</> : 'Создать проект'}
        </Button>

        <div className="flex items-center gap-4 my-2">
          <div className="h-px bg-white/10 flex-1" />
          <span className="text-xs font-label text-on-surface-variant uppercase tracking-wider">Или</span>
          <div className="h-px bg-white/10 flex-1" />
        </div>

        <input type="file" accept=".md" className="hidden" ref={openFileInputRef} onChange={handleOpen} />
        <Button
          variant="dashed"
          icon="folder_open"
          onClick={() => openFileInputRef.current?.click()}
          disabled={isCreating}
        >
          Открыть существующий проект
        </Button>
      </div>
    </div>
  )
}
