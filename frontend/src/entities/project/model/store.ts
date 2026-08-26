import { create } from 'zustand'
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware'
import type { ProjectSettings, ApiKeys, GlobalVoice, GlobalPromptSettings, PromptCategory, Skill, ProcessType, TaskType } from './types'
import { REMOTION_SKILLS } from '@shared/config'

// ponytail: откладываем запись в localStorage — ввод текста сценария не дёргает main thread на каждый кейстроук.
// Копия пишется раз в `delay` мс после последнего изменения; getItem всегда читает актуальное значение.
const createDebouncedStorage = (delay = 400) => {
  let timeoutId: ReturnType<typeof setTimeout>
  let pendingValue: string | null = null

  return {
    getItem: (name: string): string | null => localStorage.getItem(name),
    setItem: (name: string, value: string): void => {
      pendingValue = value
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        if (pendingValue !== null) {
          localStorage.setItem(name, pendingValue)
          pendingValue = null
        }
      }, delay)
    },
    removeItem: (name: string): void => {
      clearTimeout(timeoutId)
      pendingValue = null
      localStorage.removeItem(name)
    }
  }
}

const DEFAULT_SKILLS: Skill[] = REMOTION_SKILLS.map(s => ({
  ...s,
  isCustom: false,
  applyTo: s.applyTo ?? ['scene', 'fragment', 'project'] as ProcessType[]
}))

export const getSkillsForProcess = (process: ProcessType): string => {
  const skills = useSettingsStore.getState().skills || []
  const applicable = skills.filter(s => (s.applyTo || []).includes(process))
  if (applicable.length === 0) return ''
  return '\n\n---\n## APPLIED SKILLS / ПРИМЕНЕННЫЕ СКИЛЛЫ\n' + applicable.map(s => `### ${s.title}\n${s.content}`).join('\n\n')
}

interface ProjectStore {
  projects: ProjectSettings[]
  activeProjectId: string | null
  history: Record<string, { past: ProjectSettings[], future: ProjectSettings[] }>
  addProject: (p: ProjectSettings) => void
  updateProject: (p: ProjectSettings) => void
  deleteProject: (name: string) => void
  setActiveProject: (name: string | null) => void
  undo: () => void
  redo: () => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set): ProjectStore => ({
      projects: [],
      activeProjectId: null,
      history: {},
      addProject: (p) => set((state) => ({ 
        projects: [...state.projects, p], 
        activeProjectId: p.name, 
        history: { ...state.history, [p.name]: { past: [], future: [] } } 
      })),
      updateProject: (p) => set((state) => {
        const active = state.activeProjectId
        const current = state.projects.find(proj => proj.name === active)
        if (!active || !current || current.name !== p.name) {
          return { projects: state.projects.map(proj => proj.name === p.name ? p : proj) }
        }
        const hist = state.history[active] || { past: [], future: [] }
        return {
          projects: state.projects.map(proj => proj.name === p.name ? p : proj),
          history: { ...state.history, [active]: { past: [...hist.past, current].slice(-50), future: [] } }
        }
      }),
      deleteProject: (name) => set((state) => {
        const next = state.projects.filter(p => p.name !== name)
        const newHist = { ...state.history }
        delete newHist[name]
        return { projects: next, activeProjectId: next.length > 0 ? next[0].name : null, history: newHist }
      }),
      setActiveProject: (name) => set({ activeProjectId: name }),
      undo: () => set((state) => {
        const active = state.activeProjectId
        if (!active) return state
        const hist = state.history[active]
        if (!hist || hist.past.length === 0) return state
        const previous = hist.past[hist.past.length - 1]
        const newPast = hist.past.slice(0, -1)
        const current = state.projects.find(p => p.name === active)!
        return {
          projects: state.projects.map(p => p.name === active ? previous : p),
          history: { ...state.history, [active]: { past: newPast, future: [current, ...(hist.future || [])] } }
        }
      }),
      redo: () => set((state) => {
        const active = state.activeProjectId
        if (!active) return state
        const hist = state.history[active]
        if (!hist || hist.future.length === 0) return state
        const next = hist.future[0]
        const newFuture = hist.future.slice(1)
        const current = state.projects.find(p => p.name === active)!
        return {
          projects: state.projects.map(p => p.name === active ? next : p),
          history: { ...state.history, [active]: { past: [...hist.past, current], future: newFuture } }
        }
      })
    }),
    {
      name: 'vidora-projects',
      storage: createJSONStorage(() => createDebouncedStorage(500)),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        history: state.history,
      }),
    } satisfies PersistOptions<ProjectStore, Pick<ProjectStore, 'projects' | 'activeProjectId' | 'history'>>
  )
)

