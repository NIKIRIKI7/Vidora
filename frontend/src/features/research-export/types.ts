import type {
  VideoResult,
  EarlySignalItem,
  BlueOceanOpportunity,
  CommentGoldmineVideoEntry,
  DeepTrendAnalysis,
} from '@entities/project'

export type ExportScope = 'all' | 'videos' | 'signals' | 'opportunities' | 'goldmine'

export type ExportFormatId = 'excel' | 'csv' | 'markdown' | 'json' | 'clipboard_tsv'

export interface ExportOptions {
  scope: ExportScope
  onlyRockets?: boolean
  includeTranscripts?: boolean
}

export interface ExportDataset {
  query: string
  niche?: string
  language?: string
  videos: VideoResult[]
  signals: EarlySignalItem[]
  opportunities: BlueOceanOpportunity[]
  goldmine: CommentGoldmineVideoEntry[]
  analysisData?: DeepTrendAnalysis | null
}

export interface ExportResult {
  success: boolean
  filename?: string
  blob?: Blob
  text?: string
  copiedToClipboard?: boolean
  error?: string
}

export interface ExportStrategy {
  id: ExportFormatId
  title: string
  badge: string
  description: string
  extension: string
  mimeType: string
  iconName: 'file-spreadsheet' | 'file-text' | 'file-code' | 'clipboard-copy' | 'table'
  supportsScope: (scope: ExportScope) => boolean
  execute: (data: ExportDataset, options: ExportOptions) => Promise<ExportResult>
}
