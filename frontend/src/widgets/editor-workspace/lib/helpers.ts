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

// Фоллбэк-компонент: рендерит сцену без сгенерированного кода.
// B-Roll фрагменты вставляются через <OffthreadVideo>, остальные — текстовая плашка.
export const generateDefaultSceneTsx = (project: ProjectSettings, scene: Scene): string => {
  const fps = Number(project.montage?.fps) || 30
  const isVertical = project.format === '9:16'
  const width = isVertical ? 1080 : 1920
  const height = isVertical ? 1920 : 1080

  const syncedEnd = scene.fragments.reduce((acc, f) => Math.max(acc, f.endTime || 0), 0)
  const fallbackDur = scene.fragments.reduce((acc, f) => acc + Math.max((f.text || '').split(' ').length / 2.5, 3.0), 0)
  const durationInFrames = Math.max(Math.ceil(Math.max(syncedEnd, fallbackDur, 5) * fps), 30)

  let runningStart = 0
  const sequences = scene.fragments.map((frag, i) => {
    const startSec = frag.startTime ?? runningStart
    const durSec = Math.max(0.5, (frag.endTime ?? startSec + 3.0) - startSec)
    runningStart = startSec + durSec

    const startFrame = Math.round(startSec * fps)
    const durFrames = Math.max(1, Math.round(durSec * fps))
    const text = frag.text ? JSON.stringify(frag.text) : ''

    if (frag.bRollFileName) {
      const cleanFile = frag.bRollFileName.replace(/^assets\/b-roll\//, '')
      return `      <Sequence from={${startFrame}} durationInFrames={${durFrames}}>
        <AbsoluteFill className="bg-black">
          <OffthreadVideo src={staticFile("assets/b-roll/${cleanFile}")} className="w-full h-full object-cover" />
          ${text ? `          <AbsoluteFill className="flex items-end justify-center p-12 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
            <p className="text-3xl font-bold text-white text-center drop-shadow-xl max-w-4xl">{${text}}</p>
          </AbsoluteFill>` : ''}
        </AbsoluteFill>
      </Sequence>`
    }

    const note = frag.visualNote ? JSON.stringify(frag.visualNote) : JSON.stringify(`Фрагмент ${i + 1}`)
    return `      <Sequence from={${startFrame}} durationInFrames={${durFrames}}>
        <AbsoluteFill className="flex flex-col items-center justify-center p-16 bg-[#0b1326]">
          <h2 className="text-5xl font-black text-white text-center mb-4">{${note}}</h2>
          ${text ? `          <p className="text-2xl text-slate-300 text-center max-w-3xl">{${text}}</p>` : ''}
        </AbsoluteFill>
      </Sequence>`
  }).join('\n')

  return `import React from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, staticFile } from 'remotion';

export const compositionConfig = {
  id: 'Scene_${scene.id.slice(0, 6)}',
  durationInFrames: ${durationInFrames},
  fps: ${fps},
  width: ${width},
  height: ${height},
};

export const Scene: React.FC = () => {
  return (
    <AbsoluteFill className="bg-black">
${sequences}
    </AbsoluteFill>
  );
};

export default Scene;
`
}
