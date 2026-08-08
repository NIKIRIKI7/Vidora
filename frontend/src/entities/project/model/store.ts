import { create } from 'zustand'
import { persist, type PersistOptions } from 'zustand/middleware'
import type { ProjectSettings, PromptTemplates, ApiKeys, GlobalVoice } from './types'

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

## Code Structure (MANDATORY)
\`\`\`tsx
import React from 'react';
import { 
 useCurrentFrame, 
 useVideoConfig, 
 interpolate, 
 Easing, 
 AbsoluteFill,
 Sequence 
} from 'remotion';

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
// PRE-GENERATED DATA (computed once, NOT during render)
// =============================================================================
const seededRandom = (seed: number): number => {
 const x = Math.sin(seed * 9999) * 10000;
 return x - Math.floor(x);
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const ComponentName: React.FC = () => {
 const frame = useCurrentFrame();
 const { fps, durationInFrames, width, height } = useVideoConfig();

 return (
  <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
   {/* Content */}
  </AbsoluteFill>
 );
};

export default ComponentName;
\`\`\`

---

## Style Presets

Apply these when user specifies a style:

### Minimalist (default)
\`\`\`tsx
const COLORS = {
 primary: '#18181B',
 secondary: '#71717A',
 accent: '#3B82F6',
 background: '#FAFAFA',
 text: '#18181B',
};
// Characteristics: Maximum whitespace, subtle animations, thin fonts, no decorative elements
\`\`\`

### Memphis
\`\`\`tsx
const COLORS = {
 primary: '#FF6B6B',
 secondary: '#4ECDC4',
 accent: '#FFE66D',
 background: '#F7FFF7',
 text: '#2D3436',
};
// Characteristics: Geometric shapes (triangles, circles, squiggles), bold black outlines, scattered elements, confetti particles
\`\`\`

### Neo-brutalism
\`\`\`tsx
const COLORS = {
 primary: '#FF5C00',
 secondary: '#3B82F6',
 accent: '#FACC15',
 background: '#FFFFFF',
 text: '#000000',
};
// Characteristics: Harsh black borders (3-4px), solid color blocks, offset box shadows (4px 4px 0px #000), raw aesthetic
\`\`\`

### Glassmorphism
\`\`\`tsx
const COLORS = {
 primary: '#FFFFFF',
 secondary: '#A855F7',
 accent: '#06B6D4',
 background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
 text: '#FFFFFF',
};
// Characteristics: Frosted glass (backdrop-filter: blur), transparency, subtle borders, gradient backgrounds
\`\`\`

### Neon/Cyberpunk
\`\`\`tsx
const COLORS = {
 primary: '#FF00FF',
 secondary: '#00FFFF',
 accent: '#FFFF00',
 background: '#0A0A0F',
 text: '#FFFFFF',
};
// Characteristics: Dark backgrounds, glowing effects (box-shadow with color), scanlines, tech-inspired elements
\`\`\`

### Corporate
\`\`\`tsx
const COLORS = {
 primary: '#1E40AF',
 secondary: '#3B82F6',
 accent: '#10B981',
 background: '#F8FAFC',
 text: '#1E293B',
};
// Characteristics: Professional, clean, trustworthy blues, structured layouts, subtle gradients
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

**Index-based timing — ensure startFrame < endFrame:**
\`\`\`tsx
// ✅ Correct
const startFrame = index * 30;
const endFrame = startFrame + 30;
interpolate(frame, [startFrame, endFrame], [0, 1], {
 extrapolateLeft: 'clamp',
 extrapolateRight: 'clamp',
});
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

**Use hand-written SVG path strings:**
\`\`\`tsx
// ✅ Correct
const circlePath = 'M 50 10 A 40 40 0 1 1 49.99 10 Z';
const rectPath = 'M 0 0 L 100 0 L 100 50 L 0 50 Z';
const linePath = 'M 0 0 L 100 100';

const { strokeDasharray, strokeDashoffset } = evolvePath(progress, rectPath);
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
5. **Composition ID**: PascalCase only, NO hyphens or underscores

---

## Layout Guidelines

### Safe Zones
- **Top 10%:** Reserve for platform UI
- **Bottom 15%:** Reserve for captions/buttons
- **Center content** between 25%–75% vertically

### Centering
\`\`\`tsx
const centered: React.CSSProperties = {
 position: 'absolute',
 top: '50%',
 left: '50%',
 transform: 'translate(-50%, -50%)',
};
\`\`\`

---

## Typography

| Element | Size | Weight |
|---------|------|--------|
| Headlines | 72–120px | 700–900 |
| Subheadlines | 36–48px | 500–700 |
| Body | 28–36px | 400–500 |

**Always set \`margin: 0\` on text elements.**`

export const DEFAULT_PROMPTS: PromptTemplates = {
  scene: `${REMOTION_EXPERT_PROMPT}

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

Generate ONLY the complete TSX code for this scene. No markdown wrapping outside the code block, no explanations.`,
  fragment: `${REMOTION_EXPERT_PROMPT}

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

Generate ONLY the complete TSX code for this fragment. No markdown wrapping outside the code block, no explanations.`,
  project: `${REMOTION_EXPERT_PROMPT}

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

Generate ONLY the complete TSX code for the entire project. No markdown wrapping outside the code block, no explanations.`,
  fixPacing: `Эта сцена слишком скучная и медленная (кадр меняется лишь раз в {{CURRENT_PACING}} сек, а нужно не реже чем раз в {{THRESHOLD}} сек).\nПожалуйста, перепиши эту сцену, чтобы она стала динамичнее. Разбей длинные фрагменты текста на более короткие и добавь к каждому новому фрагменту визуальную ремарку *(В таких скобках)*. Текст озвучки менять не нужно, просто добавь больше смен кадра (B-roll, зум, анимация).\n\nИсходная сцена:\n{{SCENE_MARKDOWN}}\n\nВерни только исправленный Markdown-код сцены:`
}

interface SettingsStore {
  globalPrompts: PromptTemplates
  setGlobalPrompts: (prompts: Partial<PromptTemplates>) => void
  resetGlobalPrompts: () => void

  // --- AI: Облако / Локально, движок на каждую задачу ---
  aiMode: 'cloud' | 'local'
  setAiMode: (mode: 'cloud' | 'local') => void

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

      cloudEngines: {
        scenario: 'anthropic/claude-3.5-sonnet',
        visual: 'google/gemini-2.5-flash',
        audio: 'minimax/speech-01-hd',
      },
      setCloudEngine: (task, model) => set((s) => ({ cloudEngines: { ...s.cloudEngines, [task]: model } })),

      localEngines: {
        scenario: 'qwen2.5-coder',
        visual: 'qwen2.5-coder',
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

      uiPreferences: DEFAULT_UI_PREFS,
      setUiPreferences: (p) => set((s) => ({ uiPreferences: { ...s.uiPreferences, ...p } })),
    }),
    {
      name: 'vidora-settings',
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
        globalPrompts: { ...DEFAULT_PROMPTS, ...(persisted as Partial<SettingsStore>)?.globalPrompts },
        globalVoices: (persisted as Partial<SettingsStore>)?.globalVoices || [],
        uiPreferences: { ...DEFAULT_UI_PREFS, ...(persisted as Partial<SettingsStore>)?.uiPreferences },
      }),
    } satisfies PersistOptions<SettingsStore>
  )
)
