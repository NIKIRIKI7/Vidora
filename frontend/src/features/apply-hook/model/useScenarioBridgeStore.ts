import { create } from 'zustand'
import type { StolenHook } from '@shared/api'

interface ScenarioBridgeState {
  currentScenarioMarkdown: string
  appliedHook: StolenHook | null
  notification: string | null

  setScenarioMarkdown: (markdown: string) => void
  applyHookToFirstScene: (hook: StolenHook) => void
  clearNotification: () => void
}

export const useScenarioBridgeStore = create<ScenarioBridgeState>((set, get) => ({
  currentScenarioMarkdown: '',
  appliedHook: null,
  notification: null,

  setScenarioMarkdown: (markdown) => set({ currentScenarioMarkdown: markdown }),

  applyHookToFirstScene: (hook) => {
    const raw = get().currentScenarioMarkdown

    const hookBlock = `[Хук] (00:00:00)
*(Экран: визуальный триггер, динамичный зум 1.15x)* ${hook.hook_0_5s}
*(Крупный план: инфографика и ключевой вопрос)* ${hook.hook_5_20s}`

    let updated = raw
    if (raw.includes('[Хук]')) {
      updated = raw.replace(/\[Хук\][\s\S]*?(?=\n\[|$)/i, hookBlock)
    } else {
      if (raw.startsWith('---')) {
        const parts = raw.split('---')
        if (parts.length >= 3) {
          updated = `---${parts[1]}---\n\n${hookBlock}\n\n${parts.slice(2).join('---').trim()}`
        } else {
          updated = `${hookBlock}\n\n${raw}`
        }
      } else {
        updated = `${hookBlock}\n\n${raw}`
      }
    }

    set({
      currentScenarioMarkdown: updated,
      appliedHook: hook,
      notification: `Хук "${hook.angle}" успешно внедрен в сцену [Хук]!`,
    })
  },

  clearNotification: () => set({ notification: null }),
}))
