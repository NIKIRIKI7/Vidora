import type { ExportDataset, ExportOptions } from '../model/types'

export interface TabularTable {
  sheetName: string
  headers: string[]
  rows: (string | number | boolean)[][]
}

export const projectVideosTable = (data: ExportDataset, options: ExportOptions): TabularTable => {
  let source = data.videos
  if (options.onlyRockets) {
    source = source.filter((v) => v.is_rocket || (v.m_score ?? 0) >= 150)
  }

  const headers = [
    'Video ID',
    'Название видео',
    'Канал',
    'Просмотры',
    'Подписчики',
    'Ratio (Просмотры/Сабы)',
    'VPH (Просмотров/Час)',
    'Ракета (Viral Outlier)',
    'Формат',
    'Опубликовано',
    'Ссылка на ролик',
  ]

  const rows = source.map((v) => [
    v.video_id,
    v.title,
    v.channel,
    v.views,
    v.subs,
    v.ratio.toFixed(2),
    v.vph,
    v.is_rocket ? 'ДА 🚀' : 'НЕТ',
    v.is_short ? 'Shorts' : 'Long',
    v.published_at || 'Свежее',
    v.url,
  ])

  return { sheetName: 'Вирусные видео', headers, rows }
}

export const projectSignalsTable = (data: ExportDataset): TabularTable => {
  const headers = [
    'Тема / Ключевой сигнал',
    'VPS Score (Виральность)',
    'Скорость спроса (VPH)',
    'Подтверждающих роликов',
    'Платформа',
    'Процент роста',
    'Ключевые слова',
    'Ссылка',
  ]

  const rows = data.signals.map((s) => [
    s.title,
    s.vps_score,
    s.social_velocity,
    s.metrics?.upvotes ? Math.round(s.metrics.upvotes / 25) : 1,
    s.source_platform || 'Trends',
    s.growth_pct || '+100%',
    s.keywords?.join(', ') || '',
    s.source_url || `https://trends.google.com/trends/explore?q=${encodeURIComponent(s.title)}`,
  ])

  return { sheetName: 'Ранние сигналы', headers, rows }
}

export const projectOpportunitiesTable = (data: ExportDataset): TabularTable => {
  const headers = [
    'Тема / Сценарный угол',
    'Оценка возможности (Score)',
    'Статус конкуренции',
    'Сценарный угол и решение',
    'Источник спроса',
    'Схожесть с конкурентами',
  ]

  const rows = data.opportunities.map((o) => [
    o.topic,
    o.opportunity_score,
    o.status,
    o.actionable_angle,
    o.demand_source,
    `${Math.round((o.max_competitor_similarity ?? 0) * 100)}%`,
  ])

  return { sheetName: 'Голубые океаны', headers, rows }
}

export const projectGoldmineTable = (data: ExportDataset): TabularTable => {
  const headers = [
    'Ролик-источник',
    'Категория боли',
    'Цитата зрителя',
    'Инсайт для сценария',
    'Решение в нашем видео',
  ]

  const rows: (string | number | boolean)[][] = []
  for (const entry of data.goldmine) {
    const report = entry.report
    if (!report) continue
    const allPains = [
      ...(report.unresolved_questions || []).map((p) => ({ ...p, cat: 'Нерешенный вопрос' })),
      ...(report.author_omissions || []).map((p) => ({ ...p, cat: 'Упущение автора' })),
      ...(report.community_debates || []).map((p) => ({ ...p, cat: 'Спор в комментариях' })),
    ]

    for (const pain of allPains) {
      rows.push([
        entry.video_title,
        pain.cat,
        pain.viewer_quote,
        pain.insight,
        pain.script_solution,
      ])
    }
  }

  return { sheetName: 'Боли аудитории', headers, rows }
}
