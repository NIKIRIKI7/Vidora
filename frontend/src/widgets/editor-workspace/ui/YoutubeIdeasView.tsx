import { useState, useRef, useEffect } from 'react'
import { Input, Button, Slider, FieldGroup, Spinner, Select, Modal } from '@shared/ui'
import {
  Bot, X, Plus, Sparkles, CirclePlay, List, LayoutGrid, Clapperboard,
  Paintbrush, BrainCircuit, Flame, FishingHook, Copy, Download, ArrowLeft,
  TrendingUp, Mic, Share2, Play, CheckCircle2, ShieldCheck, Edit3,
  GitBranch, Terminal, MessageSquare, MessageCircle, TriangleAlert,
  Compass, Rocket, ExternalLink, Eye, Check, FileText
} from 'lucide-react'
import { API } from '@widgets/editor-workspace/lib/helpers'
import { ExportButton, type ExportDataset } from '@features/research-export'
import {
  useSettingsStore, useNotificationStore,
  type IdeaFormat, type VideoResult, type HookAnalysisData,
  type EarlySignalItem, type DeepTrendAnalysis,
  type CommentGoldmineVideoEntry, type BlueOceanOpportunity
} from '@entities/project'

interface Props {
  onSelectIdea: (idea: IdeaFormat, videos: VideoResult[]) => void
  onBack: () => void
}

interface AgentLog {
  message: string
  status: 'info' | 'success' | 'error' | 'warning'
}

type AnalysisData = DeepTrendAnalysis

const NICHE_PRESETS: Record<string, { id: string; label: string; enQuery: string }[]> = {
  ru: [
    { id: 'custom', label: '✍️ Свой вариант...', enQuery: '' },
    { id: 'IT, Программирование, Нейросети', label: '💻 IT и Программирование', enQuery: 'AI programming software development' },
    { id: 'Кибербезопасность, Хакинг, Инфобез', label: '🔐 Кибербезопасность', enQuery: 'cybersecurity ethical hacking' },
    { id: 'Криптовалюта, Инвестиции, Трейдинг', label: '📈 Крипта и Финансы', enQuery: 'crypto trading investing' },
  ],
  en: [
    { id: 'custom', label: '✍️ Custom topic...', enQuery: '' },
    { id: 'AI, Programming, Software Engineering', label: '💻 AI & Programming', enQuery: 'AI, Programming, Software Engineering' },
    { id: 'Cybersecurity, Ethical Hacking, InfoSec', label: '🔐 Cybersecurity & Hacking', enQuery: 'Cybersecurity, Ethical Hacking, InfoSec' },
    { id: 'Crypto, DeFi, Trading Strategies', label: '📈 Crypto & Trading', enQuery: 'Crypto, DeFi, Trading Strategies' },
  ],
}

const DEEP_TREND_SETTINGS_KEY = 'vidora_deeptrend_user_filters'

