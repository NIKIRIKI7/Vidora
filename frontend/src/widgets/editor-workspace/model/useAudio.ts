import { useState, useEffect } from 'react'
import { API, getProjectPath, getAudioPathForScene, sanitizeFilename, hashCode, formatShortTimecode, formatTimecode, concatSceneAudio } from '@widgets/editor-workspace/lib/helpers'
import type { ProjectSettings, Scene, SceneFragment, CustomVoice, ApiKeys } from '@entities/project'
import type { FragmentTiming } from './types'

export interface AudioOptions {
  voiceModel: string
  speed: number
  numSteps: number
  guidanceScale: number
  duration: number
  denoise: boolean
  preprocessPrompt: boolean
  postprocessOutput: boolean
  autoOffloadVram: boolean
  ttsEngine: string
  apiKeys: ApiKeys
  customVoices?: CustomVoice[]
}

const getVoicePayload = (frag: SceneFragment, scene: Scene, project: ProjectSettings, opts: AudioOptions) => {
  const customVoice = opts.customVoices?.find(v => v.id === opts.voiceModel)
  return {
    fragment_id: frag.id, file_prefix: `Frag_${sanitizeFilename(scene.title)}`, text: frag.text,
    voice_model: customVoice ? 'clone' : opts.voiceModel, ref_audio_path: customVoice?.refAudioPath || null, ref_text: customVoice?.refText || null,
    speed: opts.speed, num_steps: opts.numSteps, guidance_scale: opts.guidanceScale, duration: opts.duration,
    denoise: opts.denoise, preprocess_prompt: opts.preprocessPrompt, postprocess_output: opts.postprocessOutput,
    project_path: getProjectPath(project), auto_offload_vram: opts.autoOffloadVram, engine: opts.ttsEngine, api_keys: opts.apiKeys,
  }
}

