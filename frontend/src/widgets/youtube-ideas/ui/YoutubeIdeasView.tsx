import { fetchClient, apiErrorMessage } from '@shared/api'
import { useState, useEffect } from 'react'
import { PageHeader } from '@shared/ui'
import { Bot } from 'lucide-react'
import type { ExportDataset } from '@features/research-export'
import {
  useSettingsStore,
  useNotificationStore,
  useModelCatalog,
  type IdeaFormat,
  type VideoResult,
} from '@entities/project'
import { useYoutubeAgentStream } from '../model/useYoutubeAgentStream'
import { useHookAnalysis } from '../model/useHookAnalysis'
import {
  NICHE_PRESETS,
  DEEP_TREND_SETTINGS_KEY,
  getSavedFilters,
  type ResultsTab,
} from '../model/constants'
import { AgentFilterPanel } from './AgentFilterPanel'
import { AgentLogConsole } from './AgentLogConsole'
import { AgentResults } from './AgentResults'
import { HookAnalysisModal } from './HookAnalysisModal'

interface Props {
  onSelectIdea: (idea: IdeaFormat, videos: VideoResult[]) => void
  onBack: () => void
}

export const YoutubeIdeasView = ({ onBack }: Props) => {
  const apiKeys = useSettingsStore((s) => s.apiKeys)
  const cloudEngines = useSettingsStore((s) => s.cloudEngines)
  const localEngines = useSettingsStore((s) => s.localEngines)
  const cloudProvider = useSettingsStore((s) => s.cloudProvider)
  const taskModes = useSettingsStore((s) => s.taskModes)
  const setTaskMode = useSettingsStore((s) => s.setTaskMode)
  const setCloudEngine = useSettingsStore((s) => s.setCloudEngine)
  const setLocalEngine = useSettingsStore((s) => s.setLocalEngine)
  const showNotification = useNotificationStore(s => s.showNotification)
  const { localModels, cloudModels } = useModelCatalog('ScenarioDrafting')

  const activeApiKeys = {
    ...apiKeys,
    routerai: cloudProvider === 'routerai' ? apiKeys.routerai : undefined,
    aitunnel: cloudProvider === 'aitunnel' ? apiKeys.aitunnel : undefined,
  }

  const defaultSaved = getSavedFilters()

  const [activeTab] = useState<'agent' | 'thumbnail'>('agent')
  const [searchEngine, setSearchEngine] = useState<'auto' | 'ytscrape' | 'api'>(defaultSaved?.searchEngine || 'auto')
  const [searchMode, setSearchMode] = useState<'trending' | 'competitors'>(defaultSaved?.searchMode || 'trending')
  const [videoType, setVideoType] = useState<'all' | 'long' | 'short'>(defaultSaved?.videoType || 'all')
  const [language, setLanguage] = useState(defaultSaved?.language || 'ru')
  const [enginePreference, setEnginePreference] = useState<'auto' | 'cloud' | 'local'>('auto')
  const [nichePreset, setNichePreset] = useState(NICHE_PRESETS['ru'][1].id)
  const [customQuery, setCustomQuery] = useState('')
  const [channelContext, setChannelContext] = useState(defaultSaved?.channelContext || '')

  const [daysBack, setDaysBack] = useState<number>(defaultSaved?.daysBack ?? 30)
  const [minSubs, setMinSubs] = useState<number>(defaultSaved?.minSubs ?? 1000)
  const [maxSubs, setMaxSubs] = useState<number>(defaultSaved?.maxSubs ?? 90000)
  const [minRatio, setMinRatio] = useState<number>(defaultSaved?.minRatio ?? 1.5)
  const [ideasCount, setIdeasCount] = useState<number>(defaultSaved?.ideasCount ?? 5)

  const [competitorChannels, setCompetitorChannels] = useState<string[]>(defaultSaved?.competitorChannels || [])
  const [newChannelInput, setNewChannelInput] = useState('')
  const [isSuggestingCompetitors, setIsSuggestingCompetitors] = useState(false)
  const [isAnalyzingChannel, setIsAnalyzingChannel] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isGridView, setIsGridView] = useState(false)
  const [resultsTab, setResultsTab] = useState<ResultsTab>('details')

  const agentEngine = taskModes.scenario === 'cloud' ? cloudEngines.scenario : localEngines.scenario
  const effectiveEngine = enginePreference === 'cloud' ? 'routerai_claude' : enginePreference === 'local' ? localEngines.scenario : 'auto'

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

  const {
    isAgentRunning,
    agentLogs,
    earlySignals,
    agentResults,
    analysisData,
    blueOceanGaps,
    goldmineReports,
    logsEndRef,
    runAgent,
    loadMoreVideos,
    synthesizeBlueOceans,
  } = useYoutubeAgentStream({
    nichePreset,
    customQuery,
    language,
    searchMode,
    searchEngine,
    videoType,
    daysBack,
    minSubs,
    maxSubs,
    minRatio,
    ideasCount,
    channelContext,
    competitorChannels,
    youtubeKey: apiKeys.youtube || '',
    effectiveEngine,
    apiKeys: activeApiKeys,
    showNotification,
  })

  const {
    hookModalOpen,
    isHookAnalyzing,
    hookData,
    selectedVideoForHook,
    analyzeHook,
    closeHookModal,
  } = useHookAnalysis({ effectiveEngine, language, apiKeys: activeApiKeys, showNotification })

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleAnalyzeChannel = async () => {
    setIsAnalyzingChannel(true)
    try {
      const { data, error } = await fetchClient.POST('/api/v1/youtube/agent/analyze-channel', {
        body: {
          url_or_name: channelContext,
          engine: agentEngine,
          language,
          youtube_key: apiKeys.youtube || '',
          api_keys: activeApiKeys
        }
      })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status === 'ok') {
        setChannelContext(data.context as string)
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
      const { data, error } = await fetchClient.POST('/api/v1/youtube/agent/suggest-competitors', {
        body: { niche: finalQuery, engine: agentEngine, language, api_keys: activeApiKeys }
      })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status === 'ok') {
        const newChannels = (data.channels ?? []).filter((c: string) => !competitorChannels.includes(c))
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

  const exportDataset: ExportDataset = {
    query: nichePreset === 'custom' ? customQuery : nichePreset,
    language,
    videos: agentResults,
    signals: earlySignals,
    opportunities: blueOceanGaps,
    goldmine: goldmineReports,
    analysisData,
  }

  return (
    <div className="flex flex-col w-full h-full bg-background animate-in fade-in duration-300">
      <PageHeader title="AI-Агент (Идеи & Тренды)" icon={Bot} onBack={onBack} />

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'agent' && (
          <>
            <AgentFilterPanel
              searchEngine={searchEngine}
              setSearchEngine={setSearchEngine}
              searchMode={searchMode}
              setSearchMode={setSearchMode}
              minRatio={minRatio}
              setMinRatio={setMinRatio}
              minSubs={minSubs}
              setMinSubs={setMinSubs}
              maxSubs={maxSubs}
              setMaxSubs={setMaxSubs}
              competitorChannels={competitorChannels}
              newChannelInput={newChannelInput}
              setNewChannelInput={setNewChannelInput}
              isSuggestingCompetitors={isSuggestingCompetitors}
              onAddChannel={handleAddChannel}
              onRemoveChannel={handleRemoveChannel}
              onSuggestCompetitors={handleSuggestCompetitors}
              nichePreset={nichePreset}
              setNichePreset={setNichePreset}
              customQuery={customQuery}
              setCustomQuery={setCustomQuery}
              language={language}
              setLanguage={setLanguage}
              videoType={videoType}
              setVideoType={setVideoType}
              daysBack={daysBack}
              setDaysBack={setDaysBack}
              ideasCount={ideasCount}
              setIdeasCount={setIdeasCount}
              channelContext={channelContext}
              setChannelContext={setChannelContext}
              isAnalyzingChannel={isAnalyzingChannel}
              onAnalyzeChannel={handleAnalyzeChannel}
              enginePreference={enginePreference}
              setEnginePreference={setEnginePreference}
              taskModes={taskModes}
              setTaskMode={setTaskMode}
              cloudEngines={cloudEngines}
              setCloudEngine={setCloudEngine}
              localEngines={localEngines}
              setLocalEngine={setLocalEngine}
              cloudModels={cloudModels}
              localModels={localModels}
              isAgentRunning={isAgentRunning}
              onRunAgent={() => runAgent()}
            />

            <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden relative bg-surface-container/10">
              <AgentLogConsole logs={agentLogs} isRunning={isAgentRunning} endRef={logsEndRef} />

              <AgentResults
                resultsTab={resultsTab}
                onResultsTabChange={(id) => setResultsTab(id as ResultsTab)}
                isGridView={isGridView}
                onGridViewChange={setIsGridView}
                earlySignals={earlySignals}
                agentResults={agentResults}
                blueOceanGaps={blueOceanGaps}
                goldmineReports={goldmineReports}
                isAgentRunning={isAgentRunning}
                copiedKey={copiedKey}
                onCopy={copyToClipboard}
                onAnalyzeHook={analyzeHook}
                onLoadMoreVideos={loadMoreVideos}
                onSynthesizeBlueOceans={synthesizeBlueOceans}
                onRunAgent={() => runAgent(undefined, false)}
                exportDataset={exportDataset}
                onNotify={showNotification}
              />
            </div>
          </>
        )}
      </div>

      <HookAnalysisModal
        isOpen={hookModalOpen}
        onClose={closeHookModal}
        video={selectedVideoForHook}
        hookData={hookData}
        isAnalyzing={isHookAnalyzing}
        copiedKey={copiedKey}
        onCopy={copyToClipboard}
      />
    </div>
  )
}
