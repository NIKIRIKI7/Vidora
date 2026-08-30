import React, { useEffect, useState } from 'react'
import { X, Sparkles, RefreshCw, Save, Check } from 'lucide-react'
import { skillsApi, type SkillItem } from '@features/settings'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export const WidgetPromptEditorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [skill, setSkill] = useState<SkillItem | null>(null)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedSuccess, setSavedSuccess] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    skillsApi.getById('custom_widget_creator')
      .then((data) => {
        if (cancelled) return
        setSkill(data)
        setPrompt(data.prompt)
      })
      .catch((err) => console.error('Failed to load custom_widget_creator skill:', err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isOpen])

  if (!isOpen) return null

  const handleSave = async () => {
    if (!skill) return
    setSaving(true)
    try {
      const updated = await skillsApi.update(skill.id, { prompt: prompt.trim() })
      setSkill(updated)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2500)
    } catch (err) {
      alert('Ошибка при сохранении промпта виджетов: ' + err)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Сбросить промпт виджетов до встроенного состояния?')) return
    setLoading(true)
    try {
      const reset = await skillsApi.resetSkill('custom_widget_creator')
      setSkill(reset)
      setPrompt(reset.prompt)
    } catch (err) {
      alert('Ошибка при сбросе: ' + err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-zinc-100">
                Мастер-промпт генерации виджетов (Custom Widget Creator)
              </h2>
              <p className="text-xs text-zinc-400">
                Хранится в SQLite БД. Определяет структуру и правила React компонентов Remotion.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-20 text-center text-zinc-500 text-sm">Загрузка промпта из БД...</div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400 font-mono">
                  ID: <span className="text-indigo-400">custom_widget_creator</span> (Версия: {skill?.version})
                </span>
                <span className="text-xs text-zinc-500">{prompt.length} символов</span>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={18}
                className="w-full bg-zinc-950 font-mono text-xs leading-relaxed border border-zinc-800 rounded-lg p-4 text-zinc-200 focus:outline-none focus:border-emerald-500 resize-y"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-900/60">
          <button
            onClick={handleReset}
            disabled={loading || saving}
            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-amber-400 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Сбросить к системному
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-sm transition"
            >
              Закрыть
            </button>
            <button
              onClick={handleSave}
              disabled={loading || saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition shadow-lg shadow-emerald-600/20"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4" /> Сохранено в БД
                </>
              ) : saving ? (
                'Сохранение...'
              ) : (
                <>
                  <Save className="w-4 h-4" /> Сохранить промпт
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
