import type { TabularTable } from '../projections'

export const formatTableToTsv = (table: TabularTable): string => {
  const clean = (val: string | number | boolean) => String(val ?? '').replace(/[\t\r\n]+/g, ' ').trim()
  const header = table.headers.map(clean).join('\t')
  const rows = table.rows.map((row) => row.map(clean).join('\t'))
  return [header, ...rows].join('\n')
}
