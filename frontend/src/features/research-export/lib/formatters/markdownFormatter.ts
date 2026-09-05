import type { ExportDataset, ExportOptions } from '../types'
import {
  projectVideosTable,
  projectSignalsTable,
  projectOpportunitiesTable,
  projectGoldmineTable,
} from '../projections'

const toMarkdownTable = (headers: string[], rows: (string | number | boolean)[][]): string => {
  const headerRow = `| ${headers.join(' | ')} |`
  const dividerRow = `| ${headers.map(() => '---').join(' | ')} |`
  const bodyRows = rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`)
  return [headerRow, dividerRow, ...bodyRows].join('\n')
}

export const formatDatasetToMarkdown = (data: ExportDataset, options: ExportOptions): string => {
  const dateStr = new Date().toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const lines: string[] = []
  lines.push(`# 🚀 DeepTrend Intelligence Dossier: ${data.query}`)
  lines.push(`*Дата выгрузки: ${dateStr} | Язык: ${(data.language || 'RU').toUpperCase()}*`)
  lines.push('')

  if (options.scope === 'all' || options.scope === 'videos') {
    const table = projectVideosTable(data, options)
    lines.push(`## 🔥 Отобранные вирусные видео (${table.rows.length})`)
    lines.push(toMarkdownTable(table.headers, table.rows))
    lines.push('')
  }

  if ((options.scope === 'all' || options.scope === 'opportunities') && data.opportunities.length > 0) {
    const table = projectOpportunitiesTable(data)
    lines.push(`## 🌊 Голубые океаны и сценарные концепты (${table.rows.length})`)
    lines.push(toMarkdownTable(table.headers, table.rows))
    lines.push('')
  }

  if ((options.scope === 'all' || options.scope === 'signals') && data.signals.length > 0) {
    const table = projectSignalsTable(data)
    lines.push(`## 📈 Ранние сигналы соцсетей (${table.rows.length})`)
    lines.push(toMarkdownTable(table.headers, table.rows))
    lines.push('')
  }

  if ((options.scope === 'all' || options.scope === 'goldmine') && data.goldmine.length > 0) {
    const table = projectGoldmineTable(data)
    lines.push(`## 💡 Золотая жила комментариев и боли аудитории (${table.rows.length})`)
    lines.push(toMarkdownTable(table.headers, table.rows))
    lines.push('')
  }

  return lines.join('\n')
}