const getSavedFilters = () => {
  try {
    const raw = localStorage.getItem(DEEP_TREND_SETTINGS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

const fmtDuration = (v: VideoResult) => {
  if (v.is_short) return '⚡ SHORT'
  if (!v.duration_sec) return '—'
  return `${Math.floor(v.duration_sec / 60)}:${String(v.duration_sec % 60).padStart(2, '0')}`
}

const isYoutubeUrl = (url: string) => /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)

const PlatformIcon = ({ platform }: { platform: string }) => {
  const p = platform?.toLowerCase() || ''
  if (p === 'reddit') return <MessageSquare size={12} className="text-orange-400" />
  if (p === 'github') return <GitBranch size={12} className="text-purple-400" />
  if (p === 'hackernews') return <Terminal size={12} className="text-amber-400" />
  if (p === 'trends') return <TrendingUp size={12} className="text-emerald-400" />
  if (p === 'habr') return <FileText size={12} className="text-sky-400" />
  return <Share2 size={12} className="text-slate-400" />
}

export const YoutubeIdeasView = ({ onSelectIdea, onBack }: Props) => {
  const { apiKeys, cloudEngines, localEngines, cloudProvider, taskModes, setTaskMode, setCloudEngine, setLocalEngine } = useSettingsStore()
  const showNotification = useNotificationStore(s => s.showNotification)

  const activeApiKeys = {
    ...apiKeys,
    routerai: cloudProvider === 'routerai' ? apiKeys.routerai : undefined,
    aitunnel: cloudProvider === 'aitunnel' ? apiKeys.aitunnel : undefined,
  }

  const defaultSaved = getSavedFilters()

  const [activeTab, setActiveTab] = useState<'agent' | 'thumbnail'>('agent')
  const [searchEngine, setSearchEngine] = useState<'auto' | 'ytscrape' | 'api' | 'ai' | 'script' | 'mcp'>(defaultSaved?.searchEngine || 'auto')
  const [searchMode, setSearchMode] = useState<'trending' | 'competitors'>(defaultSaved?.searchMode || 'trending')
  const [videoType, setVideoType] = useState<'all' | 'long' | 'short'>(defaultSaved?.videoType || 'all')
  const [language, setLanguage] = useState(defaultSaved?.language || 'ru')
  const [enginePreference, setEnginePreference] = useState<'auto' | 'cloud' | 'local'>('auto')
  const [nichePreset, setNichePreset] = useState(NICHE_PRESETS['ru'][1].id)
  const [customQuery, setCustomQuery] = useState('')
  const [channelContext, setChannelContext] = useState(defaultSaved?.channelContext || '')

  const agentEngine = taskModes.scenario === 'cloud' ? cloudEngines.scenario : localEngines.scenario
  const effectiveEngine = enginePreference === 'cloud' ? 'routerai_claude' : enginePreference === 'local' ? localEngines.scenario : 'auto'

  const [daysBack, setDaysBack] = useState<number>(defaultSaved?.daysBack ?? 30)
  const [minSubs, setMinSubs] = useState<number>(defaultSaved?.minSubs ?? 1000)
  const [maxSubs, setMaxSubs] = useState<number>(defaultSaved?.maxSubs ?? 90000)
  const [minRatio, setMinRatio] = useState<number>(defaultSaved?.minRatio ?? 1.5)
  const [ideasCount, setIdeasCount] = useState<number>(defaultSaved?.ideasCount ?? 5)

  const [competitorChannels, setCompetitorChannels] = useState<string[]>(defaultSaved?.competitorChannels || [])
  const [newChannelInput, setNewChannelInput] = useState('')
  const [isSuggestingCompetitors, setIsSuggestingCompetitors] = useState(false)

  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([])
  const [earlySignals, setEarlySignals] = useState<EarlySignalItem[]>([])
  const [agentResults, setAgentResults] = useState<VideoResult[]>([])
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
  const [allEvaluatedVideoIds, setAllEvaluatedVideoIds] = useState<Set<string>>(new Set())
  const [executedQueriesHistory, setExecutedQueriesHistory] = useState<string[]>([])

  const exportDataset: ExportDataset = {
    query: nichePreset === 'custom' ? customQuery : nichePreset,
    language,
    videos: agentResults,
    signals: earlySignals,
    opportunities: blueOceanGaps,
    goldmine: goldmineReports,
    analysisData,
  }

  // Сохраняем значения фильтров в localStorage при каждом изменении
  useEffect(() => {
    localStorage.setItem(
      DEEP_TREND_SETTINGS_KEY,
      JSON.stringify({
        searchEngine,
        searchMode,
        videoType,
        language,
        daysBack,
        minSubs,
        maxSubs,
        minRatio,
        ideasCount,
        channelContext,
        competitorChannels,
      })
    )
  }, [searchEngine, searchMode, videoType, language, daysBack, minSubs, maxSubs, minRatio, ideasCount, channelContext, competitorChannels])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentLogs])

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

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
    let finalQuery = nichePreset === 'custom' ? customQuery : nichePreset
    if (language === 'en' && /[а-яА-ЯёЁ]/.test(finalQuery)) {
      const found = NICHE_PRESETS.ru.find(p => p.id === finalQuery)
      finalQuery = found?.enQuery || 'AI programming tech'
    }
    if (!finalQuery.trim()) { showNotification('Укажите нишу для подбора конкурентов', 'error'); return }
    setIsSuggestingCompetitors(true)
    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/suggest-competitors`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: finalQuery, engine: agentEngine, language, api_keys: activeApiKeys })
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

  const handleRunAgent = async (overrideQuery?: string, isExpand = false) => {
    let finalQuery = overrideQuery ?? (nichePreset === 'custom' ? customQuery : nichePreset)
    if (language === 'en' && /[а-яА-ЯёЁ]/.test(finalQuery)) {
      const found = NICHE_PRESETS.ru.find(p => p.id === finalQuery)
      finalQuery = found?.enQuery || 'AI programming tech'
    }
    if (searchMode === 'trending' && !finalQuery.trim()) { showNotification('Укажите нишу', 'error'); return }
    if (searchMode === 'competitors' && competitorChannels.length === 0) { showNotification('Укажите конкурентов', 'error'); return }

    setIsAgentRunning(true)

    if (!isExpand) {
      setAgentLogs([])
      setEarlySignals([])
      setAgentResults([])
      setAnalysisData(null)
      setBlueOceanGaps([])
      setGoldmineReports([])
      setExcelPath('')
      setAllEvaluatedVideoIds(new Set())
      setExecutedQueriesHistory([])
    } else {
      setAgentLogs(prev => [
        ...prev,
        { message: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', status: 'info' },
        { message: '🔄 Расширение поиска: генерация новых ключевых слов через Google Trends...', status: 'info' }
      ])
    }

    const excludeVideoIds = Array.from(allEvaluatedVideoIds)
    const excludeQueries = [
      finalQuery,
      ...executedQueriesHistory,
      ...agentResults.slice(0, 20).map(v => v.title.slice(0, 40))
    ]

    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: finalQuery,
          project_path: 'vidora_projects/Drafts',
          settings: {
            days_back: Number(daysBack),
            min_subs: Number(minSubs),
            max_subs: Number(maxSubs),
            min_ratio: Number(minRatio),
            search_mode: searchMode,
            search_engine: searchEngine,
            language: language,
            video_type: videoType,
            ideas_count: Number(ideasCount),
            channel_context: channelContext,
            channels: competitorChannels,
            exclude_video_ids: excludeVideoIds,
            exclude_queries: excludeQueries,
            is_expand_search: isExpand,
          },
          youtube_key: apiKeys.youtube || '',
          llm_engine: effectiveEngine,
          api_keys: activeApiKeys
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
            } else if (msg.type === 'queries_executed') {
              setExecutedQueriesHistory(prev => [...prev, ...(msg.queries || [])])
            } else if (msg.type === 'single_video_found') {
              setAllEvaluatedVideoIds(prev => new Set(prev).add(msg.video.video_id))
              setAgentResults(prev => {
                if (prev.some(v => v.video_id === msg.video.video_id)) return prev
                return [msg.video, ...prev]
              })
            } else if (msg.type === 'early_signals_ready') {
              setEarlySignals(prev => isExpand
                ? [...prev, ...(msg.signals || []).filter((s: EarlySignalItem) => !prev.some(p => p.id === s.id))]
                : (msg.signals || []))
            } else if (msg.type === 'videos_ready') {
              setAgentResults(prev => {
                const map = new Map(prev.map(v => [v.video_id, v]))
                for (const v of (msg.results || [])) {
                  setAllEvaluatedVideoIds(prev => new Set(prev).add(v.video_id))
                  if (!map.has(v.video_id)) map.set(v.video_id, v)
                }
                return Array.from(map.values()).sort((a, b) => b.vph - a.vph)
              })
            } else if (msg.type === 'blue_ocean_ready') {
              setBlueOceanGaps(prev => isExpand
                ? [...prev, ...(msg.opportunities || []).filter((o: BlueOceanOpportunity) => !prev.some(p => p.topic === o.topic))]
                : (msg.opportunities || []))
            } else if (msg.type === 'comment_goldmine_ready') {
              setGoldmineReports(prev => isExpand
                ? [...prev, ...(msg.reports || [])]
                : (msg.reports || []))
            } else if (msg.type === 'excel_ready') {
              setExcelPath(msg.excel_path || '')
            } else if (msg.type === 'done') {
              if (msg.analysis) {
                setAnalysisData(prev => {
                  if (!prev || !isExpand) return msg.analysis
                  return {
                    ...prev,
                    ideas: [...(prev.ideas || []), ...(msg.analysis.ideas || [])],
                    blue_ocean_gaps: [...(prev.blue_ocean_gaps || []), ...(msg.analysis.blue_ocean_gaps || [])],
                  }
                })
              }
              showNotification(isExpand ? 'Новые видео успешно добавлены!' : 'Анализ завершен!', 'success')
            }
          } catch (err) {
            console.error('JSON parse error:', err)
          }
        }
      }
    } catch {
      showNotification('Ошибка связи с агентом', 'error')
      setAgentLogs(prev => [...prev, { message: 'Ошибка соединения с сервером.', status: 'error' }])
    } finally {
      setIsAgentRunning(false)
    }
  }

  const handleLoadMoreVideos = () => {
    if (isAgentRunning) return
    handleRunAgent(undefined, true)
  }

  const handleAnalyzeHook = async (transcript?: string) => {
    if (!transcript) { showNotification('Субтитры недоступны', 'error'); return }
    setHookData(null)
    setHookModalOpen(true)
    setIsHookAnalyzing(true)
    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/analyze-hook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, engine: effectiveEngine, language, api_keys: activeApiKeys })
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
                  <Select value={searchEngine} onChange={e => setSearchEngine(e.target.value as any)} className="text-xs">
                    <option value="auto">Авто (ytscrape + API)</option>
                    <option value="ytscrape">ytscrape (Scraper)</option>
                    <option value="api">YouTube API v3</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Режим поиска">
                  <Select value={searchMode} onChange={e => setSearchMode(e.target.value as 'trending' | 'competitors')} className="text-xs">
                    <option value="trending">Тренды + ИИ</option>
                    <option value="competitors">Конкуренты</option>
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
                  {(NICHE_PRESETS[language] || NICHE_PRESETS.en).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
              </FieldGroup>

              {nichePreset === 'custom' && (
                <FieldGroup label="Свой запрос">
                  <Input value={customQuery} onChange={e => setCustomQuery(e.target.value)} placeholder="Например: Обзор React 19" />
                </FieldGroup>
              )}

              <div className="grid grid-cols-2 gap-3 mt-2">
                <FieldGroup label="Язык">
                  <Select value={language} onChange={e => setLanguage(e.target.value)} className="text-xs">
                    <option value="en">English (US)</option>
                    <option value="ru">Русский (RU)</option>
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
                <FieldGroup label="Дней назад">
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
                    placeholder="Вставьте ссылку на канал или опишите его"
                  />
                  {isYoutubeUrl(channelContext.trim()) && (
                    <div className="absolute bottom-2 right-2">
                      <Button variant="secondary" onClick={handleAnalyzeChannel} disabled={isAnalyzingChannel} className="text-[10px] py-1 px-2 h-auto">
                        {isAnalyzingChannel ? <Spinner className="w-3 h-3 mr-1" /> : <Sparkles size={12} className="mr-1" />}
                        Анализ
                      </Button>
                    </div>
                  )}
                </div>
              </FieldGroup>

              <div className="bg-primary/10 border border-primary/20 p-3 rounded-xl flex flex-col gap-2">
                <FieldGroup label="AI-движок">
                  <Select value={enginePreference} onChange={e => setEnginePreference(e.target.value as any)} className="text-xs">
                    <option value="auto">Авто (облако / локально)</option>
                    <option value="cloud">Облако (Claude / GPT-4o)</option>
                    <option value="local">Локально (Ollama / GGUF)</option>
                  </Select>
                </FieldGroup>
                <div className="flex bg-surface-container-lowest border border-white/10 rounded-lg p-1 shrink-0">
                  <button onClick={() => setTaskMode('scenario', 'cloud')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${taskModes.scenario === 'cloud' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}>Облако</button>
                  <button onClick={() => setTaskMode('scenario', 'local')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${taskModes.scenario === 'local' ? 'bg-success/20 text-success border border-success/30' : 'text-on-surface-variant hover:text-white'}`}>Локально</button>
                </div>
                <FieldGroup label="Модель">
                  <Input list="agent-models" value={agentEngine} onChange={e => taskModes.scenario === 'cloud' ? setCloudEngine('scenario', e.target.value) : setLocalEngine('scenario', e.target.value)} className="text-xs font-mono" />
                  <datalist id="agent-models">
                    {taskModes.scenario === 'cloud' ? (
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
                </FieldGroup>
              </div>

              <Button variant="primary" onClick={() => handleRunAgent()} disabled={isAgentRunning} className="mt-auto py-3 text-base shadow-[0_0_20px_rgba(221,183,255,0.2)]">
                {isAgentRunning ? <><Spinner className="text-xl" /> Идет поиск...</> : <><CirclePlay size={20} /> Запустить поиск</>}
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
                      <Compass size={18} /> Голубые Океаны {blueOceanGaps.length > 0 && <span className="text-[10px] font-bold bg-cyan-500/25 text-cyan-300 px-1.5 py-0.2 rounded-full border border-cyan-500/30">{blueOceanGaps.length}</span>}
                    </button>
                    <button onClick={() => setResultsTab('goldmine')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${resultsTab === 'goldmine' ? 'bg-warning/20 text-warning' : 'text-on-surface-variant hover:text-white'}`}>
                      <MessageSquare size={18} /> Боли &amp; Споры {goldmineReports.length > 0 && <span className="text-[10px] font-bold bg-warning/20 text-warning px-1.5 py-0.5 rounded-full">{goldmineReports.length}</span>}
                    </button>
                    <button onClick={() => setResultsTab('thumbnails')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${resultsTab === 'thumbnails' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}><Eye size={18} /> Обложки</button>
                  </div>
                  <ExportButton dataset={exportDataset} onNotify={showNotification} />
                </div>

                <div className="p-6 flex flex-col gap-10">
                  {resultsTab === 'details' && (
                    <>
                      {earlySignals.length > 0 && (
                        <div>
                          <h3 className="text-primary font-bold text-xl mb-4 flex items-center gap-2">
                            <TrendingUp size={24} className="text-primary" /> Ранние сигналы соцсетей и спроса
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {earlySignals.map((s) => (
                              <div key={s.id} className="bg-[#0A0E17] border border-white/10 rounded-xl p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors">
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.vps_score >= 80 ? 'bg-error/20 text-error border-error/40' : 'bg-primary/20 text-primary border-primary/40'}`}>
                                    VPS: {s.vps_score}/100 {s.breakout ? '🔥 Breakout' : ''}
                                  </span>
                                  <span className="text-[10px] text-on-surface-variant font-medium">{s.growth_pct}</span>
                                </div>
                                <a href={s.source_url || `https://www.google.com/search?q=${encodeURIComponent(s.title)}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-white hover:text-secondary line-clamp-2 leading-snug">
                                  {s.title}
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {agentResults.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-4 gap-3">
                            <h3 className="text-on-surface font-bold text-xl flex items-center gap-2">
                              <Flame size={24} className="text-error" /> Найденные вирусные видео (по критериям)
                            </h3>
                            <div className="flex items-center gap-1 bg-surface-800/60 border border-white/10 rounded-lg p-1 shrink-0">
                              <button onClick={() => setIsGridView(false)} className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 transition-colors ${!isGridView ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}><List size={14} /> Список</button>
                              <button onClick={() => setIsGridView(true)} className={`px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1 transition-colors ${isGridView ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}><LayoutGrid size={14} /> Сетка</button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                            {agentResults.map((v, i) => (
                              <div key={i} className="bg-black/40 border border-white/10 p-3 rounded-2xl flex flex-col gap-3 group hover:border-primary/30 transition-colors shadow-md relative">
                                <a href={v.url} target="_blank" rel="noopener noreferrer" className="relative rounded-xl overflow-hidden aspect-video block group/thumb bg-slate-900">
                                  <img src={v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`} alt={v.title} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300" />
                                  <div className="absolute top-2 right-2 bg-error text-white px-2 py-1 rounded-lg text-xs font-black shadow-lg border border-error/50">
                                    {v.vph} VPH 🔥
                                  </div>
                                </a>
                                <div className="flex-1">
                                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="font-bold text-[14px] line-clamp-2 leading-snug mb-1 text-white hover:text-primary transition-colors">
                                    {v.title}
                                  </a>
                                  <div className="text-[11px] text-on-surface-variant mb-2">{v.channel} • {v.subs > 0 ? `${v.subs.toLocaleString('ru')} сабов` : ''} • {v.views.toLocaleString('ru')} views</div>
                                  <div className="flex gap-2 flex-wrap">
                                    <span className="bg-warning/20 text-warning px-1.5 py-0.5 rounded text-[10px] font-bold border border-warning/30">x{v.ratio} ratio</span>
                                    <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold border border-primary/30">{fmtDuration(v)}</span>
                                  </div>
                                </div>
                                <div className="mt-auto pt-2 flex items-center gap-2">
                                  <Button variant="dashed" className="flex-1 text-xs py-1.5 border-secondary/30 text-secondary hover:bg-secondary/10" onClick={() => handleAnalyzeHook(v.transcript_sample)}>
                                    <FishingHook size={14} className="mr-1" /> Украсть Хук
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-center mt-6">
                            <button
                              onClick={handleLoadMoreVideos}
                              disabled={isAgentRunning}
                              className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-semibold rounded-xl border border-white/10 shadow-lg transition-all cursor-pointer"
                            >
                              {isAgentRunning ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                  <span>ИИ ищет новые ролики по Google Trends...</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-base">↻</span>
                                  <span>Найти еще видео (новые ключевые слова)</span>
                                </>
                              )}
                            </button>
                          </div>
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
    </div>
  )
}