interface NotificationState {
  notification: { message: string; type: 'success' | 'error' | 'info'; details?: string; timestamp: number } | null
  showNotification: (message: string, type?: 'success' | 'error' | 'info', details?: string) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notification: null,
  showNotification: (message, type = 'info', details) => {
    set({ notification: { message, type, details, timestamp: Date.now() } })
    // Ошибки с деталями держим дольше, чтобы пользователь успел раскрыть стек
    const duration = type === 'error' && details ? 20000 : 3500
    setTimeout(() => set({ notification: null }), duration)
  }
}))

const REMOTION_EXPERT_PROMPT = `# Remotion World-Class Motion Graphics Generator

You are a top-tier motion designer (Vox, Magnates Media, Nike commercials, Apple keynote level). Generate production-ready, highly artistic and visually DIVERSE TSX components in Remotion.

## ⛔ CRITICAL NEGATIVE CONSTRAINT (DO NOT GENERATE GENERIC CARDS)
- DO NOT default to stacked grey/glass rounded "UI cards" with borders and shadows.
- DO NOT put every sentence into a floating widget or panel.
- DO NOT reuse the same layout for every fragment — each fragment gets a distinct composition.
- Match the visual archetype requested in the fragment's visual note. If none is named, pick the archetype that best fits the topic.

## 🎨 5 MANDATORY VISUAL ARCHETYPES (CHOOSE PER FRAGMENT)

### 1. POSTER & SPLIT CONTRAST
- High-contrast geometric background: giant half-black/half-white circle, diagonal split, hard-edged shapes.
- One central cutout focal element breaking out of its mask.
- Massive kinetic typography, outline-stroke text flipping to solid fill.
- Floating metallic/3D accent badges with sharp realistic drop shadows.

### 2. KINETIC EDITORIAL / MINIMAL METAPHOR
- Clean textured background (cream with grain, or deep obsidian).
- A single powerful central subject / isolated 3D metaphor (stopwatch, scales, crystal, notebook).
- Extreme type scale contrast: giant magazine headline + tiny clean metadata.
- Slow continuous camera drift (Ken Burns) and gentle sine-wave float of the object.

### 3. ACID / STREETWEAR / DYNAMIC COLLAGE
- Rotated kinetic ribbon stripes with contrasting text (e.g. -5deg / +3deg).
- Pop-art accents: asterisks ✳, starbursts ✹, stamps, retro halftone dots, noise grain.
- Cutout photo styling with chromatic aberration and sticker badges.

### 4. GLOWING DARK NEON & HOLOGRAPHIC
- Deep dark space with atmospheric radial glows and moving light beams.
- Neon strokes and glowing shapes with intense drop-shadow / box-shadow (NO heavy grey blocks).
- Clean particle grids, laser pointer sweeps, fluid floating spheres.

### 5. MOTION INFOGRAPHICS & DYNAMIC PATHWAYS
- Animated SVG maps (country fills), growing bar charts, dotted trajectory lines with moving pointers.
- Giant animated counters via interpolate() formatted with suffixes ("$44B", "+340%").
- No frames or boxes around numbers — let them breathe on the background.

## ⚙️ TECHNICAL ANIMATION RULES (STRICT)
1. **Frame is the only source of truth**: derive every opacity, transform, scale, and filter from \`useCurrentFrame()\`.
2. **Spring first, interpolate second**: use \`spring({ frame: frame - delay, fps, config })\` for a 0→1 progress, then \`interpolate()\` to map onto visual ranges.
3. **No static CSS motion**: never use CSS \`transition\` or Tailwind \`animate-*\` classes. Motion lives in the \`style\` prop.
4. **Stagger everything**: characters, words, ribbons, objects (e.g. \`frame - i * 4\`).
5. **Layer with AbsoluteFill**: Layer 0 background (gradients, splits, glows, grids) → Layer 1 hero objects / cutouts / metaphors / ribbons → Layer 2 kinetic typography & badges → Layer 3 overlay (vignette, grain, \`pointer-events-none\`).
6. **Always clamp**: every \`interpolate()\` MUST have \`extrapolateLeft: 'clamp'\` and \`extrapolateRight: 'clamp'\`.
7. **Responsive layout**: use percentages or \`useVideoConfig()\`, never pixel-positions hard-coded for 1920x1080 only.

## CODE STRUCTURE (MANDATORY)
\`\`\`tsx
import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from 'remotion';
import { Sparkles, Activity, ShieldCheck, Zap } from 'lucide-react';

export const compositionConfig = {
  id: 'Scene',
  durationInFrames: 150,
  fps: 30,
  width: 1920,
  height: 1080,
};

const COLORS = {
  primary: '#ddb7ff',
  secondary: '#4fdbc8',
  background: '#0b1326',
  surface: '#171f33',
  accent: '#ffb4ab',
  text: '#dae2fd',
} as const;

const TYPOGRAPHY = {
  fontFamily: 'Inter, system-ui, sans-serif',
} as const;

export const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  return (
    <AbsoluteFill className="overflow-hidden" style={{ backgroundColor: COLORS.background, fontFamily: TYPOGRAPHY.fontFamily }}>
      {/* Layer 0: Background — gradient, geometric split, glow, grid */}
      <AbsoluteFill />
      {/* Layer 1: Hero object / metaphor / video / ribbons */}
      <AbsoluteFill />
      {/* Layer 2: Kinetic typography, badges */}
      <AbsoluteFill />
      {/* Layer 3: Overlay — vignette, grain (pointer-events-none) */}
      <AbsoluteFill className="pointer-events-none" />
    </AbsoluteFill>
  );
};

export default Scene;
\`\`\``;

