import type { TabularTable } from '../projections'

const escapeCsvCell = (val: string | number | boolean): string => {
  if (val === null || val === undefined) return '""'
  const str = String(val)
  if (/[",\n\r\t;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return `"${str}"`
}

export const formatTableToCsv = (table: TabularTable, delimiter = ';'): string => {
  const headerLine = table.headers.map(escapeCsvCell).join(delimiter)
  const rowsLines = table.rows.map((row) => row.map(escapeCsvCell).join(delimiter))
  return [headerLine, ...rowsLines].join('\r\n')
}

export const createCsvBlobWithBom = (csvContent: string): Blob => {
  return new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
}
