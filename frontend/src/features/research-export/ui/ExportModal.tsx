import React, { useState } from 'react'
import {
  FileSpreadsheet,
  FileText,
  FileCode,
  ClipboardCopy,
  Table,
  Download,
  Sparkles,
  Layers,
  Flame,
  CheckCircle2,
} from 'lucide-react'
import { Modal, Button, OptionCard, Spinner } from '@shared/ui'
import type { ExportDataset, ExportFormatId, ExportOptions, ExportScope } from '../model/types'
import { ExportStrategyRegistry } from '../model/strategies'

interface Props {
  isOpen: boolean
  onClose: () => void
  dataset: ExportDataset
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void
}

const renderIcon = (name: string, size = 20) => {
  switch (name) {
    case 'file-spreadsheet': return <FileSpreadsheet size={size} className="text-success" />
    case 'file-text': return <FileText size={size} className="text-secondary" />
    case 'file-code': return <FileCode size={size} className="text-warning" />
    case 'clipboard-copy': return <ClipboardCopy size={size} className="text-tertiary" />
    case 'table': return <Table size={size} className="text-secondary" />
    default: return <Download size={size} />
  }
}

export const ExportModal: React.FC<Props> = ({ isOpen, onClose, dataset, onNotify }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormatId>('excel')
  const [scope, setScope] = useState<ExportScope>('all')
  const [onlyRockets, setOnlyRockets] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  if (!isOpen) return null

  const strategies = ExportStrategyRegistry.getAll()
  const activeStrategy = ExportStrategyRegistry.get(selectedFormat)
  const rocketVideosCount = dataset.videos.filter((v) => v.is_rocket || (v.m_score ?? 0) >= 150).length

  const handleExecuteExport = async () => {
    setIsExporting(true)
    try {
      const options: ExportOptions = { scope, onlyRockets }
      const result = await activeStrategy.execute(dataset, options)

      if (result.copiedToClipboard) {
        setIsCopied(true)
        onNotify('Данные скопированы в буфер обмена! Нажмите Ctrl+V в таблице.', 'success')
        setTimeout(() => {
          setIsCopied(false)
          onClose()
        }, 1200)
        return
      }

      if (result.blob && result.filename) {
        const url = URL.createObjectURL(result.blob)
        const a = document.createElement('a')
        a.href = url
        a.download = result.filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        onNotify(`Файл ${result.filename} успешно скачан!`, 'success')
        onClose()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      onNotify(`Ошибка экспорта: ${message}`, 'error')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Экспорт аналитики DeepTrend" className="max-w-2xl sm:max-w-2xl">
      <div className="flex flex-col gap-5 text-on-surface">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-1.5 uppercase tracking-wider">
            <Layers size={14} className="text-primary" /> Объем выгрузки
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'all', label: 'Полный отчет', sub: 'Все слои данных' },
              { id: 'videos', label: 'Только видео', sub: `${dataset.videos.length} шт.` },
              { id: 'opportunities', label: 'Голубые океаны', sub: `${dataset.opportunities.length} шт.` },
              { id: 'signals', label: 'Ранние сигналы', sub: `${dataset.signals.length} шт.` },
            ].map((s) => {
              const active = scope === s.id
              return (
                <OptionCard
                  key={s.id}
                  title={s.label}
                  subtitle={s.sub}
                  isActive={active}
                  accent="primary"
                  showIcon={false}
                  onClick={() => {
                    setScope(s.id as ExportScope)
                    if (s.id === 'all' && selectedFormat === 'clipboard_tsv') {
                      setSelectedFormat('excel')
                    }
                  }}
                />
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-1.5 uppercase tracking-wider">
            <Sparkles size={14} className="text-secondary" /> Выберите формат
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {strategies.map((strat) => {
              const isSelected = selectedFormat === strat.id
              const disabled = !strat.supportsScope(scope)
              return (
                <div key={strat.id} className={disabled ? 'opacity-30 pointer-events-none' : ''}>
                  <OptionCard
                    title={strat.title}
                    subtitle={strat.description}
                    isActive={isSelected}
                    accent="primary"
                    showIcon={false}
                    onClick={() => setSelectedFormat(strat.id)}
                    className="h-full w-full items-start"
                  >
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-surface-container-lowest border border-outline-variant shrink-0">
                        {renderIcon(strat.iconName, 20)}
                      </div>
                      <span className="text-3xs font-mono px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant shrink-0">
                        {strat.badge}
                      </span>
                    </div>
                  </OptionCard>
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-3 bg-surface-container-low/80 rounded-xl border border-outline-variant flex items-center justify-between">
          <span className="text-xs text-on-surface flex items-center gap-2 font-medium">
            <Flame size={15} className="text-error" /> Только Rocket-видео (вирусные аномалии)
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={onlyRockets}
              onChange={(e) => setOnlyRockets(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-outline-variant/40 after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-on-surface after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-outline-variant/80">
          <span className="text-2xs font-mono text-on-surface-variant">
            К выгрузке: {onlyRockets ? rocketVideosCount : dataset.videos.length} видео
          </span>
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 rounded-xl text-xs font-semibold"
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={handleExecuteExport}
              disabled={isExporting || (scope === 'videos' && dataset.videos.length === 0)}
              className="px-5 py-2 rounded-xl text-xs font-bold"
            >
              {isExporting ? (
                <>
                  <Spinner className="w-3.5 h-3.5" /> Экспорт...
                </>
              ) : isCopied ? (
                <>
                  <CheckCircle2 size={15} className="text-success" /> Скопировано!
                </>
              ) : selectedFormat === 'clipboard_tsv' ? (
                <>
                  <ClipboardCopy size={15} /> Скопировать в буфер
                </>
              ) : (
                <>
                  <Download size={15} /> Скачать {activeStrategy.extension.toUpperCase()}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
