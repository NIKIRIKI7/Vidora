import { useState, useEffect } from 'react'
import { API, getProjectPath, getAudioPathForScene, sanitizeFilename, hashCode, formatShortTimecode, formatTimecode, concatSceneAudio } from '@widgets/editor-workspace/lib/helpers'
import { normalizeText, recalculateTimingsProportionally } from '@widgets/editor-workspace/lib/timingAlgorithms'
import type { ProjectSettings, Scene, SceneFragment, CustomVoice, ApiKeys } from '@entities/project'
import { useSettingsStore } from '@entities/project'
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
  designPrompt?: string
}

const getVoicePayload = (frag: SceneFragment, scene: Scene, project: ProjectSettings, opts: AudioOptions) => {
  let finalVoiceModel = opts.voiceModel
  let finalSpeed = opts.speed
  let finalNumSteps = opts.numSteps
  let finalGuidanceScale = opts.guidanceScale
  let finalTtsEngine = opts.ttsEngine
  let finalRefAudioPath: string | null = null
  let finalRefText: string | null = null
  let finalDesignPrompt: string | null = opts.designPrompt || null

  if (project.activeGlobalVoiceId) {
    const { globalVoices } = useSettingsStore.getState()
    const gv = globalVoices.find(v => v.id === project.activeGlobalVoiceId)
    if (gv) {
      finalVoiceModel = gv.voiceModel
      finalSpeed = gv.settings.speed
      finalNumSteps = gv.settings.numSteps
      finalGuidanceScale = gv.settings.guidanceScale
      finalTtsEngine = gv.ttsEngine
      if (gv.refAudioPath) {
        finalVoiceModel = 'clone'
        finalRefAudioPath = gv.refAudioPath
        finalRefText = gv.refText || null
      } else if (gv.voiceModel === 'design') {
        finalVoiceModel = 'design'
        finalDesignPrompt = gv.designPrompt || null
      } else if (!['aria', 'marcus', 'nova'].includes(gv.voiceModel) && (gv.ttsEngine === 'omnivoice' || gv.ttsEngine.toLowerCase().includes('omnivoice'))) {
        finalVoiceModel = 'aria' // Защита от старых багованных сохранений
      }
    }
  } else {
    const customVoice = opts.customVoices?.find(v => v.id === finalVoiceModel)
    if (customVoice) {
      finalVoiceModel = 'clone'
      finalRefAudioPath = customVoice.refAudioPath
      finalRefText = customVoice.refText
      finalDesignPrompt = customVoice.designPrompt || null
    }
  }

  return {
    fragment_id: frag.id, file_prefix: `Frag_${sanitizeFilename(scene.title)}`, text: frag.text,
    voice_model: finalVoiceModel,
    ref_audio_path: finalRefAudioPath,
    ref_text: finalRefText,
    design_prompt: finalDesignPrompt,
    speed: finalSpeed, num_steps: finalNumSteps, guidance_scale: finalGuidanceScale, duration: opts.duration,
    denoise: opts.denoise, preprocess_prompt: opts.preprocessPrompt, postprocess_output: opts.postprocessOutput,
    project_path: getProjectPath(project), auto_offload_vram: opts.autoOffloadVram, engine: finalTtsEngine, api_keys: opts.apiKeys,
  }
}

