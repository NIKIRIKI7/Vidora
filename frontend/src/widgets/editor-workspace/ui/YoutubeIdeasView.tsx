import { useState, useRef, useEffect } from 'react'
import { Input, Button, Slider, FieldGroup, Spinner, Select, Modal } from '@shared/ui'
import { Bot, X, Plus, Sparkles, CirclePlay, List, LayoutGrid, Clapperboard, Paintbrush, BrainCircuit, Flame, FishingHook, Copy, Download, ArrowLeft, TrendingUp, Mic, Share2, Play, CheckCircle2, ShieldCheck, Edit3, GitBranch, Terminal, MessageSquare, MessageCircle, TriangleAlert, Compass, Rocket, ExternalLink, Eye, Check } from 'lucide-react'
import { API } from '@widgets/editor-workspace/lib/helpers'
import { useSettingsStore, useNotificationStore, getSkillsForProcess, type IdeaFormat, type VideoResult, type HookAnalysisData, type EarlySignalItem, type DeepTrendAnalysis, type CommentGoldmineVideoEntry, type BlueOceanOpportunity } from '@entities/project'

interface Props {
  onSelectIdea: (idea: IdeaFormat, videos: VideoResult[]) => void
  onBack: () => void
}

interface AgentLog {
  message: string
  status: 'info' | 'success' | 'error' | 'warning'
}

type AnalysisData = DeepTrendAnalysis

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