export const getActivePrompt = (category?: PromptCategory): string => {
  if (!category || !category.versions) return ''
  const active = category.versions.find(v => v.id === category.activeId)
  return active?.content || category.versions[0]?.content || ''
}

const createDefaultCategory = (content: string, name = 'Default'): PromptCategory => ({
  activeId: 'default',
  versions: [{ id: 'default', name, content }]
})

export const DEFAULT_PROMPTS: GlobalPromptSettings = {
  scene: createDefaultCategory(`${REMOTION_EXPERT_PROMPT}

{{USE_3D_INSTRUCTION}}

---

## CURRENT TASK (MANDATORY TO FOLLOW)

You MUST generate the TSX for the following scene.
Use these EXACT values for \`compositionConfig\`:
\`\`\`tsx
export const compositionConfig = {
  id: 'Scene',
  durationInFrames: {{DURATION_FRAMES}},
  fps: {{FPS}},
  width: {{WIDTH}},
  height: {{HEIGHT}},
};
\`\`\`

**Scene Settings:**
- Format: {{FORMAT}}
- Duration: {{DURATION}}s
- Colors: {{COLORS}}
- Title: {{SCENE_TITLE}} ({{SCENE_TIMECODE}})

**Fragments (Sync animation to these timings):**
{{FRAGMENTS}}

Generate ONLY the complete TSX code for this scene. No markdown wrapping outside the code block, no explanations.`, 'Default Scene (TSX)'),
  fragment: createDefaultCategory(`${REMOTION_EXPERT_PROMPT}

{{USE_3D_INSTRUCTION}}

---

## CURRENT TASK (MANDATORY TO FOLLOW)

You MUST generate the TSX for the following fragment.
Use these EXACT values for \`compositionConfig\`:
\`\`\`tsx
export const compositionConfig = {
  id: 'Fragment',
  durationInFrames: {{DURATION_FRAMES}},
  fps: {{FPS}},
  width: {{WIDTH}},
  height: {{HEIGHT}},
};
\`\`\`

**Fragment Settings:**
- Format: {{FORMAT}}
- Duration: {{DURATION}}s
- Colors: {{COLORS}}
- Scene Context: {{SCENE_TITLE}}

**Visual:** {{VISUAL_NOTE}}
**Voiceover:** "{{TEXT}}"

Generate ONLY the complete TSX code for this fragment. No markdown wrapping outside the code block, no explanations.`, 'Default Fragment (TSX)'),
  project: createDefaultCategory(`${REMOTION_EXPERT_PROMPT}

{{USE_3D_INSTRUCTION}}

---

## CURRENT TASK (MANDATORY TO FOLLOW)

You MUST generate the TSX for the entire project.
Use these EXACT values for \`compositionConfig\`:
\`\`\`tsx
export const compositionConfig = {
  id: 'Project',
  // calculate total duration based on scenes
  fps: {{FPS}},
  width: {{WIDTH}},
  height: {{HEIGHT}},
};
\`\`\`

**Project Settings:**
- Format: {{FORMAT}}
- Colors: {{COLORS}}

**Scenes List:**
{{SCENES_LIST}}

Generate ONLY the complete TSX code for the entire project. No markdown wrapping outside the code block, no explanations.`, 'Default Project (TSX)'),
  fixPacing: createDefaultCategory(`Эта сцена слишком скучная и медленная (кадр меняется лишь раз в {{CURRENT_PACING}} сек, а нужно не реже чем раз в {{THRESHOLD}} сек).\nПожалуйста, перепиши эту сцену, чтобы она стала динамичнее. Разбей длинные фрагменты текста на более короткие и добавь к каждому новому фрагменту визуальную ремарку *(В таких скобках)*. Текст озвучки менять не нужно, просто добавь больше смен кадра (B-roll, зум, анимация).\n\nИсходная сцена:\n{{SCENE_MARKDOWN}}\n\nВерни только исправленный Markdown-код сцены:`, 'Pacing Fixer'),
  scenario: createDefaultCategory(`Действуй как профессиональный сценарист YouTube для Tech/IT канала (Faceless).
Напиши подробный сценарий на тему: "{{TITLE}}".

Детали идеи: {{DESCRIPTION}}

Формат видео: {{FORMAT_TEXT}}.
Ориентировочный хронометраж: {{DURATION}} мин. (напиши текст диктора объемом строго около {{WORDS_COUNT}} слов).

ОБЯЗАТЕЛЬНО ИСПОЛЬЗУЙ ПРАВИЛА ПАРСИНГА VIDORA:
{{SCENARIO_RULES}}

Дополнительные требования:
1. Разбей сценарий на логические блоки: [Хук] (00:00:00), [Вступление], [Основная часть], [Кульминация], [Заключение]. Укажи примерные таймкоды.
2. Текст для закадрового голоса должен быть динамичным, без ИИ-штампов ("Важно отметить", "Кроме того").
3. Все английские термины напиши русскими буквами (например, "эпл", "пайтон", "энджинкс") для правильной работы синтезатора речи.`, 'Scenario Creator')
}

