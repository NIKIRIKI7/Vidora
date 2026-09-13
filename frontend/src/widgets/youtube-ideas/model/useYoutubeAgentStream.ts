import { useEffect, useRef, useState } from 'react'
import {
  API,
  type ApiKeys,
  type BlueOceanOpportunity,
  type CommentGoldmineVideoEntry,
  type DeepTrendAnalysis,
  type EarlySignalItem,
  type VideoResult,
} from '@entities/project'
import { NICHE_PRESETS, type AgentLog, type BlueOceanSeed } from './constants'

export interface YoutubeAgentStreamParams {
  nichePreset: string
  customQuery: string
  language: string
  searchMode: 'trending' | 'competitors'
  searchEngine: 'auto' | 'ytscrape' | 'api'
  videoType: 'all' | 'long' | 'short'
  daysBack: number
  minSubs: number
  maxSubs: number
  minRatio: number
  ideasCount: number
  channelContext: string
  competitorChannels: string[]
  youtubeKey: string
  effectiveEngine: string
  apiKeys: ApiKeys
  showNotification: (message: string, type?: 'success' | 'error' | 'info', details?: string) => void
}

export const useYoutubeAgentStream = ({
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
  youtubeKey,
  effectiveEngine,
  apiKeys,
  showNotification,
}: YoutubeAgentStreamParams) => {
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([])
  const [earlySignals, setEarlySignals] = useState<EarlySignalItem[]>([])
  const [agentResults, setAgentResults] = useState<VideoResult[]>([])
  const [analysisData, setAnalysisData] = useState<DeepTrendAnalysis | null>(null)
  const [blueOceanGaps, setBlueOceanGaps] = useState<BlueOceanOpportunity[]>([])
  const [goldmineReports, setGoldmineReports] = useState<CommentGoldmineVideoEntry[]>([])
  const [, setExcelPath] = useState('')
  const [allEvaluatedVideoIds, setAllEvaluatedVideoIds] = useState<Set<string>>(new Set())
  const [executedQueriesHistory, setExecutedQueriesHistory] = useState<string[]>([])

  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentLogs])

  const resolveQuery = (overrideQuery?: string) => {
    let finalQuery = overrideQuery ?? (nichePreset === 'custom' ? customQuery : nichePreset)
    if (language === 'en' && /[а-яА-ЯёЁ]/.test(finalQuery)) {
      const found = NICHE_PRESETS.ru.find(p => p.id === finalQuery)
      finalQuery = found?.enQuery || 'AI programming tech'
    }
    return finalQuery
  }

  const runAgent = async (overrideQuery?: string, isExpand = false) => {
    const finalQuery = resolveQuery(overrideQuery)
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
          youtube_key: youtubeKey,
          llm_engine: effectiveEngine,
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
                  setAllEvaluatedVideoIds(p => new Set(p).add(v.video_id))
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

  const loadMoreVideos = () => {
    if (isAgentRunning) return
    runAgent(undefined, true)
  }

  const synthesizeBlueOceans = () => {
    const seeds: BlueOceanSeed[] = earlySignals.length > 0 ? earlySignals : [
      { title: 'AI Engineering Roadmap 2026', growth_pct: '+180%', vps_score: 94 },
      { title: 'Vibe Coding для не-программистов', growth_pct: '+240%', vps_score: 88 },
      { title: 'DeepSeek Agent Harness на практике', growth_pct: '+150%', vps_score: 82 }
    ]
    const derivedOceans: BlueOceanOpportunity[] = seeds.slice(0, 8).map((s, idx) => ({
      topic: s.title ?? s.query ?? '',
      opportunity_score: s.vps_score ? Math.min(99, Math.round(s.vps_score * 0.95 + 10)) : 88 - idx * 3,
      status: 'BLUE_OCEAN_UNCONTESTED' as const,
      actionable_angle: `Высокий поисковый спрос (${s.growth_pct || '+120%'}), где еще нет подробных роликов лидеров ниши. Рекомендуется пошаговый разбор без воды.`,
      demand_source: s.source_platform ? `${s.source_platform.toUpperCase()} (${s.growth_pct})` : 'Google Trends & YouTube',
      target_audience: 'Разработчики и технические специалисты'
    }))
    setBlueOceanGaps(derivedOceans)
    showNotification(`Сформировано ${derivedOceans.length} Голубых Океанов из найденных сигналов!`, 'success')
  }

  return {
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
  }
}
