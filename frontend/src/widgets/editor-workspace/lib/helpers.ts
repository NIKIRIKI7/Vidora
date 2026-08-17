import type { ProjectSettings, Scene, SceneFragment } from '@entities/project'
import { generateRemotionPrompt } from './generateRemotionPrompt'
import { normalizeText } from './timingAlgorithms'

import { API, formatTimecode, formatShortTimecode, hashCode, pad, parseTcString, sanitizeFilename } from '@shared/lib'
export { API, formatTimecode, formatShortTimecode, hashCode, pad, parseTcString, sanitizeFilename }

export const getProjectPath = (p: ProjectSettings) => sanitizeFilename(p.name || 'vidora_projects')

export const getWhisperSyncedDuration = (fragments: SceneFragment[]): number | null => {
  const syncedEnds = fragments.map(f => f.endTime).filter((e): e is number => typeof e === 'number' && e > 0)
  return syncedEnds.length > 0 ? Math.max(...syncedEnds) : null
}

export const getSceneDurationFromTimecode = (timecodeStr: string): number | null => {
  if (!timecodeStr) return null
  const rangeMatch = timecodeStr.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)/)
  if (rangeMatch) {
    const start = parseTcString(rangeMatch[1])
    const end = parseTcString(rangeMatch[2])
    if (start !== null && end !== null && end > start) return end - start
  }
  return null
}

export const getVisualNoteDuration = (fragments: SceneFragment[]): number | null => {
  let maxVisualNoteEnd = 0
  fragments.forEach(f => {
    const match = f.visualNote?.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)/)
    if (match) {
      const endSec = parseTcString(match[2])
      if (endSec !== null && endSec > maxVisualNoteEnd) maxVisualNoteEnd = endSec
    }
  })
  return maxVisualNoteEnd > 0 ? maxVisualNoteEnd : null
}

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

export const isCodeDirty = (project: ProjectSettings, scene: Scene) => {
  if (scene.ignoreTsx) return false
  if (!scene.remotionCode) return true
  if (scene.lastCodeHash && scene.lastCodeHash !== hashCode(generateRemotionPrompt(project, scene))) return true
  return false
}

export const concatSceneAudio = async (projectPath: string, title: string, id: string, audioPaths: string[], signal?: AbortSignal) => {
  const sceneAudioPath = `${projectPath}/assets/voice/Scene_${sanitizeFilename(title)}_${id.slice(0, 6)}.wav`
  const res = await fetch(`${API}/api/v1/audio/concat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_paths: audioPaths, output_path: sceneAudioPath }),
    signal,
  })
  if (!res.ok) throw new Error('Concat failed')
  return sceneAudioPath
}

export interface TeleprompterOptions {
  keepEmotionTags?: boolean
  keepPauseSoundTags?: boolean
}

/**
 * Очищает текст для суфлера/TTS:
 * - Всегда удаляет *(визуальные ремарки)* и [instruct: ...]
 * - Если keepEmotionTags = true, оставляет [emotion: ...]
 * - Если keepPauseSoundTags = true, оставляет паузы <#1.0#> и междометия (breath)
 */
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

/**
 * Единый суфлерский текст всей сцены (все фрагменты по порядку)
 */
export const getSceneTeleprompterScript = (scene: Scene, options: boolean | TeleprompterOptions = false): string => {
  return scene.fragments
    .map(f => extractCleanVoiceText(f.text, options))
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Полный суфлерский сценарий проекта без ремарок, разбитый по сценам
 */
export const getProjectTeleprompterScript = (project: ProjectSettings, options: boolean | TeleprompterOptions = false): string => {
  return project.scenes
    .map((scene, i) => {
      const text = getSceneTeleprompterScript(scene, options)
      return text ? `=== Сцена ${i + 1}: ${scene.title} ===\n${text}` : null
    })
    .filter(Boolean)
    .join('\n\n\n')
}