const isYoutubeUrl = (url: string) => {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

const PlatformIcon = ({ platform }: { platform: string }) => {
  const p = platform.toLowerCase()
  if (p === 'github') return <GitBranch size={12} />
  if (p === 'hackernews') return <Terminal size={12} />
  return <Share2 size={12} />
}

export const YoutubeIdeasView = ({ onSelectIdea, onBack }: Props) => {
  const { apiKeys, cloudEngines, localEngines, cloudProvider, taskModes, setTaskMode, setCloudEngine, setLocalEngine } = useSettingsStore()
  const showNotification = useNotificationStore(s => s.showNotification)

  const activeApiKeys = {
    ...apiKeys,
    routerai: cloudProvider === 'routerai' ? apiKeys.routerai : undefined,
    aitunnel: cloudProvider === 'aitunnel' ? apiKeys.aitunnel : undefined,
  }

  const [activeTab, setActiveTab] = useState<'agent' | 'thumbnail'>('agent')
  const [searchEngine, setSearchEngine] = useState<'auto' | 'ytscrape' | 'api' | 'ai' | 'script' | 'mcp'>('auto')
  const [searchMode, setSearchMode] = useState<'trending' | 'competitors'>('trending')
  const [videoType, setVideoType] = useState<'all' | 'long' | 'short'>('all')
  const [language, setLanguage] = useState('ru')
  const [enginePreference, setEnginePreference] = useState<'auto' | 'cloud' | 'local'>('auto')
  const [nichePreset, setNichePreset] = useState(NICHE_PRESETS[1].id)
  const [customQuery, setCustomQuery] = useState('')
  const [channelContext, setChannelContext] = useState('')

  const agentEngine = taskModes.scenario === 'cloud' ? cloudEngines.scenario : localEngines.scenario
  const effectiveEngine = enginePreference === 'cloud' ? 'routerai_claude' : enginePreference === 'local' ? localEngines.scenario : 'auto'

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
  const [earlySignals, setEarlySignals] = useState<EarlySignalItem[]>([])
  const [agentResults, setAgentResults] = useState<VideoResult[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [blueOceanGaps, setBlueOceanGaps] = useState<BlueOceanOpportunity[]>([])
  const [goldmineReports, setGoldmineReports] = useState<CommentGoldmineVideoEntry[]>([])
  const [excelPath, setExcelPath] = useState('')
  const [isGridView, setIsGridView] = useState(false)
  const [resultsTab, setResultsTab] = useState<'details' | 'blue_ocean' | 'goldmine' | 'thumbnails'>('details')

  const logsEndRef = useRef<HTMLDivElement>(null)
  const [hookModalOpen, setHookModalOpen] = useState(false)
  const [isHookAnalyzing, setIsHookAnalyzing] = useState(false)
  const [hookData, setHookData] = useState<HookAnalysisData | null>(null)
  const [isAnalyzingChannel, setIsAnalyzingChannel] = useState(false)
  const [draftModalOpen, setDraftModalOpen] = useState(false)
  const [draftingIdea, setDraftingIdea] = useState<IdeaFormat | null>(null)
  const [generatedScript, setGeneratedScript] = useState('')
  const [isDrafting, setIsDrafting] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentLogs])

  const handleAnalyzeChannel = async () => {
    setIsAnalyzingChannel(true)
    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/analyze-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url_or_name: channelContext,
          engine: agentEngine,
          language,
          youtube_key: apiKeys.youtube || '',
          api_keys: activeApiKeys
        })
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        setChannelContext(data.context)
        showNotification('Канал проанализирован!', 'success')
      } else {
        showNotification('Не удалось проанализировать канал', 'error')
      }
    } catch {
      showNotification('Ошибка при анализе канала', 'error')
    } finally {
      setIsAnalyzingChannel(false)
    }
  }

  const handleSuggestCompetitors = async () => {
    const finalQuery = nichePreset === 'custom' ? customQuery : nichePreset
    if (!finalQuery.trim()) { showNotification('Укажите нишу для подбора конкурентов', 'error'); return }
    setIsSuggestingCompetitors(true)
    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/suggest-competitors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: finalQuery, engine: agentEngine, language, api_keys: activeApiKeys, skills_text: getSkillsForProcess('analysis') })
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        const newChannels = data.channels.filter((c: string) => !competitorChannels.includes(c))
        setCompetitorChannels(prev => [...prev, ...newChannels])
        showNotification(`Добавлено ${newChannels.length} конкурентов`, 'success')
      } else { showNotification('Не удалось подобрать конкурентов', 'error') }
    } catch { showNotification('Ошибка связи с агентом', 'error') }
    finally { setIsSuggestingCompetitors(false) }
  }

  const handleAddChannel = () => {
    if (newChannelInput.trim() && !competitorChannels.includes(newChannelInput.trim())) {
      setCompetitorChannels([...competitorChannels, newChannelInput.trim()])
      setNewChannelInput('')
    }
  }

  const handleRemoveChannel = (ch: string) => setCompetitorChannels(competitorChannels.filter(c => c !== ch))

  const handleRunAgent = async (overrideQuery?: string) => {
    const finalQuery = overrideQuery ?? (nichePreset === 'custom' ? customQuery : nichePreset)
    if (searchMode === 'trending' && !finalQuery.trim()) { showNotification('Укажите нишу', 'error'); return }
    if (searchMode === 'competitors' && competitorChannels.length === 0) { showNotification('Укажите конкурентов', 'error'); return }

    setIsAgentRunning(true)
    setAgentLogs([])
    setEarlySignals([])
    setAgentResults([])
    setAnalysisData(null)
    setBlueOceanGaps([])
    setGoldmineReports([])
    setExcelPath('')

    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: finalQuery, project_path: 'vidora_projects/Drafts',
          settings: { days_back: daysBack, min_subs: minSubs, max_subs: maxSubs, min_ratio: minRatio, search_mode: searchMode, search_engine: searchEngine, language: language, video_type: videoType, ideas_count: ideasCount, channel_context: channelContext, channels: competitorChannels, skills_text: getSkillsForProcess('analysis') },
          youtube_key: apiKeys.youtube || '', llm_engine: effectiveEngine, api_keys: activeApiKeys
        })
      })

      if (!res.body) throw new Error('Нет ответа')
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
            if (msg.type === 'log') setAgentLogs(prev => [...prev, { message: msg.message, status: msg.status }])
            else if (msg.type === 'early_signals_ready') setEarlySignals(msg.signals || [])
            else if (msg.type === 'videos_ready') setAgentResults(msg.results || [])
            else if (msg.type === 'blue_ocean_ready') setBlueOceanGaps(msg.opportunities || [])
            else if (msg.type === 'comment_goldmine_ready') setGoldmineReports(msg.reports || [])
            else if (msg.type === 'excel_ready') setExcelPath(msg.excel_path || '')
            else if (msg.type === 'done') {
              if (msg.analysis) {
                setAnalysisData(msg.analysis)
                if (msg.analysis.blue_ocean_gaps) setBlueOceanGaps(msg.analysis.blue_ocean_gaps)
                if (msg.analysis.comment_goldmine) setGoldmineReports(msg.analysis.comment_goldmine)
              }
              showNotification('Анализ завершен!', 'success')
            }
          } catch (err) { console.error('JSON parse error:', err) }
        }
      }
    } catch {
      showNotification('Ошибка связи с агентом', 'error')
      setAgentLogs(prev => [...prev, { message: 'Ошибка соединения.', status: 'error' }])
    } finally {
      setIsAgentRunning(false)
    }
  }

  const handleLoadMoreVideos = async () => {
    const currentQuery = nichePreset === 'custom' ? customQuery : nichePreset
    if (isLoadingMore || !currentQuery.trim()) return
    if (agentResults.length === 0) { showNotification('Сначала запустите поиск', 'error'); return }
    setIsLoadingMore(true)
    try {
      const excludeIds = agentResults.map(v => v.video_id)
      const res = await fetch(`${API}/api/v1/youtube/more-videos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: currentQuery,
          exclude_video_ids: excludeIds,
          settings: { days_back: daysBack, min_subs: minSubs, max_subs: maxSubs, min_ratio: minRatio, video_type: videoType, llm_engine: effectiveEngine },
          language,
          youtube_key: apiKeys.youtube || '',
          api_keys: activeApiKeys,
        })
      })
      const data = await res.json()
      if (data.status === 'ok' && Array.isArray(data.results) && data.results.length > 0) {
        setAgentResults(prev => {
          const existingIds = new Set(prev.map(v => v.video_id))
          const uniqueNew = data.results.filter((v: VideoResult) => !existingIds.has(v.video_id))
          return [...prev, ...uniqueNew]
        })
        showNotification(`Найдено дополнительно ${data.results.length} видео!`, 'success')
      } else {
        showNotification('Новых видео не найдено', 'info')
      }
    } catch (err) {
      console.error('Ошибка загрузки дополнительных видео:', err)
      showNotification('Ошибка загрузки дополнительных видео', 'error')
    } finally {
      setIsLoadingMore(false)
    }
  }

  const handleAnalyzeHook = async (transcript?: string) => {
    if (!transcript) { showNotification('Субтитры недоступны', 'error'); return }
    setHookData(null)
    setHookModalOpen(true)
    setIsHookAnalyzing(true)
    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/analyze-hook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, engine: effectiveEngine, language, api_keys: activeApiKeys, skills_text: getSkillsForProcess('analysis') })
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') setHookData(data.data)
      else throw new Error()
    } catch {
      showNotification('Ошибка анализа хука', 'error')
      setHookModalOpen(false)
    } finally {
      setIsHookAnalyzing(false)
    }
  }

  const handleDraftScript = async (idea: IdeaFormat) => {
    setDraftingIdea(idea)
    setGeneratedScript('')
    setDraftModalOpen(true)
    setIsDrafting(true)
    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/draft-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: idea.titles?.[0] || idea.title || 'Viral Video',
          idea_description: `${idea.description}. Психологический хук: ${idea.psychological_hook || ''}`.trim(),
          channel_context: channelContext,
          engine: effectiveEngine,
          language,
          target_duration: '5',
          video_type: 'long',
        })
      })
      const data = await res.json()
      setGeneratedScript(data.status === 'ok' ? data.markdown : 'Ошибка генерации сценария.')
    } catch (err) {
      setGeneratedScript(`Ошибка: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsDrafting(false)
    }
  }

  return (
    <div className="flex flex-col w-full h-full bg-background animate-in fade-in duration-300">
      <div className="flex border-b border-white/10 bg-surface-container/60 shrink-0 px-6 pt-4 gap-4 items-center">
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack} className="mb-1 p-2" />
        <button
          onClick={() => setActiveTab('agent')}
          className={`px-8 py-3 text-sm font-semibold uppercase tracking-wide transition-colors rounded-t-xl ${activeTab === 'agent' ? 'bg-primary/20 text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}
        >
          <Bot size={24} className="align-middle mr-2" /> AI-Агент (Идеи & Тренды)
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'agent' && (
          <>
            <div className="w-[340px] xl:w-[380px] flex flex-col gap-4 bg-surface-container-lowest/30 border-r border-white/10 p-5 shrink-0 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Источник поиска">
                  <Select value={searchEngine} onChange={e => setSearchEngine(e.target.value as 'auto'|'ytscrape'|'api'|'ai'|'script'|'mcp')} className="text-xs">
                    <option value="auto">Автоматический выбор (ytscrape + API)</option>
                    <option value="ytscrape">ytscrape (Scraper, без ключа)</option>
                    <option value="api">YouTube API v3 (Бэкенд)</option>
                    <option value="ai">Только ИИ (Фантазия)</option>
                    <option value="script">Скрипты (yt_search.ps1)</option>
                    <option value="mcp">Агент MCP (Tool Calling)</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Режим поиска">
                  <Select value={searchMode} onChange={e => setSearchMode(e.target.value as 'trending' | 'competitors')} className="text-xs">
                    <option value="trending">Тренды + ИИ</option>
                    <option value="competitors">Анализ конкурентов</option>
                  </Select>
                </FieldGroup>
              </div>
              <div className="mt-2">
                <FieldGroup label={`Множитель просмотров (>${minRatio.toFixed(1)}x)`}>
                  <Slider min={0.5} max={10.0} step={0.5} value={minRatio} onChange={e => setMinRatio(Number(e.target.value))} />
                </FieldGroup>
              </div>

              {searchMode === 'competitors' ? (
                <div className="flex flex-col gap-2 bg-surface-container-lowest/50 border border-white/5 p-3 rounded-xl">
                  <span className="text-xs font-label uppercase text-on-surface-variant">Каналы конкурентов</span>
                  <div className="flex flex-wrap gap-2">
                    {competitorChannels.map((ch, i) => (
                      <span key={i} className="bg-primary/10 border border-primary/20 text-primary px-2 py-1 rounded text-xs flex items-center gap-1">
                        {ch} <span className="cursor-pointer hover:text-white" onClick={() => handleRemoveChannel(ch)}><X size={14} /></span>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <Input value={newChannelInput} onChange={e => setNewChannelInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddChannel()} placeholder="Название или URL..." className="text-xs flex-1" />
                    <Button variant="secondary" onClick={handleAddChannel} className="shrink-0 px-2 py-1 h-auto"><Plus size={16} /></Button>
                  </div>
                  <Button variant="dashed" onClick={handleSuggestCompetitors} disabled={isSuggestingCompetitors} className="mt-2 text-xs border-secondary/30 text-secondary hover:bg-secondary/10 py-1.5 h-auto">
                    {isSuggestingCompetitors ? <Spinner className="text-[14px]" /> : <><Sparkles size={14} className="mr-1" /> Подобрать ИИ</>}
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

        <FieldGroup label="О чем ваш канал? (Контекст)">
          <div className="relative">
            <textarea
              className="w-full bg-surface-container-lowest border border-white/10 rounded-lg py-2 px-3 pb-8 text-sm text-on-surface resize-none focus:border-primary/50"
              rows={3}
              value={channelContext}
              onChange={e => setChannelContext(e.target.value)}
              placeholder="Вставьте ссылку на канал или опишите его (Например: Я снимаю туториалы для новичков...)"
            />
            {isYoutubeUrl(channelContext.trim()) && (
              <div className="absolute bottom-2 right-2">
                <Button
                  variant="secondary"
                  onClick={handleAnalyzeChannel}
                  disabled={isAnalyzingChannel}
                  className="text-[10px] py-1 px-2 h-auto"
                >
                  {isAnalyzingChannel ? <Spinner className="w-3 h-3 mr-1" /> : <Sparkles size={12} className="mr-1" />}
                  Анализировать канал
                </Button>
              </div>
            )}
          </div>
        </FieldGroup>

              <div className="bg-primary/10 border border-primary/20 p-3 rounded-xl flex flex-col gap-2">
                <FieldGroup label="AI-движок (Авто / Облако / Локально)">
                  <Select value={enginePreference} onChange={e => setEnginePreference(e.target.value as 'auto' | 'cloud' | 'local')} className="text-xs">
                    <option value="auto">Авто (облако если есть ключи, иначе локально)</option>
                    <option value="cloud">Облако (Claude 3.5 / GPT-4o)</option>
                    <option value="local">Локально (Ollama / GGUF)</option>
                  </Select>
                </FieldGroup>
                <div className="flex bg-surface-container-lowest border border-white/10 rounded-lg p-1 shrink-0">
                  <button onClick={() => setTaskMode('scenario', 'cloud')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${taskModes.scenario === 'cloud' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}>Облако</button>
                  <button onClick={() => setTaskMode('scenario', 'local')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${taskModes.scenario === 'local' ? 'bg-success/20 text-success border border-success/30' : 'text-on-surface-variant hover:text-white'}`}>Локально</button>
                </div>
                <FieldGroup label="LLM Движок (Агент)">
                  <Input list="agent-models" value={agentEngine} onChange={e => taskModes.scenario === 'cloud' ? setCloudEngine('scenario', e.target.value) : setLocalEngine('scenario', e.target.value)} className="text-xs font-mono" />
                  <datalist id="agent-models">
                    {taskModes.scenario === 'cloud' ? (
                      <>
                        <option value="anthropic/claude-sonnet-5" />
                        <option value="anthropic/claude-3.5-sonnet" />
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
                </FieldGroup>
              </div>

              <Button variant="primary" onClick={() => handleRunAgent()} disabled={isAgentRunning} className="mt-auto shadow-[0_0_20px_rgba(221,183,255,0.2)] py-3 text-base">
                {isAgentRunning ? <><Spinner className="text-xl" /> Работаем...</> : <><CirclePlay size={20} /> Найти Идеи</>}
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
                  <div className="flex items-center gap-2">
                    <button onClick={() => setResultsTab('details')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${resultsTab === 'details' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}><List size={18} /> Детали</button>
                    <button onClick={() => setResultsTab('blue_ocean')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${resultsTab === 'blue_ocean' ? 'bg-cyan-500/20 text-cyan-300' : 'text-on-surface-variant hover:text-white'}`}>
                      <Compass size={18} /> Голубые Океаны {blueOceanGaps.length > 0 && <span className="text-[10px] font-bold bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded-full">{blueOceanGaps.length}</span>}
                    </button>
                    <button onClick={() => setResultsTab('goldmine')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${resultsTab === 'goldmine' ? 'bg-warning/20 text-warning' : 'text-on-surface-variant hover:text-white'}`}>
                      <MessageSquare size={18} /> Боли &amp; Споры {goldmineReports.length > 0 && <span className="text-[10px] font-bold bg-warning/20 text-warning px-1.5 py-0.5 rounded-full">{goldmineReports.length}</span>}
                    </button>
                    <button onClick={() => setResultsTab('thumbnails')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${resultsTab === 'thumbnails' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}><Eye size={18} /> Обложки</button>
                  </div>
                  {excelPath && (
                    <Button variant="secondary" icon={Download} onClick={() => {
                      const a = document.createElement('a'); a.href = `${API}/api/v1/render/media?path=${encodeURIComponent(excelPath)}`; a.download = 'report.xlsx'; document.body.appendChild(a); a.click(); a.remove();
                    }}>Скачать Excel</Button>
                  )}
                </div>

                <div className="p-6 flex flex-col gap-10">
                  {resultsTab === 'details' && (
                  <>
                  {earlySignals.length > 0 && (
                    <div>
                      <h3 className="text-primary font-bold text-xl mb-4 flex items-center gap-2">
                        <TrendingUp size={24} className="text-primary" /> Ранние сигналы соцсетей и спроса <span className="text-sm font-normal text-on-surface-variant">(VPS 0–100)</span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {earlySignals.map((s) => (
                          <div key={s.id} className="bg-[#0A0E17] border border-white/10 rounded-xl p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.vps_score >= 80 ? 'bg-error/20 text-error border-error/40' : s.vps_score >= 60 ? 'bg-warning/20 text-warning border-warning/40' : 'bg-primary/20 text-primary border-primary/40'}`}>
                                VPS: {s.vps_score}/100 {s.breakout ? '🔥 Breakout' : ''}
                              </span>
                              <span className="text-[10px] text-on-surface-variant font-medium">{s.growth_pct}</span>
                            </div>
                            <h4 className="text-sm font-semibold text-white line-clamp-2 leading-snug">{s.title}</h4>
                            <div className="flex items-center justify-between text-[11px] pt-2 border-t border-white/5 mt-auto">
                              {s.source_url ? (
                                <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-secondary hover:underline flex items-center gap-1 capitalize">
                                  <PlatformIcon platform={s.source_platform} /> {s.source_platform}
                                  {s.metrics.upvotes ? ` · 👍 ${s.metrics.upvotes}` : ''}
                                  {s.metrics.bookmarks ? ` · 🔖 ${s.metrics.bookmarks}` : ''}
                                </a>
                              ) : (
                                <span className="text-on-surface-variant">{s.source_platform}</span>
                              )}
                              <button
                                onClick={() => handleRunAgent(s.query)}
                                disabled={isAgentRunning}
                                className="text-primary hover:text-white flex items-center gap-1 font-medium cursor-pointer"
                                title={`Поиск роликов: ${s.query}`}
                              >
                                <Play size={12} /> Ролики
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  </>
                  )}

                  {resultsTab === 'blue_ocean' && (
                  <>
                  {blueOceanGaps.length > 0 ? (
                    <div>
                      <h3 className="text-cyan-300 font-bold text-xl mb-4 flex items-center gap-2">
                        <Compass size={24} /> Голубые Океаны (Semantic Gap — высокий спрос, 0 видео на YouTube)
                        <span className="text-sm font-normal text-on-surface-variant">(доля дефицитных тем: {blueOceanGaps.length})</span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {blueOceanGaps.map((gap, idx) => (
                          <div key={idx} className="bg-[#0A0E17] border border-cyan-500/20 hover:border-cyan-500/40 rounded-xl p-4 flex flex-col gap-2.5 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${gap.status === 'BLUE_OCEAN_UNCONTESTED' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse' : 'bg-primary/20 text-primary border-primary/40'}`}>
                                💎 Дефицит: {gap.opportunity_score}/100
                              </span>
                              <span className="text-[10px] text-on-surface-variant font-mono">
                                Конкуренция: {gap.competing_videos_count} видео
                              </span>
                            </div>
                            <h4 className="text-sm font-semibold text-white line-clamp-2 leading-snug">{gap.topic}</h4>
                            <p className="text-[11px] text-on-surface-variant leading-relaxed">
                              <strong className="text-cyan-300">🎯 Стратегия: </strong>{gap.actionable_angle}
                            </p>
                            <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-auto">
                              <span className="text-[10px] text-on-surface-variant/60 uppercase">Источник: {gap.demand_source}</span>
                              <button
                                onClick={() => handleRunAgent(gap.topic)}
                                disabled={isAgentRunning}
                                className="text-cyan-400 hover:text-white font-medium text-[11px] flex items-center gap-1 cursor-pointer"
                              >
                                Анализировать тему <ExternalLink size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/60 gap-2">
                      <Compass size={36} className="text-cyan-500/40" />
                      <p className="text-sm">Запустите поиск — дефицитные темы (Semantic Gap) появятся здесь</p>
                    </div>
                  )}
                  </>
                  )}

                  {resultsTab === 'goldmine' && (
                  <>
                  {goldmineReports.length > 0 ? (
                    <div>
                      <h3 className="text-warning font-bold text-xl mb-4 flex items-center gap-2">
                        <MessageSquare size={24} /> Comment Goldmine: боли, упущения и споры зрителей
                        <span className="text-sm font-normal text-on-surface-variant">(кластеризовано из комментариев топ-видео)</span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-[#0A0E17] border border-error/20 p-4 rounded-xl space-y-3">
                          <span className="text-[10px] font-bold text-error uppercase tracking-wider block flex items-center gap-1">
                            <MessageCircle size={13} /> Главные вопросы без ответа
                          </span>
                          {goldmineReports[0]?.report.unresolved_questions.slice(0, 2).map((q, i) => (
                            <div key={i} className="pt-2 border-t border-white/5 space-y-1">
                              <p className="text-xs text-on-surface italic leading-relaxed">"{q.viewer_quote}"</p>
                              <p className="text-[11px] text-success font-medium">💡 Ответ в видео: {q.script_solution}</p>
                            </div>
                          ))}
                        </div>
                        <div className="bg-[#0A0E17] border border-warning/20 p-4 rounded-xl space-y-3">
                          <span className="text-[10px] font-bold text-warning uppercase tracking-wider block flex items-center gap-1">
                            <TriangleAlert size={13} /> Что пропустили конкуренты
                          </span>
                          {goldmineReports[0]?.report.author_omissions.slice(0, 2).map((o, i) => (
                            <div key={i} className="pt-2 border-t border-white/5 space-y-1">
                              <p className="text-xs text-on-surface italic leading-relaxed">"{o.viewer_quote}"</p>
                              <p className="text-[11px] text-primary font-medium">🔧 Наш фикс: {o.script_solution}</p>
                            </div>
                          ))}
                        </div>
                        <div className="bg-[#0A0E17] border border-primary/20 p-4 rounded-xl space-y-3">
                          <span className="text-[10px] font-bold text-primary uppercase tracking-wider block flex items-center gap-1">
                            <Flame size={13} /> Холивары и споры сообщества
                          </span>
                          {goldmineReports[0]?.report.community_debates.slice(0, 2).map((d, i) => (
                            <div key={i} className="pt-2 border-t border-white/5 space-y-1">
                              <p className="text-xs text-on-surface italic leading-relaxed">"{d.viewer_quote}"</p>
                              <p className="text-[11px] text-secondary font-medium">⚖️ Наш вердикт: {d.script_solution}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/60 gap-2">
                      <MessageSquare size={36} className="text-warning/40" />
                      <p className="text-sm">Боли и споры зрителей появятся после нахождения вирусных роликов</p>
                    </div>
                  )}
                  </>
                  )}

                  {resultsTab === 'details' && (
                  <>
                  {analysisData?.psychology && (
                    <div>
                      <h3 className="text-primary font-bold text-xl mb-4 flex items-center gap-2">
                        <BrainCircuit size={24} /> Психографическая карта зрителя
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-[#0A0E17] border border-error/20 p-4 rounded-xl">
                          <span className="text-[10px] font-bold text-error uppercase tracking-wider block mb-1">🔥 Главный страх</span>
                          <p className="text-sm text-on-surface leading-relaxed">{analysisData.psychology.viewer_fear}</p>
                        </div>
                        <div className="bg-[#0A0E17] border border-success/20 p-4 rounded-xl">
                          <span className="text-[10px] font-bold text-success uppercase tracking-wider block mb-1">🎯 Желание и статус</span>
                          <p className="text-sm text-on-surface leading-relaxed">{analysisData.psychology.viewer_aspiration}</p>
                        </div>
                        <div className="bg-[#0A0E17] border border-warning/20 p-4 rounded-xl">
                          <span className="text-[10px] font-bold text-warning uppercase tracking-wider block mb-1">🛡️ Барьер скепсиса</span>
                          <p className="text-sm text-on-surface leading-relaxed">{analysisData.psychology.skepticism_barrier}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {analysisData?.ideas && (
                    <div>
                      <h3 className="text-success font-bold text-2xl mb-4 flex items-center gap-3">
                        <Sparkles size={30} /> Готовые Идеи и Упаковка
                      </h3>
                      <div className="flex flex-col gap-6">
                        {analysisData.ideas.map((idea, idx) => (
                          <div key={idx} className="bg-[#0A0E17] border border-success/20 p-6 rounded-2xl flex flex-col gap-4 shadow-lg relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-success" />
                            <div className="pl-2">
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex flex-col gap-1 flex-1 pr-6">
                                  {idea.angle_type && (
                                    <span className="inline-block self-start px-2 py-0.5 mb-1 rounded text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/30">
                                      {idea.angle_type}
                                    </span>
                                  )}
                                  {(idea.titles?.length ? idea.titles : (idea.title ? [idea.title] : [])).map((t, i) => (
                                    <h4 key={i} className={`text-lg font-bold ${i===0 ? 'text-white' : 'text-white/60 text-base font-normal'}`}>{i===0 && '🔥 '}{t}</h4>
                                  ))}
                                </div>
                                <Button variant="primary" onClick={() => onSelectIdea(idea, agentResults)} className="shrink-0 bg-success hover:bg-success/80 text-black shadow-[0_0_15px_rgba(74,222,128,0.3)]">
                                  <Clapperboard size={18} /> Создать проект
                                </Button>
                                <Button variant="dashed" onClick={() => handleDraftScript(idea)} className="shrink-0 text-xs py-1.5 h-auto border-secondary/30 text-secondary hover:bg-secondary/10" disabled={isDrafting}>
                                  <Edit3 size={14} className="mr-1" /> Сценарий на {language.toUpperCase()}
                                </Button>
                              </div>
                              <p className="text-on-surface-variant text-sm leading-relaxed mb-4">{idea.description}</p>
                              <div className="bg-secondary/10 border border-secondary/20 p-4 rounded-xl flex items-start gap-3">
                                <Paintbrush size={24} className="text-secondary mt-0.5" />
                                <div className="flex-1">
                                  <span className="text-xs text-secondary font-bold uppercase tracking-wider block mb-1">ТЗ для превью</span>
                                  <span className="text-sm text-on-surface leading-snug">{idea.thumbnail_visual || idea.thumbnail_concept}</span>
                                  {idea.thumbnail_overlay && (
                                    <span className="inline-block mt-2 px-2 py-0.5 rounded bg-error/20 text-error border border-error/30 text-[11px] font-bold uppercase">
                                      Текст на превью: "{idea.thumbnail_overlay}"
                                    </span>
                                  )}
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
                        <BrainCircuit size={24} /> Почему эти форматы зашли?
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

                  {analysisData?.best_concept_script && (
                    <div>
                      <h3 className="text-error font-bold text-xl mb-4 flex items-center gap-2">
                        <Play size={24} /> Скрипт первых 45 секунд (Максимизация AVD)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { key: 'hook_0_5s' as const, label: '[0:00-0:05] Pattern Interrupt', color: 'text-error border-error/30' },
                          { key: 'stakes_5_20s' as const, label: '[0:05-0:20] Stakes & Tension', color: 'text-warning border-warning/30' },
                          { key: 'open_loop_20_45s' as const, label: '[0:20-0:45] Promise & Open Loop', color: 'text-primary border-primary/30' },
                        ].map((stage) => {
                          const s = analysisData.best_concept_script?.[stage.key]
                          if (!s) return null
                          return (
                            <div key={stage.key} className={`bg-[#0A0E17] border ${stage.color} p-4 rounded-xl flex flex-col gap-2`}>
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${stage.color.split(' ')[0]}`}>{stage.label}</span>
                              <p className="text-sm text-white/90 italic font-mono leading-relaxed">"{s.spoken}"</p>
                              <p className="text-[11px] text-on-surface-variant"><strong className="text-on-surface">Визуал/SFX:</strong> {s.visual_cues}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {analysisData?.seo && (
                    <div>
                      <h3 className="text-success font-bold text-xl mb-4 flex items-center gap-2">
                        <Sparkles size={24} /> Полный пакет SEO и метаданных
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[#0A0E17] border border-white/10 p-4 rounded-xl flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-success font-bold uppercase tracking-wider">NLP-описание</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`${analysisData.seo?.description_above_fold || ''}\n\n${analysisData.seo?.description_body || ''}`)
                                showNotification('Описание скопировано!', 'success')
                              }}
                              className="text-on-surface-variant hover:text-white"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                          <p className="text-sm text-primary font-medium">{analysisData.seo.description_above_fold}</p>
                          <p className="text-sm text-on-surface-variant leading-relaxed">{analysisData.seo.description_body}</p>
                        </div>
                        <div className="bg-[#0A0E17] border border-white/10 p-4 rounded-xl flex flex-col gap-3">
                          <div>
                            <span className="text-[10px] text-warning font-bold uppercase tracking-wider">Таймкоды</span>
                            <div className="mt-1 space-y-0.5 font-mono text-xs text-on-surface-variant">
                              {analysisData.seo.timestamps.map((t, i) => (
                                <div key={i}><span className="text-warning font-bold">{t.time}</span> - {t.label}</div>
                              ))}
                            </div>
                          </div>
                          {analysisData.seo.tags?.length > 0 && (
                            <div className="pt-2 border-t border-white/5">
                              <span className="text-[10px] text-success font-bold uppercase tracking-wider">Теги</span>
                              <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">{analysisData.seo.tags.join(', ')}</p>
                            </div>
                          )}
                          {analysisData.seo.pinned_comment && (
                            <div className="pt-2 border-t border-white/5 flex items-start justify-between gap-3">
                              <div>
                                <span className="text-[10px] text-primary font-bold uppercase tracking-wider">Закрепленный комментарий</span>
                                <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">{analysisData.seo.pinned_comment}</p>
                              </div>
                              <button onClick={() => { navigator.clipboard.writeText(analysisData.seo?.pinned_comment || ''); showNotification('Скопировано!', 'success') }} className="text-on-surface-variant hover:text-white shrink-0">
                                <Copy size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {analysisData?.debug_notes && analysisData.debug_notes.length > 0 && (
                    <div>
                      <h3 className="text-on-surface font-bold text-lg mb-3 flex items-center gap-2">
                        <ShieldCheck size={20} className="text-secondary" /> Anti-Cliché Debug
                      </h3>
                      <ul className="space-y-1.5">
                        {analysisData.debug_notes.map((note, i) => (
                          <li key={i} className="bg-secondary/10 border border-secondary/20 p-3 rounded-lg text-xs text-on-surface-variant leading-relaxed flex items-start gap-2">
                            <CheckCircle2 size={14} className="text-secondary shrink-0 mt-0.5" /> {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {agentResults.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-4 gap-3">
                        <h3 className="text-on-surface font-bold text-xl flex items-center gap-2">
                          <Flame size={24} className="text-error" /> {searchMode === 'competitors' ? 'Аномалии конкурентов' : 'Референсы (Топ по VPH)'}
                        </h3>
                        <div className="flex items-center gap-1 bg-surface-800/60 border border-white/10 rounded-lg p-1 shrink-0">
                          <button onClick={() => setIsGridView(false)} className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 transition-colors ${!isGridView ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}><List size={14} /> Список</button>
                          <button onClick={() => setIsGridView(true)} className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 transition-colors ${isGridView ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}><LayoutGrid size={14} /> Сетка</button>
                        </div>
                      </div>
                      {isGridView ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                          {agentResults.map((v, i) => (
                            <div key={i} className="relative group rounded-xl overflow-hidden aspect-video bg-black cursor-pointer" onClick={() => window.open(v.url, '_blank')}>
                              <img src={v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all" />
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
                                <img src={v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute top-2 right-2 bg-error text-white px-2 py-1 rounded-lg text-xs font-black shadow-lg border border-error/50">
                                  {v.vph} VPH 🔥
                                </div>
                                {v.is_rocket && (
                                  <div className="absolute bottom-2 left-2">
                                    <span className="bg-error/95 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1 animate-pulse">
                                      <Rocket size={10} /> {v.acceleration_pct} (M: {v.m_score})
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1">
                                <h4 className="font-bold text-[14px] line-clamp-2 leading-snug mb-1" title={v.title}>{v.title}</h4>
                                <div className="text-[11px] text-on-surface-variant mb-2">{v.channel} • {v.views.toLocaleString('ru')} views</div>
                                <div className="flex gap-2 flex-wrap">
                                  <span className="bg-warning/20 text-warning px-1.5 py-0.5 rounded text-[10px] font-bold border border-warning/30">x{v.ratio} {searchMode === 'competitors' ? 'медиана' : 'база'}</span>
                                  <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold border border-primary/30">{fmtDuration(v)}</span>
                                  {v.transcript_status === 'whisper_fallback' && (
                                    <span className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-purple-500/30 flex items-center gap-1"><Mic size={10} /> Whisper</span>
                                  )}
                                  {v.transcript_status === 'official_subtitles' && (
                                    <span className="bg-success/20 text-success px-1.5 py-0.5 rounded text-[10px] font-bold border border-success/30 flex items-center gap-1"><Mic size={10} /> Субтитры</span>
                                  )}
                                </div>
                              </div>
                              <div className="mt-auto pt-2 flex flex-col gap-1">
                                {v.keyword_found && <span className="text-[10px] text-on-surface-variant/60">{v.keyword_found}</span>}
                                <Button variant="dashed" className="w-full text-xs py-1.5 border-secondary/30 text-secondary hover:bg-secondary/10" onClick={() => handleAnalyzeHook(v.transcript_sample)}>
                                  <FishingHook size={14} className="mr-1" /> Украсть Хук
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Кнопка «Найти еще видео»: добавляет новые ролики без дубликатов */}
                      <div className="flex justify-center mt-5">
                        <button
                          onClick={handleLoadMoreVideos}
                          disabled={isLoadingMore || isAgentRunning}
                          className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-semibold rounded-xl border border-white/10 shadow-lg transition-all"
                        >
                          {isLoadingMore ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                              <span>Поиск новых аномалий...</span>
                            </>
                          ) : (
                            <>
                              <span className="text-base">↻</span>
                              <span>Найти еще видео</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                  )}

                  {resultsTab === 'thumbnails' && (
                  <>
                  {analysisData?.ideas && analysisData.ideas.length > 0 ? (
                    <div>
                      <h3 className="text-primary font-bold text-xl mb-4 flex items-center gap-2">
                        <Paintbrush size={24} className="text-secondary" /> Концепты обложек (CTR Title + Overlay)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {analysisData.ideas.map((idea, idx) => (
                          <div key={idx} className="bg-[#0A0E17] border border-secondary/20 hover:border-secondary/40 rounded-xl p-4 space-y-2.5 transition-colors">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/20 text-primary border border-primary/30">
                              Концепт #{idx + 1} {idea.angle_type && `· ${idea.angle_type}`}
                            </span>
                            <h4 className="text-sm font-bold text-white leading-snug">{idea.titles?.[0] || idea.title || 'Без названия'}</h4>
                            <div className="bg-black/40 border border-white/10 p-3 rounded-lg space-y-1.5">
                              {idea.thumbnail_overlay && (
                                <span className="block px-2 py-0.5 rounded bg-error/20 text-error border border-error/30 text-[11px] font-bold uppercase">
                                  Текст на превью: "{idea.thumbnail_overlay}"
                                </span>
                              )}
                              <p className="text-xs text-on-surface-variant italic leading-relaxed">
                                {idea.thumbnail_visual || idea.thumbnail_concept}
                              </p>
                            </div>
                            <button
                              onClick={() => copyToClipboard(idea.thumbnail_overlay || idea.thumbnail_visual || '', `thumb_${idx}`)}
                              className="text-primary hover:text-white flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                            >
                              {copiedKey === `thumb_${idx}` ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                              {copiedKey === `thumb_${idx}` ? 'Скопировано' : 'Скопировать ТЗ'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/60 gap-2">
                      <Paintbrush size={36} className="text-secondary/40" />
                      <p className="text-sm">Концепты обложек появятся после завершения анализа</p>
                    </div>
                  )}
                  </>
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
                <span className="text-[10px] text-secondary uppercase tracking-wider font-bold block mb-2 flex items-center gap-1"><BrainCircuit size={14} /> Почему это работает?</span>
                <p className="text-sm text-secondary font-medium leading-relaxed">{hookData.psychology}</p>
              </div>
              {hookData.flaws_identified && (
                <div className="bg-error/10 border border-error/20 p-5 rounded-xl">
                  <span className="text-[10px] text-error uppercase tracking-wider font-bold block mb-2">Слабые места хука</span>
                  <p className="text-sm text-on-surface leading-relaxed">{hookData.flaws_identified}</p>
                </div>
              )}
              <div>
                <span className="text-[10px] text-primary uppercase tracking-wider font-bold block mb-3">Сгенерированные адаптации для вас</span>
                <div className="flex flex-col gap-3">
                  {hookData.stolen_hooks?.map((h, i) => {
                    if (typeof h === 'string') {
                      return (
                        <div key={i} className="bg-surface-container-lowest/50 border border-white/10 p-4 rounded-xl text-sm relative group pr-12">
                          {h}
                          <button onClick={() => { navigator.clipboard.writeText(h); showNotification('Скопировано!', 'success') }} className="absolute top-1/2 -translate-y-1/2 right-3 text-on-surface-variant hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy size={18} />
                          </button>
                        </div>
                      )
                    }
                    return (
                      <div key={i} className="bg-surface-container-lowest/50 border border-white/10 p-4 rounded-xl flex flex-col gap-2">
                        <span className="text-[10px] font-bold uppercase text-primary">{h.angle}</span>
                        <div className="text-xs space-y-1">
                          <p><span className="text-error font-bold">0-5с:</span> <span className="text-on-surface">{h.hook_0_5s}</span></p>
                          <p><span className="text-warning font-bold">5-20с:</span> <span className="text-on-surface">{h.hook_5_20s}</span></p>
                        </div>
                        {h.why_it_converts && <p className="text-[11px] text-on-surface-variant">🎯 {h.why_it_converts}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </Modal>

      <Modal isOpen={draftModalOpen} onClose={() => setDraftModalOpen(false)} title={`📝 Сценарий на ${language.toUpperCase()}`} className="max-w-3xl">
        <div className="flex flex-col gap-4 pb-2">
          <div className="bg-[#0A0E17] border border-white/10 p-3 rounded-xl text-xs text-on-surface-variant">
            {draftingIdea?.titles?.[0] || draftingIdea?.title}
          </div>
          <div className="bg-[#0A0E17] border border-white/10 rounded-xl p-4 font-mono text-xs text-on-surface whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto custom-scrollbar">
            {isDrafting ? (
              <div className="flex flex-col items-center justify-center py-12 opacity-70 gap-3">
                <Spinner className="text-3xl text-secondary" />
                <p>Генерация вирусного сценария на {language.toUpperCase()}...</p>
              </div>
            ) : (
              generatedScript
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => { navigator.clipboard.writeText(generatedScript); showNotification('Сценарий скопирован!', 'success') }} disabled={isDrafting || !generatedScript}>
              <Copy size={14} className="mr-1.5" /> Копировать сценарий
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
