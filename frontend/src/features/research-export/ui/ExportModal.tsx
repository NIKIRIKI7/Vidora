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
import { Modal, Spinner } from '@shared/ui'
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
      <div className="flex flex-col gap-5 text-slate-100">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Layers size={14} className="text-indigo-400" /> Объем выгрузки
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
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold leading-tight">{s.label}</span>
                  <span className="text-[10px] font-mono opacity-70">{s.sub}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Sparkles size={14} className="text-sky-400" /> Выберите формат
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
                      ? 'opacity-30 cursor-not-allowed border-slate-800'
                      : isSelected
                      ? 'bg-slate-900 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
                    {renderIcon(strat.iconName, 20)}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white whitespace-normal">{strat.title}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                        {strat.badge}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      {strat.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-200 flex items-center gap-2 font-medium">
            <Flame size={15} className="text-rose-400" /> Только Rocket-видео (вирусные аномалии)
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={onlyRockets}
              onChange={(e) => setOnlyRockets(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
          <span className="text-[11px] font-mono text-slate-400">
            К выгрузке: {onlyRockets ? rocketVideosCount : dataset.videos.length} видео
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleExecuteExport}
              disabled={isExporting || (scope === 'videos' && dataset.videos.length === 0)}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 transition active:scale-95 flex items-center gap-2"
            >
              {isExporting ? (
                <>
                  <Spinner className="w-3.5 h-3.5" /> Экспорт...
                </>
              ) : isCopied ? (
                <>
                  <CheckCircle2 size={15} className="text-emerald-300" /> Скопировано!
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
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
