import { useState, useRef } from 'react'
import { Button, Input, Select, FieldGroup, Spinner } from '@shared/ui'
import { ArrowLeft, Wand2, FileText, Download, FileUp } from 'lucide-react'
import { parseMarkdownFull, type ProjectSettings, type VideoFormat, type Resolution } from '@entities/project'
import { THEME_PRESETS, type ThemePreset } from '@shared/config'
import { API } from '@widgets/editor-workspace/lib/helpers'
import { useSettingsStore, useNotificationStore } from '@entities/project'

interface Props {
  idea?: any
  videos?: any[]
  onBack: () => void
  onCreate: (project: ProjectSettings) => void
}

export const ScenarioBuilder = ({ idea, videos, onBack, onCreate }: Props) => {
  const { apiKeys, cloudEngines, cloudProvider } = useSettingsStore()
  const showNotification = useNotificationStore(s => s.showNotification)

  const activeApiKeys = {
    ...apiKeys,
    routerai: cloudProvider === 'routerai' ? apiKeys.routerai : undefined,
    aitunnel: cloudProvider === 'aitunnel' ? apiKeys.aitunnel : undefined,
  }

  const [name, setName] = useState(idea?.titles?.[0] || '')
  const [format, setFormat] = useState<VideoFormat>('16:9')
  const [resolution, setResolution] = useState<Resolution>('1080p')
  const [theme, setTheme] = useState<ThemePreset>(THEME_PRESETS[0])
  const [markdown, setMarkdown] = useState(idea ? '' : '---\ntitle: "Новый проект"\nfps: 30\n---\n\n[Интро] (00:00:00)\n*(B-roll: Ваш футаж)*\nВаш текст здесь...')
  const [isGenerating, setIsGenerating] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleGenerateAI = async () => {
    if (!idea) return
    setIsGenerating(true)
    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/draft-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: idea.titles[0], idea_description: idea.description,
          channel_context: '', engine: cloudEngines.scenario, api_keys: activeApiKeys
        })
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        setMarkdown(data.markdown)
        showNotification('Сценарий сгенерирован!', 'success')
      } else throw new Error()
    } catch {
      showNotification('Ошибка генерации сценария', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyOriginal = async (video: any) => {
    setIsGenerating(true)
    try {
      const res = await fetch(`${API}/api/v1/youtube/download-meta`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: video.url, project_path: 'vidora_projects/Drafts' })
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok' && data.data.transcript_full) {
        setName(`Оригинал: ${video.title.substring(0, 30)}...`)
        setMarkdown(`---\ntitle: "${video.title.replace(/"/g, "'")}"\nfps: 30\n---\n\n[Сцена 1] (00:00:00)\n*(B-roll: ${video.title})*\n${data.data.transcript_full}`)
        showNotification('Транскрипт скопирован!', 'success')
      } else {
        showNotification('У видео нет субтитров', 'info')
      }
    } catch {
      showNotification('Ошибка скачивания субтитров', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCreate = () => {
    if (!name || !markdown) {
      showNotification('Укажите название и напишите сценарий', 'error')
      return
    }
    const parsed = parseMarkdownFull(markdown)
    onCreate({
      name, format, resolution,
      metadata: parsed.metadata ?? { title: name, description: idea?.thumbnail_concept || '', tags: [] },
      montage: parsed.montage ?? { fps: '30', animationStyle: 'screencast', transitions: [], colors: theme.colors, typography: { heading: 'Inter', body: 'Geist' } },
      scenes: parsed.scenes ?? [],
      rawMarkdown: markdown,
      audioMode: 'scene',
      audioProcessing: { silenceThresholdDb: -45.0, minSilenceMs: 200, maxSilenceMs: 100, removeEdges: false },
    })
  }

  return (
    <div className="flex h-dvh w-full bg-background overflow-hidden animate-in fade-in duration-300">
      <div className="w-[380px] shrink-0 bg-surface-container/40 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/5 flex items-center gap-3 bg-surface-container-lowest/30">
          <Button variant="icon" icon={ArrowLeft} onClick={onBack} className="w-8 h-8" />
          <h2 className="font-title-md text-title-md text-on-surface">Создание сценария</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 custom-scrollbar">
          {idea && (
            <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex flex-col gap-3">
              <span className="text-[10px] uppercase font-bold text-primary tracking-wider">Генерация</span>
              <Button variant="primary" onClick={handleGenerateAI} disabled={isGenerating} className="w-full text-xs">
                {isGenerating ? <Spinner /> : <><Wand2 size={16} /> Написать AI-Сценарий по Идее</>}
              </Button>
            </div>
          )}

          {videos && videos.length > 0 && (
            <div className="bg-secondary/10 border border-secondary/20 p-4 rounded-xl flex flex-col gap-3">
              <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">Скопировать оригинал</span>
              <div className="flex flex-col gap-2">
                {videos.slice(0,3).map((v, i) => (
                  <Button key={i} variant="dashed" onClick={() => handleCopyOriginal(v)} disabled={isGenerating} className="text-xs text-left h-auto py-2 px-3 justify-start border-secondary/30 text-secondary hover:bg-secondary/20">
                    <Download size={14} className="shrink-0" /> <span className="truncate">{v.title}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="h-px bg-white/10" />

          <FieldGroup label="Название проекта">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Например: Обзор RTX 5090" />
          </FieldGroup>

          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Формат">
              <Select value={format} onChange={e => setFormat(e.target.value as VideoFormat)} className="text-xs">
                <option value="16:9">YouTube (16:9)</option>
                <option value="9:16">Shorts (9:16)</option>
              </Select>
            </FieldGroup>
            <FieldGroup label="Разрешение">
              <Select value={resolution} onChange={e => setResolution(e.target.value as Resolution)} className="text-xs">
                <option value="1080p">1080p</option>
                <option value="1440p">2K</option>
                <option value="2160p">4K</option>
              </Select>
            </FieldGroup>
          </div>

          <FieldGroup label="Цветовая тема">
            <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
              {THEME_PRESETS.map((tpl: ThemePreset) => (
                <button key={tpl.name} onClick={() => setTheme(tpl)} className="flex flex-col items-center gap-1 shrink-0 group">
                  <div className={`w-8 h-8 rounded-full border-2 flex overflow-hidden ${theme.name === tpl.name ? 'border-primary' : 'border-transparent group-hover:border-white/50'}`}>
                    <div className="flex-1" style={{backgroundColor: tpl.colors.primary}} />
                    <div className="flex-1" style={{backgroundColor: tpl.colors.background}} />
                  </div>
                </button>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup label="Или загрузить .md файл">
            <input type="file" accept=".md" className="hidden" ref={fileInputRef} onChange={async (e) => {
              if (e.target.files?.[0]) setMarkdown(await e.target.files[0].text())
            }} />
            <Button variant="dashed" onClick={() => fileInputRef.current?.click()} className="w-full text-xs py-2">
              <FileUp size={16} /> Выбрать файл
            </Button>
          </FieldGroup>
        </div>

        <div className="p-4 bg-surface-container-lowest/50 border-t border-white/5">
          <Button variant="primary" onClick={handleCreate} disabled={isGenerating || !name || !markdown} className="w-full py-3 shadow-[0_0_20px_rgba(221,183,255,0.2)]">
            <FileText size={18} /> Создать проект
          </Button>
        </div>
      </div>

      <div className="flex-1 p-6 bg-surface-container-lowest/60 flex justify-center overflow-hidden">
        <textarea
          className="w-full h-full max-w-5xl bg-surface-container/50 border border-white/10 rounded-2xl p-6 font-mono text-sm leading-relaxed text-on-surface resize-none outline-none focus:border-primary/50 custom-scrollbar shadow-2xl"
          value={markdown}
          onChange={e => setMarkdown(e.target.value)}
          spellCheck={false}
          placeholder="Напишите ваш сценарий в Markdown..."
        />
      </div>
    </div>
  )
}
