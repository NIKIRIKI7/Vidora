import { useSettingsStore } from '@entities/project'
import type { ProjectSettings, Scene, SceneFragment, VideoFormat, Resolution } from '@entities/project'

const getDims = (res: Resolution, fmt: VideoFormat) => {
  const map = { '1080p': 1920, '1440p': 2560, '2160p': 3840 }
  const long = map[res]
  const short = long * (9 / 16)
  return fmt === '16:9' ? { width: long, height: short } : { width: short, height: long }
}

export const generateRemotionPrompt = (project: ProjectSettings, scene: Scene): string => {
  const globalPrompts = useSettingsStore.getState().globalPrompts
  const tpl = project.promptOverrides?.scene || globalPrompts.scene
  
  const { colors, fps } = project.montage
  const { width, height } = getDims(project.resolution, project.format)
  const durationSec = scene.fragments.reduce((acc, f) => acc + ((f.endTime || 5) - (f.startTime || 0)), 0) || 5
  const durationFrames = Math.ceil(durationSec * Number(fps))
  const fragmentsText = scene.fragments.map((frag, i) => `- Фрагмент ${i + 1}:\nТайминг: ${(frag.startTime ?? 0).toFixed(2)} - ${(frag.endTime ?? 5).toFixed(2)}с\nВизуал: ${frag.visualNote}\nСуфлер: "${frag.text}"`).join('\n')

  return tpl
    .replace(/\{\{FORMAT\}\}/g, project.format)
    .replace(/\{\{WIDTH\}\}/g, width.toString())
    .replace(/\{\{HEIGHT\}\}/g, height.toString())
    .replace(/\{\{DURATION\}\}/g, durationSec.toFixed(1))
    .replace(/\{\{DURATION_FRAMES\}\}/g, durationFrames.toString())
    .replace(/\{\{FPS\}\}/g, fps.toString())
    .replace(/\{\{COLORS\}\}/g, JSON.stringify(colors))
    .replace(/\{\{SCENE_TITLE\}\}/g, scene.title)
    .replace(/\{\{SCENE_TIMECODE\}\}/g, scene.timecode)
    .replace(/\{\{FRAGMENTS\}\}/g, fragmentsText)
}

export const generateFragmentPrompt = (project: ProjectSettings, scene: Scene, fragment: SceneFragment): string => {
  const globalPrompts = useSettingsStore.getState().globalPrompts
  const tpl = project.promptOverrides?.fragment || globalPrompts.fragment
  
  const { colors, fps } = project.montage
  const { width, height } = getDims(project.resolution, project.format)
  const durationSec = (fragment.endTime || 5) - (fragment.startTime || 0) || 5
  const durationFrames = Math.ceil(durationSec * Number(fps))

  return tpl
    .replace(/\{\{FORMAT\}\}/g, project.format)
    .replace(/\{\{WIDTH\}\}/g, width.toString())
    .replace(/\{\{HEIGHT\}\}/g, height.toString())
    .replace(/\{\{DURATION\}\}/g, durationSec.toFixed(1))
    .replace(/\{\{DURATION_FRAMES\}\}/g, durationFrames.toString())
    .replace(/\{\{FPS\}\}/g, fps.toString())
    .replace(/\{\{COLORS\}\}/g, JSON.stringify(colors))
    .replace(/\{\{SCENE_TITLE\}\}/g, scene.title)
    .replace(/\{\{VISUAL_NOTE\}\}/g, fragment.visualNote)
    .replace(/\{\{TEXT\}\}/g, fragment.text)
}

export const generateProjectPrompt = (project: ProjectSettings): string => {
  const globalPrompts = useSettingsStore.getState().globalPrompts
  const tpl = project.promptOverrides?.project || globalPrompts.project
  
  const { colors, fps } = project.montage
  const { width, height } = getDims(project.resolution, project.format)
  
  const scenesList = project.scenes.map((scene, si) => {
    const duration = scene.fragments.reduce((acc, f) => acc + ((f.endTime || 5) - (f.startTime || 0)), 0) || 5
    return `### Сцена ${si + 1}: ${scene.title}\nТаймкод: ${scene.timecode} | Длительность: ~${Math.ceil(duration)}с\n${scene.fragments.map((frag, i) => `- Фрагмент ${i + 1}: "${frag.text}"\n  Визуал: ${frag.visualNote}`).join('\n')}`
  }).join('\n\n')

  return tpl
    .replace(/\{\{FORMAT\}\}/g, project.format)
    .replace(/\{\{WIDTH\}\}/g, width.toString())
    .replace(/\{\{HEIGHT\}\}/g, height.toString())
    .replace(/\{\{FPS\}\}/g, fps.toString())
    .replace(/\{\{COLORS\}\}/g, JSON.stringify(colors))
    .replace(/\{\{SCENES_LIST\}\}/g, scenesList)
}
