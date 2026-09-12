import { create } from 'zustand'
import type { SkillItem, SkillStage } from '../api/skillsApi'
import { skillsApi } from '../api/skillsApi'

interface SkillsState {
  skills: SkillItem[]
  isInitialized: boolean
  isLoading: boolean
  error: string | null

  fetchSkills: (force?: boolean) => Promise<void>
  getSkillsForStage: (stage: SkillStage) => SkillItem[]
  buildPromptContextForStage: (stage: SkillStage, maxCharBudget?: number) => string
  updateSkillInState: (skill: SkillItem) => void
  removeSkillFromState: (id: string) => void
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  isInitialized: false,
  isLoading: false,
  error: null,

  fetchSkills: async (force = false) => {
    if (get().isInitialized && !force) return
    if (get().isLoading) return

    set({ isLoading: true, error: null })
    try {
      const data = await skillsApi.getAll()
      set({ skills: data, isInitialized: true, isLoading: false })
    } catch (err) {
      // Помечаем инициализированным, чтобы не блокировать интерфейс (генерация вернёт пустой контекст)
      set({
        error: err instanceof Error ? err.message : 'Failed to load skills from DB',
        isLoading: false,
        isInitialized: true,
      })
    }
  },

  getSkillsForStage: (stage) => {
    const { skills } = get()
    return skills
      .filter((s) => s.is_active && (s.stage === stage || s.stage === 'general'))
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
  },

  buildPromptContextForStage: (stage, maxCharBudget = 14000) => {
    const activeSkills = get().getSkillsForStage(stage)
    const parts: string[] = []
    let currentChars = 0

    for (const skill of activeSkills) {
      const block = `--- [Skill: ${skill.name} (${skill.id})] ---\n${skill.prompt.trim()}\n`
      if (currentChars + block.length > maxCharBudget) {
        break
      }
      parts.push(block)
      currentChars += block.length
    }

    return parts.join('\n').trim()
  },

  updateSkillInState: (updatedSkill) => {
    set((state) => ({
      skills: state.skills.some((s) => s.id === updatedSkill.id)
        ? state.skills.map((s) => (s.id === updatedSkill.id ? updatedSkill : s))
        : [updatedSkill, ...state.skills],
    }))
  },

  removeSkillFromState: (id) => {
    set((state) => ({
      skills: state.skills.filter((s) => s.id !== id),
    }))
  },
}))
