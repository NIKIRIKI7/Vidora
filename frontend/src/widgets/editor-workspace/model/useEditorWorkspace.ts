import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { CustomVoice, ProjectSettings, Scene, SceneFragment, VideoFormat } from '@entities/project'
import { useNotificationStore, serializeProjectToMarkdown, parseMarkdownFull, useProjectStore, useSettingsStore, serializeSceneToMarkdown, parseSceneMarkdown } from '@entities/project'
import { generateRemotionPrompt } from '../lib/generateRemotionPrompt'
import { useHotkeys } from '@shared/lib/useHotkeys'
import {
  API,
  formatShortTimecode,
  formatTimecode,
  getAudioPathForScene,
  getProjectPath,
  getSceneDurationFromTimecode,
  getVisualNoteDuration,
  getWhisperSyncedDuration,
  parseTcString,
  sanitizeFilename,
  hashCode,
} from '../lib/helpers'
import type { CenterViewMode, FragmentTiming, RenderPayload } from './types'
import { useRenderWebSocket } from './useRenderWebSocket'

interface Props {
  project: ProjectSettings
  onUpdateProject: (project: ProjectSettings) => void
}

export const useEditorWorkspace = ({ project, onUpdateProject }: Props) => {
  const [activeSceneId, setActiveSceneId] = useState(project.scenes[0]?.id)
  const [centerView, setCenterView] = useState<CenterViewMode>('player')
  const [previewFormat, setPreviewFormat] = useState<VideoFormat | null>(null)

  const [voiceModel, setVoiceModel] = useState('aria')
  const [speed, setSpeed] = useState(1.0)
  const [numSteps, setNumSteps] = useState(32)
  const [guidanceScale, setGuidanceScale] = useState(3.0)
  const [duration, setDuration] = useState(0.0)
  const [denoise, setDenoise] = useState(true)
  const [preprocessPrompt, setPreprocessPrompt] = useState(true)
  const [postprocessOutput, setPostprocessOutput] = useState(true)
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false)

  const [audioLoaded, setAudioLoaded] = useState<string | null>(null)
  const [playWithAudio, setPlayWithAudio] = useState(true)
  const [isVoiceboxOpen, setIsVoiceboxOpen] = useState(false)
  const [newVoiceName, setNewVoiceName] = useState('')
  const [newVoiceText, setNewVoiceText] = useState('')
  const [newVoiceTags, setNewVoiceTags] = useState('')
  const [newVoiceAudioPath, setNewVoiceAudioPath] = useState<string | null>(null)

  const [isAutoPipelineRunning, setIsAutoPipelineRunning] = useState(false)
  const [pipelineStep, setPipelineStep] = useState<string>('')
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [useWhisper, setUseWhisper] = useState(true)
  const [autoOffloadVram, setAutoOffloadVram] = useState(true)

  const [draggedSceneIdx, setDraggedSceneIdx] = useState<number | null>(null)
  const [draggedFragIdx, setDraggedFragIdx] = useState<number | null>(null)

  const [isRendering, setIsRendering] = useState(false)
  const [renderType, setRenderType] = useState<'scene' | 'project' | null>(null)
  const [renderedVideos, setRenderedVideos] = useState<Record<string, string>>({})
  const [renderedHashes, setRenderedHashes] = useState<Record<string, string>>({})
  const [playingTargetId, setPlayingTargetId] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const handleSelectScene = (id: string) => { setActiveSceneId(id); setPlayingTargetId(id) }
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const refVoiceInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)

  const showNotification = useNotificationStore(s => s.showNotification)
  const undo = useProjectStore(s => s.undo)
  const redo = useProjectStore(s => s.redo)
  const ttsEngine = useSettingsStore(s => s.ttsEngine)
  const llmEngine = useSettingsStore(s => s.llmEngine)
  const apiKeys = useSettingsStore(s => s.apiKeys)
  const globalPrompts = useSettingsStore(s => s.globalPrompts)

  const activeScene = project.scenes.find(s => s.id === activeSceneId)
  const { renderProgress, setRenderProgress, renderListenersRef } = useRenderWebSocket()

  const handleUpdateMarkdown = (newMd: string) => {
    const parsed = parseMarkdownFull(newMd)
    const mergedScenes = parsed.scenes?.map((newScene, sIdx) => {
      const oldScene: Partial<Scene> = project.scenes[sIdx] || {}
      const mergedFragments = newScene.fragments.map((newFrag, fIdx) => {
        const oldFrag: Partial<SceneFragment> = oldScene.fragments?.[fIdx] || {}
        return {
          ...newFrag,
          id: oldFrag.id || newFrag.id,
          audioFileName: oldFrag.audioFileName,
          bRollFileName: oldFrag.bRollFileName,
          startTime: oldFrag.startTime,
          endTime: oldFrag.endTime,
          lastAudioHash: oldFrag.lastAudioHash,
        }
      })
      return {
        ...newScene,
        id: oldScene.id || newScene.id,
        remotionCode: oldScene.remotionCode,
        remotionCodeHistory: oldScene.remotionCodeHistory,
        historyIndex: oldScene.historyIndex,
        ignoreTsx: oldScene.ignoreTsx,
        lastCodeHash: oldScene.lastCodeHash,
        fragments: mergedFragments,
      }
    })

    onUpdateProject({
      ...project,
      rawMarkdown: newMd,
      metadata: parsed.metadata ?? project.metadata,
      montage: parsed.montage ?? project.montage,
      scenes: mergedScenes ?? project.scenes,
    })
  }

  const handleUpdateFragmentBRoll = (fragId: string, filename: string) => {
    if (!activeScene) return
    const updatedFragments = activeScene.fragments.map(f => f.id === fragId ? { ...f, bRollFileName: filename } : f)
    onUpdateProject({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s) })
  }

  const handleUnlinkFragmentBRoll = (fragId: string) => {
    if (!activeScene) return
    const updatedFragments = activeScene.fragments.map(f => f.id === fragId ? { ...f, bRollFileName: undefined } : f)
    onUpdateProject({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s) })
  }

  const handleNudgeTiming = (fragId: string, type: 'start' | 'end', delta: number) => {
    if (!activeScene) return
    const updatedFragments = [...activeScene.fragments]
    const idx = updatedFragments.findIndex(f => f.id === fragId)
    if (idx === -1) return

    if (type === 'start') {
      const val = Math.max(0, (updatedFragments[idx].startTime || 0) + delta)
      updatedFragments[idx] = { ...updatedFragments[idx], startTime: val }
      if (idx > 0 && updatedFragments[idx - 1].endTime !== undefined) {
        updatedFragments[idx - 1] = { ...updatedFragments[idx - 1], endTime: val }
      }
    } else {
      const val = Math.max(0, (updatedFragments[idx].endTime || 0) + delta)
      updatedFragments[idx] = { ...updatedFragments[idx], endTime: val }
      if (idx < updatedFragments.length - 1 && updatedFragments[idx + 1].startTime !== undefined) {
        updatedFragments[idx + 1] = { ...updatedFragments[idx + 1], startTime: val }
      }
    }

    onUpdateProject({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s) })
  }

  const handleCancelAll = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsAutoPipelineRunning(false)
    setIsRendering(false)
    setRenderType(null)
    setIsGeneratingAudio(false)
    setIsSyncing(false)
    setIsGeneratingCode(false)
    setPipelineStep('Отменено')

    if (currentTaskIdRef.current) {
      try {
        const res = await fetch(`${API}/api/v1/render/cancel/${currentTaskIdRef.current}`, { method: 'POST' })
        if (!res.ok && res.status !== 404) console.warn('Не удалось отменить рендер:', await res.text())
      } catch (e) {
        console.error('Ошибка отмены рендера:', e)
      }
      currentTaskIdRef.current = null
    }
    showNotification('Все процессы отменены', 'info')
  }

  const handleResetAudio = () => {
    const updatedScenes = project.scenes.map(s => ({
      ...s,
      fragments: s.fragments.map(f => ({ ...f, audioFileName: undefined, lastAudioHash: undefined }))
    }))
    onUpdateProject({ ...project, scenes: updatedScenes })
    setAudioLoaded(null)
    showNotification('Аудио сброшено для всех сцен', 'info')
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
        const audioPath = getAudioPathForScene(project, scene)
        const res = await fetch(`${API}/api/v1/audio/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene_id: scene.id, audio_path: audioPath, action, project_path: projectPath }),
          signal: abortControllerRef.current.signal,
        })
        const data = await res.json()
        if (data.status === 'ok') successCount++
      }
      if (!abortControllerRef.current.signal.aborted) {
        showNotification(`Обработка "${action}" завершена (${successCount}/${targetScenes.length})`, 'success')
        setAudioLoaded(null)
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

  const handleSceneDragStart = (idx: number) => () => setDraggedSceneIdx(idx)
  const handleSceneDrop = (dropIdx: number) => () => {
    if (draggedSceneIdx === null || draggedSceneIdx === dropIdx) { setDraggedSceneIdx(null); return }
    const scenes = [...project.scenes]
    const [moved] = scenes.splice(draggedSceneIdx, 1)
    scenes.splice(dropIdx, 0, moved)
    onUpdateProject({ ...project, scenes })
    setDraggedSceneIdx(null)
  }

  const handleFragDragStart = (idx: number) => () => setDraggedFragIdx(idx)
  const handleFragDrop = (dropIdx: number) => () => {
    if (!activeScene || draggedFragIdx === null || draggedFragIdx === dropIdx) { setDraggedFragIdx(null); return }
    const fragments = [...activeScene.fragments]
    const [moved] = fragments.splice(draggedFragIdx, 1)
    fragments.splice(dropIdx, 0, moved)
    onUpdateProject({ ...project, scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments } : s)) })
    setDraggedFragIdx(null)
  }

  const toggleIgnoreTsx = (sceneId: string) => {
    const updatedScenes = project.scenes.map(s => (s.id === sceneId ? { ...s, ignoreTsx: !s.ignoreTsx } : s))
    onUpdateProject({ ...project, scenes: updatedScenes })
  }

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

  const handleAddScene = () => {
    const newScene: Scene = {
      id: crypto.randomUUID(),
      title: `Сцена ${project.scenes.length + 1}`,
      timecode: '00:00:00',
      fragments: [{ id: crypto.randomUUID(), visualNote: 'A-roll: Описание кадра', text: 'Текст новой сцены...' }],
    }
    onUpdateProject({ ...project, scenes: [...project.scenes, newScene] })
    setActiveSceneId(newScene.id)
    showNotification('Новая сцена добавлена', 'success')
  }

  const handleDeleteScene = (sceneId: string) => {
    if (project.scenes.length <= 1) { showNotification('Сценарий должен содержать хотя бы одну сцену', 'error'); return }
    const updatedScenes = project.scenes.filter(s => s.id !== sceneId)
    onUpdateProject({ ...project, scenes: updatedScenes })
    if (activeSceneId === sceneId) setActiveSceneId(updatedScenes[0].id)
    showNotification('Сцена удалена', 'info')
  }

  const handleUpdateSceneTitle = (sceneId: string, title: string, timecode: string) => {
    onUpdateProject({ ...project, scenes: project.scenes.map(s => (s.id === sceneId ? { ...s, title, timecode } : s)) })
  }

  const handleAddFragment = () => {
    if (!activeScene) return
    const newFrag: SceneFragment = { id: crypto.randomUUID(), visualNote: 'Визуальная ремарка', text: 'Текст суфлера...' }
    onUpdateProject({ ...project, scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: [...s.fragments, newFrag] } : s)) })
    showNotification('Фрагмент добавлен', 'success')
  }

  const handleDeleteFragment = (fragId: string) => {
    if (!activeScene) return
    if (activeScene.fragments.length <= 1) { showNotification('Сцена должна содержать хотя бы один фрагмент', 'error'); return }
    onUpdateProject({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: s.fragments.filter(f => f.id !== fragId) } : s) })
    showNotification('Фрагмент удален', 'info')
  }

  const handleFragmentTextChange = (fragId: string, newText: string, newVisualNote?: string) => {
    if (!activeScene) return
    const updatedFragments = activeScene.fragments.map(f => {
      if (f.id !== fragId) return f
      const vNote = newVisualNote !== undefined ? newVisualNote : f.visualNote
      let newStart = f.startTime
      let newEnd = f.endTime
      const match = vNote.match(/^(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)/)
      if (match) {
        const parsedStart = parseTcString(match[1])
        const parsedEnd = parseTcString(match[4])
        if (parsedStart !== null) newStart = parsedStart
        if (parsedEnd !== null) newEnd = parsedEnd
      }
      return { ...f, text: newText, visualNote: vNote, startTime: newStart, endTime: newEnd }
    })
    onUpdateProject({ ...project, scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)) })
  }

  const handleUpdateCode = (code: string) => {
    if (!activeScene) return
    const hist = activeScene.remotionCodeHistory || []
    const idx = activeScene.historyIndex ?? (hist.length - 1)
    const newHist = [...hist.slice(0, idx + 1), code]
    const hash = hashCode(generateRemotionPrompt(project, activeScene))
    onUpdateProject({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, remotionCode: code, remotionCodeHistory: newHist, historyIndex: newHist.length - 1, lastCodeHash: hash } : s)),
    })
  }

  const handleCodeHistory = (step: number) => {
    if (!activeScene) return
    const hist = activeScene.remotionCodeHistory || []
    if (hist.length === 0) return
    let idx = activeScene.historyIndex ?? (hist.length - 1)
    idx = Math.max(0, Math.min(hist.length - 1, idx + step))
    onUpdateProject({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, remotionCode: hist[idx], historyIndex: idx } : s) })
  }

  const handleResetAllSync = () => {
    const updatedScenes = project.scenes.map(s => ({
      ...s, timecode: '00:00:00', fragments: s.fragments.map(f => ({ ...f, startTime: undefined, endTime: undefined }))
    }))
    onUpdateProject({ ...project, scenes: updatedScenes })
    showNotification('Синхронизация сброшена для всех сцен', 'info')
  }

  const handleFixAudioPacing = async (sceneId: string) => {
    await handleProcessAudio('silero_vad', 'scene', sceneId)
    if (abortControllerRef.current?.signal.aborted) return
    const scene = project.scenes.find(s => s.id === sceneId)
    if (scene) {
      showNotification('Синхронизация новых таймингов...', 'info')
      await runSyncAllScenes([scene])
    }
  }

  const handleUnloadVram = async () => {
    try {
      const res = await fetch(`${API}/api/v1/audio/vram/unload`, { method: 'POST' })
      if (res.ok) showNotification('VRAM память видеокарты очищена!', 'success')
    } catch (e) {
      showNotification('Ошибка очистки VRAM', 'error')
    }
  }

  const handleUploadRefVoiceAudio = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('project_path', getProjectPath(project))
    formData.append('folder', 'refs')
    try {
      const res = await fetch(`${API}/api/v1/media/upload`, { method: 'POST', body: formData })
      const data = await res.json()
      if (data.status === 'ok') {
        setNewVoiceAudioPath(data.path)
        showNotification('Референсный файл загружен', 'success')
      }
    } catch (e) {
      showNotification('Ошибка загрузки референса', 'error')
    }
    e.target.value = ''
  }

  const handleSaveCustomVoice = () => {
    if (!newVoiceName || !newVoiceAudioPath) { showNotification('Укажите имя и загрузите файл', 'error'); return }
    const newVoice: CustomVoice = {
      id: crypto.randomUUID(), name: newVoiceName, refAudioPath: newVoiceAudioPath,
      refText: newVoiceText, tags: newVoiceTags.split(',').map(t => t.trim()).filter(Boolean),
    }
    onUpdateProject({ ...project, customVoices: [...(project.customVoices || []), newVoice] })
    setVoiceModel(newVoice.id)
    setIsVoiceboxOpen(false)
    setNewVoiceName('')
    setNewVoiceText('')
    setNewVoiceTags('')
    setNewVoiceAudioPath(null)
    showNotification(`Голос "${newVoice.name}" сохранен!`, 'success')
  }

  const handleDeleteCustomVoice = (voiceId: string) => {
    onUpdateProject({ ...project, customVoices: (project.customVoices || []).filter(v => v.id !== voiceId) })
    if (voiceModel === voiceId) setVoiceModel('aria')
    showNotification('Голос удален', 'info')
  }

  const runVoiceGenFragment = async (sceneId: string, fragId: string) => {
    setIsGeneratingAudio(true)
    try {
      const scene = project.scenes.find(s => s.id === sceneId)
      const frag = scene?.fragments.find(f => f.id === fragId)
      if (!scene || !frag) return

      const projectPath = getProjectPath(project)
      const customVoice = project.customVoices?.find(v => v.id === voiceModel)
      const payload = {
        fragment_id: frag.id, file_prefix: `Frag_${sanitizeFilename(scene.title)}`, text: frag.text,
        voice_model: customVoice ? 'clone' : voiceModel, ref_audio_path: customVoice ? customVoice.refAudioPath : null, ref_text: customVoice ? customVoice.refText : null,
        speed, num_steps: numSteps, guidance_scale: guidanceScale, duration, denoise, preprocess_prompt: preprocessPrompt, postprocess_output: postprocessOutput,
        project_path: projectPath, auto_offload_vram: autoOffloadVram, engine: ttsEngine, api_keys: apiKeys,
      }

      const res = await fetch(`${API}/api/v1/audio/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()

      if (res.ok && data.status === 'ok') {
        const hash = hashCode(frag.text)
        const relativeAudioPath = `${projectPath}/assets/voice/${data.audio_url}`
        const updatedFragments = scene.fragments.map(f => f.id === frag.id ? { ...f, audioFileName: relativeAudioPath, lastAudioHash: hash } : f)
        const updatedScene = { ...scene, fragments: updatedFragments }

        const audioPaths = updatedScene.fragments.map(f => f.audioFileName).filter(Boolean) as string[]
        if (audioPaths.length > 0) {
          const sceneAudioPath = `${projectPath}/assets/voice/Scene_${sanitizeFilename(scene.title)}_${scene.id.slice(0, 6)}.wav`
          await fetch(`${API}/api/v1/audio/concat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_paths: audioPaths, output_path: sceneAudioPath }),
          })
          updatedScene.fragments[0].audioFileName = sceneAudioPath
        }
        onUpdateProject({ ...project, scenes: project.scenes.map(s => s.id === scene.id ? updatedScene : s) })
        showNotification('Фрагмент успешно переозвучен!', 'success')
      }
    } catch (e) {
      showNotification('Ошибка переозвучки', 'error')
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  const runVoiceGenAllScenes = async (scenesToProcess?: Scene[] | unknown): Promise<{ scenes: Scene[]; activeAudio: string | null }> => {
    const targetScenes: Scene[] = Array.isArray(scenesToProcess) ? scenesToProcess : project.scenes
    if (!targetScenes || targetScenes.length === 0) return { scenes: targetScenes || [], activeAudio: null }
    setIsGeneratingAudio(true)
    abortControllerRef.current = new AbortController()

    try {
      const customVoice = project.customVoices?.find(v => v.id === voiceModel)
      const projectPath = getProjectPath(project)
      const updatedScenes = [...targetScenes]
      let activeSceneAudioPath: string | null = null
      let successCount = 0

      for (let idx = 0; idx < updatedScenes.length; idx++) {
        if (abortControllerRef.current?.signal.aborted) break
        const scene = updatedScenes[idx]
        const audioPaths: string[] = []

        for (let fIdx = 0; fIdx < scene.fragments.length; fIdx++) {
          const frag = scene.fragments[fIdx]
          if (!frag.text.trim()) continue
          const payload = {
            fragment_id: frag.id, file_prefix: `Frag_${sanitizeFilename(scene.title)}`, text: frag.text,
            voice_model: customVoice ? 'clone' : voiceModel, ref_audio_path: customVoice?.refAudioPath || null, ref_text: customVoice?.refText || null,
            speed, num_steps: numSteps, guidance_scale: guidanceScale, duration, denoise, preprocess_prompt: preprocessPrompt, postprocess_output: postprocessOutput,
            project_path: projectPath, auto_offload_vram: autoOffloadVram, engine: ttsEngine, api_keys: apiKeys,
          }

          const res = await fetch(`${API}/api/v1/audio/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload), signal: abortControllerRef.current.signal,
          })
          const data = await res.json()
          if (res.ok && data.status === 'ok') {
            const relativeAudioPath = `${projectPath}/assets/voice/${data.audio_url}`
            frag.audioFileName = relativeAudioPath
            frag.lastAudioHash = hashCode(frag.text)
            audioPaths.push(relativeAudioPath)
          }
        }

        if (audioPaths.length > 0) {
          successCount++
          const sceneAudioPath = `${projectPath}/assets/voice/Scene_${sanitizeFilename(scene.title)}_${scene.id.slice(0, 6)}.wav`
          await fetch(`${API}/api/v1/audio/concat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_paths: audioPaths, output_path: sceneAudioPath }), signal: abortControllerRef.current.signal,
          })
          scene.fragments[0].audioFileName = sceneAudioPath
          if (scene.id === activeSceneId) activeSceneAudioPath = sceneAudioPath
        }
      }
      onUpdateProject({ ...project, scenes: updatedScenes })
      if (activeSceneAudioPath) setAudioLoaded(activeSceneAudioPath)
      if (!abortControllerRef.current?.signal.aborted) showNotification(`Озвучка сгенерирована (${successCount}/${targetScenes.length})!`, 'success')
      return { scenes: updatedScenes, activeAudio: activeSceneAudioPath }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') showNotification('Сбой генерации голоса', 'error')
      return { scenes: targetScenes, activeAudio: null }
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  const runSyncAllScenes = async (scenesToSync?: Scene[] | unknown): Promise<Scene[]> => {
    const targetScenes: Scene[] = Array.isArray(scenesToSync) ? scenesToSync : project.scenes
    setIsSyncing(true)
    abortControllerRef.current = new AbortController()

    try {
      let cumulativeTime = 0
      const updatedScenes: Scene[] = []
      let whisperCount = 0
      let fallbackCount = 0

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
        if (data.fallback) fallbackCount++
        else whisperCount++

        let syncedFragments = [...scene.fragments]
        let sceneDuration = 0
        if (data.status === 'ok' && data.fragments_timings) {
          const timingMap = Object.fromEntries(data.fragments_timings.map((t: FragmentTiming) => [t.id, t]))
          syncedFragments = scene.fragments.map((f: SceneFragment) => {
            const t = timingMap[f.id]
            if (!t) return f
            const tcRegex = /^(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?):?\s*/
            const tcPrefix = `${formatShortTimecode(t.startTime)} - ${formatShortTimecode(t.endTime)}: `
            return { ...f, startTime: t.startTime, endTime: t.endTime, visualNote: tcRegex.test(f.visualNote) ? f.visualNote.replace(tcRegex, tcPrefix) : f.visualNote }
          })
          sceneDuration = Math.max(...syncedFragments.map((f: SceneFragment) => f.endTime || 0), 0)
        }
        if (sceneDuration <= 0) sceneDuration = scene.fragments.reduce((acc, f) => acc + Math.max(f.text.split(' ').length / 2.5, 1.0), 0)

        updatedScenes.push({ ...scene, timecode: formatTimecode(cumulativeTime), fragments: syncedFragments })
        cumulativeTime += sceneDuration
      }
      onUpdateProject({ ...project, scenes: updatedScenes })
      if (!abortControllerRef.current?.signal.aborted) showNotification(`Синхронизация завершена (Whisper: ${whisperCount}, Fallback: ${fallbackCount})`, fallbackCount > 0 && whisperCount === 0 ? 'info' : 'success')
      return updatedScenes
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') showNotification('Сбой синхронизации', 'error')
      return targetScenes
    } finally {
      setIsSyncing(false)
    }
  }

  const runCodeGen = async (targetScene?: Scene | unknown): Promise<string | null> => {
    const sceneToUse = targetScene && typeof targetScene === 'object' && 'id' in targetScene ? (targetScene as Scene) : activeScene
    if (!sceneToUse) return null
    if (sceneToUse.ignoreTsx) { showNotification(`Сцена "${sceneToUse.title}" игнорируется`, 'info'); return null }

    setIsGeneratingCode(true)
    abortControllerRef.current = new AbortController()
    try {
      const res = await fetch(`${API}/api/v1/code/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: sceneToUse.id, prompt: generateRemotionPrompt(project, sceneToUse), project_data: project, project_path: getProjectPath(project), engine: llmEngine, api_keys: apiKeys }),
        signal: abortControllerRef.current.signal,
      })
      const data = await res.json()
      if (data.tsx_code) {
        const hist = sceneToUse.remotionCodeHistory || []
        const idx = sceneToUse.historyIndex ?? (hist.length - 1)
        const newHist = [...hist.slice(0, idx + 1), data.tsx_code]
        const hash = hashCode(generateRemotionPrompt(project, sceneToUse))
        onUpdateProject({
          ...project,
          scenes: project.scenes.map(s => (s.id === sceneToUse.id ? { ...s, remotionCode: data.tsx_code, remotionCodeHistory: newHist, historyIndex: newHist.length - 1, lastCodeHash: hash } : s)),
        })
        if (!abortControllerRef.current?.signal.aborted) showNotification('TSX код сгенерирован', 'success')
        return data.tsx_code
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') showNotification('Сбой генерации кода', 'error')
    } finally {
      setIsGeneratingCode(false)
    }
    return null
  }

  const renderSingleScenePromise = (sceneId: string, code: string, audioPath: string, projectPath: string, signal: AbortSignal): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      fetch(`${API}/api/v1/render/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.name, target: 'scene', target_id: sceneId, project_path: projectPath, tsx_code: code, audio_path: audioPath }),
        signal,
      }).then(res => res.json()).then(data => {
        if (!data.task_id) return reject(new Error('Нет task_id'))
        currentTaskIdRef.current = data.task_id
        renderListenersRef.current.set(data.task_id, (payload: RenderPayload) => {
          if (payload.status === 'done') {
            renderListenersRef.current.delete(data.task_id!)
            currentTaskIdRef.current = null
            resolve(payload.output_path || null)
          } else if (payload.status === 'error') {
            renderListenersRef.current.delete(data.task_id!)
            currentTaskIdRef.current = null
            reject(new Error(payload.error || 'Неизвестная ошибка рендера'))
          }
        })
      }).catch(e => {
        if (e.name !== 'AbortError') reject(e)
      })
    })
  }

  const runRender = async (code?: string, audioPath?: string) => {
    if (!activeScene) return
    setRenderType('scene')
    setIsRendering(true)
    setRenderProgress(0)
    abortControllerRef.current = new AbortController()

    let codeToUse = typeof code === 'string' ? code : activeScene.ignoreTsx ? 'import { AbsoluteFill } from "remotion"; export const SceneComponent = () => <AbsoluteFill style={{ backgroundColor: "#000000" }} />;' : activeScene.remotionCode || ''
    const audioToUse = typeof audioPath === 'string' ? audioPath : audioLoaded || getAudioPathForScene(project, activeScene)

    let retries = 0
    let success = false

    while (retries < 3 && !success) {
      try {
        const sceneVideoPath = await renderSingleScenePromise(activeScene.id, codeToUse, audioToUse, getProjectPath(project), abortControllerRef.current.signal)
        if (sceneVideoPath) {
          setRenderedVideos(prev => ({ ...prev, [activeScene.id]: sceneVideoPath }))
          const currentHash = hashCode(codeToUse + audioToUse + JSON.stringify(activeScene.fragments))
          setRenderedHashes(prev => ({ ...prev, [activeScene.id]: currentHash }))
          setPlayingTargetId(activeScene.id)
          success = true
        }
      } catch (err: any) {
        if (abortControllerRef.current.signal.aborted) { setIsRendering(false); setRenderType(null); return }

        if (retries < 2 && !activeScene.ignoreTsx) {
          showNotification(`Ошибка рендера. ИИ исправляет код... (Попытка ${retries + 1}/2)`, 'warning')
          const fixPrompt = `Предыдущий код вызвал ошибку:\n${err.message}\n\nИсправь код и верни только полностью исправленный TSX.`
          try {
            setIsGeneratingCode(true)
            const res = await fetch(`${API}/api/v1/code/generate`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                target_id: activeScene.id, prompt: generateRemotionPrompt(project, activeScene) + '\n\n' + fixPrompt,
                project_data: project, project_path: getProjectPath(project), engine: llmEngine, api_keys: apiKeys,
              }),
              signal: abortControllerRef.current.signal,
            })
            const data = await res.json()
            if (data.tsx_code) {
              codeToUse = data.tsx_code
              const hist = activeScene.remotionCodeHistory || []
              const idx = activeScene.historyIndex ?? (hist.length - 1)
              const newHist = [...hist.slice(0, idx + 1), codeToUse]
              const hash = hashCode(generateRemotionPrompt(project, activeScene))
              onUpdateProject({
                ...project,
                scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, remotionCode: codeToUse, remotionCodeHistory: newHist, historyIndex: newHist.length - 1, lastCodeHash: hash } : s)),
              })
            }
          } catch (fixErr) { console.error('Ошибка при автоисправлении', fixErr) } finally { setIsGeneratingCode(false) }
          retries++
        } else {
          showNotification(`Ошибка рендера: ${err.message}. Требуется ручное исправление.`, 'error')
          setIsRendering(false)
          setRenderType(null)
          return
        }
      }
    }

    if (success) {
      showNotification('Рендер завершен!', 'success')
      setIsRendering(false)
      setRenderType(null)
    }
  }

  const runProjectRender = async () => {
    const unreadyScene = project.scenes.find(s => !s.ignoreTsx && (!s.remotionCode || !s.remotionCode.trim()))
    if (unreadyScene) { showNotification(`У сцены "${unreadyScene.title}" нет кода. Сгенерируйте или включите "Игнор".`, 'error'); return }

    setRenderType('project')
    setIsRendering(true)
    setRenderProgress(0)
    abortControllerRef.current = new AbortController()
    const projectPath = getProjectPath(project)
    const renderedSceneVideoPaths: string[] = []

    try {
      const fps = Number(project.montage?.fps) || 30
      const width = project.format === '9:16' ? 1080 : 1920
      const height = project.format === '9:16' ? 1920 : 1080

      for (let i = 0; i < project.scenes.length; i++) {
        if (abortControllerRef.current.signal.aborted) break
        const scene = project.scenes[i]
        const sceneDurationSec = getWhisperSyncedDuration(scene.fragments) || getSceneDurationFromTimecode(scene.timecode) || getVisualNoteDuration(scene.fragments) || 5
        const durationInFrames = Math.max(Math.ceil(sceneDurationSec * fps), 30)

        let codeToRender = scene.remotionCode || ''
        if (scene.ignoreTsx || !codeToRender.trim()) {
          codeToRender = `import { AbsoluteFill } from 'remotion';\nexport const compositionConfig = { id: 'BlackScreen', durationInFrames: ${durationInFrames}, fps: ${fps}, width: ${width}, height: ${height} };\nexport default () => <AbsoluteFill style={{ backgroundColor: "#000000" }} />;`
        }

        const audioPathToUse = getAudioPathForScene(project, scene)
        let sceneVideoPath = renderedVideos[scene.id]
        const currentHash = hashCode(codeToRender + audioPathToUse + JSON.stringify(scene.fragments))

        if (sceneVideoPath && renderedHashes[scene.id] === currentHash) {
          showNotification(`Сцена "${scene.title}" взята из кэша ⚡`, 'info')
          renderedSceneVideoPaths.push(sceneVideoPath)
          setRenderProgress(Math.round(((i + 1) / project.scenes.length) * 100))
          continue
        }

        let retries = 0
        let success = false
        while (retries < 3 && !success) {
          try {
            sceneVideoPath = await renderSingleScenePromise(scene.id, codeToRender, audioPathToUse, projectPath, abortControllerRef.current.signal)
            if (sceneVideoPath) {
              renderedSceneVideoPaths.push(sceneVideoPath)
              setRenderedVideos(prev => ({ ...prev, [scene.id]: sceneVideoPath! }))
              setRenderedHashes(prev => ({ ...prev, [scene.id]: currentHash }))
              success = true
            }
          } catch (err: any) {
            if (abortControllerRef.current.signal.aborted) { setIsRendering(false); setRenderType(null); return }

            if (retries < 2 && !scene.ignoreTsx) {
              showNotification(`Сбой сборки "${scene.title}". ИИ исправляет... (Попытка ${retries + 1}/2)`, 'warning')
              const fixPrompt = `Предыдущий код вызвал ошибку:\n${err.message}\n\nИсправь код и верни только полностью исправленный TSX.`
              try {
                setIsGeneratingCode(true)
                const res = await fetch(`${API}/api/v1/code/generate`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    target_id: scene.id, prompt: generateRemotionPrompt(project, scene) + '\n\n' + fixPrompt,
                    project_data: project, project_path: getProjectPath(project), engine: llmEngine, api_keys: apiKeys,
                  }),
                  signal: abortControllerRef.current.signal,
                })
                const data = await res.json()
                if (data.tsx_code) {
                  codeToRender = data.tsx_code
                  const hist = scene.remotionCodeHistory || []
                  const idx = scene.historyIndex ?? (hist.length - 1)
                  const newHist = [...hist.slice(0, idx + 1), codeToRender]
                  const newHash = hashCode(generateRemotionPrompt(project, scene))

                  scene.remotionCode = codeToRender
                  scene.lastCodeHash = newHash
                  scene.remotionCodeHistory = newHist
                  scene.historyIndex = newHist.length - 1
                }
              } catch (fixErr) { console.error('Ошибка автоисправления', fixErr) } finally { setIsGeneratingCode(false) }
              retries++
            } else {
              showNotification(`Сбой сборки "${scene.title}": ${err.message}. Требуется ручное исправление.`, 'error')
              setIsRendering(false)
              setRenderType(null)
              onUpdateProject({ ...project, scenes: project.scenes.map(s => s.id === scene.id ? scene : s) })
              return
            }
          }
        }
        setRenderProgress(Math.round(((i + 1) / project.scenes.length) * 100))
      }

      if (abortControllerRef.current.signal.aborted) return
      const finalProjectVideoPath = `${projectPath}/preview/Project_${sanitizeFilename(project.name)}.mp4`
      const concatRes = await fetch(`${API}/api/v1/render/concat-video`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: projectPath, video_paths: renderedSceneVideoPaths, output_path: finalProjectVideoPath }),
        signal: abortControllerRef.current.signal,
      })
      const concatData = await concatRes.json()
      if (concatData.status === 'ok') {
        setRenderedVideos(prev => ({ ...prev, [`Project_${project.name}`]: finalProjectVideoPath }))
        setPlayingTargetId(`Project_${project.name}`)
        showNotification('Проект успешно отрендерен!', 'success')
        onUpdateProject({ ...project, scenes: [...project.scenes] })
      } else { showNotification('Ошибка склейки проекта', 'error') }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') showNotification('Сбой сборки', 'error')
    } finally {
      setIsRendering(false)
      setRenderType(null)
    }
  }

  const handleFullAutoPipeline = async () => {
    if (!activeScene) return
    setIsAutoPipelineRunning(true)
    setPipelineStep('1/4 Озвучка всех сцен...')
    const { scenes: voiceScenes } = await runVoiceGenAllScenes(project.scenes)
    if (!isAutoPipelineRunning || abortControllerRef.current?.signal.aborted) return
    setPipelineStep('2/4 Whisper Alignment...')
    const syncedScenes = await runSyncAllScenes(voiceScenes)
    if (!isAutoPipelineRunning || abortControllerRef.current?.signal.aborted) return
    const currentActiveScene = syncedScenes.find(s => s.id === activeSceneId) || activeScene
    setPipelineStep('3/4 Remotion TSX...')
    await runCodeGen(currentActiveScene)
    if (!isAutoPipelineRunning || abortControllerRef.current?.signal.aborted) return
    setPipelineStep('4/4 Рендер MP4...')
    await runProjectRender()
    setIsAutoPipelineRunning(false)
    setPipelineStep('')
  }

  const handleExportProject = async () => {
    const hasDirty = project.scenes.some(s => {
      if (s.ignoreTsx) return false
      const cd = !s.remotionCode || (s.lastCodeHash && s.lastCodeHash !== hashCode(generateRemotionPrompt(project, s)))
      const ad = s.fragments.some(f => !f.audioFileName || (f.lastAudioHash && f.lastAudioHash !== hashCode(f.text)))
      return cd || ad
    })
    if (hasDirty) {
      const proceed = window.confirm('Внимание!\nЧасть сцен устарела (изменён текст или промпт, но не перегенерирован голос или код).\n\nЭкспортировать текущее состояние как есть?\nОтмена - прервать экспорт для ручного обновления.')
      if (!proceed) return
    }

    setIsRendering(true)
    showNotification('Подготовка архива...', 'info')
    try {
      const markdownContent = serializeProjectToMarkdown(project)
      const res = await fetch(`${API}/api/v1/render/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: getProjectPath(project), markdown: markdownContent }),
      })
      if (!res.ok) throw new Error('Export error')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sanitizeFilename(project.name)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      showNotification('Проект успешно экспортирован!', 'success')
    } catch (e) {
      showNotification('Ошибка экспорта проекта', 'error')
    } finally {
      setIsRendering(false)
    }
  }

  const handleCopyFixPacingPrompt = (sceneId: string, currentPacing: number, threshold: number) => {
    const scene = project.scenes.find(s => s.id === sceneId)
    if (!scene) return
    const md = serializeSceneToMarkdown(scene)
    const template = project.promptOverrides?.fixPacing || globalPrompts.fixPacing || ''
    const prompt = template
      .replace(/\{\{CURRENT_PACING\}\}/g, currentPacing.toFixed(1))
      .replace(/\{\{THRESHOLD\}\}/g, threshold.toString())
      .replace(/\{\{SCENE_MARKDOWN\}\}/g, md)
    
    navigator.clipboard.writeText(prompt)
    showNotification('Промпт для ИИ скопирован в буфер!', 'success')
  }

  const handleExportScene = (sceneId: string) => {
    const scene = project.scenes.find(s => s.id === sceneId)
    if (!scene) return
    navigator.clipboard.writeText(serializeSceneToMarkdown(scene))
    showNotification('Сцена скопирована в буфер (Markdown)', 'success')
  }

  const handleReplaceScene = async (sceneId: string) => {
    try {
      const text = await navigator.clipboard.readText()
      const newSceneData = parseSceneMarkdown(text)
      if (!newSceneData) {
        showNotification('Буфер не содержит корректной сцены [Название](00:00)', 'error')
        return
      }
      const newScene: Scene = { ...newSceneData, id: crypto.randomUUID() }
      onUpdateProject({ ...project, scenes: project.scenes.map(s => s.id === sceneId ? newScene : s) })
      showNotification('Сцена успешно заменена', 'success')
    } catch (e) {
      showNotification('Ошибка чтения буфера обмена', 'error')
    }
  }

  const handleCaptureFrame = async () => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(videoRef.current, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      showNotification('Сохранение превью...', 'info')
      const fd = new FormData()
      fd.append('file', blob, 'thumbnail.jpg')
      fd.append('project_path', getProjectPath(project))
      fd.append('folder', 'packaging')
      try {
        const res = await fetch(`${API}/api/v1/media/upload`, { method: 'POST', body: fd })
        const data = await res.json()
        if (res.ok && data.status === 'ok') {
          onUpdateProject({ ...project, metadata: { ...project.metadata, thumbnail: data.path } })
          showNotification('Превью (Thumbnail) успешно сохранено!', 'success')
        }
      } catch (e) {
        showNotification('Ошибка сохранения превью', 'error')
      }
    }, 'image/jpeg', 0.9)
  }

  useHotkeys('Space', false, () => setPlayWithAudio(p => !p))
  useHotkeys('Enter', true, () => runRender())
  useHotkeys('KeyS', true, () => handleExportProject())
  useHotkeys('KeyZ', true, () => undo())
  useHotkeys('KeyY', true, () => redo())

  useHotkeys('ArrowUp', true, () => {
    const idx = project.scenes.findIndex(s => s.id === activeSceneId)
    if (idx > 0) handleSelectScene(project.scenes[idx - 1].id)
  })
  useHotkeys('ArrowDown', true, () => {
    const idx = project.scenes.findIndex(s => s.id === activeSceneId)
    if (idx !== -1 && idx < project.scenes.length - 1) handleSelectScene(project.scenes[idx + 1].id)
  })
  useHotkeys('KeyJ', true, () => {
    if (!activeScene) return
    const dirtyFrag = activeScene.fragments.find(f => {
      if (!f.audioFileName) return true
      if (f.lastAudioHash && f.lastAudioHash !== hashCode(f.text)) return true
      return false
    })
    if (dirtyFrag) { runVoiceGenFragment(activeScene.id, dirtyFrag.id); return }
    if (!activeScene.ignoreTsx) {
      const cd = !activeScene.remotionCode || (activeScene.lastCodeHash && activeScene.lastCodeHash !== hashCode(generateRemotionPrompt(project, activeScene)))
      if (cd) { runCodeGen(activeScene); return }
    }
    showNotification('Сцена актуальна, генерация не требуется', 'info')
  })

  return {
    activeSceneId, activeScene, centerView, previewFormat, voiceModel, speed, numSteps, guidanceScale, duration,
    denoise, preprocessPrompt, postprocessOutput, isAiSettingsOpen, audioLoaded, playWithAudio, isVoiceboxOpen,
    newVoiceName, newVoiceText, newVoiceTags, newVoiceAudioPath, isAutoPipelineRunning, pipelineStep, isGeneratingAudio,
    isSyncing, isGeneratingCode, isRendering, renderType, renderProgress, isSettingsOpen, useWhisper, autoOffloadVram,
    renderedVideos, playingTargetId, videoRef, audioRef, refVoiceInputRef,
    setActiveSceneId: handleSelectScene, setCenterView, setPreviewFormat, setVoiceModel, setSpeed, setNumSteps,
    setGuidanceScale, setDuration, setDenoise, setPreprocessPrompt, setPostprocessOutput, setIsAiSettingsOpen,
    setPlayWithAudio, setIsVoiceboxOpen, setNewVoiceName, setNewVoiceText, setNewVoiceTags, setIsSettingsOpen,
    setUseWhisper, setAutoOffloadVram, handleSceneDragStart, handleSceneDrop, handleFragDragStart, handleFragDrop,
    toggleIgnoreTsx, handleAddScene, handleDeleteScene, handleUpdateSceneTitle, handleAddFragment, handleDeleteFragment,
    handleFragmentTextChange, handleUpdateCode, handleCodeHistory, handleResetAllSync, handleResetAudio, handleProcessAudio,
    handleUnloadVram, handleFixAudioPacing, handleUploadRefVoiceAudio, handleSaveCustomVoice, handleDeleteCustomVoice, runVoiceGenAllScenes,
    runVoiceGenFragment, runSyncAllScenes, runCodeGen, runRender, runProjectRender, handleFullAutoPipeline, handleCancelAll,
    handleExportProject, showNotification, handleUpdateMarkdown, handleUpdateFragmentBRoll, handleUnlinkFragmentBRoll,
    handleNudgeTiming, handleCaptureFrame, ttsEngine, llmEngine, apiKeys,
    handleExportScene, handleReplaceScene, handleCopyFixPacingPrompt,
  }
}
