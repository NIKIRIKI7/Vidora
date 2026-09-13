import React, { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  Database,
  RefreshCw,
  Info,
} from 'lucide-react'
import { SearchInput } from '@shared/ui'
import type { SkillCreate, SkillItem, SkillStage, SkillUpdate } from '@entities/skill'
import { skillsApi } from '@entities/skill'
import { useSkillsStore } from '@entities/skill'
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
    <div className="w-full max-w-full overflow-x-hidden p-4 sm:p-6 space-y-5 text-on-surface">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Database className="w-6 h-6 text-primary shrink-0" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              LLM Skills & Prompts Registry
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant max-w-xl">
            Все системные и кастомные правила хранятся в SQLite БД. Контекст собирается по стадиям и бюджету токенов.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => fetchSkills(true)}
            className="p-2.5 rounded-xl border border-outline-variant bg-surface-container-low/80 hover:bg-surface-container-high text-on-surface transition"
            title="Обновить список"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setEditingSkill(null)
              setIsModalOpen(true)
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary text-on-surface rounded-xl font-medium text-xs sm:text-sm transition shadow-lg shadow-primary/25 shrink-0"
          >
            <Plus className="w-4 h-4" /> Добавить скил
          </button>
        </div>
      </div>

      {/* Filter and Search Bar (Адаптивный flex-wrap без вылезания за границы) */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-surface-container-low/50 p-2.5 sm:p-3 rounded-2xl border border-outline-variant/60">

        {/* Скроллируемые табы БЕЗ уродливого нативного скроллбара */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setSelectedStage('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0 ${
              selectedStage === 'all'
                ? 'bg-surface-container-high text-outline shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/60'
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
                    ? 'bg-primary text-on-surface shadow-md shadow-primary/20'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/60'
                }`}
              >
                <span>{config.label}</span>
                <span className="text-xxs opacity-70">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Search Input — с фиксированной минимальной шириной и без сжатия */}
        <div className="min-w-[var(--layout-search)] lg:w-64 shrink-0">
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            placeholder="Поиск по скилам..."
            className="text-xs"
          />
        </div>
      </div>

      {/* Skills List */}
      {loading ? (
        <div className="py-20 text-center text-outline text-sm">Загрузка скилов из базы данных...</div>
      ) : filteredSkills.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-outline-variant/80 rounded-2xl">
          <Info className="w-8 h-8 text-outline mx-auto mb-2" />
          <p className="text-on-surface-variant text-sm">Скилы не найдены</p>
          <p className="text-outline text-xs mt-1">Попробуйте изменить поисковый запрос или фильтр</p>
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
                    ? 'bg-surface-container-low/40 border-outline-variant/80 hover:border-outline-variant/80'
                    : 'bg-surface-container-lowest/30 border-outline-variant/60 opacity-60'
                }`}
              >
                {/* Левая колонка информации */}
                <div className="flex-1 min-w-0 space-y-2 w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-on-surface truncate max-w-md">
                      {skill.name}
                    </span>
                    <span className={`text-2xs px-2 py-0.5 rounded-md border font-medium ${stageConfig.color}`}>
                      {stageConfig.label}
                    </span>
                    <span
                      className={`text-xxs px-1.5 py-0.5 rounded font-mono ${
                        skill.is_custom
                          ? 'bg-warning/10 text-warning border border-warning/20'
                          : 'bg-surface-container-high/80 text-on-surface-variant border border-outline-variant/40'
                      }`}
                    >
                      {skill.is_custom ? 'Custom' : `System (v${skill.version})`}
                    </span>
                    <span className="text-2xs text-outline font-mono">
                      Priority: {skill.priority}
                    </span>
                  </div>

                  {skill.description && (
                    <p className="text-xs text-on-surface-variant truncate">{skill.description}</p>
                  )}

                  {/* Превью промпта с защитой от горизонтального распирания */}
                  <div className="bg-surface-container-lowest/70 rounded-xl p-2.5 border border-outline-variant/60 max-w-full overflow-hidden">
                    <p className="font-mono text-2xs text-on-surface-variant line-clamp-2 leading-relaxed break-words">
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
                        ? 'bg-success/10 text-success border border-success/30 hover:bg-success/20'
                        : 'bg-surface-container-high/60 text-outline border border-outline-variant/30 hover:bg-surface-container-high hover:text-on-surface'
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
                    className="p-2 rounded-xl bg-surface-container-high/70 hover:bg-surface-container-highest text-on-surface border border-outline-variant/30 transition"
                    title="Редактировать"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(skill.id, skill.name)}
                    className="p-2 rounded-xl bg-surface-container-high/70 hover:bg-error/20 hover:text-error text-on-surface-variant border border-outline-variant/30 transition"
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
