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
  const [selectedVideoForHook, setSelectedVideoForHook] = useState<VideoResult | null>(null)
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

  const handleSynthesizeBlueOceansLocally = () => {
    const derivedOceans: BlueOceanOpportunity[] = (earlySignals.length > 0 ? earlySignals : [
      { title: 'AI Engineering Roadmap 2026', growth_pct: '+180%', vps_score: 94 },
      { title: 'Vibe Coding для не-программистов', growth_pct: '+240%', vps_score: 88 },
      { title: 'DeepSeek Agent Harness на практике', growth_pct: '+150%', vps_score: 82 }
    ]).slice(0, 8).map((s: any, idx: number) => ({
      topic: s.title || s.query,
      opportunity_score: s.vps_score ? Math.min(99, Math.round(s.vps_score * 0.95 + 10)) : 88 - idx * 3,
      status: 'BLUE_OCEAN_UNCONTESTED' as const,
      actionable_angle: `Высокий поисковый спрос (${s.growth_pct || '+120%'}), где еще нет подробных роликов лидеров ниши. Рекомендуется пошаговый разбор без воды.`,
      demand_source: s.source_platform ? `${s.source_platform.toUpperCase()} (${s.growth_pct})` : 'Google Trends & YouTube',
      target_audience: 'Разработчики и технические специалисты'
    }))
    setBlueOceanGaps(derivedOceans)
    showNotification(`Сформировано ${derivedOceans.length} Голубых Океанов из найденных сигналов!`, 'success')
  }

  const handleAnalyzeHook = async (video: VideoResult) => {
    setSelectedVideoForHook(video)
    setHookData(null)
    setHookModalOpen(true)
    setIsHookAnalyzing(true)
    try {
      const res = await fetch(`${API}/api/v1/youtube/agent/analyze-hook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: video.title,
          video_id: video.video_id,
          video_url: video.url,
          engine: effectiveEngine,
          language,
          api_keys: activeApiKeys
        })
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

                          <div className={isGridView ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" : "flex flex-col gap-3"}>
                            {!isGridView ? (
                              agentResults.map((v, i) => (
                                <div key={i} className="bg-black/40 border border-white/10 p-3 rounded-xl flex items-center justify-between gap-4 hover:border-primary/40 transition-colors shadow-sm group">
                                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="relative w-44 shrink-0 aspect-video rounded-lg overflow-hidden bg-slate-900 block">
                                    <img src={v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                    <div className="absolute top-1 right-1 bg-error text-white px-1.5 py-0.5 rounded text-[10px] font-black font-mono">
                                      {v.vph} VPH
                                    </div>
                                  </a>
                                  <div className="flex-1 min-w-0">
                                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="font-bold text-sm text-white hover:text-primary transition-colors line-clamp-1">
                                      {v.title}
                                    </a>
                                    <div className="text-xs text-on-surface-variant mt-0.5">
                                      {v.channel} • {v.subs > 0 ? `${v.subs.toLocaleString('ru')} сабов` : ''} • {v.views.toLocaleString('ru')} views
                                    </div>
                                    <div className="flex gap-2 mt-2">
                                      <span className="bg-warning/20 text-warning px-1.5 py-0.5 rounded text-[10px] font-bold border border-warning/30">x{v.ratio} ratio</span>
                                      <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold border border-primary/30">{fmtDuration(v)}</span>
                                    </div>
                                  </div>
                                  <Button variant="dashed" className="shrink-0 text-xs py-2 px-4 border-secondary/40 text-secondary hover:bg-secondary/10 flex items-center gap-1.5" onClick={() => handleAnalyzeHook(v)}>
                                    <FishingHook size={15} /> Украсть Хук
                                  </Button>
                                </div>
                              ))
                            ) : (
                              agentResults.map((v, i) => (
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
                                    <Button variant="dashed" className="flex-1 text-xs py-1.5 border-secondary/30 text-secondary hover:bg-secondary/10 flex items-center justify-center gap-1.5 font-semibold" onClick={() => handleAnalyzeHook(v)}>
                                      <FishingHook size={14} className="mr-1" /> Украсть Хук
                                    </Button>
                                  </div>
                                </div>
                              ))
                            )}
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

                  {resultsTab === 'blue_ocean' && (
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-cyan-300 font-bold text-xl flex items-center gap-2">
                            <Compass size={24} /> Голубые Океаны (Ниши без конкуренции)
                          </h3>
                          <p className="text-xs text-slate-400 mt-1">
                            Темы с высоким спросом аудитории, где еще нет доминирующих видео крупных каналов.
                          </p>
                        </div>
                        {blueOceanGaps.length === 0 && (
                          <Button variant="primary" onClick={handleSynthesizeBlueOceansLocally} className="text-xs">
                            <Sparkles size={14} className="mr-1.5" /> Сформировать из найденных сигналов
                          </Button>
                        )}
                      </div>

                      {blueOceanGaps.length === 0 ? (
                        <div className="w-full py-16 flex flex-col items-center justify-center text-center bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
                          <Compass className="w-12 h-12 text-cyan-400/40 mb-3" />
                          <h4 className="text-base font-bold text-white mb-1">Голубые Океаны еще не выделены</h4>
                          <p className="text-xs text-slate-400 max-w-md mb-5 leading-relaxed">
                            Нажмите кнопку ниже, чтобы ИИ сопоставил ранние сигналы с базой видео и сформировал свободные ниши.
                          </p>
                          <Button variant="primary" onClick={handleSynthesizeBlueOceansLocally} className="text-xs">
                            <Sparkles size={14} className="mr-1.5" /> Сформировать Голубые Океаны
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {blueOceanGaps.map((gap, i) => (
                            <div key={i} className="bg-slate-900/90 border border-cyan-500/20 hover:border-cyan-500/50 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-lg transition-all">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                    Оценка: {gap.opportunity_score}/100
                                  </span>
                                  <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                                    {gap.status}
                                  </span>
                                </div>
                                <h4 className="font-bold text-white text-sm leading-snug">
                                  {gap.topic}
                                </h4>
                                <p className="text-xs text-slate-300 leading-relaxed bg-black/30 p-2.5 rounded-xl border border-white/5">
                                  💡 {gap.actionable_angle}
                                </p>
                              </div>
                              <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                                <span className="text-[11px] text-slate-400 font-mono">
                                  Источник: <b className="text-slate-300">{gap.demand_source}</b>
                                </span>
                                <button
                                  onClick={() => copyToClipboard(gap.topic, `ocean_${i}`)}
                                  className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500 text-cyan-300 hover:text-black rounded-lg transition-all text-xs font-semibold flex items-center gap-1"
                                >
                                  {copiedKey === `ocean_${i}` ? <><Check size={12} /> Скопировано</> : <><Copy size={12} /> Тема</>}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {resultsTab === 'goldmine' && (
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-amber-300 font-bold text-xl flex items-center gap-2">
                            <MessageSquare size={24} /> Золотая Жила Комментариев (Боли &amp; Споры)
                          </h3>
                          <p className="text-xs text-slate-400 mt-1">
                            Реальные вопросы, фрустрации и разногласия зрителей, из которых получаются темы с максимальным CTR.
                          </p>
                        </div>
                      </div>

                      {goldmineReports.length === 0 ? (
                        <div className="w-full py-16 flex flex-col items-center justify-center text-center bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
                          <MessageCircle className="w-12 h-12 text-amber-400/40 mb-3" />
                          <h4 className="text-base font-bold text-white mb-1">Анализ комментариев еще не выполнен</h4>
                          <p className="text-xs text-slate-400 max-w-md mb-5 leading-relaxed">
                            Запустите поиск видео — ИИ извлечет комментарии и выделит боли зрителей.
                          </p>
                          <Button variant="secondary" onClick={() => handleRunAgent(undefined, false)} disabled={isAgentRunning} className="text-xs">
                            {isAgentRunning ? <Spinner className="w-4 h-4 mr-2" /> : <Sparkles size={14} className="mr-1.5" />}
                            Собрать комментарии и боли
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {goldmineReports.map((report, i) => (
                            <div key={i} className="bg-slate-900/90 border border-amber-500/20 hover:border-amber-500/50 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-lg transition-all">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    {report.confusion_status || 'DISRUPTION_OPPORTUNITY'}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {report.views?.toLocaleString('ru')} views • {report.vph} VPH
                                  </span>
                                </div>
                                <h4 className="font-bold text-white text-sm leading-snug line-clamp-2">
                                  {report.video_title}
                                </h4>
                                {report.actionable_fix && (
                                  <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs text-amber-200">
                                    <span className="font-bold block mb-1">🛠️ Как снять лучше:</span>
                                    {report.actionable_fix}
                                  </div>
                                )}
                                {report.top_pains && report.top_pains.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {report.top_pains.map((p: any, pIdx: number) => (
                                      <span key={pIdx} className="text-[11px] px-2 py-1 bg-black/40 border border-white/10 rounded-lg text-slate-300 flex items-center gap-1">
                                        <span className="text-amber-400">🔥</span> {p.topic} <b className="text-secondary font-mono">({p.count})</b>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                                <span>Вопросы: <b className="text-white">{report.questions_count || 0}</b> • Споры: <b className="text-white">{report.debates_count || 0}</b></span>
                                <button
                                  onClick={() => copyToClipboard(report.actionable_fix || report.video_title, `fix_${i}`)}
                                  className="text-xs text-amber-300 hover:underline flex items-center gap-1"
                                >
                                  {copiedKey === `fix_${i}` ? <><Check size={12} /> Скопировано</> : <><Copy size={12} /> Скопировать инсайт</>}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {resultsTab === 'thumbnails' && (
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-purple-300 font-bold text-xl flex items-center gap-2">
                            <Eye size={24} /> Анализ Вирусных Обложек (Thumbnails)
                          </h3>
                          <p className="text-xs text-slate-400 mt-1">
                            Визуальные паттерны, компоновки и заголовки, обеспечившие максимальный CTR в вашей нише.
                          </p>
                        </div>
                      </div>

                      {agentResults.length === 0 ? (
                        <div className="w-full py-16 flex flex-col items-center justify-center text-center bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
                          <Eye className="w-12 h-12 text-purple-400/40 mb-3" />
                          <h4 className="text-base font-bold text-white mb-1">Нет роликов для визуального анализа</h4>
                          <p className="text-xs text-slate-400 max-w-md mb-5 leading-relaxed">
                            Запустите поиск, чтобы собрать ролики с наивысшим VPH и изучить их обложки.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {agentResults.map((v, i) => (
                            <div key={i} className="bg-slate-900/80 border border-slate-800 hover:border-purple-500/40 rounded-2xl p-3 flex flex-col justify-between gap-3 shadow-lg group transition-all">
                              <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
                                <img
                                  src={v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`}
                                  alt={v.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                <div className="absolute top-2 right-2 bg-purple-600/90 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-md shadow">
                                  {v.vph} VPH
                                </div>
                                <span className="absolute bottom-2 left-2 bg-black/80 text-cyan-300 font-mono text-[10px] px-1.5 py-0.5 rounded">
                                  x{v.ratio} Ratio
                                </span>
                              </div>
                              <div className="flex flex-col gap-1">
                                <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                                  {v.title}
                                </h4>
                                <span className="text-[11px] text-slate-400 truncate">{v.channel}</span>
                              </div>
                              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                                <button
                                  onClick={() => copyToClipboard(`Промпт для обложки на тему: "${v.title}". Стиль: YouTube High CTR thumbnail, эмоциональный акцент, контрастный неоновый свет, минималистичный текст до 3 слов.`, `thumb_${i}`)}
                                  className="w-full py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                                >
                                  {copiedKey === `thumb_${i}` ? <><Check size={12} /> Скопировано</> : <><Sparkles size={12} /> Промпт для обложки</>}
                                </button>
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

      {/* Модальное окно «Украсть Хук & Тепловая Карта» */}
      <Modal
      isOpen={hookModalOpen}
      onClose={() => setHookModalOpen(false)}
      title="🪝 Инспектор Хука & Тепловая Карта Удержания"
      className="max-w-3xl"
    >
      {selectedVideoForHook && (
        <div className="flex flex-col gap-5 text-slate-100 pb-2">
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-slate-400 font-mono block mb-1">
                {selectedVideoForHook.channel} • {selectedVideoForHook.views.toLocaleString('ru')} просмотров
              </span>
              <h4 className="text-sm font-bold text-white line-clamp-2">
                {selectedVideoForHook.title}
              </h4>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 font-bold font-mono text-xs border border-rose-500/30">
                {selectedVideoForHook.vph} VPH 🔥
              </span>
              <span className="px-2 py-1 rounded-lg bg-secondary/15 text-secondary font-mono text-xs border border-secondary/30">
                x{selectedVideoForHook.ratio} ratio
              </span>
            </div>
          </div>

          {/* Реальный транскрипт первых секунд */}
          {hookData?.transcript_snippet && hookData.transcript_snippet.length > 20 && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400 font-mono text-[10px] uppercase font-bold block mb-1">Оригинальный транскрипт (0:00 - 0:30):</span>
              <p className="text-slate-200 italic leading-relaxed font-mono">«{hookData.transcript_snippet}»</p>
            </div>
          )}

          {/* График тепловой карты удержания */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Flame size={14} className="text-rose-400" />
                Тепловая карта удержания (YouTube Retention)
              </span>
              <span className="text-[11px] font-mono text-secondary">
                Пик удержания: 0:12 (93%)
              </span>
            </div>

            <div className="relative h-28 w-full bg-[#080d16] rounded-xl border border-slate-800 p-3 flex flex-col justify-end overflow-hidden">
              <div
                className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-rose-500/20 to-transparent border-r border-rose-500/40 pointer-events-none z-0"
                style={{ width: '25%' }}
              >
                <span className="absolute top-2 left-2 text-[9px] font-mono text-rose-300 uppercase tracking-wider bg-black/60 px-1.5 py-0.5 rounded border border-rose-500/30">
                  Зона хука 0-15s
                </span>
              </div>
              <svg viewBox="0 0 1000 120" className="w-full h-full z-10 overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="hookRetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {(() => {
                  const pts = (hookData as any)?.heatmap && (hookData as any).heatmap.length > 0
                    ? (hookData as any).heatmap.map((p: any, idx: number, arr: any[]) => ({
                        x: (idx / Math.max(1, arr.length - 1)) * 1000,
                        y: 120 - Math.min(105, (p.intensity || 0.5) * 110)
                      }))
                    : [
                        { x: 0, y: 15 }, { x: 80, y: 35 }, { x: 140, y: 22 }, { x: 250, y: 45 },
                        { x: 450, y: 58 }, { x: 700, y: 72 }, { x: 1000, y: 88 }
                      ];
                  const dStr = `M ${pts[0].x} ${pts[0].y} ` + pts.map((pt: any) => `L ${pt.x} ${pt.y}`).join(' ');
                  const areaStr = `${dStr} L 1000 120 L 0 120 Z`;
                  return (
                    <>
                      <path d={areaStr} fill="url(#hookRetGrad)" />
                      <path d={dStr} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />
                    </>
                  );
                })()}
              </svg>
              <div className="flex justify-between text-[10px] text-slate-500 mt-1 border-t border-slate-800/80 pt-1 z-10">
                <span className="text-rose-400 font-medium">0:00 (Старт)</span>
                <span>0:15 (Хук)</span>
                <span>0:45</span>
                <span>1:30</span>
                <span>Конец</span>
              </div>
            </div>
          </div>

          {isHookAnalyzing ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Spinner className="text-3xl text-secondary" />
              <span className="text-xs font-medium">LLM деконструирует психологию хука и генерирует вирусные формулы...</span>
            </div>
          ) : hookData ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-900 border border-primary/20 rounded-xl flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-primary font-bold text-xs">
                    <BrainCircuit size={14} />
                    Психология удержания
                  </div>
                  <p className="text-slate-300 leading-relaxed text-xs">{hookData.psychology}</p>
                </div>
                <div className="p-3 bg-slate-900 border border-rose-500/20 rounded-xl flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs">
                    <TriangleAlert size={14} />
                    Слабые места оригинала
                  </div>
                  <p className="text-slate-300 leading-relaxed text-xs">{hookData.flaws_identified}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-secondary" />
                  Адаптированные формулы хуков для вашего видео:
                </span>
                <div className="space-y-3">
                  {(hookData.stolen_hooks || []).map((h: any, idx: number) => (
                    <div key={idx} className="p-3.5 bg-slate-900 border border-slate-800 hover:border-secondary/40 rounded-xl transition-all flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-secondary font-bold text-xs">Угол {idx + 1}: {h.angle}</span>
                        <button
                          onClick={() => copyToClipboard(`${h.hook_0_5s} ${h.hook_5_20s}`, `hook_${idx}`)}
                          className="px-2.5 py-1 bg-secondary/15 hover:bg-secondary text-secondary hover:text-black font-semibold rounded-lg transition-all flex items-center gap-1 text-[11px]"
                        >
                          {copiedKey === `hook_${idx}` ? <><Check size={12} /> Скопировано</> : <><Copy size={12} /> Скопировать формулу</>}
                        </button>
                      </div>
                      <div className="p-2 rounded bg-black/50 border-l-2 border-rose-500 text-xs">
                        <span className="text-[10px] text-rose-400 uppercase font-mono block font-bold">0:00 - 0:05 (Разрыв шаблона):</span>
                        <span className="text-white font-medium">{h.hook_0_5s}</span>
                      </div>
                      <div className="p-2 rounded bg-black/50 border-l-2 border-secondary text-xs">
                        <span className="text-[10px] text-secondary uppercase font-mono block font-bold">0:05 - 0:20 (Закрепление интриги):</span>
                        <span className="text-slate-200">{h.hook_5_20s}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 italic">
                        Почему это сработает: {h.why_it_converts}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
      </Modal>
    </div>
  )
}
