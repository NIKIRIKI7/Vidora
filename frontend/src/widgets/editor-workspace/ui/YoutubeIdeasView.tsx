import { useState, useRef, useEffect } from 'react'
import { Input, Button, Slider, FieldGroup, Icon, Spinner, Select } from '@shared/ui'
import { API, getProjectPath } from '@widgets/editor-workspace/lib/helpers'
import type { ProjectSettings } from '@entities/project'
import { useSettingsStore, useNotificationStore } from '@entities/project'

interface Props {
  project: ProjectSettings
}

interface VideoResult {
  video_id: string
  title: string
  channel: string
  views: number
  subs: number
  ratio: number
  url: string
  published_at: string
  transcript_sample?: string
  duration_sec?: number
  is_short?: boolean
}

interface AgentLog {
  message: string
  status: 'info' | 'success' | 'error' | 'warning'
}

interface ThumbnailResult {
  layout_type: string
  text_lines: string[]
  colors: { background: string; accent: string; text: string }
  emotion_hook: string
  midjourney_prompt: string
  vidiq_score_estimate: number
  explanation: string
}

const NICHE_PRESETS = [
  { id: 'custom', label: '✍️ Свой вариант...' },
  { id: 'IT, Программирование, Нейросети', label: '💻 IT и Программирование' },
  { id: 'Кибербезопасность, Хакинг, Инфобез', label: '🔐 Кибербезопасность' },
  { id: 'Кулинария, Рецепты, Готовка', label: '🍳 Кулинария и рецепты' },
  { id: 'Криптовалюта, Инвестиции, Трейдинг', label: '📈 Крипта и Финансы' },
]

const fmtDuration = (v: VideoResult) => {
  if (v.is_short) return '⚡ SHORT'
  if (!v.duration_sec) return '—'
  return `${Math.floor(v.duration_sec / 60)}:${String(v.duration_sec % 60).padStart(2, '0')}`
}

const renderMarkdown = (text: string) => {
  return text.split('\n').map((line, idx) => {
    if (!line.trim()) return <div key={idx} className="h-2" />
    let isList = false
    let isNumbered = false
    let listNumber = ''
    let cleanLine = line.trim()
    if (cleanLine.match(/^[-*]\s/)) {
      isList = true
      cleanLine = cleanLine.substring(2)
    } else if (cleanLine.match(/^(\d+)\.\s/)) {
      isList = true
      isNumbered = true
      listNumber = cleanLine.match(/^(\d+)\.\s/)?.[1] || ''
      cleanLine = cleanLine.replace(/^\d+\.\s/, '')
    }
    const parts = cleanLine.split(/(\*\*.*?\*\*)/g)
    const formattedNodes = parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
      }
      return <span key={i}>{part}</span>
    })

    if (isList) {
      return (
        <div key={idx} className="flex items-start gap-2 ml-4 mt-2">
          <span className="text-success font-bold min-w-[14px] mt-0.5 text-sm">
            {isNumbered ? `${listNumber}.` : '•'}
          </span>
          <div className="flex-1 text-on-surface-variant leading-relaxed text-[15px]">{formattedNodes}</div>
        </div>
      )
    }
    if (cleanLine.startsWith('**') && cleanLine.endsWith('**') && parts.length === 3) {
      return <div key={idx} className="mt-6 mb-2 text-white font-bold text-base tracking-wide">{formattedNodes}</div>
    }
    return <div key={idx} className="mt-2 text-on-surface-variant leading-relaxed text-[15px]">{formattedNodes}</div>
  })
}