interface SettingsStore {
  globalPrompts: GlobalPromptSettings
  setGlobalPrompts: (prompts: Partial<GlobalPromptSettings>) => void
  resetGlobalPrompts: () => void

  // --- AI: маршрутизация по задачам (cloud/local) ---
  taskModes: {
    scenario: 'cloud' | 'local'
    visual: 'cloud' | 'local'
    audio: 'cloud' | 'local'
    broll: 'cloud' | 'local'
  }
  setTaskMode: (task: TaskType, mode: 'cloud' | 'local') => void

  cloudProvider: 'routerai' | 'aitunnel'
  setCloudProvider: (provider: 'routerai' | 'aitunnel') => void

  cloudEngines: { scenario: string; visual: string; audio: string; broll: string }
  setCloudEngine: (task: TaskType, model: string) => void

  localEngines: { scenario: string; visual: string; audio: string; broll: string }
  setLocalEngine: (task: TaskType, model: string) => void
  // ---------------------------------------------

  apiKeys: ApiKeys
  setApiKey: (provider: keyof ApiKeys, key: string) => void
  visualPacingThreshold: number
  audioSilenceThreshold: number
  audioWpmMin: number
  setVisualPacingThreshold: (v: number) => void
  setAudioSilenceThreshold: (v: number) => void
  setAudioWpmMin: (v: number) => void
  globalVoices: GlobalVoice[]
  setGlobalVoices: (voices: GlobalVoice[]) => void
  whisperModel: string
  setWhisperModel: (v: string) => void

