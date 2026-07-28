import { useSettingsStore } from '@entities/project'
import type { ProjectSettings, Scene, SceneFragment, VideoFormat, Resolution } from '@entities/project'

const getDims = (res: Resolution, fmt: VideoFormat) => {
  const map = { '1080p': 1920, '1440p': 2560, '2160p': 3840 }
  const long = map[res]
  const short = long * (9 / 16)
  return fmt === '16:9' ? { width: long, height: short } : { width: short, height: long }
}

const getBaseVars = (project: ProjectSettings) => {
  const { width, height } = getDims(project.resolution, project.format)
  const { colors, fps } = project.montage
  return {
    FORMAT: project.format,
    WIDTH: width,
    HEIGHT: height,
    FPS: fps,
    COLORS: JSON.stringify(colors),
  }
}

const replaceVars = (tpl: string, vars: Record<string, string | number>) => {
  let res = tpl
  for (const [k, v] of Object.entries(vars)) {
    res = res.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
  }
  return res
}

// ponytail: uses max endTime from Whisper sync for duration; falls back to heuristic
const getSceneDuration = (fragments: SceneFragment[]): number => {
  const syncedEnds = fragments.map(f => f.endTime).filter((e): e is number => typeof e === 'number' && e > 0)
  if (syncedEnds.length > 0) return Math.max(...syncedEnds)
  return fragments.reduce((acc, f) => acc + Math.max(f.text.split(' ').length / 2.5, 1.0), 0)
}

export const generateRemotionPrompt = (project: ProjectSettings, scene: Scene): string => {
  const globalPrompts = useSettingsStore.getState().globalPrompts
  const durationSec = getSceneDuration(scene.fragments)

  return replaceVars(project.promptOverrides?.scene || globalPrompts.scene, {
    ...getBaseVars(project),
    DURATION: durationSec.toFixed(1),
    DURATION_FRAMES: Math.max(Math.ceil(durationSec * Number(project.montage.fps)), 30),
    SCENE_TITLE: scene.title,
    SCENE_TIMECODE: scene.timecode,
    FRAGMENTS: scene.fragments.map((frag, i) => `- Фрагмент ${i + 1}:\nТайминг: ${(frag.startTime ?? 0).toFixed(2)} - ${(frag.endTime ?? 5).toFixed(2)}с\nВизуал: ${frag.visualNote}\nСуфлер: "${frag.text}"`).join('\n')
  })
}

export const generateFragmentPrompt = (project: ProjectSettings, scene: Scene, fragment: SceneFragment): string => {
  const globalPrompts = useSettingsStore.getState().globalPrompts
  const durationSec = Math.max((fragment.endTime || 5) - (fragment.startTime || 0), 1)

  return replaceVars(project.promptOverrides?.fragment || globalPrompts.fragment, {
    ...getBaseVars(project),
    DURATION: durationSec.toFixed(1),
    DURATION_FRAMES: Math.max(Math.ceil(durationSec * Number(project.montage.fps)), 30),
    SCENE_TITLE: scene.title,
    VISUAL_NOTE: fragment.visualNote,
    TEXT: fragment.text,
  })
}

export const generateProjectPrompt = (project: ProjectSettings): string => {
  const globalPrompts = useSettingsStore.getState().globalPrompts

  const scenesList = project.scenes.map((scene, si) => {
    const duration = getSceneDuration(scene.fragments)
    return `### Сцена ${si + 1}: ${scene.title}\nТаймкод: ${scene.timecode} | Длительность: ~${Math.ceil(duration)}с\n${scene.fragments.map((frag, i) => `- Фрагмент ${i + 1}: "${frag.text}"\n  Визуал: ${frag.visualNote}`).join('\n')}`
  }).join('\n\n')

  return replaceVars(project.promptOverrides?.project || globalPrompts.project, {
    ...getBaseVars(project),
    SCENES_LIST: scenesList
  })
}
