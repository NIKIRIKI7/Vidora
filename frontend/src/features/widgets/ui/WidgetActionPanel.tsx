import { useState } from 'react'
import { FileText, Check, RotateCcw, Trash2, Code2, Wand2 } from 'lucide-react'
import { WidgetRenderTester } from './WidgetRenderTester'
import { WidgetQuickRender } from './WidgetQuickRender'
import { useSkillsStore } from '@features/settings'
import type { WidgetMetadata } from '../api/widgetsApi'

interface WidgetActionPanelProps {
  widget: WidgetMetadata
  currentProps: Record<string, unknown>
  onReset: () => void
  onDelete: () => void
}

export const WidgetActionPanel: React.FC<WidgetActionPanelProps> = ({
  widget,
  currentProps,
  onReset,
  onDelete,
}) => {
  const [copiedJsx, setCopiedJsx] = useState(false)
  const [copiedDocs, setCopiedDocs] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  const generateJsxCode = () => {
    const formatValue = (val: unknown): string => {
      if (typeof val === 'string') return `"${val.replace(/"/g, '\\"')}"`
      if (typeof val === 'number' || typeof val === 'boolean') return `{${val}}`
      return `{${JSON.stringify(val)}}`
    }

    const propLines = Object.entries(currentProps)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(([_, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `  ${k}=${formatValue(v)}`)
      .join('\n')

    return `<${widget.id}\n${propLines}\n/>`
  }

  const generateAiDocs = () => {
    const propsBlock = (widget.props || [])
      .map((p) => {
        const enums = p.enum_values ? ` [варианты: ${p.enum_values.join(' | ')}]` : ''
        const def = p.default !== undefined ? `, по умолчанию: ${JSON.stringify(p.default)}` : ''
        const req = p.required ? ' (ОБЯЗАТЕЛЕН)' : ''
        return `  • ${p.name}: ${p.type}${enums}${req}${def} — ${p.description}`
      })
      .join('\n')

    return `=== VIDORA CUSTOM COMPONENT SPECIFICATION ===
Имя компонента: <${widget.id} />
Категория: ${widget.category || 'custom'}
Назначение: ${widget.description || widget.name}
Импорт в сценах: import { ${widget.id} } from '../widgets';

ДОСТУПНЫЕ ПАРАМЕТРЫ (PROPS):
${propsBlock || '  • Нет кастомных пропсов'}

ЭТАЛОННЫЙ ПРИМЕР ИСПОЛЬЗОВАНИЯ В СЦЕНЕ (TSX):
\`\`\`tsx
import React from 'react';
import { ${widget.id} } from '../widgets';

export const Scene: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#08020f] flex flex-col items-center justify-center relative overflow-hidden">
      ${generateJsxCode().replace(/\n/g, '\n      ')}
    </div>
  );
};
\`\`\`
=============================================`
  }

  const handleCopyJsx = async () => {
    await navigator.clipboard.writeText(generateJsxCode())
    setCopiedJsx(true)
    setTimeout(() => setCopiedJsx(false), 2000)
  }

  const handleCopyDocs = async () => {
    await navigator.clipboard.writeText(generateAiDocs())
    setCopiedDocs(true)
    setTimeout(() => setCopiedDocs(false), 2000)
  }

  const handleCopyPrompt = async () => {
    try {
      const store = useSkillsStore.getState()
      // Если стор пустой — подтягиваем актуальные скилы из SQLite БД
      if (store.skills.length === 0) {
        await store.fetchSkills()
      }
      const widgetSkill = store.skills.find((s) => s.id === 'custom_widget_creator')
      const promptText = widgetSkill?.prompt
      if (!promptText) {
        console.error('Скил custom_widget_creator не найден в БД')
        return
      }
      await navigator.clipboard.writeText(promptText)
      setCopiedPrompt(true)
      setTimeout(() => setCopiedPrompt(false), 2000)
    } catch (err) {
      console.error('Ошибка копирования промпта из БД:', err)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 pt-4 border-t border-slate-800/80">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCopyJsx}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 hover:border-sky-400/60 text-sky-200 hover:text-white text-xs font-semibold tracking-wide transition-all active:scale-[0.98]"
        >
          {copiedJsx ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">Скопировано</span>
            </>
          ) : (
            <>
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Вызов JSX</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleCopyDocs}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-400/60 text-indigo-200 hover:text-white text-xs font-semibold tracking-wide transition-all active:scale-[0.98]"
        >
          {copiedDocs ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300">Скопировано</span>
            </>
          ) : (
            <>
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Дока для AI</span>
            </>
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={handleCopyPrompt}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-fuchsia-950/40 via-purple-900/30 to-indigo-950/40 hover:from-fuchsia-900/60 hover:via-purple-800/50 hover:to-indigo-900/60 border border-fuchsia-500/30 hover:border-fuchsia-400/60 text-fuchsia-200 hover:text-white text-xs font-semibold tracking-wide shadow-md shadow-purple-950/40 transition-all active:scale-[0.98]"
      >
        {copiedPrompt ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-300">Промпт скопирован!</span>
          </>
        ) : (
          <>
            <Wand2 className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>Скопировать промпт создания</span>
          </>
        )}
      </button>

      <WidgetQuickRender
        widgetId={widget.id}
        widgetName={widget.name}
        currentProps={currentProps}
      />

      <WidgetRenderTester
        widgetId={widget.id}
        widgetName={widget.name}
        currentProps={currentProps}
        defaultQuality="medium"
      />

      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={onReset}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-700/40 hover:border-slate-600 text-slate-300 hover:text-white text-xs font-medium transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          <span>Сбросить пропсы</span>
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="p-2 rounded-xl bg-rose-950/20 hover:bg-rose-900/40 border border-rose-500/20 hover:border-rose-500/50 text-rose-400 hover:text-rose-200 transition-all"
          title="Удалить кастомный виджет"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
