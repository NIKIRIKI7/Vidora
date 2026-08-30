import React, { useState } from 'react'
import { X, Sparkles, Plus, Trash2 } from 'lucide-react'
import { useWidgetManagementStore } from '../model/useWidgetManagementStore'
import type { PropType, PropValue, WidgetCategory, WidgetPropDefinition } from '../api/widgetsApi'

export const WidgetCreateModal: React.FC = () => {
  const { isCreateModalOpen, closeCreateModal, createWidget } = useWidgetManagementStore()

  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [category] = useState<WidgetCategory>('custom')
  const [description, setDescription] = useState('')
  const [tsxCode, setTsxCode] = useState(
    'import React from "react";\nimport { MotionBox } from "../core/MotionBox";\n\nexport const MyWidget = ({ title = "Hello" }) => {\n  return (\n    <MotionBox animation="spring-pop" className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-white font-bold">\n      {title}\n    </MotionBox>\n  );\n};'
  )
  const [props, setProps] = useState<WidgetPropDefinition[]>([
    { name: 'title', type: 'string', required: true, default: 'Hello World', description: 'Заголовок плашки' },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isCreateModalOpen) return null

  const handleAddProp = () => {
    setProps([
      ...props,
      { name: `prop${props.length + 1}`, type: 'string', required: false, default: '', description: 'Новый параметр' },
    ])
  }

  const handleRemoveProp = (idx: number) => {
    setProps(props.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!id.trim() || !name.trim() || !tsxCode.trim()) {
      setError('Заполните обязательные поля (ID, Название, TSX код)')
      return
    }

    setIsSubmitting(true)
    try {
      const defaultPropsObj: Record<string, PropValue> = {}
      props.forEach((p) => {
        defaultPropsObj[p.name] = p.default ?? ''
      })

      await createWidget({
        id: id.trim(),
        name: name.trim(),
        category,
        description: description.trim(),
        props,
        default_props: defaultPropsObj,
        tsx_code: tsxCode,
        example_snippet: `<${id.trim()} />`,
        tags: ['custom', category],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-white text-lg">
            <Sparkles className="text-sky-400" size={20} />
            <span>Создание нового Remotion-виджета</span>
          </div>
          <button onClick={closeCreateModal} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <div className="p-3 bg-rose-500/20 text-rose-300 text-xs rounded-xl font-semibold">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">ID Компонента (PascalCase) *</label>
              <input
                type="text"
                placeholder="ProductCard"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Название *</label>
              <input
                type="text"
                placeholder="Карточка продукта"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Описание назначения</label>
            <input
              type="text"
              placeholder="Стильная карточка с ценой и анимацией..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          {/* Конструктор пропсов */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-white uppercase tracking-wider">Спецификация Пропсов</label>
              <button
                type="button"
                onClick={handleAddProp}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1"
              >
                <Plus size={14} /> <span>Добавить пропс</span>
              </button>
            </div>

            <div className="space-y-2">
              {props.map((p, idx) => (
                <div key={idx} className="flex gap-2 items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
                  <input
                    type="text"
                    placeholder="name"
                    value={p.name}
                    onChange={(e) => {
                      const next = [...props]
                      next[idx].name = e.target.value
                      setProps(next)
                    }}
                    className="w-32 bg-slate-900 px-2 py-1 rounded text-white font-mono"
                  />
                  <select
                    value={p.type}
                    onChange={(e) => {
                      const next = [...props]
                      next[idx].type = e.target.value as PropType
                      setProps(next)
                    }}
                    className="bg-slate-900 text-slate-300 px-2 py-1 rounded"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="string[]">string[]</option>
                  </select>
                  <input
                    type="text"
                    placeholder="дефолтное значение"
                    value={p.default == null ? '' : String(p.default)}
                    onChange={(e) => {
                      const next = [...props]
                      next[idx].default = e.target.value
                      setProps(next)
                    }}
                    className="flex-1 bg-slate-900 px-2 py-1 rounded text-white"
                  />
                  <button type="button" onClick={() => handleRemoveProp(idx)} className="text-rose-400 px-1.5">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Исходный код */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Исходный TSX код *</label>
            <textarea
              value={tsxCode}
              onChange={(e) => setTsxCode(e.target.value)}
              className="w-full h-40 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
              required
            />
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeCreateModal}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-500/20"
            >
              {isSubmitting ? 'Сохранение...' : 'Зарегистрировать виджет'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