export const useAudio = ({ project, onUpdateProject, activeScene, activeSceneId, voiceOpts, useWhisper, autoOffloadVram, showNotification, abortControllerRef }: {
  project: ProjectSettings, onUpdateProject: (p: ProjectSettings) => void, activeScene?: Scene, activeSceneId?: string, voiceOpts: AudioOptions, useWhisper: boolean, autoOffloadVram: boolean, showNotification: (msg: string, type?: 'success'|'error'|'info') => void, abortControllerRef: React.MutableRefObject<AbortController | null>
}) => {
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [audioLoaded, setAudioLoaded] = useState<string | null>(null)

  const expectedPath = activeScene ? getAudioPathForScene(project, activeScene) : null;

  useEffect(() => {
    let isCancelled = false
    if (!expectedPath) {
      Promise.resolve().then(() => { if (!isCancelled) setAudioLoaded(null) })
      return
    }
    fetch(`${API}/api/v1/render/media?path=${encodeURIComponent(expectedPath)}`, { method: 'HEAD' })
      .then(res => { if (!isCancelled) setAudioLoaded(res.ok ? expectedPath : null) })
      .catch(() => { if (!isCancelled) setAudioLoaded(null) })
    return () => { isCancelled = true }
  }, [expectedPath])

  const handleProcessAdvancedSilence = async (scope: 'scene' | 'project', targetSceneId?: string) => {
    setIsGeneratingAudio(true)
    abortControllerRef.current = new AbortController()
    let successCount = 0
    try {
      const projectPath = getProjectPath(project)
      const targetScenes = scope === 'scene' ? (targetSceneId ? project.scenes.filter(s => s.id === targetSceneId) : (activeScene ? [activeScene] : [])) : project.scenes
      if (targetScenes.length === 0) { showNotification('Нет сцен для обработки', 'error'); return }

      const audioProc = project.audioProcessing || { silenceThresholdDb: -45.0, minSilenceMs: 200, maxSilenceMs: 100, removeEdges: false }
      const processedTargetScenes: Scene[] = []

      for (const scene of targetScenes) {
        if (abortControllerRef.current.signal.aborted) break
        const res = await fetch(`${API}/api/v1/audio/process/advanced-silence`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene_id: scene.id,
            audio_path: getAudioPathForScene(project, scene),
            project_path: projectPath,
            threshold_db: audioProc.silenceThresholdDb,
            min_silence_ms: audioProc.minSilenceMs,
            max_silence_ms: audioProc.maxSilenceMs,
            remove_edges: audioProc.removeEdges,
          }),
          signal: abortControllerRef.current.signal,
        })
        const data = await res.json()
        if (data.status === 'ok') {
          successCount++
          const newFragments = recalculateTimingsProportionally(scene.fragments, data.new_duration_sec)
          processedTargetScenes.push({ ...scene, fragments: newFragments })
        }
      }
      if (!abortControllerRef.current.signal.aborted) {
        showNotification(`Умная обрезка тишины завершена (${successCount}/${targetScenes.length})`, 'success')

        const updatedScenes = project.scenes.map(s => {
          const processed = processedTargetScenes.find(ps => ps.id === s.id)
          return processed || s
        })
        onUpdateProject({ ...project, scenes: updatedScenes })

        if (activeSceneId) {
          const active = project.scenes.find(s => s.id === activeSceneId)
          if (active) {
            setAudioLoaded(null)
            setTimeout(() => setAudioLoaded(getAudioPathForScene(project, active)), 500)
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') showNotification('Ошибка умной обработки', 'error')
    } finally {
      setIsGeneratingAudio(false)
    }
  }

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
          if (active) {
            setAudioLoaded(null)
            setTimeout(() => setAudioLoaded(getAudioPathForScene(project, active)), 500)
          }
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
        const updatedScene = { ...scene, fragments: scene.fragments.map(f => f.id === frag.id ? { ...f, audioFileName: relativeAudioPath, lastAudioHash: hashCode(frag.text), lastAudioTextNormalized: normalizeText(frag.text) } : f) }
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
    let targetScenes = Array.isArray(scenesToProcess) ? scenesToProcess : project.scenes
    if (project.audioMode === 'project') targetScenes = project.scenes
    if (!targetScenes.length) return { scenes: project.scenes, activeAudio: null }

    setIsGeneratingAudio(true)
    abortControllerRef.current = new AbortController()
    try {
      const projectPath = getProjectPath(project)
      const processedTargetScenes: Scene[] = []
      let activeAudioPath: string | null = null
      let successCount = 0

      if (project.audioMode === 'project') {
        const combinedText = targetScenes.flatMap(s => s.fragments.map(f => f.text)).join(' ')
        if (!combinedText.trim()) return { scenes: project.scenes, activeAudio: null }

        const fakeFrag = { ...targetScenes[0].fragments[0], text: combinedText, id: 'project_voice' }
        const res = await fetch(`${API}/api/v1/audio/generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(getVoicePayload(fakeFrag as SceneFragment, targetScenes[0], project, voiceOpts)),
          signal: abortControllerRef.current.signal,
        })
        const data = await res.json()

        if (res.ok && data.status === 'ok') {
          const p = `${projectPath}/assets/voice/${data.audio_url}`
          const allFragments = targetScenes.flatMap(s => s.fragments)
          const recalculated = recalculateTimingsProportionally(allFragments, data.duration || 1)

          let fragIdx = 0
          for (const scene of targetScenes) {
            const sceneFrags = recalculated.slice(fragIdx, fragIdx + scene.fragments.length)
            const sceneStart = sceneFrags[0]?.startTime || 0

            const updatedScene = {
              ...scene,
              audioOffset: sceneStart,
              fragments: sceneFrags.map(f => ({
                ...f,
                startTime: Math.max(0, f.startTime! - sceneStart),
                endTime: Math.max(0, f.endTime! - sceneStart),
                audioFileName: p,
                lastAudioHash: hashCode(f.text),
                lastAudioTextNormalized: normalizeText(f.text)
              }))
            }
            processedTargetScenes.push(updatedScene)
            fragIdx += scene.fragments.length
            successCount++
            if (activeSceneId && scene.id === activeSceneId) activeAudioPath = p
          }
        }
      } else {
        for (let idx = 0; idx < targetScenes.length; idx++) {
          if (abortControllerRef.current?.signal.aborted) break
          const scene = { ...targetScenes[idx], fragments: [...targetScenes[idx].fragments], audioOffset: 0 }
          const audioPaths: string[] = []

          if (project.audioMode === 'scene') {
            const combinedText = scene.fragments.map(f => f.text).join(' ')
            if (!combinedText.trim()) {
              processedTargetScenes.push(scene)
              continue
            }
            const fakeFrag = { ...scene.fragments[0], text: combinedText, id: scene.id }
            const res = await fetch(`${API}/api/v1/audio/generate`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(getVoicePayload(fakeFrag as SceneFragment, scene, project, voiceOpts)), signal: abortControllerRef.current.signal,
            })
            const data = await res.json()
            if (res.ok && data.status === 'ok') {
              const p = `${projectPath}/assets/voice/${data.audio_url}`
              scene.fragments = recalculateTimingsProportionally(scene.fragments, data.duration || 1)
              scene.fragments.forEach(f => {
                f.audioFileName = p
                f.lastAudioHash = hashCode(f.text)
                f.lastAudioTextNormalized = normalizeText(f.text)
              })
              successCount++
              if (activeSceneId && scene.id === activeSceneId) activeAudioPath = p
            }
          } else {
            for (let fIdx = 0; fIdx < scene.fragments.length; fIdx++) {
              const frag = { ...scene.fragments[fIdx] }
              if (!frag.text.trim()) {
                scene.fragments[fIdx] = frag
                continue
              }
              const res = await fetch(`${API}/api/v1/audio/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(getVoicePayload(frag, scene, project, voiceOpts)), signal: abortControllerRef.current.signal,
              })
              const data = await res.json()
              if (res.ok && data.status === 'ok') {
                const p = `${projectPath}/assets/voice/${data.audio_url}`
                frag.audioFileName = p
                frag.lastAudioHash = hashCode(frag.text)
                frag.lastAudioTextNormalized = normalizeText(frag.text)
                audioPaths.push(p)
              }
              scene.fragments[fIdx] = frag
            }
            if (audioPaths.length > 0) {
              successCount++
              scene.fragments[0].audioFileName = await concatSceneAudio(projectPath, scene.title, scene.id, audioPaths, abortControllerRef.current.signal)
              scene.fragments.forEach(f => {
                if (f.text.trim()) f.audioFileName = scene.fragments[0].audioFileName
              })
              if (activeSceneId && scene.id === activeSceneId) activeAudioPath = scene.fragments[0].audioFileName
            }
          }
          processedTargetScenes.push(scene)
        }
      }

      const updatedScenes = project.scenes.map(s => {
        const processed = processedTargetScenes.find(ps => ps.id === s.id)
        return processed || s
      })
      onUpdateProject({ ...project, scenes: updatedScenes })
      if (activeAudioPath) setAudioLoaded(activeAudioPath)
      if (!abortControllerRef.current?.signal.aborted) showNotification(`Озвучка сгенерирована (${successCount}/${targetScenes.length})!`, 'success')
      return { scenes: updatedScenes, activeAudio: activeAudioPath }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') showNotification('Сбой генерации голоса', 'error')
      return { scenes: project.scenes, activeAudio: null }
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  const runSyncAllScenes = async (scenesToSync?: Scene[]) => {
    const whisperModel = useSettingsStore.getState().whisperModel || 'small'
    let targetScenes = Array.isArray(scenesToSync) ? scenesToSync : project.scenes
    if (project.audioMode === 'project') targetScenes = project.scenes
    setIsSyncing(true)
    abortControllerRef.current = new AbortController()
    try {
      const syncedTargetScenes: Scene[] = []
      let [wCount, fCount] = [0, 0]

      if (project.audioMode === 'project') {
        const allFragments = targetScenes.flatMap(s => s.fragments.map(f => ({ id: f.id, text: f.text })))
        const globalAudioPath = targetScenes[0]?.fragments[0]?.audioFileName
        if (!globalAudioPath) throw new Error("Аудио не найдено")

        const res = await fetch(`${API}/api/v1/audio/sync`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene_id: 'project_sync', audio_path: globalAudioPath,
            fragments: allFragments, project_path: getProjectPath(project),
            use_whisper: useWhisper, auto_offload_vram: autoOffloadVram, whisper_model: whisperModel,
          }),
          signal: abortControllerRef.current.signal,
        })
        const data = await res.json()
        if (data.fallback) fCount += allFragments.length; else wCount += allFragments.length

        if (data.status === 'ok' && data.fragments_timings) {
          const timingMap = Object.fromEntries(data.fragments_timings.map((t: FragmentTiming) => [t.id, t]))

          for (const scene of targetScenes) {
            const firstTiming = timingMap[scene.fragments[0].id]
            const sceneStart = firstTiming ? firstTiming.startTime : 0

            const syncedFragments = scene.fragments.map(f => {
              const t = timingMap[f.id]
              if (!t) return f
              const localStart = Math.max(0, t.startTime - sceneStart)
              const localEnd = Math.max(0, t.endTime - sceneStart)

              const tcRegex = /^(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?):?\s*/
              return {
                ...f,
                startTime: localStart,
                endTime: localEnd,
                visualNote: tcRegex.test(f.visualNote) ? f.visualNote.replace(tcRegex, `${formatShortTimecode(localStart)} - ${formatShortTimecode(localEnd)}: `) : f.visualNote
              }
            })
            syncedTargetScenes.push({ ...scene, audioOffset: sceneStart, fragments: syncedFragments })
          }
        } else {
            syncedTargetScenes.push(...targetScenes)
        }
      } else {
        for (const scene of targetScenes) {
          if (abortControllerRef.current?.signal.aborted) break
          const res = await fetch(`${API}/api/v1/audio/sync`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scene_id: scene.id, audio_path: getAudioPathForScene(project, scene),
              fragments: scene.fragments.map(f => ({ id: f.id, text: f.text })),
              project_path: getProjectPath(project), use_whisper: useWhisper, auto_offload_vram: autoOffloadVram, whisper_model: whisperModel,
            }),
            signal: abortControllerRef.current.signal,
          })
          const data = await res.json()
          if (data.fallback) fCount++
          else wCount++

          let syncedFragments = [...scene.fragments]
          if (data.status === 'ok' && data.fragments_timings) {
            const timingMap = Object.fromEntries(data.fragments_timings.map((t: FragmentTiming) => [t.id, t]))
            syncedFragments = scene.fragments.map(f => {
              const t = timingMap[f.id]
              if (!t) return f
              const tcRegex = /^(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?):?\s*/
              return { ...f, startTime: t.startTime, endTime: t.endTime, visualNote: tcRegex.test(f.visualNote) ? f.visualNote.replace(tcRegex, `${formatShortTimecode(t.startTime)} - ${formatShortTimecode(t.endTime)}: `) : f.visualNote }
            })
          }
          syncedTargetScenes.push({ ...scene, fragments: syncedFragments, audioOffset: 0 })
        }
      }

      let cumulativeTime = 0
      const updatedScenes = project.scenes.map(s => {
        const synced = syncedTargetScenes.find(ts => ts.id === s.id) || s
        let sceneDuration = Math.max(...synced.fragments.map(f => f.endTime || 0), 0)
        if (sceneDuration <= 0) sceneDuration = synced.fragments.reduce((acc, f) => acc + Math.max(f.text.split(' ').length / 2.5, 1.0), 0)

        const updatedScene = { ...synced, timecode: formatTimecode(cumulativeTime) }
        cumulativeTime += sceneDuration
        return updatedScene
      })

      onUpdateProject({ ...project, scenes: updatedScenes })
      if (!abortControllerRef.current?.signal.aborted) showNotification(`Синхронизация завершена (Whisper: ${wCount}, Fallback: ${fCount})`, fCount > 0 && wCount === 0 ? 'info' : 'success')
      return updatedScenes
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') showNotification('Сбой синхронизации', 'error')
      return project.scenes
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

  const handleReplaceSceneAudio = async (sceneId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('project_path', getProjectPath(project))
    fd.append('target_id', sceneId)
    try {
      const res = await fetch(`${API}/api/v1/media/upload-audio`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.status === 'ok') {
        const scene = project.scenes.find(s => s.id === sceneId)
        if (!scene) return
        const newFragments = recalculateTimingsProportionally(scene.fragments, data.duration)

        newFragments.forEach(f => {
          f.audioFileName = data.path;
          f.lastAudioHash = hashCode(f.text);
          f.lastAudioTextNormalized = normalizeText(f.text);
        });

        onUpdateProject({
          ...project,
          scenes: project.scenes.map(s => s.id === sceneId ? { ...s, fragments: newFragments } : s)
        })
        showNotification('Аудио заменено. Тайминги пересчитаны!', 'success')
      }
    } catch {
      showNotification('Ошибка загрузки аудио', 'error')
    }
  }

  return { isGeneratingAudio, isSyncing, audioLoaded, setAudioLoaded, handleProcessAudio, handleProcessAdvancedSilence, runVoiceGenFragment, runVoiceGenAllScenes, runSyncAllScenes, handleUnloadVram, handleResetAudio, handleResetAllSync, handleReplaceSceneAudio }
}
