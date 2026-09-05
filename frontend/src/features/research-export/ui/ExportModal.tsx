import React, { useState } from 'react'
import {
  FileSpreadsheet,
  FileText,
  FileCode,
  ClipboardCopy,
  Table,
  Download,
  Check,
  Sparkles,
  Layers,
  Flame,
  CheckCircle2,
} from 'lucide-react'
import { Modal, Button, Spinner } from '@shared/ui'
import type { ExportDataset, ExportFormatId, ExportOptions, ExportScope } from '../types'
import { ExportStrategyRegistry } from '../model/strategies'

interface Props {
  isOpen: boolean
  onClose: () => void
  dataset: ExportDataset
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void
}

const renderIcon = (name: string, size = 18) => {
  switch (name) {
    case 'file-spreadsheet': return <FileSpreadsheet size={size} className="text-emerald-400" />
    case 'file-text': return <FileText size={size} className="text-cyan-400" />
    case 'file-code': return <FileCode size={size} className="text-amber-400" />
    case 'clipboard-copy': return <ClipboardCopy size={size} className="text-fuchsia-400" />
    case 'table': return <Table size={size} className="text-sky-400" />
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
        }, 1500)
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
    <Modal isOpen={isOpen} onClose={onClose} title="Экспорт аналитики DeepTrend" className="max-w-2xl">
      <div className="flex flex-col gap-6 py-1">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono uppercase text-on-surface-variant flex items-center gap-1.5">
            <Layers size={14} className="text-primary" /> Выберите объем экспорта:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'all', label: 'Полный отчет', sub: 'Все слои данных' },
              { id: 'videos', label: 'Только видео', sub: `${dataset.videos.length} роликов` },
              { id: 'opportunities', label: 'Голубые океаны', sub: `${dataset.opportunities.length} концептов` },
              { id: 'signals', label: 'Ранние сигналы', sub: `${dataset.signals.length} трендов` },
            ].map((s) => {
              const active = scope === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setScope(s.id as ExportScope)
                    if (s.id === 'all' && selectedFormat === 'clipboard_tsv') {
                      setSelectedFormat('excel')
                    }
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all ${
                    active
                      ? 'bg-primary/20 border-primary text-primary shadow-sm'
                      : 'bg-surface-container-lowest border-white/5 hover:border-white/20 text-on-surface'
                  }`}
                >
                  <span className="text-xs font-bold leading-tight">{s.label}</span>
                  <span className="text-[10px] opacity-60 font-mono">{s.sub}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono uppercase text-on-surface-variant flex items-center gap-1.5">
            <Sparkles size={14} className="text-secondary" /> Целевой формат файла:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {strategies.map((strat) => {
              const isSelected = selectedFormat === strat.id
              const disabled = !strat.supportsScope(scope)
              return (
                <button
                  key={strat.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedFormat(strat.id)}
                  className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed border-white/5'
                      : isSelected
                      ? 'bg-gradient-to-r from-primary/15 to-secondary/15 border-primary shadow-md'
                      : 'bg-surface-container-lowest border-white/5 hover:border-white/20 text-on-surface'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-black/40 border border-white/10 shrink-0">
                    {renderIcon(strat.iconName, 20)}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-white truncate">{strat.title}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-on-surface-variant shrink-0">
                        {strat.badge}
                      </span>
                    </div>
                    <span className="text-[11px] text-on-surface-variant/80 mt-1 leading-relaxed line-clamp-2">
                      {strat.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-3.5 bg-surface-container-lowest/60 rounded-xl border border-white/5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-on-surface flex items-center gap-1.5 font-medium">
              <Flame size={14} className="text-error" /> Экспортировать только Rocket-видео (аномалии)
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={onlyRockets}
                onChange={(e) => setOnlyRockets(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
          {onlyRockets && (
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              Будет выгружено только {rocketVideosCount} из {dataset.videos.length} роликов с повышенным коэффициентом виральности.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <div className="text-[11px] font-mono text-on-surface-variant">
            Готово к экспорту: {onlyRockets ? rocketVideosCount : dataset.videos.length} видео • {dataset.signals.length} сигналов
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} disabled={isExporting}>
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={handleExecuteExport}
              disabled={isExporting || (scope === 'videos' && dataset.videos.length === 0)}
              className="px-6 py-2"
            >
              {isExporting ? (
                <span className="flex items-center gap-2">
                  <Spinner className="w-4 h-4" /> Генерация...
                </span>
              ) : isCopied ? (
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <CheckCircle2 size={16} /> Скопировано!
                </span>
              ) : selectedFormat === 'clipboard_tsv' ? (
                <span className="flex items-center gap-1.5">
                  <ClipboardCopy size={16} /> Копировать в буфер
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Download size={16} /> Скачать {activeStrategy.extension.toUpperCase()}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