export const useAudio = ({ project, onUpdateProject, activeScene, activeSceneId, voiceOpts, useWhisper, autoOffloadVram, showNotification, abortControllerRef }: {
  project: ProjectSettings, onUpdateProject: (p: ProjectSettings) => void, activeScene?: Scene, activeSceneId?: string, voiceOpts: AudioOptions, useWhisper: boolean, autoOffloadVram: boolean, showNotification: (msg: string, type?: 'success'|'error'|'info') => void, abortControllerRef: React.MutableRefObject<AbortController | null>
}) => {
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [audioLoaded, setAudioLoaded] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false
    if (!activeScene) {
      Promise.resolve().then(() => { if (!isCancelled) setAudioLoaded(null) })
      return
    }
    const expectedPath = getAudioPathForScene(project, activeScene)
    fetch(`${API}/api/v1/render/media?path=${encodeURIComponent(expectedPath)}`, { method: 'HEAD' })
      .then(res => { if (!isCancelled) setAudioLoaded(res.ok ? expectedPath : null) })
      .catch(() => { if (!isCancelled) setAudioLoaded(null) })
    return () => { isCancelled = true }
  }, [activeScene, project])

  const handleProcessAudio = async (action: string, scope: 'scene' | 'project', targetSceneId?: string) => {
    setIsGeneratingAudio(true)
    abortControllerRef.current = new AbortController()
    let successCount = 0
    try {
      const projectPath = getProjectPath(project)
      const targetScenes = scope === 'scene' ? (targetSceneId ? project.scenes.filter(s => s.id === targetSceneId) : (activeScene ? [activeScene] : [])) : project.scenes
      if (targetScenes.length === 0) { showNotification('Нет сцен для обработки', 'error'); return }
      
      for (const scene of targetScenes) {
        if (abortControllerRef.current.signal.aborted) break
        const res = await fetch(`${API}/api/v1/audio/process`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene_id: scene.id, audio_path: getAudioPathForScene(project, scene), action, project_path: projectPath }),
          signal: abortControllerRef.current.signal,
        })
        if ((await res.json()).status === 'ok') successCount++
      }
      
      if (!abortControllerRef.current.signal.aborted) {
        showNotification(`Обработка "${action}" завершена (${successCount}/${targetScenes.length})`, 'success')
        if (activeSceneId) {
          const active = project.scenes.find(s => s.id === activeSceneId)
          if (active) setTimeout(() => setAudioLoaded(getAudioPathForScene(project, active)), 500)
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') showNotification('Ошибка обработки аудио', 'error')
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  const runVoiceGenFragment = async (sceneId: string, fragId: string) => {
    setIsGeneratingAudio(true)
    try {
      const scene = project.scenes.find(s => s.id === sceneId)
      const frag = scene?.fragments.find(f => f.id === fragId)
      if (!scene || !frag) return

      const res = await fetch(`${API}/api/v1/audio/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getVoicePayload(frag, scene, project, voiceOpts)) })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        const projectPath = getProjectPath(project)
        const relativeAudioPath = `${projectPath}/assets/voice/${data.audio_url}`
        const updatedScene = { ...scene, fragments: scene.fragments.map(f => f.id === frag.id ? { ...f, audioFileName: relativeAudioPath, lastAudioHash: hashCode(frag.text) } : f) }
        const audioPaths = updatedScene.fragments.map(f => f.audioFileName).filter(Boolean) as string[]
        if (audioPaths.length > 0) {
          updatedScene.fragments[0].audioFileName = await concatSceneAudio(projectPath, scene.title, scene.id, audioPaths)
        }
        onUpdateProject({ ...project, scenes: project.scenes.map(s => s.id === scene.id ? updatedScene : s) })
        showNotification('Фрагмент успешно переозвучен!', 'success')
      }
    } catch {
      showNotification('Ошибка переозвучки', 'error')
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  const runVoiceGenAllScenes = async (scenesToProcess?: Scene[]) => {
    const targetScenes = Array.isArray(scenesToProcess) ? scenesToProcess : project.scenes
    if (!targetScenes.length) return { scenes: [], activeAudio: null }
    
    setIsGeneratingAudio(true)
    abortControllerRef.current = new AbortController()
    try {
      const projectPath = getProjectPath(project)
      const updatedScenes = [...targetScenes]
      let activeAudioPath: string | null = null
      let successCount = 0

      for (let idx = 0; idx < updatedScenes.length; idx++) {
        if (abortControllerRef.current?.signal.aborted) break
        const scene = updatedScenes[idx]
        const audioPaths: string[] = []
        for (let fIdx = 0; fIdx < scene.fragments.length; fIdx++) {
          const frag = scene.fragments[fIdx]
          if (!frag.text.trim()) continue
          const res = await fetch(`${API}/api/v1/audio/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getVoicePayload(frag, scene, project, voiceOpts)), signal: abortControllerRef.current.signal,
          })
          const data = await res.json()
          if (res.ok && data.status === 'ok') {
            const p = `${projectPath}/assets/voice/${data.audio_url}`
            frag.audioFileName = p
            frag.lastAudioHash = hashCode(frag.text)
            audioPaths.push(p)
          }
        }
        if (audioPaths.length > 0) {
          successCount++
          scene.fragments[0].audioFileName = await concatSceneAudio(projectPath, scene.title, scene.id, audioPaths, abortControllerRef.current.signal)
          if (activeSceneId && scene.id === activeSceneId) activeAudioPath = scene.fragments[0].audioFileName
        }
      }
      onUpdateProject({ ...project, scenes: updatedScenes })
      if (activeAudioPath) setAudioLoaded(activeAudioPath)
      if (!abortControllerRef.current?.signal.aborted) showNotification(`Озвучка сгенерирована (${successCount}/${targetScenes.length})!`, 'success')
      return { scenes: updatedScenes, activeAudio: activeAudioPath }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') showNotification('Сбой генерации голоса', 'error')
      return { scenes: targetScenes, activeAudio: null }
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  const runSyncAllScenes = async (scenesToSync?: Scene[]) => {
    const targetScenes = Array.isArray(scenesToSync) ? scenesToSync : project.scenes
    setIsSyncing(true)
    abortControllerRef.current = new AbortController()
    try {
      let cumulativeTime = 0
      const updatedScenes: Scene[] = []
      let [wCount, fCount] = [0, 0]
      for (const scene of targetScenes) {
        if (abortControllerRef.current?.signal.aborted) break
        const res = await fetch(`${API}/api/v1/audio/sync`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene_id: scene.id, audio_path: getAudioPathForScene(project, scene),
            fragments: scene.fragments.map(f => ({ id: f.id, text: f.text })),
            project_path: getProjectPath(project), use_whisper: useWhisper, auto_offload_vram: autoOffloadVram,
          }),
          signal: abortControllerRef.current.signal,
        })
        const data = await res.json()

        if (data.fallback) {
          fCount++
        } else {
          wCount++
        }
        
        let syncedFragments = [...scene.fragments]
        let sceneDuration = 0
        if (data.status === 'ok' && data.fragments_timings) {
          const timingMap = Object.fromEntries(data.fragments_timings.map((t: FragmentTiming) => [t.id, t]))
          syncedFragments = scene.fragments.map(f => {
            const t = timingMap[f.id]
            if (!t) return f
            const tcRegex = /^(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?):?\s*/
            return { ...f, startTime: t.startTime, endTime: t.endTime, visualNote: tcRegex.test(f.visualNote) ? f.visualNote.replace(tcRegex, `${formatShortTimecode(t.startTime)} - ${formatShortTimecode(t.endTime)}: `) : f.visualNote }
          })
          sceneDuration = Math.max(...syncedFragments.map(f => f.endTime || 0), 0)
        }
        if (sceneDuration <= 0) sceneDuration = scene.fragments.reduce((acc, f) => acc + Math.max(f.text.split(' ').length / 2.5, 1.0), 0)
        updatedScenes.push({ ...scene, timecode: formatTimecode(cumulativeTime), fragments: syncedFragments })
        cumulativeTime += sceneDuration
      }
      onUpdateProject({ ...project, scenes: updatedScenes })
      if (!abortControllerRef.current?.signal.aborted) showNotification(`Синхронизация завершена (Whisper: ${wCount}, Fallback: ${fCount})`, fCount > 0 && wCount === 0 ? 'info' : 'success')
      return updatedScenes
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') showNotification('Сбой синхронизации', 'error')
      return targetScenes
    } finally {
      setIsSyncing(false)
    }
  }

  const handleUnloadVram = async () => {
    try {
      const res = await fetch(`${API}/api/v1/audio/vram/unload`, { method: 'POST' })
      if (res.ok) showNotification('VRAM память видеокарты очищена!', 'success')
    } catch { showNotification('Ошибка очистки VRAM', 'error') }
  }

  const handleResetAudio = () => {
    const updatedScenes = project.scenes.map(s => ({
      ...s, fragments: s.fragments.map(f => ({ ...f, audioFileName: undefined, lastAudioHash: undefined }))
    }))
    onUpdateProject({ ...project, scenes: updatedScenes })
    setAudioLoaded(null)
    showNotification('Аудио сброшено для всех сцен', 'info')
  }

  const handleResetAllSync = () => {
    const updatedScenes = project.scenes.map(s => ({
      ...s, timecode: '00:00:00', fragments: s.fragments.map(f => ({ ...f, startTime: null, endTime: null }))
    }))
    onUpdateProject({ ...project, scenes: updatedScenes })
    showNotification('Синхронизация сброшена для всех сцен', 'info')
  }

  return { isGeneratingAudio, isSyncing, audioLoaded, setAudioLoaded, handleProcessAudio, runVoiceGenFragment, runVoiceGenAllScenes, runSyncAllScenes, handleUnloadVram, handleResetAudio, handleResetAllSync }
}
