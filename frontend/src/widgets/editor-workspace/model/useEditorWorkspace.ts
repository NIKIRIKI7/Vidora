import { useState, useRef, useCallback, useEffect, type ChangeEvent } from 'react'
import type { ProjectSettings, Scene, SceneFragment, CustomVoice, VideoFormat } from '@entities/project'
import { useNotificationStore, useProjectStore, useSettingsStore, parseMarkdownFull, serializeSceneToMarkdown, parseSceneMarkdown, serializeProjectToMarkdown } from '@entities/project'
import { generateRemotionPrompt } from '@widgets/editor-workspace/lib/generateRemotionPrompt'
import { useHotkeys } from '@shared/lib/useHotkeys'
import { API, getProjectPath, parseTcString, hashCode, sanitizeFilename } from '@widgets/editor-workspace/lib/helpers'
import { normalizeText, recalculateTimingsProportionally } from '@widgets/editor-workspace/lib/timingAlgorithms'
import type { CenterViewMode } from './types'
import { useAudio, type AudioOptions } from './useAudio'
import { useRender, pushCodeHistory } from './useRender'

interface Props {
  project: ProjectSettings
  onUpdateProject: (project: ProjectSettings) => void
}

export const useEditorWorkspace = ({ project, onUpdateProject }: Props) => {
  const [activeSceneId, setActiveSceneId] = useState(project.scenes[0]?.id)
  const [centerView, setCenterView] = useState<CenterViewMode>('player')
  const [previewFormat, setPreviewFormat] = useState<VideoFormat | null>(null)
  
  const [voiceModel, setVoiceModel] = useState('aria')
  const [speed, setSpeed] = useState(1)
  const [numSteps, setNumSteps] = useState(64)
  const [guidanceScale, setGuidanceScale] = useState(3.0)
  const [duration, setDuration] = useState(0.0)
  const [denoise, setDenoise] = useState(true)
  const [preprocessPrompt, setPreprocessPrompt] = useState(true)
  const [postprocessOutput, setPostprocessOutput] = useState(true)

  useEffect(() => {
    if (project.activeGlobalVoiceId) {
      const gv = useSettingsStore.getState().globalVoices.find(v => v.id === project.activeGlobalVoiceId)
      if (gv) {
        setSpeed(gv.settings.speed)
        setNumSteps(gv.settings.numSteps)
        setGuidanceScale(gv.settings.guidanceScale)
      }
    }
  }, [project.activeGlobalVoiceId])
  
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false)
  const [playWithAudio, setPlayWithAudio] = useState(true)
  const [isVoiceboxOpen, setIsVoiceboxOpen] = useState(false)
  const [newVoiceName, setNewVoiceName] = useState('')
  const [newVoiceText, setNewVoiceText] = useState('')
  const [newVoiceTags, setNewVoiceTags] = useState('')
  const [newVoiceAudioPath, setNewVoiceAudioPath] = useState<string | null>(null)

  const [isAutoPipelineRunning, setIsAutoPipelineRunning] = useState(false)
  const [pipelineStep, setPipelineStep] = useState<string>('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [useWhisper, setUseWhisper] = useState(true)
  const [autoOffloadVram, setAutoOffloadVram] = useState(true)

  const [draggedSceneIdx, setDraggedSceneIdx] = useState<number | null>(null)
  const [draggedFragIdx, setDraggedFragIdx] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const refVoiceInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)

  const showNotification = useNotificationStore(s => s.showNotification)
  const undo = useProjectStore(s => s.undo)
  const redo = useProjectStore(s => s.redo)
  const aiMode = useSettingsStore(s => s.aiMode)
  const cloudProvider = useSettingsStore(s => s.cloudProvider)
  const cloudEngines = useSettingsStore(s => s.cloudEngines)
  const localEngines = useSettingsStore(s => s.localEngines)
  const apiKeys = useSettingsStore(s => s.apiKeys)

  // ponytail: передаём только ключ выбранного провайдера, чтобы шлюз не путался
  const activeApiKeys = {
    ...apiKeys,
    routerai: cloudProvider === 'routerai' ? apiKeys.routerai : undefined,
    aitunnel: cloudProvider === 'aitunnel' ? apiKeys.aitunnel : undefined,
  }

  const ttsEngine = aiMode === 'cloud' ? cloudEngines.audio : localEngines.audio
  const llmEngine = aiMode === 'cloud' ? cloudEngines.visual : localEngines.visual

  const activeScene = project.scenes.find(s => s.id === activeSceneId)

  // ponytail: auto-sync rawMarkdown on scene/metadata/montage changes
  const handleUpdateProjectSync = useCallback((newProject: ProjectSettings, skipMdSync = false) => {
    if (!skipMdSync && (newProject.scenes !== project.scenes || newProject.metadata !== project.metadata || newProject.montage !== project.montage)) {
      newProject.rawMarkdown = serializeProjectToMarkdown(newProject)
    }
    onUpdateProject(newProject)
  }, [project, onUpdateProject])

  const voiceOpts: AudioOptions = { voiceModel, speed, numSteps, guidanceScale, duration, denoise, preprocessPrompt, postprocessOutput, autoOffloadVram, ttsEngine, apiKeys: activeApiKeys, customVoices: project.customVoices }

  const audio = useAudio({ project, onUpdateProject: handleUpdateProjectSync, activeScene, activeSceneId, voiceOpts, useWhisper, autoOffloadVram, showNotification, abortControllerRef })
  const render = useRender({ project, onUpdateProject: handleUpdateProjectSync, activeScene, llmEngine, apiKeys: activeApiKeys, audioLoaded: audio.audioLoaded, showNotification, abortControllerRef, currentTaskIdRef })

  const handleSelectScene = (id: string) => { setActiveSceneId(id); render.setPlayingTargetId(id) }

  const handleUpdateMarkdown = (newMd: string) => {
    const parsed = parseMarkdownFull(newMd)
    const mergedScenes = parsed.scenes?.map((newScene, sIdx) => {
      const oldScene: Partial<Scene> = project.scenes[sIdx] || {}

      const oldTotalText = oldScene.fragments?.map(f => normalizeText(f.text || '')).join('') || ''
      const newTotalText = newScene.fragments.map(f => normalizeText(f.text)).join('')

      let mergedFragments: SceneFragment[] = newScene.fragments.map((newFrag, fIdx) => {
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

      if (oldTotalText === newTotalText && project.audioMode === 'scene' && oldScene.fragments && oldScene.fragments.length > 0) {
        const firstStart = oldScene.fragments[0].startTime || 0;
        const lastEnd = oldScene.fragments[oldScene.fragments.length - 1].endTime || 0;
        if (lastEnd > firstStart) {
           mergedFragments = recalculateTimingsProportionally(mergedFragments, lastEnd - firstStart) as SceneFragment[];
        }
      }

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

    handleUpdateProjectSync({
      ...project,
      rawMarkdown: newMd,
      metadata: parsed.metadata ?? project.metadata,
      montage: parsed.montage ?? project.montage,
      scenes: mergedScenes ?? project.scenes,
    }, true)
  }

  const handleUpdateFragmentBRoll = (fragId: string, filename: string) => {
    if (!activeScene) return
    const updatedFragments = activeScene.fragments.map(f => f.id === fragId ? { ...f, bRollFileName: filename } : f)
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s) })
  }

  const handleReplaceFragmentAudio = (fragId: string, path: string) => {
    if (!activeScene) return
    const updatedFragments = activeScene.fragments.map(f => f.id === fragId ? { ...f, audioFileName: path, lastAudioHash: hashCode(f.text) } : f)
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s) })
  }

  const handleUnlinkFragmentBRoll = (fragId: string) => {
    if (!activeScene) return
    const updatedFragments = activeScene.fragments.map(f => f.id === fragId ? { ...f, bRollFileName: undefined } : f)
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s) })
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
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s) })
  }

  const handleUpdateFragmentBounds = (fragId: string, edge: 'start' | 'end', newTime: number) => {
    if (!activeScene) return
    const updatedFragments = [...activeScene.fragments]
    const idx = updatedFragments.findIndex(f => f.id === fragId)
    if (idx === -1) return

    const safeTime = Math.max(0, Number(newTime.toFixed(3)))

    if (edge === 'start') {
      const maxStart = (updatedFragments[idx].endTime || 1) - 0.1
      const finalStart = Math.min(safeTime, maxStart)
      updatedFragments[idx] = { ...updatedFragments[idx], startTime: finalStart }
      if (idx > 0) {
        updatedFragments[idx - 1] = { ...updatedFragments[idx - 1], endTime: finalStart }
      }
    } else {
      const minEnd = (updatedFragments[idx].startTime || 0) + 0.1
      const finalEnd = Math.max(safeTime, minEnd)
      updatedFragments[idx] = { ...updatedFragments[idx], endTime: finalEnd }
      if (idx < updatedFragments.length - 1) {
        updatedFragments[idx + 1] = { ...updatedFragments[idx + 1], startTime: finalEnd }
      }
    }

    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s) })
  }

  const handleCancelAll = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    setIsAutoPipelineRunning(false)
    setPipelineStep('Отменено')

    if (currentTaskIdRef.current) {
      try {
        const res = await fetch(`${API}/api/v1/render/cancel/${currentTaskIdRef.current}`, { method: 'POST' })
        if (!res.ok && res.status !== 404) console.warn('Не удалось отменить рендер:', await res.text())
      } catch {
        console.error('Ошибка отмены рендера')
      }
      currentTaskIdRef.current = null
    }
    showNotification('Все процессы отменены', 'info')
  }

  const handleSceneDragStart = (idx: number) => () => setDraggedSceneIdx(idx)
  const handleSceneDrop = (dropIdx: number) => () => {
    if (draggedSceneIdx === null || draggedSceneIdx === dropIdx) { setDraggedSceneIdx(null); return }
    const scenes = [...project.scenes]
    const [moved] = scenes.splice(draggedSceneIdx, 1)
    scenes.splice(dropIdx, 0, moved)
    handleUpdateProjectSync({ ...project, scenes })
    setDraggedSceneIdx(null)
  }

  const handleFragDragStart = (idx: number) => () => setDraggedFragIdx(idx)
  const handleFragDrop = (dropIdx: number) => () => {
    if (!activeScene || draggedFragIdx === null || draggedFragIdx === dropIdx) { setDraggedFragIdx(null); return }
    const fragments = [...activeScene.fragments]
    const [moved] = fragments.splice(draggedFragIdx, 1)
    fragments.splice(dropIdx, 0, moved)
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments } : s)) })
    setDraggedFragIdx(null)
  }

  const toggleIgnoreTsx = (sceneId: string) => {
    const updatedScenes = project.scenes.map(s => (s.id === sceneId ? { ...s, ignoreTsx: !s.ignoreTsx } : s))
    handleUpdateProjectSync({ ...project, scenes: updatedScenes })
  }

  const handleAddScene = () => {
    const newScene: Scene = {
      id: crypto.randomUUID(), title: `Сцена ${project.scenes.length + 1}`, timecode: '00:00:00',
      fragments: [{ id: crypto.randomUUID(), visualNote: 'A-roll: Описание кадра', text: 'Текст новой сцены...' }],
    }
    handleUpdateProjectSync({ ...project, scenes: [...project.scenes, newScene] })
    setActiveSceneId(newScene.id)
    showNotification('Новая сцена добавлена', 'success')
  }

  const handleDeleteScene = (sceneId: string) => {
    if (project.scenes.length <= 1) { showNotification('Сценарий должен содержать хотя бы одну сцену', 'error'); return }
    const updatedScenes = project.scenes.filter(s => s.id !== sceneId)
    handleUpdateProjectSync({ ...project, scenes: updatedScenes })
    if (activeSceneId === sceneId) setActiveSceneId(updatedScenes[0].id)
    showNotification('Сцена удалена', 'info')
  }

  const handleUpdateSceneTitle = (sceneId: string, title: string, timecode: string) => {
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => (s.id === sceneId ? { ...s, title, timecode } : s)) })
  }

  const handleAddFragment = () => {
    if (!activeScene) return
    const newFrag: SceneFragment = { id: crypto.randomUUID(), visualNote: 'Визуальная ремарка', text: 'Текст суфлера...' }
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: [...s.fragments, newFrag] } : s)) })
    showNotification('Фрагмент добавлен', 'success')
  }

  const handleDeleteFragment = (fragId: string) => {
    if (!activeScene) return
    if (activeScene.fragments.length <= 1) { showNotification('Сцена должна содержать хотя бы один фрагмент', 'error'); return }
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: s.fragments.filter(f => f.id !== fragId) } : s) })
    showNotification('Фрагмент удален', 'info')
  }

  const handleFragmentTextChange = (fragId: string, newText: string, newVisualNote?: string) => {
    if (!activeScene) return
    const oldTotalText = activeScene.fragments.map(f => normalizeText(f.text)).join('')
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
    const newTotalText = updatedFragments.map(f => normalizeText(f.text)).join('')
    if (oldTotalText === newTotalText && project.audioMode === 'scene') {
      const firstStartTime = activeScene.fragments[0].startTime || 0;
      const lastEndTime = activeScene.fragments[activeScene.fragments.length - 1].endTime || 0;
      const totalDuration = lastEndTime - firstStartTime;

      if (totalDuration > 0) {
        const remapped = recalculateTimingsProportionally(updatedFragments, totalDuration);
        handleUpdateProjectSync({
          ...project,
          scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: remapped } : s)
        });
        return;
      }
    }
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)) })
  }

  const handleUpdateCode = (code: string) => {
    if (!activeScene) return
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, ...pushCodeHistory(activeScene, code, project) } : s)) })
  }

  const handleCodeHistory = (step: number) => {
    if (!activeScene) return
    const hist = activeScene.remotionCodeHistory || []
    if (hist.length === 0) return
    let idx = activeScene.historyIndex ?? (hist.length - 1)
    idx = Math.max(0, Math.min(hist.length - 1, idx + step))
    handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, remotionCode: hist[idx], historyIndex: idx } : s) })
  }

  const handleFixAudioPacing = async (sceneId: string) => {
    await audio.handleProcessAudio('silero_vad', 'scene', sceneId)
    if (abortControllerRef.current?.signal.aborted) return
    const scene = project.scenes.find(s => s.id === sceneId)
    if (scene) {
      showNotification('Синхронизация новых таймингов...', 'info')
      await audio.runSyncAllScenes([scene])
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
    } catch { showNotification('Ошибка загрузки референса', 'error') }
    e.target.value = ''
  }

  const handleSaveCustomVoice = () => {
    if (!newVoiceName || !newVoiceAudioPath) { showNotification('Укажите имя и загрузите файл', 'error'); return }
    const newVoice: CustomVoice = {
      id: crypto.randomUUID(), name: newVoiceName, refAudioPath: newVoiceAudioPath,
      refText: newVoiceText, tags: newVoiceTags.split(',').map(t => t.trim()).filter(Boolean),
    }
    handleUpdateProjectSync({ ...project, customVoices: [...(project.customVoices || []), newVoice] })
    setVoiceModel(newVoice.id)
    setIsVoiceboxOpen(false)
    setNewVoiceName('')
    setNewVoiceText('')
    setNewVoiceTags('')
    setNewVoiceAudioPath(null)
    showNotification(`Голос "${newVoice.name}" сохранен!`, 'success')
  }

  const handleDeleteCustomVoice = (voiceId: string) => {
    handleUpdateProjectSync({ ...project, customVoices: (project.customVoices || []).filter(v => v.id !== voiceId) })
    if (voiceModel === voiceId) setVoiceModel('aria')
    showNotification('Голос удален', 'info')
  }

  const handleFullAutoPipeline = async () => {
    if (!activeScene) return
    setIsAutoPipelineRunning(true)

    setPipelineStep('1/4 Озвучка всех сцен...')
    const { scenes: voiceScenes } = await audio.runVoiceGenAllScenes(project.scenes)
    if (!isAutoPipelineRunning || abortControllerRef.current?.signal.aborted) return

    setPipelineStep('2/4 Whisper Alignment...')
    const syncedScenes = await audio.runSyncAllScenes(voiceScenes)
    if (!isAutoPipelineRunning || abortControllerRef.current?.signal.aborted) return

    const currentActiveScene = syncedScenes.find(s => s.id === activeSceneId) || activeScene

    setPipelineStep('3/4 Remotion TSX...')
    await render.runCodeGen(currentActiveScene)
    if (!isAutoPipelineRunning || abortControllerRef.current?.signal.aborted) return

    setPipelineStep('4/4 Рендер MP4...')
    await render.runProjectRender()

    setIsAutoPipelineRunning(false)
    setPipelineStep('')
  }

  const handleCopyFixPacingPrompt = (sceneId: string, currentPacing: number, threshold: number) => {
    const scene = project.scenes.find(s => s.id === sceneId)
    if (!scene) return
    const md = serializeSceneToMarkdown(scene)
    const template = project.promptOverrides?.fixPacing || useSettingsStore.getState().globalPrompts.fixPacing || ''
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
      handleUpdateProjectSync({ ...project, scenes: project.scenes.map(s => s.id === sceneId ? newScene : s) })
      showNotification('Сцена успешно заменена', 'success')
    } catch { showNotification('Ошибка чтения буфера обмена', 'error') }
  }

  const handleCaptureFrame = async () => {
    if (!videoRef.current) {
      showNotification('Видео еще не отрендерено', 'error')
      return
    }

    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current.videoWidth || 1920
      canvas.height = videoRef.current.videoHeight || 1080
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          showNotification('Ошибка создания изображения', 'error')
          return
        }
        
        showNotification('Скачивание превью...', 'info')
        
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Thumbnail_${sanitizeFilename(project.name)}.jpg`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)

        const fd = new FormData()
        fd.append('file', blob, 'thumbnail.jpg')
        fd.append('project_path', getProjectPath(project))
        fd.append('folder', 'packaging')
        try {
          const res = await fetch(`${API}/api/v1/media/upload`, { method: 'POST', body: fd })
          const data = await res.json()
          if (res.ok && data.status === 'ok') {
            handleUpdateProjectSync({ ...project, metadata: { ...project.metadata, thumbnail: data.path } })
          }
        } catch { 
          console.error('Ошибка сохранения превью на бэкенд')
        }
      }, 'image/jpeg', 0.9)
    } catch (e) {
      console.error(e)
      showNotification('Не удалось захватить кадр. Возможно блокирует CORS.', 'error')
    }
  }

  useHotkeys('Space', false, () => setPlayWithAudio(p => !p))
  useHotkeys('Enter', true, () => render.runRender())
  useHotkeys('KeyS', true, () => render.handleExportProject())
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
    const dirtyFrag = activeScene.fragments.find(f => !f.audioFileName || (f.lastAudioHash && f.lastAudioHash !== hashCode(f.text)))
    if (dirtyFrag) { audio.runVoiceGenFragment(activeScene.id, dirtyFrag.id); return }
    if (!activeScene.ignoreTsx) {
      const cd = !activeScene.remotionCode || (activeScene.lastCodeHash && activeScene.lastCodeHash !== hashCode(generateRemotionPrompt(project, activeScene)))
      if (cd) { render.runCodeGen(activeScene); return }
    }
    showNotification('Сцена актуальна, генерация не требуется', 'info')
  })

  return {
    ...audio, ...render,
    activeSceneId, activeScene, centerView, previewFormat, voiceModel, speed, numSteps, guidanceScale, duration,
    denoise, preprocessPrompt, postprocessOutput, isAiSettingsOpen, playWithAudio, isVoiceboxOpen,
    newVoiceName, newVoiceText, newVoiceTags, newVoiceAudioPath, isAutoPipelineRunning, pipelineStep,
    isSettingsOpen, useWhisper, autoOffloadVram, videoRef, audioRef, refVoiceInputRef, ttsEngine, llmEngine, apiKeys: activeApiKeys,

    setActiveSceneId: handleSelectScene, setCenterView, setPreviewFormat, setVoiceModel, setSpeed, setNumSteps,
    setGuidanceScale, setDuration, setDenoise, setPreprocessPrompt, setPostprocessOutput, setIsAiSettingsOpen,
    setPlayWithAudio, setIsVoiceboxOpen, setNewVoiceName, setNewVoiceText, setNewVoiceTags, setIsSettingsOpen,
    setUseWhisper, setAutoOffloadVram, handleSceneDragStart, handleSceneDrop, handleFragDragStart, handleFragDrop,
    toggleIgnoreTsx, handleAddScene, handleDeleteScene, handleUpdateSceneTitle, handleAddFragment, handleDeleteFragment,
    handleFragmentTextChange, handleUpdateCode, handleCodeHistory, handleFixAudioPacing, handleUploadRefVoiceAudio, 
    handleProcessAdvancedSilence: audio.handleProcessAdvancedSilence,
    handleSaveCustomVoice, handleDeleteCustomVoice, handleFullAutoPipeline, handleCancelAll, showNotification, 
      handleUpdateMarkdown, handleUpdateFragmentBRoll, handleUnlinkFragmentBRoll, handleNudgeTiming, handleCaptureFrame, handleReplaceFragmentAudio,
      handleExportScene, handleReplaceScene, handleCopyFixPacingPrompt,
      handleUpdateFragmentBounds,
  }
}
