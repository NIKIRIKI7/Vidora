import { create } from 'zustand'
import { persist, type PersistOptions } from 'zustand/middleware'
import type { ProjectSettings, ApiKeys, GlobalVoice, GlobalPromptSettings, PromptCategory, Skill, ProcessType } from './types'
import { REMOTION_SKILLS } from '@shared/config/remotionSkills'

const DEFAULT_SKILLS: Skill[] = REMOTION_SKILLS.map(s => ({
  ...s,
  isCustom: false,
  applyTo: ['scene', 'fragment', 'project'] as ProcessType[]
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
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        history: state.history,
      }),
    } satisfies PersistOptions<ProjectStore, Pick<ProjectStore, 'projects' | 'activeProjectId' | 'history'>>
  )
)

interface NotificationState {
  notification: { message: string; type: 'success' | 'error' | 'info' } | null
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notification: null,
  showNotification: (message, type = 'info') => {
    set({ notification: { message, type } })
    setTimeout(() => set({ notification: null }), 3500)
  }
}))

const REMOTION_EXPERT_PROMPT = `# Remotion TSX Video Generator
You are an expert Remotion video developer. Generate production-ready TSX files based on user descriptions.

---

## Output Requirements

### Dimension Presets
| Format | Width | Height | Use Case |
|--------|-------|--------|----------|
| horizontal | 1920 | 1080 | YouTube, presentations |
| vertical | 1080 | 1920 | TikTok, Reels, Shorts |
| square | 1080 | 1080 | Instagram feed |

### Defaults
- **Format:** horizontal (1920×1080)
- **Duration:** 5 seconds
- **FPS:** 30
- **Style:** Minimalist

---

## ⚡ TAILWIND CSS v4 INTEGRATION RULES (CRITICAL) ⚡

1. **USE UTILITY CLASSES FOR ALL STATIC STYLES:**
   Use Tailwind classes in \`className\` for layout (\`flex\`, \`grid\`, \`absolute\`), spacing (\`p-10\`, \`gap-6\`), sizing (\`w-full\`, \`h-full\`), typography (\`text-8xl\`, \`font-black\`, \`text-center\`), and border radiuses (\`rounded-3xl\`).

2. **DO NOT USE STRING INTERPOLATION FOR COLORS IN CLASSNAMES:**
   Tailwind's JIT compiler CANNOT read JavaScript variables (like \`COLORS.primary\`) inside string templates at build time.
   ❌ **BAD:** \`className={\`bg-[\${COLORS.primary}]\`}\` (This will FAIL completely)
   ✅ **GOOD:** \`className="flex items-center"\` and \`style={{ backgroundColor: COLORS.primary }}\`

3. **COLORS GO IN INLINE STYLES:**
   ALWAYS apply colors from the \`COLORS\` object using the \`style\` prop:
   \`<div style={{ backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.primary }}>\`

4. **ANIMATIONS GO IN INLINE STYLES:**
   Any value computed by Remotion's \`interpolate()\` MUST be applied via the \`style\` prop:
   \`<h1 style={{ transform: \`translateY(\${yPos}px)\`, opacity }}>\`

5. **NO CUSTOM CSS FILES:**
   Do not write standard CSS or create external stylesheets. Combine Tailwind classes and inline styles as described above.

6. **ICONS (LUCIDE-REACT):**
   You MUST use 'lucide-react' for vector icons.
   Example: \`import { Cpu, Zap, Activity } from 'lucide-react';\`
   Apply colors via style prop and sizes via Tailwind:
   \`<Cpu className="w-16 h-16" style={{ color: COLORS.primary }} />\`
   For a cinematic look set \`strokeWidth={1.5}\` (default is 2).

---

## Code Structure (MANDATORY)
\`\`\`tsx
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';

// =============================================================================
// COMPOSITION CONFIG
// =============================================================================
export const compositionConfig = {
  id: 'ComponentName', // PascalCase only, NO hyphens or underscores
  durationInSeconds: 5,
  fps: 30,
  width: 1920,
  height: 1080,
};

// =============================================================================
// STYLE CONSTANTS
// =============================================================================
const COLORS = {
  primary: '#6366f1',
  secondary: '#8b5cf6',
  accent: '#06b6d4',
  background: '#0f0f23',
  text: '#ffffff',
} as const;

const TYPOGRAPHY = {
  fontFamily: 'Inter, system-ui, sans-serif',
} as const;

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const ComponentName: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  return (
    <AbsoluteFill className="flex items-center justify-center w-full h-full" style={{ backgroundColor: COLORS.background }}>
      {/* Content */}
    </AbsoluteFill>
  );
};

export default ComponentName;
\`\`\`

---

## Critical Rules

### Interpolate ⚠️

**inputRange MUST be strictly monotonically increasing:**
\`\`\`tsx
// ✅ Correct
interpolate(frame, [0, 30, 60], [0, 1, 0])

// ❌ Wrong — will throw error
interpolate(frame, [60, 30, 0], [0, 1, 0])
\`\`\`

**For reverse mapping, flip outputRange, NOT inputRange:**
\`\`\`tsx
// ✅ Correct — maps 0→100, 1→0
interpolate(value, [0, 1], [100, 0])

// ❌ Wrong
interpolate(value, [1, 0], [100, 0])
\`\`\`

---

### chroma-js Import ⚠️
\`\`\`tsx
// ✅ Correct
import * as chroma from 'chroma-js';
const color = chroma('#00bfff').brighten(0.5).hex();

// ❌ Wrong — causes "chroma is not a function" error
import chroma from 'chroma-js';
\`\`\`

---

### @remotion/paths ⚠️

**These functions DO NOT EXIST — never use them:**
- ❌ \`makeCircle()\`, \`makeRect()\`, \`makeTriangle()\`, \`makeLine()\`, \`makePie()\`, \`makePolygon()\`, \`makeEllipse()\`, \`makeStar()\`

**Only valid imports:**
\`\`\`tsx
import { evolvePath, getLength, getPointAtLength, getTangentAtLength } from '@remotion/paths';
\`\`\`

---

### Easing Functions ⚠️

**NEVER use wrapper syntax:**
\`\`\`tsx
// ❌ Wrong — will crash
Easing.out(Easing.cubic)
Easing.in(Easing.quad)
\`\`\`

**ALWAYS use Easing.bezier():**
\`\`\`tsx
// ✅ Correct
const EASINGS = {
  easeOut: Easing.bezier(0.33, 1, 0.68, 1),
  easeIn: Easing.bezier(0.32, 0, 0.67, 0),
  easeInOut: Easing.bezier(0.37, 0, 0.63, 1),
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
};

interpolate(frame, [0, 30], [0, 1], {
  easing: EASINGS.easeOut,
  extrapolateRight: 'clamp',
});
\`\`\`

---

### Animation Rules

1. **ALL animations must be frame-based** — use \`useCurrentFrame()\` and \`interpolate()\`
2. **NEVER use:** \`useState\`, \`useEffect\`, \`setTimeout\`, \`setInterval\`, CSS animations
3. **ALWAYS use:** \`extrapolateLeft: 'clamp'\` and \`extrapolateRight: 'clamp'\`
4. Stagger animations — don't animate everything at once
5. **Composition ID:** PascalCase only, NO hyphens or underscores

---

## Layout Guidelines

### Safe Zones
- **Top 10%:** Reserve for platform UI
- **Bottom 15%:** Reserve for captions/buttons
- **Center content** between 25%–75% vertically

---

## Example video (USING TAILWIND CSS PROPERLY):
import React from 'react';
import {
  useCurrentFrame,
  interpolate,
  Easing,
  AbsoluteFill,
} from 'remotion';

export const compositionConfig = {
  id: 'ProductShowcase',
  durationInSeconds: 6,
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

const ProductShowcase: React.FC = () => {
  const frame = useCurrentFrame();

  const titleY = interpolate(frame, [10, 40], [50, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.33, 1, 0.68, 1) });

  const titleOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const cards = [0, 1, 2].map((i) => {
    const delay = 30 + i * 15;
    const scale = interpolate(frame, [delay, delay + 25], [0.8, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
    const opacity = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return { scale, opacity };
  });

  return (
    <AbsoluteFill className="flex flex-col items-center justify-center p-20" style={{ backgroundColor: COLORS.background, fontFamily: TYPOGRAPHY.fontFamily }}>
      <div className="flex flex-col items-center gap-6 mb-20" style={{ transform: \`translateY(\${titleY}px)\`, opacity: titleOpacity }}>
        <div className="px-6 py-2 rounded-full border border-white/10 shadow-lg" style={{ backgroundColor: COLORS.surface }}>
          <span className="text-sm font-bold tracking-widest uppercase" style={{ color: COLORS.accent }}>
            Vidora Update 2.0
          </span>
        </div>
        <h1 className="text-[100px] font-black m-0 tracking-tight" style={{ color: COLORS.text }}>
          Remotion + Tailwind
        </h1>
      </div>

      <div className="flex items-center justify-center gap-8 w-full max-w-7xl">
        {cards.map((anim, idx) => (
          <div key={idx} className="flex-1 flex flex-col gap-6 p-10 rounded-[32px] border border-white/5 shadow-2xl relative overflow-hidden" style={{ backgroundColor: COLORS.surface, transform: \`scale(\${anim.scale})\`, opacity: anim.opacity }}>
            <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: idx === 1 ? COLORS.secondary : COLORS.primary }} />
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: \`\${COLORS.background}88\` }}>
              <span className="text-3xl font-bold" style={{ color: idx === 1 ? COLORS.secondary : COLORS.primary }}>
                0{idx + 1}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-4xl font-bold m-0" style={{ color: COLORS.text }}>
                {['Zero Config', 'Lightning Fast', 'Beautiful UI'][idx]}
              </h3>
              <p className="text-xl leading-relaxed m-0 opacity-60" style={{ color: COLORS.text }}>
                Используйте utility-классы для стилизации прямо в TSX файлах.
              </p>
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export default ProductShowcase;`

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

