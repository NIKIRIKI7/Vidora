import React, { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@shared/ui'
import type { ExportDataset } from '../model/types'
import { ExportModal } from './ExportModal'

interface Props {
  dataset: ExportDataset
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void
  className?: string
}

export const ExportButton: React.FC<Props> = ({ dataset, onNotify, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false)

  const totalCount =
    dataset.videos.length + dataset.signals.length + dataset.opportunities.length

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setIsOpen(true)}
        disabled={totalCount === 0}
        className={`text-xs py-1.5 px-3 flex items-center gap-1.5 transition-all shadow-sm ${className}`}
        title="Экспорт в Excel, CSV, Markdown или буфер обмена"
      >
        <Download size={14} className="text-secondary" />
        <span>Экспорт ({dataset.videos.length})</span>
      </Button>

      <ExportModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        dataset={dataset}
        onNotify={onNotify}
      />
    </>
  )
}
