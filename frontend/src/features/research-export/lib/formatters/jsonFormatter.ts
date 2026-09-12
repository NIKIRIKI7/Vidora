import type { ExportDataset, ExportOptions } from '../../model/types'

export const formatDatasetToJson = (data: ExportDataset, options: ExportOptions): string => {
  const filteredVideos = options.onlyRockets
    ? data.videos.filter((v) => v.is_rocket || (v.m_score ?? 0) >= 150)
    : data.videos

  const payload = {
    meta: {
      exported_at: new Date().toISOString(),
      query: data.query,
      niche: data.niche || 'General',
      language: data.language || 'ru',
      total_videos_found: filteredVideos.length,
      total_signals: data.signals.length,
      total_opportunities: data.opportunities.length,
    },
    videos: (options.scope === 'all' || options.scope === 'videos') ? filteredVideos : undefined,
    early_signals: (options.scope === 'all' || options.scope === 'signals') ? data.signals : undefined,
    blue_ocean_opportunities: (options.scope === 'all' || options.scope === 'opportunities') ? data.opportunities : undefined,
    comment_goldmine: (options.scope === 'all' || options.scope === 'goldmine') ? data.goldmine : undefined,
  }

  return JSON.stringify(payload, null, 2)
}
