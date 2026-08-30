import React, { useState } from 'react'
import { X, Download, Upload, Copy, Check, FileJson } from 'lucide-react'
import { useWidgetManagementStore } from '../model/useWidgetManagementStore'

export const WidgetImportExportModal: React.FC = () => {
  const { isImportExportModalOpen, importExportTab, closeImportExportModal, exportWidgetsJson, importWidgetsJson } =
    useWidgetManagementStore()

  const [jsonContent, setJsonContent] = useState('')
  const [copied, setCopied] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isImportExportModalOpen) return null

  const handleDownloadExport = async () => {
    const jsonStr = await exportWidgetsJson()
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vidora_motion_widgets_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopyExport = async () => {
    const jsonStr = await exportWidgetsJson()
    navigator.clipboard.writeText(jsonStr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleImport = async () => {
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const parsed = JSON.parse(jsonContent)
      const count = await importWidgetsJson(parsed)
      setSuccessMessage(`Успешно импортировано виджетов: ${count}`)
      setTimeout(() => {
        closeImportExportModal()
      }, 1500)
    } catch (e) {
      setErrorMessage(`Ошибка импорта: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setJsonContent(String(event.target?.result || ''))
      }
      reader.readAsText(file)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-white text-lg">
            <FileJson className="text-sky-400" size={20} />
            <span>{importExportTab === 'export' ? 'Экспорт виджетов в JSON' : 'Импорт виджетов из JSON'}</span>
          </div>
          <button onClick={closeImportExportModal} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {importExportTab === 'export' ? (
            <div className="space-y-4 text-center py-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                Выгрузите всю библиотеку виджетов или выбранные компоненты в формате единого JSON-пакета для переноса в
                другие проекты.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={handleDownloadExport}
                  className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-500/20"
                >
                  <Download size={15} /> <span>Скачать .json файл</span>
                </button>
                <button
                  onClick={handleCopyExport}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />} <span>Копировать JSON</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-700 rounded-2xl p-6 text-center hover:border-sky-500 transition-colors">
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" id="json-upload" />
                <label htmlFor="json-upload" className="cursor-pointer space-y-2 block">
                  <Upload className="mx-auto text-slate-400" size={24} />
                  <div className="text-xs text-slate-300 font-semibold">Выберите .json файл или перетащите сюда</div>
                </label>
              </div>

              <textarea
                placeholder="Или вставьте JSON содержимое напрямую..."
                value={jsonContent}
                onChange={(e) => setJsonContent(e.target.value)}
                className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />

              {errorMessage && <div className="p-3 bg-rose-500/20 text-rose-300 text-xs rounded-xl">{errorMessage}</div>}
              {successMessage && <div className="p-3 bg-emerald-500/20 text-emerald-300 text-xs rounded-xl">{successMessage}</div>}

              <button
                onClick={handleImport}
                disabled={!jsonContent.trim()}
                className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-500/20"
              >
                Применить импорт
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
