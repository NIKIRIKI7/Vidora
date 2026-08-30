import React, { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Search,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  Database,
  RefreshCw,
  Info,
} from 'lucide-react'
import type { SkillCreate, SkillItem, SkillStage, SkillUpdate } from '../api/skillsApi'
import { skillsApi } from '../api/skillsApi'
import { useSkillsStore } from '../model/useSkillsStore'
import { STAGE_CONFIG } from './constants'
import { SkillEditModal } from './SkillEditModal'

export const SkillsSettingsView: React.FC = () => {
  const skills = useSkillsStore((s) => s.skills)
  const loading = useSkillsStore((s) => s.isLoading)
  const fetchSkills = useSkillsStore((s) => s.fetchSkills)
  const updateSkillInState = useSkillsStore((s) => s.updateSkillInState)
  const removeSkillFromState = useSkillsStore((s) => s.removeSkillFromState)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStage, setSelectedStage] = useState<SkillStage | 'all'>('all')

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null)

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  const handleToggleActive = async (skill: SkillItem) => {
    try {
      const updated = await skillsApi.update(skill.id, { is_active: !skill.is_active })
      updateSkillInState(updated)
    } catch (err) {
      console.error('Failed to toggle skill:', err)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Удалить скил "${name}"?`)) return
    try {
      await skillsApi.delete(id)
      removeSkillFromState(id)
    } catch (err) {
      alert('Ошибка при удалении скила: ' + err)
    }
  }

  const handleSaveSkill = async (data: SkillCreate | SkillUpdate) => {
    if (editingSkill) {
      const updated = await skillsApi.update(editingSkill.id, data as SkillUpdate)
      updateSkillInState(updated)
    } else {
      const created = await skillsApi.create(data as SkillCreate)
      updateSkillInState(created)
    }
  }

  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      const matchesStage = selectedStage === 'all' || skill.stage === selectedStage
      const matchesSearch =
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        skill.prompt.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesStage && matchesSearch
    })
  }, [skills, selectedStage, searchQuery])

  return (
    // overflow-x-hidden и w-full предотвращают горизонтальный скролл окна
    <div className="w-full max-w-full overflow-x-hidden p-4 sm:p-6 space-y-5 text-zinc-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Database className="w-6 h-6 text-indigo-400 shrink-0" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              LLM Skills & Prompts Registry
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl">
            Все системные и кастомные правила хранятся в SQLite БД. Контекст собирается по стадиям и бюджету токенов.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => fetchSkills(true)}
            className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 transition"
            title="Обновить список"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setEditingSkill(null)
              setIsModalOpen(true)
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-xs sm:text-sm transition shadow-lg shadow-indigo-600/25 shrink-0"
          >
            <Plus className="w-4 h-4" /> Добавить скил
          </button>
        </div>
      </div>

      {/* Filter and Search Bar (Адаптивный flex-wrap без вылезания за границы) */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-zinc-900/50 p-2.5 sm:p-3 rounded-2xl border border-zinc-800/60">

        {/* Скроллируемые табы БЕЗ уродливого нативного скроллбара */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setSelectedStage('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0 ${
              selectedStage === 'all'
                ? 'bg-zinc-100 text-zinc-900 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            Все ({skills.length})
          </button>
          {Object.entries(STAGE_CONFIG).map(([key, config]) => {
            const count = skills.filter((s) => s.stage === key).length
            if (count === 0 && selectedStage !== key) return null
            return (
              <button
                key={key}
                onClick={() => setSelectedStage(key as SkillStage)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  selectedStage === key
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                }`}
              >
                <span>{config.label}</span>
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Search Input — с фиксированной минимальной шириной и без сжатия */}
        <div className="relative min-w-[200px] lg:w-64 shrink-0">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по скилам..."
            className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

      {/* Skills List */}
      {loading ? (
        <div className="py-20 text-center text-zinc-500 text-sm">Загрузка скилов из базы данных...</div>
      ) : filteredSkills.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-zinc-800/80 rounded-2xl">
          <Info className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">Скилы не найдены</p>
          <p className="text-zinc-600 text-xs mt-1">Попробуйте изменить поисковый запрос или фильтр</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredSkills.map((skill) => {
            const stageConfig = STAGE_CONFIG[skill.stage] || STAGE_CONFIG.general
            return (
              <div
                key={skill.id}
                className={`p-4 rounded-2xl border transition flex flex-col md:flex-row items-start md:items-center justify-between gap-4 min-w-0 ${
                  skill.is_active
                    ? 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700/80'
                    : 'bg-zinc-950/30 border-zinc-900/60 opacity-60'
                }`}
              >
                {/* Левая колонка информации */}
                <div className="flex-1 min-w-0 space-y-2 w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100 truncate max-w-md">
                      {skill.name}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${stageConfig.color}`}>
                      {stageConfig.label}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        skill.is_custom
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/40'
                      }`}
                    >
                      {skill.is_custom ? 'Custom' : `System (v${skill.version})`}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      Priority: {skill.priority}
                    </span>
                  </div>

                  {skill.description && (
                    <p className="text-xs text-zinc-400 truncate">{skill.description}</p>
                  )}

                  {/* Превью промпта с защитой от горизонтального распирания */}
                  <div className="bg-zinc-950/70 rounded-xl p-2.5 border border-zinc-800/60 max-w-full overflow-hidden">
                    <p className="font-mono text-[11px] text-zinc-400 line-clamp-2 leading-relaxed break-words">
                      {skill.prompt}
                    </p>
                  </div>
                </div>

                {/* Правая колонка действий */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={() => handleToggleActive(skill)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition ${
                      skill.is_active
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                        : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/30 hover:bg-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    {skill.is_active ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Включен
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" /> Выключен
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setEditingSkill(skill)
                      setIsModalOpen(true)
                    }}
                    className="p-2 rounded-xl bg-zinc-800/70 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/30 transition"
                    title="Редактировать"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(skill.id, skill.name)}
                    className="p-2 rounded-xl bg-zinc-800/70 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 border border-zinc-700/30 transition"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SkillEditModal
        isOpen={isModalOpen}
        skill={editingSkill}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveSkill}
      />
    </div>
  )
}
