import React, { useState } from 'react'
import { X, Sparkles, Code2 } from 'lucide-react'
import type { SkillCreate, SkillItem, SkillStage, SkillUpdate } from '@entities/skill'
import { STAGE_CONFIG } from './constants'
import { Alert, Button, Input, Select, TextArea } from '@shared/ui'

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
      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1">
            Название скила
          </label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="напр. Remotion SVG Spring Animations"
            required
          />
        </div>

        {/* Stage */}
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1">
            Стадия применения (Stage)
          </label>
          <Select
            value={stage}
            onChange={(e) => setStage(e.target.value as SkillStage)}
          >
            {Object.entries(STAGE_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label} — {config.desc}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Description */}
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-on-surface-variant mb-1">
            Краткое описание (для чего скил)
          </label>
          <Input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опциональное пояснение..."
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1">
            Приоритет (меньше = выше)
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max="1000"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
            <span className="text-xs text-outline whitespace-nowrap">
              {priority <= 10 ? '🔥 Высокий' : priority <= 50 ? '⚡ Средний' : 'Базовый'}
            </span>
          </div>
        </div>
      </div>

      {/* Prompt Editor */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-medium text-on-surface-variant flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5 text-primary" /> Системный промпт / Инструкции LLM
          </label>
          <span className="text-2xs text-outline">{prompt.length} символов</span>
        </div>
        <TextArea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={12}
          placeholder="Инструкции для модели (Markdown / Text)..."
          className="font-mono text-xs leading-relaxed"
          required
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-outline-variant">
        <Button type="button" variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Сохранение...' : skill ? 'Обновить скил' : 'Создать скил'}
        </Button>
      </div>
    </form>
  )
}

export const SkillEditModal: React.FC<{ isOpen: boolean } & Props> = ({ isOpen, skill, onClose, onSave }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-container-lowest/70 backdrop-blur-sm p-4">
      <div className="bg-surface-container-low border border-outline-variant rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-low/50">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-on-surface">
              {skill ? `Редактировать: ${skill.name}` : 'Создать новый скил'}
            </h2>
          </div>
          <Button variant="icon" icon={X} onClick={onClose} />
        </div>

        {/* SkillEditForm remounts per skill via key from parent */}
        <SkillEditForm key={skill?.id ?? 'new'} skill={skill} onClose={onClose} onSave={onSave} />
      </div>
    </div>
  )
}
