import { create } from 'zustand'
import {
  scenarioEngineApi,
  type ScenarioAstDocument,
  type ScenarioIssue,
} from '@shared/api'

/** Результат успешной синхронизации: markdown + AST + индикаторы линтера. */
export interface EngineSyncPayload {
  backendId: string
  markdown: string
  ast: ScenarioAstDocument
  issues: ScenarioIssue[]
  durationSeconds: number
}

/**
 * Мост из Стора обратно в локальную модель проекта:
 * бэкенд-проект создаётся лениво, а результат /engine/sync применяется в local-слои.
 */
export interface ScenarioEngineBridge {
  ensureBackend: () => Promise<string | null>
  onApplied: (payload: EngineSyncPayload) => void
  onFailed: (markdown: string, error: unknown) => void
}

interface ScenarioEngineState {
  backendProjectId: string | null
  /** Сырой Markdown для текстового редактора (мгновенный отклик). */
  rawMarkdown: string
  /** AST для визуальных блоков (приходит со Шлюза). */
  ast: ScenarioAstDocument | null
  /** Замечания режиссёрского линтера (Правый блок). */
  issues: ScenarioIssue[]
  durationSeconds: number
  isSyncing: boolean
  isTyping: boolean
  lastError: string | null

  bridge: ScenarioEngineBridge | null

  init: (backendId: string | null, markdown: string, bridge: ScenarioEngineBridge) => void
  updateMarkdown: (md: string) => void
  forceSync: () => Promise<void>
  /** Внешнее обновление (смена проекта, операция над сценами) — без пометки "печатает". */
  setRawMarkdownFromExternal: (md: string) => void
}

const SYNC_DEBOUNCE_MS = 500

export const useScenarioEngineStore = create<ScenarioEngineState>((set, get) => {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let syncSequence = 0

  const scheduleSync = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void get().forceSync()
    }, SYNC_DEBOUNCE_MS)
  }

  return {
    backendProjectId: null,
    rawMarkdown: '',
    ast: null,
    issues: [],
    durationSeconds: 0,
    isSyncing: false,
    isTyping: false,
    lastError: null,
    bridge: null,

    init: (backendId, markdown, bridge) => {
      syncSequence++
      if (debounceTimer) clearTimeout(debounceTimer)
      set({
        backendProjectId: backendId,
        rawMarkdown: markdown,
        bridge,
        isSyncing: true,
        isTyping: false,
        lastError: null,
        // Пока новый AST не пришёл — сбрасываем визуальный слой и индикаторы
        ast: null,
        issues: [],
        durationSeconds: 0,
      })
      void get().forceSync()
    },

    updateMarkdown: (md) => {
      set({ rawMarkdown: md, isTyping: true })
      scheduleSync()
    },

    setRawMarkdownFromExternal: (md) => {
      if (md === get().rawMarkdown) return
      set({ rawMarkdown: md, isTyping: false })
      scheduleSync()
    },

    forceSync: async () => {
      const { bridge } = get()
      if (!bridge?.ensureBackend) {
        set({ isSyncing: false, isTyping: false })
        return
      }

      const runId = ++syncSequence
      set({ isSyncing: true })

      try {
        const existingId = get().backendProjectId
        const backendId = existingId ?? (await bridge.ensureBackend())
        if (runId !== syncSequence) return
        if (!backendId) {
          set({ isSyncing: false, isTyping: false })
          return
        }
        if (backendId !== get().backendProjectId) set({ backendProjectId: backendId })

        const markdown = get().rawMarkdown
        const response = await scenarioEngineApi.syncMarkdown(backendId, markdown)
        if (runId !== syncSequence) return

        set({
          ast: response.ast_tree,
          issues: response.issues,
          durationSeconds: response.computed_duration_seconds,
          isSyncing: false,
          isTyping: false,
          lastError: null,
        })

        get().bridge?.onApplied?.({
          backendId,
          markdown,
          ast: response.ast_tree,
          issues: response.issues,
          durationSeconds: response.computed_duration_seconds,
        })
      } catch (error) {
        if (runId !== syncSequence) return
        const markdown = get().rawMarkdown
        set({
          isSyncing: false,
          isTyping: false,
          lastError: error instanceof Error ? error.message : String(error),
        })
        // Offline / недоступен бэкенд: локальный fallback (сырой текст сохраняется)
        get().bridge?.onFailed?.(markdown, error)
      }
    },
  }
})
