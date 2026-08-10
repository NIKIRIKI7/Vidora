import { useState, useRef, useEffect } from 'react'
import { Input, Button, Slider, FieldGroup, Icon, Spinner, Select, Modal } from '@shared/ui'
import { API, getProjectPath } from '@widgets/editor-workspace/lib/helpers'
import type { ProjectSettings } from '@entities/project'
import { useSettingsStore, useNotificationStore, useProjectStore } from '@entities/project'

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
  vph: number
  url: string
  published_at: string
  transcript_sample?: string
  duration_sec?: number
  is_short?: boolean
  keyword_found?: string
}

interface AgentLog {
  message: string
  status: 'info' | 'success' | 'error' | 'warning'
}

interface IdeaFormat {
  titles: string[]
  description: string
  thumbnail_concept: string
}

interface AnalysisData {
  conclusions?: string[]
  ideas?: IdeaFormat[]
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

export const YoutubeIdeasView = ({ project }: Props) => {
  const { apiKeys } = useSettingsStore()
  const showNotification = useNotificationStore(s => s.showNotification)
  const addProject = useProjectStore(s => s.addProject)

  const [activeTab, setActiveTab] = useState<'agent' | 'thumbnail'>('agent')

  const [searchMode, setSearchMode] = useState<'trending' | 'competitors'>('trending')
  const [videoType, setVideoType] = useState<'all' | 'long' | 'short'>('all')
  const [language, setLanguage] = useState('ru')

  const [nichePreset, setNichePreset] = useState(NICHE_PRESETS[1].id)
  const [customQuery, setCustomQuery] = useState('')
  const [channelContext, setChannelContext] = useState('')
  const [agentEngine, setAgentEngine] = useState('openai/gpt-4o')

  const [daysBack, setDaysBack] = useState(30)
  const [minSubs, setMinSubs] = useState(1000)
  const [maxSubs, setMaxSubs] = useState(90000)
  const [minRatio, setMinRatio] = useState(1.5)
  const [ideasCount, setIdeasCount] = useState(5)

  const [competitorChannels, setCompetitorChannels] = useState<string[]>([])
  const [newChannelInput, setNewChannelInput] = useState('')
  const [isSuggestingCompetitors, setIsSuggestingCompetitors] = useState(false)

  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([])
  const [agentResults, setAgentResults] = useState<VideoResult[]>([])
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [excelPath, setExcelPath] = useState('')
  const [isGridView, setIsGridView] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const [hookModalOpen, setHookModalOpen] = useState(false)
  const [isHookAnalyzing, setIsHookAnalyzing] = useState(false)
  const [hookData, setHookData] = useState<any>(null)
  const [draftingIdeaIdx, setDraftingIdeaIdx] = useState<number | null>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentLogs])

  const handleSuggestCompetitors = async () => {
    const finalQuery = nichePreset === 'custom' ? customQuery : nichePreset
    if (!finalQuery.trim()) {
      showNotification('Укажите нишу для подбора конкурентов', 'error')
      return
    }
    setIsSuggestingCompetitors(true)
    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/suggest-competitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: finalQuery, engine: agentEngine, api_keys: apiKeys })
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        const newChannels = data.channels.filter((c: string) => !competitorChannels.includes(c))
        setCompetitorChannels(prev => [...prev, ...newChannels])
        showNotification(`Добавлено ${newChannels.length} конкурентов`, 'success')
      } else {
        showNotification('Не удалось подобрать конкурентов', 'error')
      }
    } catch (e) {
      showNotification('Ошибка связи с агентом', 'error')
    } finally {
      setIsSuggestingCompetitors(false)
    }
  }

  const handleAddChannel = () => {
    if (newChannelInput.trim() && !competitorChannels.includes(newChannelInput.trim())) {
      setCompetitorChannels([...competitorChannels, newChannelInput.trim()])
      setNewChannelInput('')
    }
  }

  const handleRemoveChannel = (ch: string) => {
    setCompetitorChannels(competitorChannels.filter(c => c !== ch))
  }

  const handleRunAgent = async () => {
    const finalQuery = nichePreset === 'custom' ? customQuery : nichePreset
    if (searchMode === 'trending' && !finalQuery.trim()) {
      showNotification('Укажите нишу или запрос', 'error')
      return
    }
    if (searchMode === 'competitors' && competitorChannels.length === 0) {
      showNotification('Укажите хотя бы одного конкурента', 'error')
      return
    }

    setIsAgentRunning(true)
    setAgentLogs([])
    setAgentResults([])
    setAnalysisData(null)
    setExcelPath('')

    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: finalQuery,
          project_path: getProjectPath(project),
          settings: {
            days_back: daysBack, min_subs: minSubs, max_subs: maxSubs,
            min_ratio: minRatio, search_mode: searchMode, language: language,
            video_type: videoType, ideas_count: ideasCount, channel_context: channelContext,
            channels: competitorChannels
          },
          youtube_key: apiKeys.youtube || '', llm_engine: agentEngine, api_keys: apiKeys
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
              if (msg.analysis) setAnalysisData(msg.analysis)
              showNotification('Анализ завершен!', 'success')
            }
          } catch (err) {
            console.error('JSON parse error on stream:', err)
          }
        }
      }
    } catch (e) {
      showNotification('Ошибка связи с агентом', 'error')
      setAgentLogs(prev => [...prev, { message: 'Ошибка соединения.', status: 'error' }])
    } finally {
      setIsAgentRunning(false)
    }
  }

  const handleAnalyzeHook = async (transcript?: string) => {
    if (!transcript) {
      showNotification('Субтитры недоступны для этого видео', 'error')
      return
    }
    setHookData(null)
    setHookModalOpen(true)
    setIsHookAnalyzing(true)

    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/analyze-hook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, engine: agentEngine, api_keys: apiKeys })
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') setHookData(data.data)
      else throw new Error('Сбой генерации')
    } catch (e) {
      showNotification('Ошибка анализа хука', 'error')
      setHookModalOpen(false)
    } finally {
      setIsHookAnalyzing(false)
    }
  }

  const handleCreateProject = async (idea: IdeaFormat, index: number) => {
    setDraftingIdeaIdx(index)
    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/draft-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: idea.titles[0], idea_description: idea.description,
          channel_context: channelContext, engine: agentEngine, api_keys: apiKeys
        })
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        const md = data.markdown
        const newProj: ProjectSettings = {
          name: `Ideation: ${idea.titles[0].substring(0, 20)}`,
          format: '16:9', resolution: '1080p',
          metadata: { title: idea.titles[0], description: idea.thumbnail_concept, tags: [] },
          montage: { fps: '30', animationStyle: 'screencast', transitions: [], colors: { primary: '#ddb7ff', secondary: '#4fdbc8', background: '#0b1326', surface: '#171f33', accent: '#ffb4ab', text: '#dae2fd' }, typography: { heading: 'Inter', body: 'Geist' } },
          scenes: [], rawMarkdown: md, audioMode: 'scene',
          audioProcessing: { silenceThresholdDb: -45.0, minSilenceMs: 200, maxSilenceMs: 100, removeEdges: false }
        }
        addProject(newProj)
        showNotification('Проект и скрипт успешно созданы!', 'success')
      }
    } catch (e) {
      showNotification('Ошибка генерации скрипта', 'error')
    } finally {
      setDraftingIdeaIdx(null)
    }
  }

  return (
    <div className="flex flex-col w-full h-full bg-background animate-in fade-in duration-300">
      <div className="flex border-b border-white/10 bg-surface-container/60 shrink-0 px-6 pt-4 gap-2">
        <button
          onClick={() => setActiveTab('agent')}
          className={`px-8 py-3 text-sm font-semibold uppercase tracking-wide transition-colors rounded-t-xl ${activeTab === 'agent' ? 'bg-primary/20 text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}
        >
          <Icon name="smart_toy" className="align-middle mr-2" /> AI-Агент (Идеи & Тренды)
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'agent' && (
          <>
            <div className="w-[340px] xl:w-[380px] flex flex-col gap-4 bg-surface-container-lowest/30 border-r border-white/10 p-5 shrink-0 overflow-y-auto custom-scrollbar">

              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Режим поиска">
                  <Select value={searchMode} onChange={e => setSearchMode(e.target.value as 'trending' | 'competitors')} className="text-xs">
                    <option value="trending">Тренды + ИИ</option>
                    <option value="competitors">Анализ конкурентов</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label={`Множитель (>${minRatio.toFixed(1)}x)`}>
                  <Slider min={0.5} max={10.0} step={0.5} value={minRatio} onChange={e => setMinRatio(Number(e.target.value))} />
                </FieldGroup>
              </div>

              {searchMode === 'competitors' ? (
                <div className="flex flex-col gap-2 bg-surface-container-lowest/50 border border-white/5 p-3 rounded-xl">
                  <span className="text-xs font-label uppercase text-on-surface-variant">Каналы конкурентов</span>
                  <div className="flex flex-wrap gap-2">
                    {competitorChannels.map((ch, i) => (
                      <span key={i} className="bg-primary/10 border border-primary/20 text-primary px-2 py-1 rounded text-xs flex items-center gap-1">
                        {ch} <span className="cursor-pointer hover:text-white" onClick={() => handleRemoveChannel(ch)}><Icon name="close" className="text-[14px]" /></span>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Input value={newChannelInput} onChange={e => setNewChannelInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddChannel()} placeholder="Название или URL..." className="text-xs flex-1" />
                    <Button variant="secondary" onClick={handleAddChannel} className="shrink-0 px-2 py-1 h-auto"><Icon name="add" className="text-[16px]" /></Button>
                  </div>
                  <Button variant="dashed" onClick={handleSuggestCompetitors} disabled={isSuggestingCompetitors} className="mt-2 text-xs border-secondary/30 text-secondary hover:bg-secondary/10 py-1.5 h-auto">
                    {isSuggestingCompetitors ? <Spinner className="text-[14px]" /> : <><Icon name="auto_awesome" className="text-[14px] mr-1" /> Подобрать ИИ</>}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <FieldGroup label="Мин. сабов">
                    <Input type="number" value={minSubs} onChange={e => setMinSubs(Number(e.target.value))} className="text-xs" />
                  </FieldGroup>
                  <FieldGroup label="Макс. сабов">
                    <Input type="number" value={maxSubs} onChange={e => setMaxSubs(Number(e.target.value))} className="text-xs" />
                  </FieldGroup>
                </div>
              )}

              <FieldGroup label="Тематика ниши">
                <Select value={nichePreset} onChange={e => setNichePreset(e.target.value)}>
                  {NICHE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
              </FieldGroup>

              {nichePreset === 'custom' && (
                <FieldGroup label="Своя ниша / Точный запрос">
                  <Input value={customQuery} onChange={e => setCustomQuery(e.target.value)} placeholder="Например: Обзор React 19" />
                </FieldGroup>
              )}

              <div className="grid grid-cols-2 gap-3 mt-2">
                <FieldGroup label="Язык">
                  <Select value={language} onChange={e => setLanguage(e.target.value)} className="text-xs">
                    <option value="ru">Русский (RU)</option>
                    <option value="en">English (US)</option>
                    <option value="es">Español (ES)</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Формат">
                  <Select value={videoType} onChange={e => setVideoType(e.target.value as 'all' | 'long' | 'short')} className="text-xs">
                    <option value="all">Все</option>
                    <option value="long">Длинные</option>
                    <option value="short">Shorts</option>
                  </Select>
                </FieldGroup>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <FieldGroup label="Дней назад (Поиск)">
                  <Input type="number" min={1} max={365} value={daysBack} onChange={e => setDaysBack(Number(e.target.value))} className="text-xs" />
                </FieldGroup>
                <FieldGroup label="Кол-во идей">
                  <Select value={ideasCount} onChange={e => setIdeasCount(Number(e.target.value))} className="text-xs">
                    <option value="3">3 шт.</option>
                    <option value="5">5 шт.</option>
                    <option value="10">10 шт.</option>
                  </Select>
                </FieldGroup>
              </div>

              <FieldGroup label="О чем ваш канал? (Контекст для ИИ)">
                <textarea
                  className="w-full bg-surface-container-lowest border border-white/10 rounded-lg py-2 px-3 text-sm text-on-surface resize-none focus:border-primary/50"
                  rows={2}
                  value={channelContext}
                  onChange={e => setChannelContext(e.target.value)}
                  placeholder="Например: Я снимаю туториалы для новичков..."
                />
              </FieldGroup>

              <div className="bg-primary/10 border border-primary/20 p-3 rounded-xl flex flex-col gap-2">
                <FieldGroup label="LLM Движок (Агент)">
                  <Input list="agent-models" value={agentEngine} onChange={e => setAgentEngine(e.target.value)} className="text-xs font-mono" />
                  <datalist id="agent-models">
                    <option value="openai/gpt-4o" />
                    <option value="openai/gpt-4o-mini" />
                    <option value="qwen/qwen2.5-coder" />
                    <option value="gemma3:1b" />
                    <option value="gemma3:4b" />
                    <option value="gemma3:8b" />
                    <option value="qwen2.5-coder" />
                    <option value="llama3.1-8b" />
                    <option value="deepseek-coder-v2" />
                  </datalist>
                </FieldGroup>
              </div>

              <Button variant="primary" onClick={handleRunAgent} disabled={isAgentRunning} className="mt-auto shadow-[0_0_20px_rgba(221,183,255,0.2)] py-3 text-base">
                {isAgentRunning ? <><Spinner className="text-xl" /> Работаем...</> : <><Icon name="play_circle" className="text-xl" /> Найти Идеи</>}
              </Button>
            </div>

            <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden relative bg-surface-container/10">
              <div className="h-[120px] shrink-0 bg-[#0A0E17] border border-white/10 rounded-xl p-4 font-mono text-xs overflow-y-auto custom-scrollbar shadow-inner">
                {agentLogs.length === 0 && !isAgentRunning && <div className="text-on-surface-variant/50 m-auto text-center mt-6">Здесь будут отображаться этапы анализа...</div>}
                {agentLogs.map((log, i) => (
                  <div key={i} className={`flex items-start gap-2 ${log.status === 'error' ? 'text-error font-bold' : log.status === 'success' ? 'text-success' : log.status === 'warning' ? 'text-warning' : 'text-primary'}`}>
                    <span className="opacity-50">[{new Date().toLocaleTimeString()}]</span>
                    <span>{log.message}</span>
                  </div>
                ))}
                {isAgentRunning && <div className="text-primary animate-pulse flex items-center gap-2 mt-2"><Spinner className="text-[12px]" /></div>}
                <div ref={logsEndRef} />
              </div>

              <div className="flex-1 bg-surface-900/60 border border-white/10 rounded-xl overflow-y-auto custom-scrollbar relative shadow-xl">
                <div className="sticky top-0 z-30 flex justify-between items-center bg-surface-900/90 backdrop-blur-md px-6 py-3 border-b border-white/10">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setIsGridView(false)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${!isGridView ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}><Icon name="view_list" className="text-[18px]" /> Детали</button>
                    <button onClick={() => setIsGridView(true)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${isGridView ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}><Icon name="grid_view" className="text-[18px]" /> Обложки</button>
                  </div>
                  {excelPath && (
                    <Button variant="secondary" icon="download" onClick={() => {
                      const a = document.createElement('a'); a.href = `${API}/api/v1/render/media?path=${encodeURIComponent(excelPath)}`; a.download = 'report.xlsx'; document.body.appendChild(a); a.click(); a.remove();
                    }}>Скачать Excel</Button>
                  )}
                </div>

                <div className="p-6 flex flex-col gap-10">
                  {analysisData?.ideas && (
                    <div>
                      <h3 className="text-success font-bold text-2xl mb-4 flex items-center gap-3">
                        <Icon name="tips_and_updates" className="text-3xl" /> Готовые Идеи и Упаковка
                      </h3>
                      <div className="flex flex-col gap-6">
                        {analysisData.ideas.map((idea, idx) => (
                          <div key={idx} className="bg-[#0A0E17] border border-success/20 p-6 rounded-2xl flex flex-col gap-4 shadow-lg relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-success" />
                            <div className="pl-2">
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex flex-col gap-1 flex-1 pr-6">
                                  {idea.titles.map((t, i) => (
                                    <h4 key={i} className={`text-lg font-bold ${i===0 ? 'text-white' : 'text-white/60 text-base'}`}>{i===0 && '🔥 '}{t}</h4>
                                  ))}
                                </div>
                                <Button variant="primary" onClick={() => handleCreateProject(idea, idx)} disabled={draftingIdeaIdx !== null} className="shrink-0 bg-success hover:bg-success/80 text-black shadow-[0_0_15px_rgba(74,222,128,0.3)]">
                                  {draftingIdeaIdx === idx ? <Spinner /> : <><Icon name="movie_edit" className="text-lg" /> Создать проект</>}
                                </Button>
                              </div>
                              <p className="text-on-surface-variant text-sm leading-relaxed mb-4">{idea.description}</p>
                              <div className="bg-secondary/10 border border-secondary/20 p-4 rounded-xl flex items-start gap-3">
                                <Icon name="brush" className="text-secondary mt-0.5" />
                                <div>
                                  <span className="text-xs text-secondary font-bold uppercase tracking-wider block mb-1">ТЗ для превью</span>
                                  <span className="text-sm text-on-surface leading-snug">{idea.thumbnail_concept}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysisData?.conclusions && (
                    <div>
                      <h3 className="text-primary font-bold text-xl mb-4 flex items-center gap-2">
                        <Icon name="psychology" className="text-2xl" /> Почему эти форматы зашли?
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {analysisData.conclusions.map((conc, i) => (
                          <div key={i} className="bg-surface-800/50 border border-white/5 p-4 rounded-xl text-sm text-on-surface-variant leading-relaxed">
                            <span className="text-primary font-bold text-lg block mb-1">0{i+1}</span>
                            {conc}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {agentResults.length > 0 && (
                    <div>
                      <h3 className="text-on-surface font-bold text-xl mb-4 flex items-center gap-2">
                        <Icon name="local_fire_department" className="text-error text-2xl" /> {searchMode === 'competitors' ? 'Аномалии конкурентов' : 'Референсы (Топ по VPH)'}
                      </h3>
                      {isGridView ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                          {agentResults.map((v, i) => (
                            <div key={i} className="relative group rounded-xl overflow-hidden aspect-video bg-black cursor-pointer" onClick={() => window.open(v.url, '_blank')}>
                              <img src={`https://i.ytimg.com/vi/${v.video_id}/maxresdefault.jpg`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute bottom-1 right-1 bg-error text-white px-1.5 py-0.5 rounded text-[10px] font-bold shadow-md">
                                {v.vph} VPH
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                          {agentResults.map((v, i) => (
                            <div key={i} className="bg-black/40 border border-white/10 p-3 rounded-2xl flex flex-col gap-3 group hover:border-primary/30 transition-colors shadow-md relative">
                              <div className="relative rounded-xl overflow-hidden aspect-video">
                                <img src={`https://i.ytimg.com/vi/${v.video_id}/maxresdefault.jpg`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                <div className="absolute top-2 right-2 bg-error text-white px-2 py-1 rounded-lg text-xs font-black shadow-lg border border-error/50">
                                  {v.vph} VPH 🔥
                                </div>
                              </div>
                              <div className="flex-1">
                                <h4 className="font-bold text-[14px] line-clamp-2 leading-snug mb-1" title={v.title}>{v.title}</h4>
                                <div className="text-[11px] text-on-surface-variant mb-2">{v.channel} • {v.views.toLocaleString('ru')} views</div>
                                <div className="flex gap-2">
                                  <span className="bg-warning/20 text-warning px-1.5 py-0.5 rounded text-[10px] font-bold border border-warning/30">x{v.ratio} {searchMode === 'competitors' ? 'медиана' : 'база'}</span>
                                  <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold border border-primary/30">{fmtDuration(v)}</span>
                                </div>
                              </div>
                              <div className="mt-auto pt-2 flex flex-col gap-1">
                                {v.keyword_found && <span className="text-[10px] text-on-surface-variant/60">{v.keyword_found}</span>}
                                <Button variant="dashed" className="w-full text-xs py-1.5 border-secondary/30 text-secondary hover:bg-secondary/10" onClick={() => handleAnalyzeHook(v.transcript_sample)}>
                                  <Icon name="phishing" className="text-[14px] mr-1" /> Украсть Хук
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal isOpen={hookModalOpen} onClose={() => setHookModalOpen(false)} title="🪝 Анализ Хука" className="max-w-2xl">
        <div className="flex flex-col gap-6 pb-4">
          {isHookAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-10 opacity-70">
              <Spinner className="text-5xl text-secondary mb-4" />
              <p className="font-mono text-sm">ИИ препарирует крючок...</p>
            </div>
          ) : hookData ? (
            <>
              <div className="bg-[#0A0E17] border border-white/10 p-5 rounded-xl">
                <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold block mb-2">Оригинальный хук (первые секунды)</span>
                <p className="text-sm italic text-white/90 leading-relaxed">"{hookData.original_hook}"</p>
              </div>
              <div className="bg-secondary/10 border border-secondary/20 p-5 rounded-xl">
                <span className="text-[10px] text-secondary uppercase tracking-wider font-bold block mb-2 flex items-center gap-1"><Icon name="psychology" className="text-[14px]" /> Почему это работает?</span>
                <p className="text-sm text-secondary font-medium leading-relaxed">{hookData.psychology}</p>
              </div>
              <div>
                <span className="text-[10px] text-primary uppercase tracking-wider font-bold block mb-3">Сгенерированные адаптации для вас</span>
                <div className="flex flex-col gap-3">
                  {hookData.stolen_hooks?.map((h: string, i: number) => (
                    <div key={i} className="bg-surface-container-lowest/50 border border-white/10 p-4 rounded-xl text-sm relative group pr-12">
                      {h}
                      <button onClick={() => { navigator.clipboard.writeText(h); showNotification('Скопировано!', 'success') }} className="absolute top-1/2 -translate-y-1/2 right-3 text-on-surface-variant hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <Icon name="content_copy" className="text-[18px]" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}