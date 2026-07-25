import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { CustomVoice, ProjectSettings, Scene, SceneFragment } from '@entities/project'
import { useNotificationStore } from '@entities/project'
import { saveAudioToDisk, saveRenderedVideoToDisk, saveSceneCodeToDisk } from '@features/file-system'
import { generateRemotionPrompt } from '../lib/generateRemotionPrompt'
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
  const [voiceModel, setVoiceModel] = useState('aria')
  const [speed] = useState(1.0)
  const [numSteps] = useState(32)
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
  const [isMerging, setIsMerging] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [useWhisper, setUseWhisper] = useState(true)
  const [autoOffloadVram, setAutoOffloadVram] = useState(true)
  const [draggedSceneIdx, setDraggedSceneIdx] = useState<number | null>(null)
  const [draggedFragIdx, setDraggedFragIdx] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const refVoiceInputRef = useRef<HTMLInputElement>(null)

  const showNotification = useNotificationStore(s => s.showNotification)
  const activeScene = project.scenes.find(s => s.id === activeSceneId)

  const {
    isRendering,
    setIsRendering,
    renderProgress,
    setRenderProgress,
    renderedVideos,
    setRenderedVideos,
    playingTargetId,
    setPlayingTargetId,
    renderListenersRef,
  } = useRenderWebSocket(project.projectDir)

  // Drag & drop handlers
  const handleSceneDragStart = (idx: number) => () => setDraggedSceneIdx(idx)
  const handleSceneDrop = (dropIdx: number) => () => {
    if (draggedSceneIdx === null || draggedSceneIdx === dropIdx) {
      setDraggedSceneIdx(null)
      return
    }
    const scenes = [...project.scenes]
    const [moved] = scenes.splice(draggedSceneIdx, 1)
    scenes.splice(dropIdx, 0, moved)
    onUpdateProject({ ...project, scenes })
    setDraggedSceneIdx(null)
  }

  const handleFragDragStart = (idx: number) => () => setDraggedFragIdx(idx)
  const handleFragDrop = (dropIdx: number) => () => {
    if (!activeScene || draggedFragIdx === null || draggedFragIdx === dropIdx) {
      setDraggedFragIdx(null)
      return
    }
    const fragments = [...activeScene.fragments]
    const [moved] = fragments.splice(draggedFragIdx, 1)
    fragments.splice(dropIdx, 0, moved)
    onUpdateProject({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments } : s)),
    })
    setDraggedFragIdx(null)
  }

  const toggleIgnoreTsx = (sceneId: string) => {
    const updatedScenes = project.scenes.map(s => (s.id === sceneId ? { ...s, ignoreTsx: !s.ignoreTsx } : s))
    onUpdateProject({ ...project, scenes: updatedScenes })
  }

  // Fetch active scene audio presence
  useEffect(() => {
    let isCancelled = false
    if (!activeScene) {
      Promise.resolve().then(() => {
        if (!isCancelled) setAudioLoaded(null)
      })
      return
    }
    const expectedPath = getAudioPathForScene(project, activeScene)
    fetch(`${API}/api/v1/render/media?path=${encodeURIComponent(expectedPath)}`, { method: 'HEAD' })
      .then(res => {
        if (!isCancelled) setAudioLoaded(res.ok ? expectedPath : null)
      })
      .catch(() => {
        if (!isCancelled) setAudioLoaded(null)
      })
    return () => {
      isCancelled = true
    }
  }, [activeScene, project])

  // Scene Operations
  const handleAddScene = () => {
    const newScene: Scene = {
      id: crypto.randomUUID(),
      title: `Сцена ${project.scenes.length + 1}`,
      timecode: '00:00:00',
      fragments: [
        {
          id: crypto.randomUUID(),
          visualNote: 'A-roll: Описание кадра',
          text: 'Текст новой сцены...',
        },
      ],
    }
    const updated = { ...project, scenes: [...project.scenes, newScene] }
    onUpdateProject(updated)
    setActiveSceneId(newScene.id)
    showNotification('Новая сцена добавлена', 'success')
  }

  const handleDeleteScene = (sceneId: string) => {
    if (project.scenes.length <= 1) {
      showNotification('Сценарий должен содержать хотя бы одну сцену', 'error')
      return
    }
    const updatedScenes = project.scenes.filter(s => s.id !== sceneId)
    const updated = { ...project, scenes: updatedScenes }
    onUpdateProject(updated)
    if (activeSceneId === sceneId) setActiveSceneId(updatedScenes[0].id)
    showNotification('Сцена удалена', 'info')
  }

  const handleUpdateSceneTitle = (sceneId: string, title: string, timecode: string) => {
    const updated = {
      ...project,
      scenes: project.scenes.map(s => (s.id === sceneId ? { ...s, title, timecode } : s)),
    }
    onUpdateProject(updated)
  }

  // Fragment Operations
  const handleAddFragment = () => {
    if (!activeScene) return
    const newFrag: SceneFragment = {
      id: crypto.randomUUID(),
      visualNote: 'Визуальная ремарка',
      text: 'Текст суфлера...',
    }
    const updated = {
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: [...s.fragments, newFrag] } : s)),
    }
    onUpdateProject(updated)
    showNotification('Фрагмент добавлен', 'success')
  }

  const handleDeleteFragment = (fragId: string) => {
    if (!activeScene) return
    if (activeScene.fragments.length <= 1) {
      showNotification('Сцена должна содержать хотя бы один фрагмент', 'error')
      return
    }
    const updated = {
      ...project,
      scenes: project.scenes.map(s =>
        s.id === activeScene.id ? { ...s, fragments: s.fragments.filter(f => f.id !== fragId) } : s,
      ),
    }
    onUpdateProject(updated)
    showNotification('Фрагмент удален', 'info')
  }

  const handleFragmentTextChange = (fragId: string, newText: string, newVisualNote?: string) => {
    if (!activeScene) return
    const updatedFragments = activeScene.fragments.map(f => {
      if (f.id !== fragId) return f
      const vNote = newVisualNote !== undefined ? newVisualNote : f.visualNote
      let newStart = f.startTime
      let newEnd = f.endTime
      const match = vNote.match(
        /^(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)/,
      )
      if (match) {
        const parsedStart = parseTcString(match[1])
        const parsedEnd = parseTcString(match[4])
        if (parsedStart !== null) newStart = parsedStart
        if (parsedEnd !== null) newEnd = parsedEnd
      }
      return {
        ...f,
        text: newText,
        visualNote: vNote,
        startTime: newStart,
        endTime: newEnd,
      }
    })
    onUpdateProject({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)),
    })
  }

  const handleUpdateCode = (code: string) => {
    if (!activeScene) return
    onUpdateProject({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, remotionCode: code } : s)),
    })
  }

  const handleResetAllSync = () => {
    const updatedScenes = project.scenes.map(s => ({
      ...s,
      timecode: '00:00:00',
      fragments: s.fragments.map(f => ({
        ...f,
        startTime: undefined,
        endTime: undefined,
      })),
    }))
    onUpdateProject({ ...project, scenes: updatedScenes })
    showNotification('Синхронизация сброшена для всех сцен', 'info')
  }

  const handleUnloadVram = async () => {
    try {
      const res = await fetch(`${API}/api/v1/audio/vram/unload`, { method: 'POST' })
      if (res.ok) {
        showNotification('VRAM память видеокарты очищена!', 'success')
      }
    } catch {
      showNotification('Ошибка очистки VRAM', 'error')
    }
  }

  const handleUploadRefVoiceAudio = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('project_path', getProjectPath(project))
    try {
      const res = await fetch(`${API}/api/v1/audio/upload-ref`, { method: 'POST', body: formData })
      const data = await res.json()
      if (data.status === 'ok') {
        setNewVoiceAudioPath(data.ref_audio_path)
        showNotification('Референсный файл загружен', 'success')
      }
    } catch {
      showNotification('Ошибка загрузки референса', 'error')
    }
    e.target.value = ''
  }

  const handleSaveCustomVoice = () => {
    if (!newVoiceName || !newVoiceAudioPath) {
      showNotification('Укажите имя голоса и загрузите аудиофайл', 'error')
      return
    }
    const newVoice: CustomVoice = {
      id: crypto.randomUUID(),
      name: newVoiceName,
      refAudioPath: newVoiceAudioPath,
      refText: newVoiceText,
      tags: newVoiceTags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    }
    const updatedVoices = [...(project.customVoices || []), newVoice]
    onUpdateProject({ ...project, customVoices: updatedVoices })
    setVoiceModel(newVoice.id)
    setIsVoiceboxOpen(false)
    setNewVoiceName('')
    setNewVoiceText('')
    setNewVoiceTags('')
    setNewVoiceAudioPath(null)
    showNotification(`Голос "${newVoice.name}" добавлен в Voicebox!`, 'success')
  }

  const handleDeleteCustomVoice = (voiceId: string) => {
    const updatedVoices = (project.customVoices || []).filter(v => v.id !== voiceId)
    onUpdateProject({ ...project, customVoices: updatedVoices })
    if (voiceModel === voiceId) setVoiceModel('aria')
    showNotification('Голос удален из Voicebox', 'info')
  }

  const handleMergeAudioAndVideo = async () => {
    if (!activeScene) return
    const projectPath = getProjectPath(project)
    const videoPath = renderedVideos[activeScene.id] || renderedVideos[`Project_${project.name}`]
    const audioPath = audioLoaded || getAudioPathForScene(project, activeScene)

    if (!videoPath) {
      showNotification('Сначала отрендерите видео для текущей сцены или проекта', 'error')
      return
    }

    setIsMerging(true)
    try {
      const safeTitle = sanitizeFilename(activeScene.title)
      const outputPath = `${projectPath}/preview/Merged_${safeTitle}.mp4`

      const res = await fetch(`${API}/api/v1/render/merge-audio-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_path: projectPath,
          video_path: videoPath,
          audio_path: audioPath,
          output_path: outputPath,
        }),
      })
      const data = await res.json()

      if (res.ok && data.status === 'ok') {
        setRenderedVideos(prev => ({ ...prev, [activeScene.id]: data.output_path }))
        setPlayingTargetId(activeScene.id)

        if (project.projectDir) {
          try {
            const mediaUrl = `${API}/api/v1/render/media?path=${encodeURIComponent(data.output_path)}`
            const videoRes = await fetch(mediaUrl)
            if (videoRes.ok) {
              const blob = await videoRes.blob()
              const videoFile = new File([blob], `Merged_${safeTitle}.mp4`, { type: 'video/mp4' })
              await saveRenderedVideoToDisk(
                project.projectDir,
                videoFile,
                'preview',
                `Merged_${safeTitle}`
              )
            }
          } catch (err) {
            console.error('Ошибка сохранения объединенного файла:', err)
          }
        }

        showNotification('Аудио и видеоанимация успешно объединены!', 'success')
      } else {
        showNotification(`Ошибка объединения: ${data.detail || 'сбой FFmpeg'}`, 'error')
      }
    } catch (e) {
      console.error(e)
      showNotification('Сбой запроса объединения аудио и видео', 'error')
    } finally {
      setIsMerging(false)
    }
  }

  // Async Pipeline Actions
  const runVoiceGenAllScenes = async (
    scenesToProcess?: Scene[] | unknown,
  ): Promise<{ scenes: Scene[]; activeAudio: string | null }> => {
    const targetScenes: Scene[] = Array.isArray(scenesToProcess) ? scenesToProcess : project.scenes
    if (!targetScenes || targetScenes.length === 0) return { scenes: targetScenes || [], activeAudio: null }
    setIsGeneratingAudio(true)
    try {
      const customVoice = project.customVoices?.find(v => v.id === voiceModel)
      const projectPath = getProjectPath(project)
      const updatedScenes = [...targetScenes]
      let activeSceneAudioPath: string | null = null
      let successCount = 0

      for (let idx = 0; idx < updatedScenes.length; idx++) {
        const scene = updatedScenes[idx]
        const text = scene.fragments.map(f => f.text).join(' ')
        if (!text.trim()) continue
        const safeTitle = sanitizeFilename(scene.title)
        const payload = {
          fragment_id: scene.id,
          file_prefix: `Scene_${safeTitle}`,
          text,
          voice_model: customVoice ? 'clone' : voiceModel,
          ref_audio_path: customVoice ? customVoice.refAudioPath : null,
          ref_text: customVoice ? customVoice.refText : null,
          speed,
          num_steps: numSteps,
          project_path: projectPath,
          auto_offload_vram: autoOffloadVram,
        }
        const res = await fetch(`${API}/api/v1/audio/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (res.ok && data.status === 'ok') {
          successCount++
          const relativeAudioPath = `${projectPath}/assets/voice/${data.audio_url}`
          const updatedFragments = scene.fragments.map((f: SceneFragment, i: number) =>
            i === 0 ? { ...f, audioFileName: relativeAudioPath } : f,
          )
          updatedScenes[idx] = { ...scene, fragments: updatedFragments }
          if (scene.id === activeSceneId) {
            activeSceneAudioPath = relativeAudioPath
          }
          if (project.projectDir) {
            try {
              const mediaUrl = `${API}/api/v1/render/media?path=${encodeURIComponent(relativeAudioPath)}`
              const audioRes = await fetch(mediaUrl)
              if (audioRes.ok) {
                const blob = await audioRes.blob()
                const audioFile = new File([blob], data.audio_url, { type: 'audio/wav' })
                await saveAudioToDisk(project.projectDir, audioFile)
              }
            } catch (fsErr) {
              console.warn('Не удалось записать аудиофайл в директорию пользователя:', fsErr)
            }
          }
        }
      }
      onUpdateProject({ ...project, scenes: updatedScenes })
      if (activeSceneAudioPath) setAudioLoaded(activeSceneAudioPath)
      showNotification(`Озвучка успешно сгенерирована для всех сцен (${successCount}/${targetScenes.length})!`, 'success')
      return { scenes: updatedScenes, activeAudio: activeSceneAudioPath }
    } catch (error) {
      console.error('Ошибка массовой генерации голоса:', error)
      showNotification('Сбой генерации голоса для сцен', 'error')
      return { scenes: targetScenes, activeAudio: null }
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  const runSyncAllScenes = async (scenesToSync?: Scene[] | unknown): Promise<Scene[]> => {
    const targetScenes: Scene[] = Array.isArray(scenesToSync) ? scenesToSync : project.scenes
    setIsSyncing(true)
    try {
      let cumulativeTime = 0
      const updatedScenes: Scene[] = []
      const projectPath = getProjectPath(project)
      let whisperCount = 0
      let fallbackCount = 0

      for (const scene of targetScenes) {
        const audioPathToUse = getAudioPathForScene(project, scene)
        const res = await fetch(`${API}/api/v1/audio/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene_id: scene.id,
            audio_path: audioPathToUse,
            fragments: scene.fragments.map(f => ({ id: f.id, text: f.text })),
            project_path: projectPath,
            use_whisper: useWhisper,
            auto_offload_vram: autoOffloadVram,
          }),
        })
        const data = await res.json()
        if (data.fallback) {
          fallbackCount++
          console.warn(`[SYNC] ⚠️ Сцена "${scene.title}": сработал FALLBACK. Причина: ${data.reason || 'аудио не найдено'}`)
        } else {
          whisperCount++
          console.log(`[SYNC] ✅ Сцена "${scene.title}": сработал WHISPERX.`)
        }

        let syncedFragments = [...scene.fragments]
        let sceneDuration = 0
        if (data.status === 'ok' && data.fragments_timings) {
          const timingMap = Object.fromEntries(data.fragments_timings.map((t: FragmentTiming) => [t.id, t]))
          syncedFragments = scene.fragments.map((f: SceneFragment) => {
            const t = timingMap[f.id]
            if (!t) return f
            const startSec = t.startTime
            const endSec = t.endTime
            let newVisualNote = f.visualNote
            const startTc = formatShortTimecode(startSec)
            const endTc = formatShortTimecode(endSec)
            const tcPrefix = `${startTc} - ${endTc}: `
            const tcRegex =
              /^(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?):?\s*/
            if (tcRegex.test(f.visualNote)) {
              newVisualNote = f.visualNote.replace(tcRegex, tcPrefix)
            }
            return {
              ...f,
              startTime: startSec,
              endTime: endSec,
              visualNote: newVisualNote,
            }
          })
          sceneDuration = Math.max(...syncedFragments.map((f: SceneFragment) => f.endTime || 0), 0)
        }
        if (sceneDuration <= 0) {
          sceneDuration = scene.fragments.reduce(
            (acc: number, f: SceneFragment) => acc + Math.max(f.text.split(' ').length / 2.5, 1.0),
            0,
          )
        }
        const sceneTimecode = formatTimecode(cumulativeTime)
        cumulativeTime += sceneDuration
        updatedScenes.push({
          ...scene,
          timecode: sceneTimecode,
          fragments: syncedFragments,
        })
      }
      onUpdateProject({ ...project, scenes: updatedScenes })
      const summaryMsg = `Синхронизация завершена! (WhisperX: ${whisperCount}, Fallback: ${fallbackCount})`
      showNotification(summaryMsg, fallbackCount > 0 && whisperCount === 0 ? 'info' : 'success')
      return updatedScenes
    } catch (error) {
      console.error('Ошибка выполнения запроса синхронизации:', error)
      showNotification('Сбой синхронизации таймингов', 'error')
      return targetScenes
    } finally {
      setIsSyncing(false)
    }
  }

  const runCodeGen = async (targetScene?: Scene | unknown): Promise<string | null> => {
    const sceneToUse =
      targetScene && typeof targetScene === 'object' && 'id' in targetScene ? (targetScene as Scene) : activeScene
    if (!sceneToUse) return null
    if (sceneToUse.ignoreTsx) {
      showNotification(`Сцена "${sceneToUse.title}" помечена как игнорируемая (черный экран)`, 'info')
      return null
    }
    setIsGeneratingCode(true)
    try {
      const prompt = generateRemotionPrompt(project, sceneToUse)
      const res = await fetch(`${API}/api/v1/code/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_id: sceneToUse.id,
          prompt,
          project_data: project,
          project_path: getProjectPath(project),
        }),
      })
      const data = await res.json()
      if (data.tsx_code) {
        onUpdateProject({
          ...project,
          scenes: project.scenes.map(s => (s.id === sceneToUse.id ? { ...s, remotionCode: data.tsx_code } : s)),
        })
        if (project.projectDir) {
          await saveSceneCodeToDisk(project.projectDir, sceneToUse.id, data.tsx_code)
        }
        showNotification('TSX код сгенерирован', 'success')
        return data.tsx_code
      }
    } catch {
      showNotification('Сбой генерации кода', 'error')
    } finally {
      setIsGeneratingCode(false)
    }
    return null
  }

  const renderSingleScenePromise = (
    sceneId: string,
    code: string,
    audioPath: string,
    projectPath: string,
  ): Promise<string | null> => {
    return new Promise(resolve => {
      fetch(`${API}/api/v1/render/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.name,
          target: 'scene',
          target_id: sceneId,
          project_path: projectPath,
          tsx_code: code,
          audio_path: audioPath,
        }),
      })
        .then(res => res.json())
        .then(data => {
          if (!data.task_id) {
            resolve(null)
            return
          }
          const taskId = data.task_id
          renderListenersRef.current.set(taskId, (payload: RenderPayload) => {
            if (payload.status === 'done') {
              renderListenersRef.current.delete(taskId)
              resolve(payload.output_path || null)
            } else if (payload.status === 'error') {
              renderListenersRef.current.delete(taskId)
              resolve(null)
            }
          })
        })
        .catch(() => resolve(null))
    })
  }

  const runRender = async (code?: string, audioPath?: string) => {
    if (!activeScene) return
    setIsRendering(true)
    setRenderProgress(0)
    try {
      const res = await fetch(`${API}/api/v1/render/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.name,
          target: 'scene',
          target_id: activeScene.id,
          project_path: getProjectPath(project),
          tsx_code:
            typeof code === 'string'
              ? code
              : activeScene.ignoreTsx
                ? 'import { AbsoluteFill } from "remotion"; export const SceneComponent = () => <AbsoluteFill style={{ backgroundColor: "#000000" }} />;'
                : activeScene.remotionCode || '',
          audio_path:
            typeof audioPath === 'string' ? audioPath : audioLoaded || getAudioPathForScene(project, activeScene),
        }),
      })
      const data = await res.json()
      if (data.task_id) {
        setCenterView('player')
      }
    } catch {
      setIsRendering(false)
      showNotification('Ошибка старта рендера', 'error')
    }
  }

  const runProjectRender = async () => {
    const unreadyScene = project.scenes.find(s => !s.ignoreTsx && (!s.remotionCode || !s.remotionCode.trim()))
    if (unreadyScene) {
      showNotification(
        `Нельзя скомпилировать проект! У сцены "${unreadyScene.title}" отсутствует TSX код. Сгенерируйте код или включите "Игнорировать".`,
        'error',
      )
      return
    }
    setIsRendering(true)
    setRenderProgress(0)
    const projectPath = getProjectPath(project)
    const renderedSceneVideoPaths: string[] = []
    try {
      const fps = Number(project.montage?.fps) || 30
      const width = project.format === '9:16' ? 1080 : 1920
      const height = project.format === '9:16' ? 1920 : 1080
      for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i]
        const sceneDurationSec =
          getWhisperSyncedDuration(scene.fragments) ||
          getSceneDurationFromTimecode(scene.timecode) ||
          getVisualNoteDuration(scene.fragments) ||
          5
        const durationInFrames = Math.max(Math.ceil(sceneDurationSec * fps), 30)
        let codeToRender = scene.remotionCode || ''
        if (scene.ignoreTsx || !codeToRender.trim()) {
          codeToRender = `
            import { AbsoluteFill } from 'remotion';
            const compositionConfig = {
              id: 'BlackScreen',
              durationInFrames: ${durationInFrames},
              durationInSeconds: ${Math.ceil(durationInFrames / fps)},
              fps: ${fps},
              width: ${width},
              height: ${height}
            };
            const SceneComponent = () => <AbsoluteFill style={{ backgroundColor: "#000000" }} />;
            export default SceneComponent;
          `.trim()
        }
        const audioPath = getAudioPathForScene(project, scene)
        const sceneVideoPath = await renderSingleScenePromise(scene.id, codeToRender, audioPath, projectPath)
        if (sceneVideoPath) {
          renderedSceneVideoPaths.push(sceneVideoPath)
        } else {
          showNotification(`Сбой рендера сцены "${scene.title}"`, 'error')
          setIsRendering(false)
          return
        }
      }
      const finalProjectVideoPath = `${projectPath}/preview/Project_${sanitizeFilename(project.name)}.mp4`
      const concatRes = await fetch(`${API}/api/v1/render/concat-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_path: projectPath,
          video_paths: renderedSceneVideoPaths,
          output_path: finalProjectVideoPath,
        }),
      })
      const concatData = await concatRes.json()
      if (concatData.status === 'ok') {
        setRenderedVideos(prev => ({ ...prev, [`Project_${project.name}`]: finalProjectVideoPath }))
        setPlayingTargetId(`Project_${project.name}`)
        if (project.projectDir) {
          const mediaUrl = `${API}/api/v1/render/media?path=${encodeURIComponent(finalProjectVideoPath)}`
          const videoRes = await fetch(mediaUrl)
          if (videoRes.ok) {
            const blob = await videoRes.blob()
            const videoFile = new File([blob], `Project_${project.name}.mp4`, { type: 'video/mp4' })
            await saveRenderedVideoToDisk(
              project.projectDir,
              videoFile,
              'project',
              `Project_${project.name}`,
            )
          }
        }
        showNotification('Проект успешно отрендерен и скомпонован!', 'success')
      } else {
        showNotification('Ошибка при объединении видеозаписей проекта', 'error')
      }
    } catch (e) {
      console.error('Ошибка поочередного рендера:', e)
      showNotification('Сбой сборки проекта', 'error')
    } finally {
      setIsRendering(false)
    }
  }

  const handleFullAutoPipeline = async () => {
    if (!activeScene) return
    setIsAutoPipelineRunning(true)
    setPipelineStep('1/4 Озвучка всех сцен...')
    const { scenes: voiceScenes, activeAudio } = await runVoiceGenAllScenes(project.scenes)
    setPipelineStep('2/4 Whisper Alignment...')
    const syncedScenes = await runSyncAllScenes(voiceScenes)
    const currentActiveScene = syncedScenes.find(s => s.id === activeSceneId) || activeScene
    setPipelineStep('3/4 Remotion TSX...')
    const code = await runCodeGen(currentActiveScene)
    setPipelineStep('4/4 Рендер MP4...')
    await runRender(code || currentActiveScene.remotionCode || '', activeAudio || audioLoaded || '')
    setIsAutoPipelineRunning(false)
    setPipelineStep('')
  }

  return {
    // State
    activeSceneId,
    activeScene,
    centerView,
    voiceModel,
    audioLoaded,
    playWithAudio,
    isVoiceboxOpen,
    newVoiceName,
    newVoiceText,
    newVoiceTags,
    newVoiceAudioPath,
    isAutoPipelineRunning,
    pipelineStep,
    isGeneratingAudio,
    isSyncing,
    isGeneratingCode,
    isRendering,
    isMerging,
    renderProgress,
    isSettingsOpen,
    useWhisper,
    autoOffloadVram,
    renderedVideos,
    playingTargetId,
    videoRef,
    audioRef,
    refVoiceInputRef,

    // Setters
    setActiveSceneId,
    setCenterView,
    setVoiceModel,
    setPlayWithAudio,
    setIsVoiceboxOpen,
    setNewVoiceName,
    setNewVoiceText,
    setNewVoiceTags,
    setIsSettingsOpen,
    setUseWhisper,
    setAutoOffloadVram,

    // Operations / Handlers
    handleSceneDragStart,
    handleSceneDrop,
    handleFragDragStart,
    handleFragDrop,
    toggleIgnoreTsx,
    handleAddScene,
    handleDeleteScene,
    handleUpdateSceneTitle,
    handleAddFragment,
    handleDeleteFragment,
    handleFragmentTextChange,
    handleUpdateCode,
    handleResetAllSync,
    handleUnloadVram,
    handleUploadRefVoiceAudio,
    handleSaveCustomVoice,
    handleDeleteCustomVoice,
    handleMergeAudioAndVideo,
    runVoiceGenAllScenes,
    runSyncAllScenes,
    runCodeGen,
    runRender,
    runProjectRender,
    handleFullAutoPipeline,
    showNotification,
  }
}