export const YoutubeIdeasView = ({ project }: Props) => {
  const { apiKeys, setApiKey } = useSettingsStore()
  const showNotification = useNotificationStore(s => s.showNotification)

  const [activeTab, setActiveTab] = useState<'agent' | 'thumbnail'>('agent')

  // Agent State
  const [searchMode, setSearchMode] = useState<'trending' | 'exact'>('trending')
  const [videoType, setVideoType] = useState<'all' | 'long' | 'short'>('all')
  const [language, setLanguage] = useState('ru')
  const [nichePreset, setNichePreset] = useState(NICHE_PRESETS[1].id)
  const [customQuery, setCustomQuery] = useState('')
  const [agentEngine, setAgentEngine] = useState('gemma3:1b')
  const [daysBack, setDaysBack] = useState(7)
  const [minSubs, setMinSubs] = useState(1000)
  const [maxSubs, setMaxSubs] = useState(50000)
  const [minRatio, setMinRatio] = useState(1.5)
  const [ideasCount, setIdeasCount] = useState(10)

  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([])
  const [agentResults, setAgentResults] = useState<VideoResult[]>([])
  const [agentAnalysis, setAgentAnalysis] = useState('')
  const [excelPath, setExcelPath] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentLogs])

  // Thumbnail State
  const [thumbEngine, setThumbEngine] = useState('openai/gpt-4o')
  const [thumbTitle, setThumbTitle] = useState('')
  const [thumbTranscript, setThumbTranscript] = useState('')
  const [isThumbGenerating, setIsThumbGenerating] = useState(false)
  const [thumbResult, setThumbResult] = useState<ThumbnailResult | null>(null)

  const handleRunAgent = async () => {
    const finalQuery = nichePreset === 'custom' ? customQuery : nichePreset
    if (!finalQuery.trim()) {
      showNotification('Укажите нишу или запрос', 'error')
      return
    }

    setIsAgentRunning(true)
    setAgentLogs([])
    setAgentResults([])
    setAgentAnalysis('')
    setExcelPath('')

    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: finalQuery,
          project_path: getProjectPath(project),
          settings: {
            days_back: daysBack,
            min_subs: minSubs,
            max_subs: maxSubs,
            min_ratio: minRatio,
            search_mode: searchMode,
            language: language,
            video_type: videoType,
            ideas_count: ideasCount
          },
          youtube_key: apiKeys.youtube || '',
          llm_engine: agentEngine,
          api_keys: apiKeys
        })
      })

      if (!res.body) throw new Error('Нет ответа от сервера')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            if (msg.type === 'log') {
              setAgentLogs(prev => [...prev, { message: msg.message, status: msg.status }])
            } else if (msg.type === 'videos_ready') {
              setAgentResults(msg.results || [])
            } else if (msg.type === 'excel_ready') {
              setExcelPath(msg.excel_path || '')
            } else if (msg.type === 'done') {
              if (msg.analysis) {
                setAgentAnalysis(msg.analysis)
              }
              showNotification('Агент успешно завершил работу!', 'success')
            }
          } catch (err) {
            console.error('JSON parse error on stream:', err)
          }
        }
      }
    } catch (e) {
      showNotification('Ошибка связи с агентом', 'error')
      setAgentLogs(prev => [...prev, { message: 'Критическая ошибка соединения. Проверьте консоль бэкенда.', status: 'error' }])
    } finally {
      setIsAgentRunning(false)
    }
  }

  const handleGenerateThumbnail = async () => {
    if (!thumbTitle.trim()) {
      showNotification('Заголовок обязателен', 'error')
      return
    }
    setIsThumbGenerating(true)
    setThumbResult(null)

    try {
      const res = await fetch(`${API}/api/v1/youtube/thumbnail-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_title: thumbTitle,
          transcript: thumbTranscript,
          engine: thumbEngine,
          api_keys: apiKeys
        })
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        setThumbResult(data.concept)
        showNotification('Дизайн-концепт превью готов!', 'success')
      } else {
        throw new Error(data.detail || 'Сбой генерации')
      }
    } catch (e: unknown) {
      showNotification(e instanceof Error ? e.message : 'Ошибка генерации', 'error')
    } finally {
      setIsThumbGenerating(false)
    }
  }

  const loadToThumbnailMaker = (video: VideoResult) => {
    setThumbTitle(video.title)
    setThumbTranscript(video.transcript_sample || '')
    setActiveTab('thumbnail')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showNotification('Промпт скопирован в буфер!', 'success')
  }

  return (
    <div className="flex flex-col w-full h-full bg-background animate-in fade-in duration-300">

      {/* Навигационные табы на всю ширину */}
      <div className="flex border-b border-white/10 bg-surface-container/60 shrink-0 px-6 pt-4 gap-2">
        <button
          onClick={() => setActiveTab('agent')}
          className={`px-8 py-3 text-sm font-semibold uppercase tracking-wide transition-colors rounded-t-xl ${activeTab === 'agent' ? 'bg-primary/20 text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}
        >
          <Icon name="smart_toy" className="align-middle mr-2" />
          AI-Агент: Поиск Идей
        </button>
        <button
          onClick={() => setActiveTab('thumbnail')}
          className={`px-8 py-3 text-sm font-semibold uppercase tracking-wide transition-colors rounded-t-xl ${activeTab === 'thumbnail' ? 'bg-secondary/20 text-secondary border-b-2 border-secondary' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}
        >
          <Icon name="art_track" className="align-middle mr-2" />
          Дизайнер Концептов (vidIQ)
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* === ВКЛАДКА: АГЕНТ === */}
        {activeTab === 'agent' && (
          <>
            {/* Левый Сайдбар - Фильтры */}
            <div className="w-[340px] xl:w-[400px] flex flex-col gap-5 bg-surface-container-lowest/30 border-r border-white/10 p-6 shrink-0 overflow-y-auto custom-scrollbar">
              <div className="flex gap-2 mb-1">
                <Button variant={searchMode === 'trending' ? 'primary' : 'ghost'} className="flex-1 text-xs py-2" onClick={() => setSearchMode('trending')}>
                  <Icon name="trending_up" className="text-[16px] mr-1" /> Тренды
                </Button>
                <Button variant={searchMode === 'exact' ? 'primary' : 'ghost'} className="flex-1 text-xs py-2" onClick={() => setSearchMode('exact')}>
                  <Icon name="manage_search" className="text-[16px] mr-1" /> Точный
                </Button>
              </div>

              {searchMode === 'trending' ? (
                <FieldGroup label="Тематика ниши">
                  <Select value={nichePreset} onChange={e => setNichePreset(e.target.value)}>
                    {NICHE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </Select>
                </FieldGroup>
              ) : null}

              {(nichePreset === 'custom' || searchMode === 'exact') && (
                <FieldGroup label={searchMode === 'exact' ? 'Точный запрос для поиска' : 'Своя ниша'}>
                  <Input value={customQuery} onChange={e => setCustomQuery(e.target.value)} placeholder="Например: Обзор React 19" />
                </FieldGroup>
              )}

              <FieldGroup label="Формат видео">
                <div className="flex gap-2">
                  <Button variant={videoType === 'all' ? 'primary' : 'ghost'} className="flex-1 text-xs py-1.5 px-2" onClick={() => setVideoType('all')}>Все</Button>
                  <Button variant={videoType === 'long' ? 'primary' : 'ghost'} className="flex-1 text-xs py-1.5 px-2" onClick={() => setVideoType('long')}>🎬 Длинные</Button>
                  <Button variant={videoType === 'short' ? 'primary' : 'ghost'} className="flex-1 text-xs py-1.5 px-2" onClick={() => setVideoType('short')}>⚡ Shorts</Button>
                </div>
              </FieldGroup>

              <FieldGroup label="Язык поиска и видео">
                <Select value={language} onChange={e => setLanguage(e.target.value)}>
                  <option value="ru">Русский (ru)</option>
                  <option value="en">Английский (en)</option>
                  <option value="es">Испанский (es)</option>
                </Select>
              </FieldGroup>

              <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex flex-col gap-4 mt-2">
                <FieldGroup label="Модель Агента (Аналитика)">
                  <Input list="agent-models" value={agentEngine} onChange={e => setAgentEngine(e.target.value)} className="text-xs font-mono" />
                  <datalist id="agent-models">
                    <option value="gemma3:1b" label="Локальная GGUF" />
                    <option value="qwen2.5-coder" label="Локальная Ollama" />
                    <option value="openai/gpt-4o" label="Cloud GPT-4o" />
                  </datalist>
                </FieldGroup>
                <FieldGroup label="Кол-во идей для сценария" value={`${ideasCount} шт.`}>
                  <Slider min={3} max={20} step={1} value={ideasCount} onChange={e => setIdeasCount(Number(e.target.value))} />
                </FieldGroup>
              </div>

              <FieldGroup label="YouTube API Key">
                <Input type="password" value={apiKeys.youtube || ''} onChange={e => setApiKey('youtube', e.target.value)} placeholder="AIza..." className="text-xs" />
              </FieldGroup>

              <div className="h-px bg-white/10 my-2" />

              <FieldGroup label="Окно публикации" value={`${daysBack} дней`}>
                <Slider min={1} max={30} step={1} value={daysBack} onChange={e => setDaysBack(Number(e.target.value))} />
              </FieldGroup>

              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label="Мин. сабов" value={minSubs.toLocaleString('ru')}>
                  <Input type="number" value={minSubs} onChange={e => setMinSubs(Number(e.target.value))} className="text-xs" />
                </FieldGroup>
                <FieldGroup label="Макс. сабов" value={maxSubs.toLocaleString('ru')}>
                  <Input type="number" value={maxSubs} onChange={e => setMaxSubs(Number(e.target.value))} className="text-xs" />
                </FieldGroup>
              </div>

              <FieldGroup label="Вирусность (Outlier Ratio)" value={`${minRatio.toFixed(1)}x`}>
                <Slider min={0.5} max={10.0} step={0.5} value={minRatio} onChange={e => setMinRatio(Number(e.target.value))} />
              </FieldGroup>

              <Button variant="primary" onClick={handleRunAgent} disabled={isAgentRunning} className="mt-6 mb-4 shadow-[0_0_20px_rgba(221,183,255,0.2)] py-3 text-base">
                {isAgentRunning ? <><Spinner className="text-xl" /> Агент работает...</> : <><Icon name="play_circle" className="text-xl" /> Запустить Агента</>}
              </Button>
            </div>

            {/* Правая часть - Основной контент */}
            <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden relative bg-surface-container/10">

              {/* Логи - фиксированной высоты */}
              <div className="h-[140px] shrink-0 bg-[#0A0E17] border border-white/10 rounded-xl p-4 font-mono text-xs overflow-y-auto custom-scrollbar flex flex-col gap-2 shadow-inner">
                {agentLogs.length === 0 && !isAgentRunning && <div className="text-on-surface-variant/50 m-auto text-sm">Ожидание запуска агента... Настройте фильтры слева.</div>}
                {agentLogs.map((log, i) => (
                  <div key={i} className={`flex items-start gap-2 ${log.status === 'error' ? 'text-error font-bold' : log.status === 'success' ? 'text-success font-bold' : log.status === 'warning' ? 'text-warning' : 'text-primary'}`}>
                    <span className="opacity-50">[{new Date().toLocaleTimeString()}]</span>
                    <span className={log.status === 'info' ? 'text-on-surface-variant' : ''}>{log.message}</span>
                  </div>
                ))}
                {isAgentRunning && (
                  <div className="text-primary animate-pulse flex items-center gap-2 mt-2">
                    <Spinner className="text-[12px]" /> Анализируем данные...
                  </div>
                )}
                <div ref={logsEndRef} />
              </div>

              {/* Основной контент: выводы и сетка видео в одном скролл-контейнере */}
              <div className="flex-1 bg-surface-container-lowest/60 border border-white/10 rounded-xl overflow-y-auto custom-scrollbar relative shadow-xl">

                {excelPath && (
                  <div className="absolute top-6 right-8 z-20">
                    <Button variant="secondary" icon="download" onClick={() => {
                      const a = document.createElement('a')
                      a.href = `${API}/api/v1/render/media?path=${encodeURIComponent(excelPath)}`
                      a.download = excelPath.split('\\').pop()?.split('/').pop() || 'report.xlsx'
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                    }}>Скачать Excel-отчет</Button>
                  </div>
                )}

                <div className="p-8 flex flex-col gap-10">
                  {/* Выводы Агента (Аналитика) */}
                  {agentAnalysis && (
                    <div className="p-8 border border-success/20 bg-[#0A0E17]/80 rounded-2xl relative overflow-hidden shadow-lg">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-success" />
                      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-success/5 to-transparent pointer-events-none" />
                      <h3 className="text-success font-bold text-xl mb-6 flex items-center gap-3 relative z-10">
                        <Icon name="insights" className="text-3xl" /> Выводы и идеи ({agentEngine})
                      </h3>
                      <div className="relative z-10 pr-4">
                        {renderMarkdown(agentAnalysis)}
                      </div>
                    </div>
                  )}

                  {/* Сетка Видео */}
                  {agentResults.length > 0 ? (
                    <div>
                      <h3 className="text-on-surface font-bold text-xl mb-6 flex items-center gap-2">
                        <Icon name="youtube_searched_for" className="text-primary text-2xl" /> Найденные вирусные видео ({agentResults.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {agentResults.map((v, i) => (
                          <div key={i} className="bg-black/40 border border-white/10 p-4 rounded-2xl flex flex-col gap-4 group hover:border-primary/50 transition-colors shadow-md">
                            <img src={`https://img.youtube.com/vi/${v.video_id}/maxresdefault.jpg`} alt="thumbnail" className="w-full aspect-video object-cover rounded-xl border border-white/10" onError={(e) => e.currentTarget.src = `https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg`} />
                            <div>
                              <h4 className="font-semibold text-[15px] line-clamp-2 leading-snug mb-2" title={v.title}>{v.title}</h4>
                              <div className="text-xs text-on-surface-variant flex items-center gap-1">
                                <Icon name="account_circle" className="text-[14px]" /> {v.channel}
                              </div>
                            </div>
                            <div className="flex justify-between items-center mt-auto border-t border-white/10 pt-3">
                              <div className="flex gap-2">
                                <span className="bg-warning/20 text-warning px-2 py-1 rounded text-xs font-bold border border-warning/30" title="Просмотров больше чем сабов">
                                  x{v.ratio} (вирус)
                                </span>
                                <span className="bg-primary/20 text-primary px-2 py-1 rounded text-xs font-bold border border-primary/30" title="Длительность">
                                  {fmtDuration(v)}
                                </span>
                              </div>
                              <Button variant="ghost" className="py-1 px-2 text-xs border border-primary/30 text-primary hover:bg-primary/10" onClick={() => loadToThumbnailMaker(v)}>
                                Дизайн <Icon name="arrow_forward" className="text-[14px] ml-1" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    !isAgentRunning && !agentAnalysis && (
                      <div className="h-64 flex flex-col items-center justify-center text-on-surface-variant/40 gap-4">
                        <Icon name="query_stats" className="text-6xl opacity-50" />
                        <span className="text-lg">Результаты поиска и аналитика появятся здесь</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* === ВКЛАДКА: ДИЗАЙН ПРЕВЬЮ === */}
        {activeTab === 'thumbnail' && (
          <>
            <div className="w-[340px] xl:w-[400px] flex flex-col gap-6 border-r border-white/10 p-6 shrink-0 overflow-y-auto custom-scrollbar bg-surface-container-lowest/30">
              <div className="bg-secondary/10 border border-secondary/20 p-5 rounded-2xl mb-2 shadow-inner">
                <FieldGroup label="Модель для Дизайна">
                  <Input list="thumb-models" value={thumbEngine} onChange={e => setThumbEngine(e.target.value)} className="text-sm font-mono" />
                  <datalist id="thumb-models">
                    <option value="openai/gpt-4o" label="Cloud (GPT-4o - Рекомендуется)" />
                    <option value="anthropic/claude-3.5-sonnet" label="Cloud (Claude 3.5)" />
                    <option value="qwen2.5-coder" label="Локальная Ollama" />
                  </datalist>
                </FieldGroup>
                <p className="text-xs text-on-surface-variant mt-4 opacity-80 leading-relaxed">
                  Движок использует файл правил <span className="text-secondary font-mono bg-secondary/10 px-1 py-0.5 rounded">DESIGN.md</span> для создания идеального концепта.
                </p>
              </div>

              <FieldGroup label="Заголовок будущего видео">
                <Input value={thumbTitle} onChange={e => setThumbTitle(e.target.value)} placeholder="Например: Я создал AI агента за 5 минут..." className="text-sm py-3" />
              </FieldGroup>

              <FieldGroup label="Суть видео (Транскрипция/Саммари)">
                <textarea
                  className="w-full bg-surface-container-lowest border border-white/10 rounded-xl p-4 text-sm text-on-surface resize-none focus:outline-none focus:border-secondary/50 custom-scrollbar h-48"
                  value={thumbTranscript}
                  onChange={e => setThumbTranscript(e.target.value)}
                  placeholder="Вставьте кусок сценария или транскрипцию, чтобы ИИ понял, о чем видео и вытащил нужную эмоцию..."
                />
              </FieldGroup>

              <Button variant="primary" onClick={handleGenerateThumbnail} disabled={isThumbGenerating} className="mt-auto bg-gradient-to-r from-secondary to-accent text-black font-bold shadow-[0_0_20px_rgba(79,219,200,0.3)] py-4 text-base">
                {isThumbGenerating ? <><Spinner className="text-xl" /> Генерация схемы...</> : <><Icon name="design_services" className="text-xl" /> Создать Концепт</>}
              </Button>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center overflow-y-auto custom-scrollbar p-8 relative bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-black/70">

              {!thumbResult && !isThumbGenerating && (
                <div className="flex flex-col items-center opacity-40">
                  <Icon name="imagesmode" className="text-[100px] mb-6 text-secondary" />
                  <p className="font-medium text-2xl mb-2">Концепт не сгенерирован</p>
                  <p className="text-base">Впишите заголовок слева и нажмите кнопку</p>
                </div>
              )}

              {isThumbGenerating && (
                <div className="flex flex-col items-center animate-pulse">
                  <Spinner className="text-[80px] text-secondary mb-6" />
                  <p className="text-secondary font-mono text-lg">Анализ правил vidIQ и подбор палитры...</p>
                </div>
              )}

              {thumbResult && !isThumbGenerating && (
                <div className="w-full max-w-5xl bg-surface-container/90 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col gap-10 animate-in zoom-in-95 duration-500">

                  <div className="flex justify-between items-center border-b border-white/10 pb-6">
                    <h2 className="text-3xl font-bold text-white flex items-center gap-4">
                      <Icon name="verified" className="text-secondary text-4xl" />
                      Дизайн-документ Превью
                    </h2>
                    <div className="flex items-center gap-3 bg-success/20 text-success px-5 py-2.5 rounded-full border border-success/30 font-bold text-lg shadow-[0_0_15px_rgba(74,222,128,0.2)]">
                      vidIQ Score: {thumbResult.vidiq_score_estimate} / 100
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    <div className="col-span-2 bg-[#0A0E17] border border-white/10 p-8 rounded-2xl relative overflow-hidden shadow-inner">
                      <div className="absolute top-0 right-0 bg-primary/20 text-primary px-4 py-2 rounded-bl-2xl text-xs font-bold tracking-widest">
                        LAYOUT: {thumbResult.layout_type}
                      </div>
                      <h3 className="text-xs text-on-surface-variant uppercase tracking-widest mb-6 font-bold">Текст на картинке (&lt; 5 слов)</h3>
                      <div className="flex flex-col gap-3">
                        {thumbResult.text_lines.map((line, i) => (
                          <div key={i} className="text-5xl md:text-6xl font-black text-white uppercase tracking-tighter" style={{ textShadow: `0 4px 30px ${thumbResult.colors.accent}80` }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-6">
                      <div className="bg-[#0A0E17] border border-white/10 p-6 rounded-2xl flex-1 shadow-inner">
                        <h3 className="text-xs text-on-surface-variant uppercase tracking-widest mb-5 font-bold">Цветовая схема</h3>
                        <div className="flex flex-col gap-4">
                          <div className="flex items-center gap-4"><div className="w-8 h-8 rounded-md border border-white/20 shadow-sm" style={{ backgroundColor: thumbResult.colors.background }} /><span className="text-sm font-mono font-medium">Фон</span></div>
                          <div className="flex items-center gap-4"><div className="w-8 h-8 rounded-md border border-white/20 shadow-sm" style={{ backgroundColor: thumbResult.colors.accent }} /><span className="text-sm font-mono font-medium">Акцент</span></div>
                          <div className="flex items-center gap-4"><div className="w-8 h-8 rounded-md border border-white/20 shadow-sm" style={{ backgroundColor: thumbResult.colors.text }} /><span className="text-sm font-mono font-medium">Текст</span></div>
                        </div>
                      </div>

                      <div className="bg-[#0A0E17] border border-white/10 p-6 rounded-2xl shadow-inner">
                        <h3 className="text-xs text-on-surface-variant uppercase tracking-widest mb-3 font-bold">Якорь внимания</h3>
                        <div className="text-base font-semibold text-accent leading-snug">
                          {thumbResult.emotion_hook}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0A0E17] border border-secondary/30 p-8 rounded-2xl relative group shadow-lg">
                    <h3 className="text-xs text-secondary uppercase tracking-widest mb-4 font-bold flex items-center gap-2">
                      <Icon name="brush" className="text-lg" /> Генерация фона (Midjourney / DALL-E)
                    </h3>
                    <div className="font-mono text-base text-on-surface leading-relaxed pr-32">
                      {thumbResult.midjourney_prompt}
                    </div>
                    <button
                      onClick={() => copyToClipboard(thumbResult.midjourney_prompt)}
                      className="absolute top-1/2 -translate-y-1/2 right-6 bg-secondary/20 hover:bg-secondary text-secondary hover:text-black border border-secondary/30 px-5 py-2.5 rounded-lg transition-all flex items-center gap-2 text-sm font-bold opacity-0 group-hover:opacity-100 shadow-md"
                    >
                      <Icon name="content_copy" className="text-[18px]" /> Копировать
                    </button>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-8 rounded-2xl">
                    <h3 className="text-xs text-on-surface-variant uppercase tracking-widest mb-4 font-bold">Обоснование психологии клика</h3>
                    <p className="text-base text-on-surface-variant leading-relaxed">
                      {thumbResult.explanation}
                    </p>
                  </div>

                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}