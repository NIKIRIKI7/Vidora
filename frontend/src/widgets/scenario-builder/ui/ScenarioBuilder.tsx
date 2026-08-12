import { useState, useRef, useMemo } from 'react'
import { Button, Input, Select, FieldGroup, Spinner } from '@shared/ui'
import { ArrowLeft, Wand2, FileText, Download, FileUp, Clock, Copy } from 'lucide-react'
import { parseMarkdownFull, type ProjectSettings, type VideoFormat, type Resolution } from '@entities/project'
import { THEME_PRESETS, type ThemePreset } from '@shared/config'
import { API, formatTimecode } from '@widgets/editor-workspace/lib/helpers'
import { useSettingsStore, useNotificationStore } from '@entities/project'

interface Props {
  idea?: any
  videos?: any[]
  onBack: () => void
  onCreate: (project: ProjectSettings) => void
}

export const ScenarioBuilder = ({ idea, videos, onBack, onCreate }: Props) => {
  const { apiKeys, cloudEngines, localEngines, cloudProvider, aiMode } = useSettingsStore()
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

  const [localAiMode, setLocalAiMode] = useState<'cloud' | 'local'>(aiMode)
  const [agentEngine, setAgentEngine] = useState(localAiMode === 'cloud' ? (cloudEngines.scenario || 'openai/gpt-4o') : (localEngines.scenario || 'gemma3:4b'))
  const [customTopic, setCustomTopic] = useState('')
  const [genFormat, setGenFormat] = useState<'long' | 'short'>('long')
  const [genDuration, setGenDuration] = useState('3')

  const estimatedDuration = useMemo(() => {
    if (!markdown) return 0
    let cleanText = markdown.replace(/^---\n[\s\S]+?\n---/, '')
    cleanText = cleanText.replace(/\[.*?\]\s*\(.*?\)/g, '')
    cleanText = cleanText.replace(/\*\([\s\S]*?\)\*/g, '')
    const words = cleanText.split(/\s+/).filter(w => w.trim().length > 0)
    return words.length / 2.5
  }, [markdown])

  const getScenarioPrompt = () => {
    const globalPrompts = useSettingsStore.getState().globalPrompts;
    const topic = idea ? idea.titles[0] : customTopic;
    const desc = idea ? idea.description : '';
    const formatText = genFormat === 'short' ? 'Вертикальный Shorts/Reels (сверхбыстрый темп, без воды)' : 'Горизонтальное длинное видео';
    const wordsCount = Math.round(Number(genDuration) * 150);

    const template = globalPrompts.scenario || `Действуй как профессиональный сценарист YouTube для Tech/IT канала (Faceless).\nНапиши подробный сценарий на тему: "{{TITLE}}".\n\nФормат видео: {{FORMAT_TEXT}}.\nОриентировочный хронометраж: {{DURATION}} мин. (напиши текст диктора объемом строго около {{WORDS_COUNT}} слов).\n\nОбязательные требования:\n1. Разбей сценарий на логические блоки: [Хук] (00:00:00), [Вступление], [Основная часть], [Кульминация], [Заключение]. Укажи примерные таймкоды.\n2. В начале каждого фрагмента укажи визуальную ремарку в скобках.\n3. Напиши текст для закадрового голоса.\n4. Все английские термины напиши русскими буквами.\n5. Верни сценарий строго в формате Markdown.`;

    return template
      .replace(/\{\{TITLE\}\}/g, topic)
      .replace(/\{\{DESCRIPTION\}\}/g, desc)
      .replace(/\{\{FORMAT_TEXT\}\}/g, formatText)
      .replace(/\{\{DURATION\}\}/g, genDuration)
      .replace(/\{\{WORDS_COUNT\}\}/g, wordsCount.toString());
  }

  const copyText = async (text: string): Promise<boolean> => {
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through to execCommand fallback
      }
    }
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.opacity = "0";
      document.body.prepend(textArea);
      textArea.focus();
      textArea.select();
      const ok = document.execCommand('copy');
      textArea.remove();
      return ok;
    } catch {
      return false;
    }
  }

  const handleCopyPrompt = async () => {
    const topic = idea ? idea.titles[0] : customTopic;
    if (!topic.trim()) { showNotification('Укажите тему для сценария', 'error'); return; }

    const prompt = getScenarioPrompt();
    const ok = await copyText(prompt);
    if (ok) {
      showNotification('Промпт скопирован в буфер обмена!', 'success');
    } else {
      console.error('Copy failed');
      showNotification('Ошибка копирования. Скопируйте текст вручную.', 'error');
    }
  }

  const handleGenerateAI = async () => {
    const topic = idea ? idea.titles[0] : customTopic;
    const desc = idea ? idea.description : '';
    if (!topic.trim()) { showNotification('Укажите тему для сценария', 'error'); return; }

    setIsGenerating(true)
    try {
      const customPrompt = getScenarioPrompt();
      const res = await fetch(`${API}/api/v1/youtube/agent/draft-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: topic, idea_description: desc,
          channel_context: '', engine: agentEngine, api_keys: activeApiKeys,
          video_type: genFormat, target_duration: genDuration, custom_prompt: customPrompt
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
          <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex flex-col gap-3">
            <span className="text-[10px] uppercase font-bold text-primary tracking-wider">Генерация AI-сценария</span>
            {!idea && (
              <FieldGroup label="Тема для генерации (если лень писать)">
                <Input value={customTopic} onChange={e => setCustomTopic(e.target.value)} placeholder="Например: Как работают нейросети" className="text-xs border-primary/30" />
              </FieldGroup>
            )}

            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="Формат видео">
                <Select value={genFormat} onChange={e => {
                  setGenFormat(e.target.value as 'long'|'short');
                  if (e.target.value === 'short') setGenDuration('1');
                }} className="text-xs border-primary/30">
                  <option value="long">Длинное (16:9)</option>
                  <option value="short">Shorts (9:16)</option>
                </Select>
              </FieldGroup>
              <FieldGroup label="Хронометраж (мин)">
                <Input type="number" min={0.5} max={60} step={0.5} value={genDuration} onChange={e => setGenDuration(e.target.value)} className="text-xs border-primary/30" />
              </FieldGroup>
            </div>

            <div className="flex bg-surface-container-lowest border border-white/10 rounded-lg p-1 shrink-0">
              <button onClick={() => setLocalAiMode('cloud')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${localAiMode === 'cloud' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}>Облако</button>
              <button onClick={() => setLocalAiMode('local')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${localAiMode === 'local' ? 'bg-success/20 text-success border border-success/30' : 'text-on-surface-variant hover:text-white'}`}>Локально</button>
            </div>
            <Input list="agent-models" value={agentEngine} onChange={e => setAgentEngine(e.target.value)} className="text-xs font-mono" placeholder="LLM Движок (Агент)" />
            <datalist id="agent-models">
              {localAiMode === 'cloud' ? (
                <>
                  <option value="anthropic/claude-sonnet-5" />
                  <option value="openai/gpt-4o" />
                  <option value="google/gemini-2.5-pro" />
                </>
              ) : (
                <>
                  <option value="gemma3:4b" />
                  <option value="qwen2.5-coder" />
                  <option value="llama3.1-8b" />
                </>
              )}
            </datalist>
            <div className="flex gap-2">
              <Button variant="primary" onClick={handleGenerateAI} disabled={isGenerating || (!idea && !customTopic.trim())} className="flex-1 text-xs px-2">
                {isGenerating ? <Spinner /> : <><Wand2 size={14} className="mr-1" /> Написать Сценарий</>}
              </Button>
              <Button variant="dashed" onClick={handleCopyPrompt} disabled={isGenerating || (!idea && !customTopic.trim())} className="text-xs text-primary border-primary/30 hover:bg-primary/20 px-3 shrink-0" title="Скопировать промпт для ChatGPT / Claude">
                <Copy size={14} className="mr-1" /> Промпт
              </Button>
            </div>
          </div>

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
          <div className="flex items-center justify-between mb-3 text-sm font-medium text-on-surface-variant bg-white/5 p-2 rounded-lg border border-white/10">
            <span className="flex items-center gap-1.5"><Clock size={16} className="text-secondary" /> Хронометраж:</span>
            <span className="text-secondary font-mono tracking-widest">{formatTimecode(estimatedDuration)}</span>
          </div>
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
