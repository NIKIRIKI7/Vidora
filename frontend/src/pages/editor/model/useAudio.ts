import { fetchClient, apiErrorMessage } from '@shared/api'
import { useState, useEffect } from 'react'
import { getProjectPath, getAudioPathForScene, sanitizeFilename, hashCode, formatShortTimecode, formatTimecode, concatSceneAudio } from '@entities/project'
import { normalizeText, recalculateTimingsProportionally } from '@entities/project'
import type { ProjectSettings, Scene, SceneFragment } from '@entities/project'
import { useSettingsStore } from '@entities/project'
import { resolveCleanVoiceEngine } from '@shared/lib'
import { isRequestCanceled } from '@shared/lib/http'
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
}

export interface CustomAudioUploadParams {
  scope: 'fragment' | 'scene' | 'project' | 'all_scenes'
  file: File
  files?: File[]
  targetSceneId?: string
  targetFragmentId?: string
  transcribeWithWhisper?: boolean
  manualRefText?: string
}

const getVoicePayload = (frag: SceneFragment, scene: Scene, project: ProjectSettings, opts: AudioOptions) => {
  // ponytail: наследуем эмоцию первой фразы сцены во все фрагменты без своего [emotion: x] — единый тон всего блока
  const sceneEmotion = scene.fragments[0]?.text.match(/\[emotion:\s*[a-z-]+\]/i)?.[0] || ''
  const fragText = frag.text.match(/\[emotion:\s*[a-z-]+\]/i) ? frag.text : sceneEmotion ? `${sceneEmotion} ${frag.text}` : frag.text
  const speakerId = opts.voiceModel
  const { speed, numSteps, guidanceScale, ttsEngine } = opts

  return {
    fragment_id: frag.id, file_prefix: `Frag_${sanitizeFilename(scene.title)}`, text: fragText,
    speaker_id: speakerId,
    engine: resolveCleanVoiceEngine(speakerId, ttsEngine),
    speed, num_steps: numSteps, guidance_scale: guidanceScale, duration: opts.duration,
    denoise: opts.denoise, preprocess_prompt: opts.preprocessPrompt, postprocess_output: opts.postprocessOutput,
    project_path: getProjectPath(project), auto_offload_vram: opts.autoOffloadVram,
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
    fetchClient.GET('/api/v1/render/media', { params: { query: { path: expectedPath } } })
      .then(({ error }) => { if (error) throw new Error(apiErrorMessage(error)); if (!isCancelled) setAudioLoaded(expectedPath) })
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
        const { data, error } = await fetchClient.POST('/api/v1/audio/process/advanced-silence', {
          body: {
            scene_id: scene.id,
            audio_path: getAudioPathForScene(project, scene),
            project_path: projectPath,
            threshold_db: audioProc.silenceThresholdDb,
            min_silence_ms: audioProc.minSilenceMs,
            max_silence_ms: audioProc.maxSilenceMs,
            remove_edges: audioProc.removeEdges,
          } as never,
          signal: abortControllerRef.current.signal,
        })
        if (error || data === undefined) throw new Error(apiErrorMessage(error))
        if (data.status === 'ok') {
          successCount++
          const newFragments = recalculateTimingsProportionally(scene.fragments, data.new_duration_sec as number)
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
      if (!isRequestCanceled(e)) showNotification('Ошибка умной обработки', 'error')
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
        const { data, error } = await fetchClient.POST('/api/v1/audio/process', { body: { scene_id: scene.id, audio_path: getAudioPathForScene(project, scene), action, project_path: projectPath } as never, signal: abortControllerRef.current.signal })
        if (error || data === undefined) throw new Error(apiErrorMessage(error))
        if (data.status === 'ok') successCount++
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
      if (!isRequestCanceled(e)) showNotification('Ошибка обработки аудио', 'error')
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

      const { data, error } = await fetchClient.POST('/api/v1/audio/generate', { body: getVoicePayload(frag, scene, project, voiceOpts) })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status === 'ok') {
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
        const { data, error } = await fetchClient.POST('/api/v1/audio/generate', { body: getVoicePayload(fakeFrag as SceneFragment, targetScenes[0], project, voiceOpts), signal: abortControllerRef.current.signal })
        if (error || data === undefined) throw new Error(apiErrorMessage(error))

        if (data.status === 'ok') {
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
            const { data, error } = await fetchClient.POST('/api/v1/audio/generate', { body: getVoicePayload(fakeFrag as SceneFragment, scene, project, voiceOpts), signal: abortControllerRef.current.signal })
            if (error || data === undefined) throw new Error(apiErrorMessage(error))
            if (data.status === 'ok') {
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
              const { data, error } = await fetchClient.POST('/api/v1/audio/generate', { body: getVoicePayload(frag, scene, project, voiceOpts), signal: abortControllerRef.current.signal })
              if (error || data === undefined) throw new Error(apiErrorMessage(error))
              if (data.status === 'ok') {
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
      if (!isRequestCanceled(e)) showNotification('Сбой генерации голоса', 'error')
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

        const { data, error } = await fetchClient.POST('/api/v1/audio/sync', {
          body: {
            scene_id: 'project_sync', audio_path: globalAudioPath,
            fragments: allFragments, project_path: getProjectPath(project),
            use_whisper: useWhisper, auto_offload_vram: autoOffloadVram, whisper_model: whisperModel,
          } as never,
          signal: abortControllerRef.current.signal,
        })
        if (error || data === undefined) throw new Error(apiErrorMessage(error))
        if (data.fallback) fCount += allFragments.length; else wCount += allFragments.length

        if (data.status === 'ok' && data.fragments_timings) {
          const timingMap = Object.fromEntries((data.fragments_timings as FragmentTiming[]).map((t: FragmentTiming) => [t.id, t]))

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
          const { data, error } = await fetchClient.POST('/api/v1/audio/sync', {
            body: {
              scene_id: scene.id, audio_path: getAudioPathForScene(project, scene),
              fragments: scene.fragments.map(f => ({ id: f.id, text: f.text })),
              project_path: getProjectPath(project), use_whisper: useWhisper, auto_offload_vram: autoOffloadVram, whisper_model: whisperModel,
            } as never,
            signal: abortControllerRef.current.signal,
          })
          if (error || data === undefined) throw new Error(apiErrorMessage(error))
          if (data.fallback) fCount++
          else wCount++

          let syncedFragments = [...scene.fragments]
          if (data.status === 'ok' && data.fragments_timings) {
            const timingMap = Object.fromEntries((data.fragments_timings as FragmentTiming[]).map((t: FragmentTiming) => [t.id, t]))
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
      if (!isRequestCanceled(e)) showNotification('Сбой синхронизации', 'error')
      return project.scenes
    } finally {
      setIsSyncing(false)
    }
  }

  const handleUnloadVram = async () => {
    try {
      const { error } = await fetchClient.POST('/api/v1/audio/vram/unload')
      if (error) throw new Error(apiErrorMessage(error))
      showNotification('VRAM память видеокарты очищена!', 'success')
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
      const { data, error } = await fetchClient.POST('/api/v1/media/upload-audio', { body: fd as never })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status === 'ok') {
        const scene = project.scenes.find(s => s.id === sceneId)
        if (!scene) return
        const newFragments = recalculateTimingsProportionally(scene.fragments, data.duration as number)

        newFragments.forEach(f => {
          f.audioFileName = data.path ?? undefined;
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

  const handleUploadCustomAudioAdvanced = async ({
    scope,
    file,
    files,
    targetSceneId,
    targetFragmentId,
    transcribeWithWhisper = false,
    manualRefText = '',
  }: CustomAudioUploadParams) => {
    setIsGeneratingAudio(true)
    showNotification('Загрузка аудиофайла...', 'info')
    const projectPath = getProjectPath(project)

    if (scope === 'all_scenes') {
      const batchFiles = files || []
      if (batchFiles.length === 0) return
      try {
        const sceneIds = project.scenes.map(s => s.id)
        const fd = new FormData()
        fd.append('project_path', projectPath)
        fd.append('scene_ids', JSON.stringify(sceneIds))
        batchFiles.forEach(f => fd.append('files', f))

        const { data: uploadData, error } = await fetchClient.POST('/api/v1/audio/batch-upload-scenes', { body: fd as never })
        if (error || uploadData === undefined) throw new Error(apiErrorMessage(error))
        if (uploadData.status !== 'ok') {
          throw new Error((uploadData as typeof uploadData & { detail?: string | null }).detail || 'Ошибка пакетной загрузки аудио')
        }

        const matches = (uploadData.matches || []) as { scene_id: string; absolute_path: string; duration: number }[]
        const matchedScenes: Scene[] = []
        for (const m of matches) {
          const scene = project.scenes.find(s => s.id === m.scene_id)
          if (!scene) continue
          const updatedFragments = recalculateTimingsProportionally(scene.fragments, m.duration || 0)
          updatedFragments.forEach(f => {
            f.audioFileName = m.absolute_path
            f.lastAudioHash = hashCode(f.text)
            f.lastAudioTextNormalized = normalizeText(f.text)
          })
          matchedScenes.push({ ...scene, fragments: updatedFragments, audioOffset: 0 })
        }

        if (matchedScenes.length > 0) {
          onUpdateProject({ ...project, scenes: project.scenes.map(s => matchedScenes.find(m => m.id === s.id) || s) })
          showNotification('Синхронизация таймингов сцен (WhisperX)...', 'info')
          await runSyncAllScenes(matchedScenes)
        }

        const unmatched = uploadData.unmatched_files?.length || 0
        showNotification(
          `Привязано сцен: ${matchedScenes.length}${unmatched ? `, не привязано файлов: ${unmatched}` : ''}!`,
          'success',
        )
        return
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        showNotification(`Ошибка: ${msg}`, 'error')
      } finally {
        setIsGeneratingAudio(false)
      }
      return
    }

    const fd = new FormData()
    fd.append('file', file)
    fd.append('project_path', projectPath)
    fd.append('target_id', scope === 'fragment' ? targetFragmentId || 'frag' : targetSceneId || 'scene')

    try {
      const { data: uploadData, error } = await fetchClient.POST('/api/v1/media/upload-audio', { body: fd as never })
      if (error || uploadData === undefined) throw new Error(apiErrorMessage(error))
      if (uploadData.status !== 'ok') {
        throw new Error((uploadData as typeof uploadData & { detail?: string | null }).detail || 'Ошибка загрузки аудио')
      }

      const savedAudioPath = uploadData.path ?? undefined
      const audioDuration = uploadData.duration || 0
      let spokenText = manualRefText.trim()

      if (transcribeWithWhisper && !spokenText) {
        showNotification('Распознавание речи через Whisper...', 'info')
        const { data: transData, error } = await fetchClient.POST('/api/v1/audio/transcribe', { body: { audio_path: savedAudioPath, whisper_model: 'small' } as never })
        if (error || transData === undefined) throw new Error(apiErrorMessage(error))
        if (transData.status === 'ok') {
          spokenText = transData.text ?? ''
        } else {
          showNotification('Не удалось распознать речь, используем текущий сценарий', 'info')
        }
      }

      if (scope === 'fragment' && targetSceneId && targetFragmentId) {
        const scene = project.scenes.find(s => s.id === targetSceneId)
        if (!scene) return
        const updatedFragments = scene.fragments.map(f => {
          if (f.id !== targetFragmentId) return f
          const start = f.startTime ?? 0
          return {
            ...f,
            text: spokenText || f.text,
            audioFileName: savedAudioPath,
            startTime: start,
            endTime: Number((start + (audioDuration || 3.0)).toFixed(3)),
            lastAudioHash: hashCode(spokenText || f.text),
            lastAudioTextNormalized: normalizeText(spokenText || f.text),
          }
        })
        onUpdateProject({
          ...project,
          scenes: project.scenes.map(s => (s.id === targetSceneId ? { ...s, fragments: updatedFragments } : s)),
        })
        showNotification('Аудио фрагмента успешно обновлено!', 'success')
      } else if (scope === 'scene' && targetSceneId) {
        const scene = project.scenes.find(s => s.id === targetSceneId)
        if (!scene) return
        const updatedFragments = recalculateTimingsProportionally(scene.fragments, audioDuration)
        updatedFragments.forEach(f => {
          f.audioFileName = savedAudioPath
          f.lastAudioHash = hashCode(f.text)
          f.lastAudioTextNormalized = normalizeText(f.text)
        })
        const targetScene = { ...scene, fragments: updatedFragments, audioOffset: 0 }
        showNotification('Синхронизация таймингов сцены (WhisperX)...', 'info')
        await runSyncAllScenes([targetScene])
        showNotification(`Сцена "${scene.title}" озвучена и синхронизирована!`, 'success')
      } else if (scope === 'project') {
        const allFragments = project.scenes.flatMap(s => s.fragments)
        const recalculated = recalculateTimingsProportionally(allFragments, audioDuration)
        let fragIdx = 0
        const processedScenes = project.scenes.map(scene => {
          const sceneFrags = recalculated.slice(fragIdx, fragIdx + scene.fragments.length)
          const sceneStart = sceneFrags[0]?.startTime || 0
          fragIdx += scene.fragments.length
          return {
            ...scene,
            audioOffset: sceneStart,
            fragments: sceneFrags.map(f => ({
              ...f,
              startTime: Math.max(0, (f.startTime || 0) - sceneStart),
              endTime: Math.max(0, (f.endTime || 0) - sceneStart),
              audioFileName: savedAudioPath,
              lastAudioHash: hashCode(f.text),
              lastAudioTextNormalized: normalizeText(f.text),
            })),
          }
        })
        onUpdateProject({
          ...project,
          audioMode: 'project',
          scenes: processedScenes,
        })
        showNotification('Синхронизация проекта с аудио (WhisperX)...', 'info')
        await runSyncAllScenes(processedScenes)
        showNotification('Полный аудиофайл проекта успешно синхронизирован!', 'success')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showNotification(`Ошибка: ${msg}`, 'error')
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  return { isGeneratingAudio, isSyncing, audioLoaded, setAudioLoaded, handleProcessAudio, handleProcessAdvancedSilence, runVoiceGenFragment, runVoiceGenAllScenes, runSyncAllScenes, handleUnloadVram, handleResetAudio, handleResetAllSync, handleReplaceSceneAudio, handleUploadCustomAudioAdvanced }
}
