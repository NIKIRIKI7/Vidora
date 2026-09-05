import { API } from '@shared/lib'
import type { ExportDataset, ExportOptions, ExportResult, ExportStrategy } from '../types'
import {
  projectVideosTable,
  projectSignalsTable,
  projectOpportunitiesTable,
  projectGoldmineTable,
} from '../lib/projections'
import { formatTableToCsv, createCsvBlobWithBom } from '../lib/formatters/csvFormatter'
import { formatTableToTsv } from '../lib/formatters/tsvFormatter'
import { formatDatasetToMarkdown } from '../lib/formatters/markdownFormatter'
import { formatDatasetToJson } from '../lib/formatters/jsonFormatter'

export const ExcelStrategy: ExportStrategy = {
  id: 'excel',
  title: 'Excel Таблица (.xlsx)',
  badge: 'Полный отчет',
  description: 'Все 4 листа: Видео, Голубые океаны, Сигналы и Боли с авто-выравниванием колонок.',
  extension: 'xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  iconName: 'file-spreadsheet',
  supportsScope: () => true,
  execute: async (data: ExportDataset, options: ExportOptions): Promise<ExportResult> => {
    const cleanQuery = data.query.replace(/[^\w\u0400-\u04FF]+/g, '_')
    const filename = `vidora_${cleanQuery}_${new Date().toISOString().slice(0, 10)}.xlsx`

    try {
      const payload = {
        query: data.query,
        niche: data.niche,
        videos: (options.onlyRockets ? data.videos.filter((v) => v.is_rocket) : data.videos).map((v) => ({
          video_id: v.video_id,
          title: v.title,
          channel: v.channel,
          views: v.views,
          subs: v.subs,
          ratio: v.ratio,
          vph: v.vph,
          url: v.url,
          published_at: v.published_at,
          duration_sec: v.duration_sec || 0,
          is_short: v.is_short || false,
          is_rocket: v.is_rocket || false,
          velocity_stage: v.velocity_stage || 'STABLE',
        })),
        signals: data.signals.map((s) => ({
          topic: s.title,
          vps_score: s.vps_score,
          aggregate_vph: s.social_velocity,
          supporting_videos: s.metrics?.upvotes ? Math.round(s.metrics.upvotes / 25) : 1,
          source_platform: s.source_platform,
          growth_pct: s.growth_pct || '',
          source_url: s.source_url || '',
        })),
        opportunities: data.opportunities.map((o) => ({
          topic: o.topic,
          opportunity_score: o.opportunity_score,
          status: o.status,
          actionable_angle: o.actionable_angle,
          demand_source: o.demand_source,
        })),
        goldmine: data.goldmine.flatMap((entry) =>
          [
            ...(entry.report.unresolved_questions || []).map((p) => ({ cat: 'Вопрос', ...p })),
            ...(entry.report.author_omissions || []).map((p) => ({ cat: 'Упущение', ...p })),
            ...(entry.report.community_debates || []).map((p) => ({ cat: 'Спор', ...p })),
          ].map((pain) => ({
            video_title: entry.video_title,
            category: pain.cat,
            viewer_quote: pain.viewer_quote,
            insight: pain.insight,
            script_solution: pain.script_solution,
          }))
        ),
      }

      const res = await fetch(`${API}/api/v1/research/export/excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      return { success: true, filename, blob }
    } catch {
      const table = projectVideosTable(data, options)
      const csv = formatTableToCsv(table)
      const blob = createCsvBlobWithBom(csv)
      return {
        success: true,
        filename: filename.replace('.xlsx', '.csv'),
        blob,
      }
    }
  },
}

export const CsvStrategy: ExportStrategy = {
  id: 'csv',
  title: 'CSV Таблица (.csv)',
  badge: 'Excel / Sheets',
  description: 'Таблица с кодировкой UTF-8 BOM — сразу открывается в Excel без кракозябр.',
  extension: 'csv',
  mimeType: 'text/csv;charset=utf-8;',
  iconName: 'table',
  supportsScope: () => true,
  execute: async (data: ExportDataset, options: ExportOptions): Promise<ExportResult> => {
    let table = projectVideosTable(data, options)
    if (options.scope === 'signals') table = projectSignalsTable(data)
    if (options.scope === 'opportunities') table = projectOpportunitiesTable(data)
    if (options.scope === 'goldmine') table = projectGoldmineTable(data)

    const csvString = formatTableToCsv(table)
    const blob = createCsvBlobWithBom(csvString)
    const filename = `deeptrend_${options.scope}_${new Date().toISOString().slice(0, 10)}.csv`
    return { success: true, filename, blob }
  },
}

export const MarkdownStrategy: ExportStrategy = {
  id: 'markdown',
  title: 'Markdown Досье (.md)',
  badge: 'Notion / Obsidian',
  description: 'Готовый форматированный документ с H2, таблицами и тезисами для сценаристов.',
  extension: 'md',
  mimeType: 'text/markdown;charset=utf-8;',
  iconName: 'file-text',
  supportsScope: () => true,
  execute: async (data: ExportDataset, options: ExportOptions): Promise<ExportResult> => {
    const md = formatDatasetToMarkdown(data, options)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' })
    const filename = `deeptrend_${data.query.replace(/[^\w\u0400-\u04FF]+/g, '_')}.md`
    return { success: true, filename, blob, text: md }
  },
}

export const JsonStrategy: ExportStrategy = {
  id: 'json',
  title: 'Сырой JSON (.json)',
  badge: 'Dev / API',
  description: 'Полный структурированный снапшот всех сущностей сессии для автоматизаций.',
  extension: 'json',
  mimeType: 'application/json',
  iconName: 'file-code',
  supportsScope: () => true,
  execute: async (data: ExportDataset, options: ExportOptions): Promise<ExportResult> => {
    const json = formatDatasetToJson(data, options)
    const blob = new Blob([json], { type: 'application/json' })
    const filename = `deeptrend_dump_${new Date().toISOString().slice(0, 10)}.json`
    return { success: true, filename, blob, text: json }
  },
}

export const ClipboardTsvStrategy: ExportStrategy = {
  id: 'clipboard_tsv',
  title: 'Копировать в буфер (TSV)',
  badge: 'Ctrl+V в Таблицы',
  description: 'Мгновенно копирует данные: откройте Google Таблицы и нажмите Ctrl+V.',
  extension: 'tsv',
  mimeType: 'text/tab-separated-values',
  iconName: 'clipboard-copy',
  supportsScope: (scope) => scope !== 'all',
  execute: async (data: ExportDataset, options: ExportOptions): Promise<ExportResult> => {
    let table = projectVideosTable(data, options)
    if (options.scope === 'signals') table = projectSignalsTable(data)
    if (options.scope === 'opportunities') table = projectOpportunitiesTable(data)
    if (options.scope === 'goldmine') table = projectGoldmineTable(data)

    const tsv = formatTableToTsv(table)
    await navigator.clipboard.writeText(tsv)
    return { success: true, text: tsv, copiedToClipboard: true }
  },
}

export class ExportStrategyRegistry {
  private static readonly strategies: Map<string, ExportStrategy> = new Map([
    [ExcelStrategy.id, ExcelStrategy],
    [CsvStrategy.id, CsvStrategy],
    [MarkdownStrategy.id, MarkdownStrategy],
    [ClipboardTsvStrategy.id, ClipboardTsvStrategy],
    [JsonStrategy.id, JsonStrategy],
  ])

  public static getAll(): ExportStrategy[] {
    return Array.from(this.strategies.values())
  }

  public static get(id: string): ExportStrategy {
    const strategy = this.strategies.get(id)
    if (!strategy) throw new Error(`Стратегия экспорта '${id}' не найдена в реестре.`)
    return strategy
  }

  public static register(strategy: ExportStrategy): void {
    this.strategies.set(strategy.id, strategy)
  }
}