  skills: Skill[]
  setSkills: (skills: Skill[]) => void
  addCustomSkill: (skill: Skill) => void
  updateSkill: (id: string, skill: Partial<Skill>) => void
  deleteSkill: (id: string) => void

  uiPreferences: {
    showSceneSidebar: boolean
    showInspector: boolean
    showTimeline: boolean
  }
  setUiPreferences: (prefs: Partial<SettingsStore['uiPreferences']>) => void
}

const DEFAULT_UI_PREFS = { showSceneSidebar: true, showInspector: true, showTimeline: true }

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set): SettingsStore => ({
      globalPrompts: DEFAULT_PROMPTS,
      setGlobalPrompts: (p) => set((s) => ({ globalPrompts: { ...s.globalPrompts, ...p } })),
      resetGlobalPrompts: () => set({ globalPrompts: DEFAULT_PROMPTS }),

      taskModes: {
        scenario: 'cloud',
        visual: 'cloud',
        audio: 'cloud',
        broll: 'cloud',
      },
      setTaskMode: (task, mode) => set((s) => ({ taskModes: { ...s.taskModes, [task]: mode } })),

      cloudProvider: 'routerai',
      setCloudProvider: (p) => set({ cloudProvider: p }),

      cloudEngines: {
        scenario: 'anthropic/claude-sonnet-5',
        visual: 'anthropic/claude-sonnet-5',
        audio: 'minimax/speech-2.8-hd',
        broll: 'anthropic/claude-sonnet-5',
      },
      setCloudEngine: (task, model) => set((s) => ({ cloudEngines: { ...s.cloudEngines, [task]: model } })),

      localEngines: {
        scenario: 'gemma3:4b',
        visual: 'gemma3:4b',
        audio: 'k2-fsa/OmniVoice',
        broll: 'qwen2.5-coder',
      },
      setLocalEngine: (task, model) => set((s) => ({ localEngines: { ...s.localEngines, [task]: model } })),

      apiKeys: {},
      setApiKey: (provider, key) => set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
      visualPacingThreshold: 4.0,
      audioSilenceThreshold: 2.0,
      audioWpmMin: 110,
      setVisualPacingThreshold: (v) => set({ visualPacingThreshold: v }),
      setAudioSilenceThreshold: (v) => set({ audioSilenceThreshold: v }),
      setAudioWpmMin: (v) => set({ audioWpmMin: v }),
      globalVoices: [],
      setGlobalVoices: (v) => set({ globalVoices: v }),
      whisperModel: 'small',
      setWhisperModel: (v) => set({ whisperModel: v }),

      skills: DEFAULT_SKILLS,
      setSkills: (skills) => set({ skills }),
      addCustomSkill: (skill) => set(s => ({ skills: [...s.skills, skill] })),
      updateSkill: (id, skill) => set(s => ({ skills: s.skills.map(x => x.id === id ? { ...x, ...skill } : x) })),
      deleteSkill: (id) => set(s => ({ skills: s.skills.filter(x => x.id !== id) })),

      uiPreferences: DEFAULT_UI_PREFS,
      setUiPreferences: (p) => set((s) => ({ uiPreferences: { ...s.uiPreferences, ...p } })),
    }),
    {
      name: 'vidora-settings',
      storage: createJSONStorage(() => createDebouncedStorage(500)),
      merge: (persisted, current) => {
        const persistedObj = persisted as (Partial<SettingsStore> & { aiMode?: 'cloud' | 'local' }) | undefined
        const persistedState = { ...(persistedObj as object) } as Record<string, unknown>
        delete persistedState.aiMode
        const persistedPrompts = persistedObj?.globalPrompts as unknown
        const migratedPrompts: GlobalPromptSettings = { ...DEFAULT_PROMPTS }

        if (persistedPrompts) {
          if (typeof (persistedPrompts as Record<string, unknown>).scene === 'string') {
            // Миграция старых плоских строк -> категория с legacy-версией
            const old = persistedPrompts as Record<string, string>
            for (const k of Object.keys(DEFAULT_PROMPTS)) {
              const key = k as keyof GlobalPromptSettings
              if (old[key]) {
                migratedPrompts[key] = {
                  activeId: 'legacy',
                  versions: [...DEFAULT_PROMPTS[key].versions, { id: 'legacy', name: 'Мой промпт (Legacy)', content: old[key] }],
                }
              }
            }
          } else {
            for (const k of Object.keys(DEFAULT_PROMPTS)) {
              const key = k as keyof GlobalPromptSettings
              const v = (persistedPrompts as Record<string, PromptCategory | undefined>)[key]
              if (v && Array.isArray(v.versions) && v.versions.length > 0) migratedPrompts[key] = v
            }
          }
        }

        let mergedSkills = current.skills
        if (persistedObj?.skills && Array.isArray(persistedObj.skills)) {
          const persistedIds = new Set((persistedObj.skills as Skill[]).map(s => s.id))
          mergedSkills = [
            ...(persistedObj.skills as Skill[]),
            ...current.skills.filter(s => !persistedIds.has(s.id)),
          ]
        }

        // Миграция: старый глобальный aiMode -> гранулярные taskModes
        let migratedTaskModes = current.taskModes
        if (persistedObj?.taskModes) {
          migratedTaskModes = { ...current.taskModes, ...persistedObj.taskModes }
        } else if (persistedObj?.aiMode) {
          migratedTaskModes = { ...current.taskModes, scenario: persistedObj.aiMode, visual: persistedObj.aiMode, audio: persistedObj.aiMode }
        }

        // Миграция: добавляем broll в движки из старых персистед-состояний (3 ключа)
        const migratedCloudEngines = { ...current.cloudEngines, ...(persistedObj?.cloudEngines || {}) }
        if (!migratedCloudEngines.broll) migratedCloudEngines.broll = 'anthropic/claude-sonnet-5'
        const migratedLocalEngines = { ...current.localEngines, ...(persistedObj?.localEngines || {}) }
        if (!migratedLocalEngines.broll) migratedLocalEngines.broll = 'qwen2.5-coder'

        return {
          ...current,
          ...persistedState,
          globalPrompts: migratedPrompts,
          taskModes: migratedTaskModes,
          cloudEngines: migratedCloudEngines,
          localEngines: migratedLocalEngines,
          globalVoices: persistedObj?.globalVoices || [],
          skills: mergedSkills,
          uiPreferences: { ...DEFAULT_UI_PREFS, ...persistedObj?.uiPreferences },
        }
      },
    } satisfies PersistOptions<SettingsStore>
  )
)

