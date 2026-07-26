import type { ProjectSettings, Scene, SceneFragment } from '@entities/project'
import { generateRemotionPrompt } from './generateRemotionPrompt'

export const API = 'http://127.0.0.1:8355'

export const getProjectPath = (p: ProjectSettings) => sanitizeFilename(p.name || 'vidora_projects')

export const sanitizeFilename = (str: string) => str.trim().replace(/[^a-zA-Z0-9а-яА-Я_\- ]/g, '_')

export const formatTimecode = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const pad = (num: number) => num.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export const formatShortTimecode = (sec: number): string => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${m}:${pad(s)}`
}

export const parseTcString = (str: string): number | null => {
  if (!str) return null
  const parts = str.trim().split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

export const getWhisperSyncedDuration = (fragments: SceneFragment[]): number | null => {
  const syncedEnds = fragments
    .map(f => f.endTime)
    .filter((e): e is number => typeof e === 'number' && e > 0)
  if (syncedEnds.length > 0) {
    return Math.max(...syncedEnds)
  }
  return null
}

export const getSceneDurationFromTimecode = (timecodeStr: string): number | null => {
  if (!timecodeStr) return null
  const rangeMatch = timecodeStr.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)/)
  if (rangeMatch) {
    const start = parseTcString(rangeMatch[1])
    const end = parseTcString(rangeMatch[2])
    if (start !== null && end !== null && end > start) {
      return end - start
    }
  }
  return null
}

export const getVisualNoteDuration = (fragments: SceneFragment[]): number | null => {
  let maxVisualNoteEnd = 0
  fragments.forEach(f => {
    const match = f.visualNote?.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)/)
    if (match) {
      const endSec = parseTcString(match[2])
      if (endSec !== null && endSec > maxVisualNoteEnd) {
        maxVisualNoteEnd = endSec
      }
    }
  })
  if (maxVisualNoteEnd > 0) {
    return maxVisualNoteEnd
  }
  return null
}

export const getAudioPathForScene = (project: ProjectSettings, scene: Scene): string => {
  const projectPath = getProjectPath(project)
  const firstFragAudio = scene.fragments.find(f => f.audioFileName)?.audioFileName
  if (firstFragAudio) {
    if (firstFragAudio.includes('/') || firstFragAudio.includes('\\') || firstFragAudio.includes(':')) {
      return firstFragAudio
    }
    return `${projectPath}/assets/voice/${firstFragAudio}`
  }
  const safeTitle = sanitizeFilename(scene.title)
  return `${projectPath}/assets/voice/Scene_${safeTitle}_${scene.id.slice(0, 6)}.wav`
}

// ponytail: simple string hash, collision risk is theoretical for this use case
export const hashCode = (str: string) => {
  let hash = 0
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return hash.toString()
}

export const isAudioDirty = (frag: SceneFragment) => {
  if (!frag.audioFileName) return true
  if (frag.lastAudioHash && frag.lastAudioHash !== hashCode(frag.text)) return true
  return false
}

export const isCodeDirty = (project: ProjectSettings, scene: Scene) => {
  if (scene.ignoreTsx) return false
  if (!scene.remotionCode) return true
  if (scene.lastCodeHash && scene.lastCodeHash !== hashCode(generateRemotionPrompt(project, scene))) return true
  return false
}
