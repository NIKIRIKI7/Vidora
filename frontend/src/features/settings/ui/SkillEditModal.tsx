import React, { useState } from 'react'
import { X, Sparkles, Code2 } from 'lucide-react'
import type { SkillCreate, SkillItem, SkillStage, SkillUpdate } from '../api/skillsApi'
import { STAGE_CONFIG } from './constants'

interface Props {
  skill: SkillItem | null
  onClose: () => void
  onSave: (data: SkillCreate | SkillUpdate) => Promise<void>
}

const SkillEditForm: React.FC<Props> = ({ skill, onClose, onSave }) => {
  const [name, setName] = useState(skill?.name ?? '')
  const [description, setDescription] = useState(skill?.description || '')
  const [prompt, setPrompt] = useState(skill?.prompt ?? '')
  const [stage, setStage] = useState<SkillStage>(skill?.stage ?? 'scene_generation')
  const [priority, setPriority] = useState(skill?.priority ?? 100)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !prompt.trim()) {
      setError('Название и промпт обязательны')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        prompt: prompt.trim(),
        stage,
        priority: Number(priority),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения скила')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Название скила
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="напр. Remotion SVG Spring Animations"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
            required
          />
        </div>

        {/* Stage */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Стадия применения (Stage)
          </label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as SkillStage)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
          >
            {Object.entries(STAGE_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label} — {config.desc}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Description */}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Краткое описание (для чего скил)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опциональное пояснение..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Приоритет (меньше = выше)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="1000"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
            />
            <span className="text-xs text-zinc-500 whitespace-nowrap">
              {priority <= 10 ? '🔥 Высокий' : priority <= 50 ? '⚡ Средний' : 'Базовый'}
            </span>
          </div>
        </div>
      </div>

      {/* Prompt Editor */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5 text-indigo-400" /> Системный промпт / Инструкции LLM
          </label>
          <span className="text-[11px] text-zinc-500">{prompt.length} символов</span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={12}
          placeholder="Инструкции для модели (Markdown / Text)..."
          className="w-full bg-zinc-950 font-mono text-xs leading-relaxed border border-zinc-800 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-indigo-500 resize-y"
          required
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-sm transition"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition shadow-lg shadow-indigo-600/20"
        >
          {loading ? 'Сохранение...' : skill ? 'Обновить скил' : 'Создать скил'}
        </button>
      </div>
    </form>
  )
}

export const SkillEditModal: React.FC<{ isOpen: boolean } & Props> = ({ isOpen, skill, onClose, onSave }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-zinc-100">
              {skill ? `Редактировать: ${skill.name}` : 'Создать новый скил'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SkillEditForm remounts per skill via key from parent */}
        <SkillEditForm key={skill?.id ?? 'new'} skill={skill} onClose={onClose} onSave={onSave} />
      </div>
    </div>
  )
}
