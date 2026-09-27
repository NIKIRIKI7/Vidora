import { fetchClient, apiErrorMessage } from '@shared/api'
import type { ProjectSettings, Scene, SceneFragment } from '@entities/project'
import { normalizeText } from './timingAlgorithms'
import { API, formatTimecode, formatShortTimecode, hashCode, pad, parseTcString, sanitizeFilename } from '@shared/lib'

export { API, formatTimecode, formatShortTimecode, hashCode, pad, parseTcString, sanitizeFilename }

export const getProjectPath = (p: ProjectSettings) => sanitizeFilename(p.name || 'vidora_projects')

export const getAudioPathForScene = (project: ProjectSettings, scene: Scene): string => {
  const projectPath = getProjectPath(project)
  const firstFragAudio = scene.fragments.find(f => f.audioFileName)?.audioFileName
  if (firstFragAudio) {
    if (firstFragAudio.includes('/') || firstFragAudio.includes('\\') || firstFragAudio.includes(':')) return firstFragAudio
    return `${projectPath}/assets/voice/${firstFragAudio}`
  }
  return `${projectPath}/assets/voice/Scene_${sanitizeFilename(scene.title)}_${scene.id.slice(0, 6)}.wav`
}

export const isAudioDirty = (frag: SceneFragment) => {
  if (!frag.audioFileName) return true
  if (frag.lastAudioTextNormalized !== undefined) {
    if (frag.lastAudioTextNormalized !== normalizeText(frag.text)) return true
  } else {
    if (frag.lastAudioHash && frag.lastAudioHash !== hashCode(frag.text)) return true
  }
  return false
}

export const concatSceneAudio = async (projectPath: string, title: string, id: string, audioPaths: string[], signal?: AbortSignal) => {
  const sceneAudioPath = `${projectPath}/assets/voice/Scene_${sanitizeFilename(title)}_${id.slice(0, 6)}.wav`
  const { error } = await fetchClient.POST('/api/v1/audio/concat', {
    body: { audio_paths: audioPaths, output_path: sceneAudioPath },
    signal,
  })
  if (error) throw new Error(apiErrorMessage(error))
  return sceneAudioPath
}

export interface TeleprompterOptions {
  keepEmotionTags?: boolean
  keepPauseSoundTags?: boolean
}

export const extractCleanVoiceText = (rawText: string, options: boolean | TeleprompterOptions = false): string => {
  if (!rawText) return ''
  const opts: TeleprompterOptions =
    typeof options === 'boolean'
      ? { keepEmotionTags: options, keepPauseSoundTags: options }
      : { keepEmotionTags: false, keepPauseSoundTags: false, ...options }
  let text = rawText.replace(/\*\([\s\S]*?\)\*/g, ' ')
  text = text.replace(/\[instruct:\s*[^\]]+\]/gi, ' ')
  if (!opts.keepEmotionTags) {
    text = text.replace(/\[emotion:\s*[^\]]+\]/gi, ' ')
  }
  if (!opts.keepPauseSoundTags) {
    text = text.replace(/<#[\d.]+#>/g, ' ')
    text = text.replace(/\((?:breath|inhale|exhale|sighs|chuckle|laughs|clear-throat|emm|coughs|groans|gasps|sniffs)\)/gi, ' ')
  }
  return text.replace(/\s+/g, ' ').trim()
}

export const getSceneTeleprompterScript = (scene: Scene, options: boolean | TeleprompterOptions = false): string => {
  return scene.fragments
    .map(f => extractCleanVoiceText(f.text, options))
    .filter(Boolean)
    .join('\n\n')
}

export const getProjectTeleprompterScript = (project: ProjectSettings, options: boolean | TeleprompterOptions = false): string => {
  return project.scenes
    .map((scene, i) => {
      const text = getSceneTeleprompterScript(scene, options)
      return text ? `=== Сцена ${i + 1}: ${scene.title} ===\n${text}` : null
    })
    .filter(Boolean)
    .join('\n\n\n')
}