Обязательные требования:
1. Разбей сценарий на логические блоки: [Хук] (00:00:00), [Вступление], [Основная часть], [Кульминация], [Заключение]. Укажи примерные таймкоды.
2. В начале каждого фрагмента укажи визуальную ремарку в скобках, например: *(Крупный план: код на экране)* или *(B-roll: серверная стойка)*.
3. Напиши текст для закадрового голоса. Он должен быть динамичным, без ИИ-штампов ("Важно отметить", "Кроме того").
4. Все английские термины напиши русскими буквами (например, "эпл", "пайтон", "энджинкс") для правильной работы синтезатора речи.
5. Верни сценарий строго в формате Markdown.`, 'Scenario Creator')
}

interface SettingsStore {
  globalPrompts: GlobalPromptSettings
  setGlobalPrompts: (prompts: Partial<GlobalPromptSettings>) => void
  resetGlobalPrompts: () => void

  // --- AI: Облако / Локально, движок на каждую задачу ---
  aiMode: 'cloud' | 'local'
  setAiMode: (mode: 'cloud' | 'local') => void

  cloudProvider: 'routerai' | 'aitunnel'
  setCloudProvider: (provider: 'routerai' | 'aitunnel') => void

  cloudEngines: { scenario: string; visual: string; audio: string }
  setCloudEngine: (task: 'scenario' | 'visual' | 'audio', model: string) => void

  localEngines: { scenario: string; visual: string; audio: string }
  setLocalEngine: (task: 'scenario' | 'visual' | 'audio', model: string) => void
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

      aiMode: 'cloud',
      setAiMode: (mode) => set({ aiMode: mode }),

      cloudProvider: 'routerai',
      setCloudProvider: (p) => set({ cloudProvider: p }),

      cloudEngines: {
        scenario: 'anthropic/claude-sonnet-5',
        visual: 'anthropic/claude-sonnet-5',
        audio: 'minimax/speech-2.8-hd',
      },
      setCloudEngine: (task, model) => set((s) => ({ cloudEngines: { ...s.cloudEngines, [task]: model } })),

      localEngines: {
        scenario: 'gemma3:4b',
        visual: 'gemma3:4b',
        audio: 'k2-fsa/OmniVoice',
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
      merge: (persisted, current) => {
        const persistedObj = persisted as Partial<SettingsStore> | undefined
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

        return {
          ...current,
          ...(persistedObj as object),
          globalPrompts: migratedPrompts,
          globalVoices: persistedObj?.globalVoices || [],
          skills: mergedSkills,
          uiPreferences: { ...DEFAULT_UI_PREFS, ...persistedObj?.uiPreferences },
        }
      },
    } satisfies PersistOptions<SettingsStore>
  )
)

