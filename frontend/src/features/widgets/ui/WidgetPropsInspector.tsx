import React, { useState } from 'react'
import { Copy, Check, RotateCcw, Trash2, Sliders } from 'lucide-react'
import { useWidgetManagementStore } from '../model/useWidgetManagementStore'
import type { PropValue, WidgetPropDefinition } from '../api/widgetsApi'

const str = (v: PropValue | undefined, fb = ''): string => (typeof v === 'string' ? v : fb)

export const WidgetPropsInspector: React.FC = () => {
  const { selectedWidgetId, widgets, liveProps, updateLiveProp, resetLiveProps, deleteWidget } =
    useWidgetManagementStore()
  const [copied, setCopied] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const widget = widgets.find((w) => w.id === selectedWidgetId)
  if (!widget) return null

  const handleCopySnippet = () => {
    const propAssignments = Object.entries(liveProps)
      .map(([key, val]) => {
        if (typeof val === 'string') return `${key}="${val}"`
        if (typeof val === 'boolean') return `${key}={${val}}`
        if (typeof val === 'number') return `${key}={${val}}`
        return `${key}={${JSON.stringify(val)}}`
      })
      .join('\n  ')

    const snippet = `<${widget.id}\n  ${propAssignments}\n/>`
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    if (confirm(`Удалить кастомный виджет '${widget.name}'?`)) {
      setIsDeleting(true)
      try {
        await deleteWidget(widget.id)
      } finally {
        setIsDeleting(false)
      }
    }
  }

  const renderControl = (propDef: WidgetPropDefinition) => {
    const val: PropValue | undefined = liveProps[propDef.name] ?? propDef.default

    switch (propDef.type) {
      case 'number':
        return (
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={propDef.name.includes('delay') ? 60 : 1000000}
              step={propDef.name.includes('delay') ? 1 : 100}
              value={Number(val || 0)}
              onChange={(e) => updateLiveProp(propDef.name, Number(e.target.value))}
              className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none accent-sky-500"
            />
            <input
              type="number"
              value={Number(val ?? 0)}
              onChange={(e) => updateLiveProp(propDef.name, Number(e.target.value))}
              className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono text-right text-white"
            />
          </div>
        )

      case 'boolean':
        return (
          <button
            onClick={() => updateLiveProp(propDef.name, !val)}
            className={`w-12 h-6 rounded-full p-1 transition-colors flex items-center ${
              val ? 'bg-sky-500 justify-end' : 'bg-slate-800 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white shadow-sm inline-block" />
          </button>
        )

      case 'enum':
        return (
          <div className="flex flex-wrap gap-1.5">
            {(propDef.enum_values || []).map((opt) => (
              <button
                key={opt}
                onClick={() => updateLiveProp(propDef.name, opt)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
                  val === opt
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        )

      case 'string[]': {
        const arrayVal: string[] = Array.isArray(val) ? val.map(String) : []
        return (
          <div className="space-y-1.5">
            {arrayVal.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const next = [...arrayVal]
                    next[idx] = e.target.value
                    updateLiveProp(propDef.name, next)
                  }}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
                />
                <button
                  onClick={() => {
                    const next = arrayVal.filter((_, i) => i !== idx)
                    updateLiveProp(propDef.name, next)
                  }}
                  className="text-rose-400 hover:text-rose-300 text-xs px-2"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => updateLiveProp(propDef.name, [...arrayVal, 'Новый пункт'])}
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold"
            >
              + Добавить пункт
            </button>
          </div>
        )
      }

      case 'string':
      default:
        if (propDef.name.toLowerCase().includes('color')) {
          return (
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={str(val, '#38bdf8')}
                onChange={(e) => updateLiveProp(propDef.name, e.target.value)}
                className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer"
              />
              <input
                type="text"
                value={str(val, '#38bdf8')}
                onChange={(e) => updateLiveProp(propDef.name, e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white"
              />
            </div>
          )
        }
        return (
          <input
            type="text"
            value={str(val)}
            onChange={(e) => updateLiveProp(propDef.name, e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
          />
        )
    }
  }

  return (
    <div className="w-80 bg-slate-950 border-l border-slate-800/80 flex flex-col h-full overflow-hidden">
      {/* Шапка инспектора */}
      <div className="p-5 border-b border-slate-800/80">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Sliders size={16} className="text-sky-400" />
            <span>Параметры</span>
          </h3>
          {widget.is_custom && (
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded border border-indigo-500/30">
              Пользовательский
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{widget.description}</p>
      </div>

      {/* Список пропсов */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {widget.props.map((p) => (
          <div key={p.name} className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300">{p.name}</span>
              <span className="font-mono text-[10px] text-slate-500">{p.type}</span>
            </div>
            {renderControl(p)}
            <p className="text-[10px] text-slate-500 leading-tight">{p.description}</p>
          </div>
        ))}
      </div>

      {/* Тулбар действий */}
      <div className="p-5 border-t border-slate-800/80 bg-slate-900/40 space-y-2.5">
        <button
          onClick={handleCopySnippet}
          className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 transition-all"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Скопировано в буфер!' : 'Копировать вызов JSX'}</span>
        </button>

        <div className="flex gap-2">
          <button
            onClick={resetLiveProps}
            className="flex-1 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <RotateCcw size={13} /> <span>Сброс</span>
          </button>

          {widget.is_custom && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-3 py-2 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Удалить компонент"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
