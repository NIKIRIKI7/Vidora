import { useState, useRef, useEffect, ChangeEvent } from 'react'
import { SceneCard, Icon, Button, Modal, FieldGroup, Input, Dropdown, DropdownItem, Spinner, Slider, Select, Switch } from '@shared/ui'
import { generateRemotionPrompt, generateFragmentPrompt, generateProjectPrompt } from '../lib/generateRemotionPrompt'
import { useNotificationStore } from '@entities/project'
import { saveAudioToDisk, saveSceneCodeToDisk, saveRenderedVideoToDisk } from '@features/file-system'
import type { ProjectSettings, Scene, SceneFragment, CustomVoice } from '@entities/project'

const API = 'http://127.0.0.1:8355'

interface Props {
  project: ProjectSettings
  projects: ProjectSettings[]
  onSwitchProject: (id: string) => void
  onNewProject: () => void
  onUpdateProject: (project: ProjectSettings) => void
  onDeleteProject: (id: string) => void
}

const getProjectPath = (p: ProjectSettings) => p.projectDir?.name || p.name || 'vidora_projects'

const sanitizeFilename = (str: string) => str.replace(/[^a-zA-Z0-9а-яА-Я_]/g, '_')

const formatTimecode = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const pad = (num: number) => num.toString().padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

const formatShortTimecode = (sec: number): string => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${m}:${pad(s)}`
}

const parseTcString = (str: string): number | null => {
  if (!str) return null
  const parts = str.trim().split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

// Приоритет 1: Точные тайминги Whisper
const getWhisperSyncedDuration = (fragments: SceneFragment[]): number | null => {
  const syncedEnds = fragments
    .map(f => f.endTime)
    .filter((e): e is number => typeof e === 'number' && e > 0)

  if (syncedEnds.length > 0) {
    return Math.max(...syncedEnds)
  }
  return null
}

// Приоритет 2: Интервал из заголовков сцены (например "2:05 - 3:35" -> 90 сек)
const getSceneDurationFromTimecode = (timecodeStr: string): number | null => {
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

// Приоритет 3: Интервал из визуальных ремарок (например "0:00 - 0:04")
const getVisualNoteDuration = (fragments: SceneFragment[]): number | null => {
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

const getAudioPathForScene = (project: ProjectSettings, scene: Scene): string => {
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

// Генерация мастер-TSX с заданным порядком приоритетов
const buildMasterProjectTsx = (project: ProjectSettings): string => {
  const fps = Number(project.montage?.fps) || 30
  const width = project.format === '9:16' ? 1080 : 1920
  const height = project.format === '9:16' ? 1920 : 1080

  const sceneBlocks: string[] = []
  const sequenceTags: string[] = []
  let cumulativeFrames = 0

  project.scenes.forEach((scene, index) => {
    const sceneNum = index + 1
    const compName = `SceneComp_${sceneNum}`

    // 1. Приоритет 1: Точные Whisper-тайминги
    let sceneDurationSec = getWhisperSyncedDuration(scene.fragments)

    // 2. Приоритет 2: Интервал из заголовков сцены (например "2:05 - 3:35" -> 90 сек)
    if (!sceneDurationSec) {
      sceneDurationSec = getSceneDurationFromTimecode(scene.timecode)
    }

    // 3. Приоритет 3: Визуальные ремарки (например "0:00 - 0:04")
    if (!sceneDurationSec) {
      sceneDurationSec = getVisualNoteDuration(scene.fragments)
    }

    // 4. Фолбэк по длине текста или 5 секунд
    if (!sceneDurationSec || sceneDurationSec <= 0) {
      sceneDurationSec = scene.fragments.reduce((acc, f) => {
        return acc + Math.max(f.text.split(' ').length / 2.5, 1.0)
      }, 0) || 5
    }

    const durationInFrames = Math.max(Math.ceil(sceneDurationSec * fps), 30)

    if (scene.ignoreTsx || !scene.remotionCode?.trim()) {
      sceneBlocks.push(`
const ${compName}: React.FC = () => {
  return <AbsoluteFill style={{ backgroundColor: '#000000' }} />;
};`)
    } else {
      // ponytail: strip all imports to prevent esbuild syntax errors on concat
      let cleanCode = scene.remotionCode
        .replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, '')
        .replace(/import\s+['"].*?['"];?/g, '')
        .replace(/^[ \t]*React\s+from\s+['"].*?['"];?/gm, '')
        .replace(/^[ \t]*from\s+['"].*?['"];?/gm, '')
        .replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)/g, 'function $1')
        .replace(/export\s+default\s+const\s+([A-Za-z0-9_]+)/g, 'const $1')
        .replace(/export\s+default\s+([A-Za-z0-9_]+);?/g, '')
        .replace(/export\s+const\s+/g, 'const ')
        .replace(/export\s+function\s+/g, 'function ')

      sceneBlocks.push(`
// === Сцена ${sceneNum}: ${scene.title} ===
${cleanCode}
const ${compName} = typeof SceneComponent !== 'undefined' ? SceneComponent : (typeof MainVideo !== 'undefined' ? MainVideo : (() => <AbsoluteFill style={{ backgroundColor: '#000000' }} />));
`)
    }

    sequenceTags.push(`
        <Sequence from={${cumulativeFrames}} durationInFrames={${durationInFrames}}>
          <${compName} />
        </Sequence>`)

    cumulativeFrames += durationInFrames
  })

  const totalFrames = Math.max(cumulativeFrames, 30)

  return `
import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

export const compositionConfig = {
  id: 'MasterProject',
  durationInFrames: ${totalFrames},
  durationInSeconds: ${Math.ceil(totalFrames / fps)},
  fps: ${fps},
  width: ${width},
  height: ${height},
};

${sceneBlocks.join('\n\n')}

export const MasterProject: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      ${sequenceTags.join('\n')}
    </AbsoluteFill>
  );
};

export default MasterProject;
`.trim()
}

export const EditorWorkspace = ({ project, projects, onSwitchProject, onNewProject, onUpdateProject, onDeleteProject }: Props) => {
  const [activeSceneId, setActiveSceneId] = useState(project.scenes[0]?.id)
  const [centerView, setCenterView] = useState<'player' | 'code'>('player')
  const [voiceModel, setVoiceModel] = useState('aria')
  const [speed, setSpeed] = useState(1.0)
  const [numSteps, setNumSteps] = useState(32)
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
  const [isRendering, setIsRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderTaskId, setRenderTaskId] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [useWhisper, setUseWhisper] = useState(true)
  const [autoOffloadVram, setAutoOffloadVram] = useState(true)
  const [renderedVideos, setRenderedVideos] = useState<Record<string, string>>({})
  const [playingTargetId, setPlayingTargetId] = useState<string | null>(null)
  const [draggedSceneIdx, setDraggedSceneIdx] = useState<number | null>(null)
  const [draggedFragIdx, setDraggedFragIdx] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const refVoiceInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const showNotification = useNotificationStore(s => s.showNotification)

  const activeScene = project.scenes.find(s => s.id === activeSceneId)

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
    onUpdateProject({
      ...project,
      scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments } : s)
    })
    setDraggedFragIdx(null)
  }

  const toggleIgnoreTsx = (sceneId: string) => {
    const updatedScenes = project.scenes.map(s =>
      s.id === sceneId ? { ...s, ignoreTsx: !s.ignoreTsx } : s
    )
    onUpdateProject({ ...project, scenes: updatedScenes })
  }

  useEffect(() => {
    let isMounted = true
    const ws = new WebSocket(`${API.replace('http', 'ws')}/ws/events/frontend`)
    ws.onopen = () => { if (!isMounted) ws.close() }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'RENDER_PROGRESS') {
          setRenderProgress(msg.payload.progress)
          if (msg.payload.status === 'done' && msg.payload.output_path) {
            setRenderedVideos(prev => ({ ...prev, [msg.payload.target_id]: msg.payload.output_path }))
            setPlayingTargetId(msg.payload.target_id)

            if (project.projectDir) {
              const mediaUrl = `${API}/api/v1/render/media?path=${encodeURIComponent(msg.payload.output_path)}`
              fetch(mediaUrl)
                .then(res => res.blob())
                .then(blob => {
                  const videoFile = new File([blob], `${msg.payload.target_id}.mp4`, { type: 'video/mp4' })
                  saveRenderedVideoToDisk(project.projectDir!, videoFile, msg.payload.target, msg.payload.target_id)
                })
                .catch(err => console.warn('Ошибка сохранения видео на диск:', err))
            }
          }
          if (msg.payload.progress >= 100 || msg.payload.status === 'done' || msg.payload.status === 'error') {
            setIsRendering(false)
            setRenderTaskId(null)
            showNotification(msg.payload.status === 'error' ? 'Ошибка рендера' : 'Рендер завершен!', msg.payload.status === 'error' ? 'error' : 'success')
          }
        }
      } catch {}
    }
    wsRef.current = ws
    return () => {
      isMounted = false
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [project.projectDir, showNotification])

  useEffect(() => {
    if (!activeScene) {
      setAudioLoaded(null)
      return
    }
    const expectedPath = getAudioPathForScene(project, activeScene)
    fetch(`${API}/api/v1/render/media?path=${encodeURIComponent(expectedPath)}`, { method: 'HEAD' })
      .then(res => {
        if (res.ok) {
          setAudioLoaded(expectedPath)
        } else {
          setAudioLoaded(null)
        }
      })
      .catch(() => setAudioLoaded(null))
  }, [activeSceneId, project.name, project.scenes])

  const handleAddScene = () => {
    const newScene: Scene = {
      id: crypto.randomUUID(),
      title: `Сцена ${project.scenes.length + 1}`,
      timecode: '00:00:00',
      fragments: [{
        id: crypto.randomUUID(),
        visualNote: 'A-roll: Описание кадра',
        text: 'Текст новой сцены...',
      }]
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
      scenes: project.scenes.map(s => s.id === sceneId ? { ...s, title, timecode } : s)
    }
    onUpdateProject(updated)
  }

  const handleAddFragment = () => {
    if (!activeScene) return
    const newFrag: SceneFragment = {
      id: crypto.randomUUID(),
      visualNote: 'Визуальная ремарка',
      text: 'Текст суфлера...',
    }
    const updated = {
      ...project,
      scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: [...s.fragments, newFrag] } : s)
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
      scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: s.fragments.filter(f => f.id !== fragId) } : s)
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

      const match = vNote.match(/^(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)/)
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
      scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)
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
      }))
    }))
    onUpdateProject({
      ...project,
      scenes: updatedScenes,
    })
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
      tags: newVoiceTags.split(',').map(t => t.trim()).filter(Boolean)
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

  const runVoiceGenAllScenes = async (scenesToProcess?: Scene[] | unknown): Promise<{ scenes: Scene[]; activeAudio: string | null }> => {
    const targetScenes = Array.isArray(scenesToProcess) ? scenesToProcess : project.scenes
    if (!targetScenes || targetScenes.length === 0) return { scenes: targetScenes || [], activeAudio: null }

    setIsGeneratingAudio(true)
    try {
      const customVoice = project.customVoices?.find(v => v.id === voiceModel)
      const projectPath = getProjectPath(project)
      let updatedScenes = [...targetScenes]
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
          body: JSON.stringify(payload)
        })

        const data = await res.json()
        if (res.ok && data.status === 'ok') {
          successCount++
          const relativeAudioPath = `${projectPath}/assets/voice/${data.audio_url}`
          const updatedFragments = scene.fragments.map((f, i) =>
            i === 0 ? { ...f, audioFileName: relativeAudioPath } : f
          )
          updatedScenes[idx] = {
            ...scene,
            fragments: updatedFragments,
          }
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

      if (activeSceneAudioPath) {
        setAudioLoaded(activeSceneAudioPath)
      }

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
    const targetScenes = Array.isArray(scenesToSync) ? scenesToSync : project.scenes
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
          })
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
          const timingMap = Object.fromEntries(data.fragments_timings.map((t: any) => [t.id, t]))
          syncedFragments = scene.fragments.map(f => {
            const t = timingMap[f.id]
            if (!t) return f

            const startSec = t.startTime
            const endSec = t.endTime

            let newVisualNote = f.visualNote
            const startTc = formatShortTimecode(startSec)
            const endTc = formatShortTimecode(endSec)
            const tcPrefix = `${startTc} - ${endTc}: `

            const tcRegex = /^(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?):?\s*/
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
          sceneDuration = Math.max(...syncedFragments.map(f => f.endTime || 0), 0)
        }

        if (sceneDuration <= 0) {
          sceneDuration = scene.fragments.reduce((acc, f) => acc + Math.max(f.text.split(' ').length / 2.5, 1.0), 0)
        }

        const sceneTimecode = formatTimecode(cumulativeTime)
        cumulativeTime += sceneDuration

        updatedScenes.push({
          ...scene,
          timecode: sceneTimecode,
          fragments: syncedFragments,
        })
      }

      onUpdateProject({
        ...project,
        scenes: updatedScenes,
      })

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
    const sceneToUse = (targetScene && typeof targetScene === 'object' && 'id' in targetScene)
      ? (targetScene as Scene)
      : activeScene

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
        })
      })

      const data = await res.json()
      if (data.tsx_code) {
        onUpdateProject({
          ...project,
          scenes: project.scenes.map(s => s.id === sceneToUse.id ? { ...s, remotionCode: data.tsx_code } : s)
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
          tsx_code: typeof code === 'string' ? code : (activeScene.ignoreTsx ? 'export const SceneComponent = () => <AbsoluteFill style={{ backgroundColor: "#000000" }} />;' : (activeScene.remotionCode || '')),
          audio_path: typeof audioPath === 'string' ? audioPath : (audioLoaded || getAudioPathForScene(project, activeScene)),
        })
      })
      const data = await res.json()
      if (data.task_id) {
        setRenderTaskId(data.task_id)
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
        'error'
      )
      return
    }

    setIsRendering(true)
    setRenderProgress(0)

    try {
      const masterTsxCode = buildMasterProjectTsx(project)
      const projectPath = getProjectPath(project)

      const audioPaths = project.scenes.map(s => getAudioPathForScene(project, s))
      const fullAudioPath = `${projectPath}/assets/voice/Full_Project_${sanitizeFilename(project.name)}.wav`

      try {
        await fetch(`${API}/api/v1/audio/concat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio_paths: audioPaths,
            output_path: fullAudioPath
          })
        })
      } catch (concatErr) {
        console.warn('Не удалось объединить аудиозаписи сцен:', concatErr)
      }

      const res = await fetch(`${API}/api/v1/render/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.name,
          target: 'project',
          target_id: `Project_${project.name}`,
          project_path: projectPath,
          tsx_code: masterTsxCode,
          audio_path: fullAudioPath,
        })
      })

      const data = await res.json()
      if (data.task_id) {
        setRenderTaskId(data.task_id)
        setCenterView('player')
        showNotification('Старт сборки всего проекта!', 'success')
      }
    } catch {
      setIsRendering(false)
      showNotification('Ошибка старта рендера проекта', 'error')
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

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-background">
      <header className="h-16 shrink-0 border-b border-white/10 bg-surface-container/60 backdrop-blur-2xl px-6 flex justify-between items-center z-20">
        <div className="flex items-center gap-4">
          <span className="font-display text-2xl font-bold text-primary tracking-tight">Vidora</span>
          <div className="h-4 w-px bg-white/20" />
          <Dropdown trigger={
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 font-medium text-sm">
              <Icon name="folder" className="text-secondary text-[18px]" />
              {project.name}
              <Icon name="expand_more" className="text-on-surface-variant text-[18px]" />
            </button>
          }>
            {projects.map(p => (
              <DropdownItem key={p.name} onClick={() => onSwitchProject(p.name)}>{p.name}</DropdownItem>
            ))}
            <div className="h-px bg-white/10 my-1" />
            <DropdownItem onClick={onNewProject} className="text-primary"><Icon name="add" className="inline text-[16px] mr-1" /> Новый проект</DropdownItem>
            <DropdownItem onClick={() => setIsSettingsOpen(true)}><Icon name="settings" className="inline text-[16px] mr-1" /> Настройки</DropdownItem>
          </Dropdown>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            disabled={isAutoPipelineRunning || isRendering}
            onClick={handleFullAutoPipeline}
            icon="bolt"
            filledIcon
            className="bg-gradient-to-r from-secondary to-primary text-black font-semibold shadow-[0_0_20px_rgba(79,219,200,0.3)]"
          >
            {isAutoPipelineRunning ? pipelineStep : 'Сгенерировать всё'}
          </Button>

          <Button
            variant="dashed"
            disabled={isRendering}
            onClick={runProjectRender}
            className="border-primary/40 text-primary hover:bg-primary/10"
          >
            {isRendering ? `Рендер... ${renderProgress}%` : '🎬 Рендер всего проекта'}
          </Button>

          <Button
            variant="dashed"
            disabled={isRendering}
            onClick={() => runRender()}
          >
            Только текущая сцена
          </Button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Левый сайдбар со сценами */}
        <aside className="w-[320px] border-r border-white/10 bg-surface-container/30 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-surface-container-lowest/30">
            <h2 className="font-title-md text-title-md text-on-surface">Сценарий</h2>
            <button
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              onClick={handleAddScene}
            >
              <Icon name="add" className="text-[14px]" /> Сцена
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
            {project.scenes.map((scene, idx) => {
              const isSceneActive = activeSceneId === scene.id
              const hasAudio = Boolean(scene.fragments.some(f => f.audioFileName) || (isSceneActive && audioLoaded))
              const hasSync = Boolean(scene.fragments.some(f => f.startTime !== undefined && f.startTime !== null))
              const isIgnored = Boolean(scene.ignoreTsx)
              const hasCode = Boolean(scene.remotionCode && scene.remotionCode.trim().length > 0)

              return (
                <div
                  key={scene.id}
                  draggable
                  onDragStart={handleSceneDragStart(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleSceneDrop(idx)}
                  onClick={() => setActiveSceneId(scene.id)}
                  className="flex flex-col gap-1 group relative"
                >
                  <Icon name="drag_indicator" className="text-[12px] text-on-surface-variant/30 absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
                  <div className="flex items-center justify-between">
                    <input
                      className="text-xs font-semibold bg-transparent text-primary outline-none focus:border-b border-primary/50 w-full"
                      value={scene.title}
                      onChange={(e) => handleUpdateSceneTitle(scene.id, e.target.value, scene.timecode)}
                    />
                    <div className="flex items-center gap-1">
                      <button
                        className={`text-[11px] p-1 rounded transition-colors ${isIgnored ? 'text-error font-medium' : 'text-on-surface-variant/40 hover:text-white'}`}
                        onClick={(e) => { e.stopPropagation(); toggleIgnoreTsx(scene.id) }}
                        title={isIgnored ? "TSX игнорируется (черный экран)" : "Нажмите, чтобы игнорировать TSX"}
                      >
                        {isIgnored ? '⬛ Игнор' : '⬛'}
                      </button>
                      <button
                        className="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity p-1"
                        onClick={(e) => { e.stopPropagation(); handleDeleteScene(scene.id) }}
                        title="Удалить сцену"
                      >
                        <Icon name="delete" className="text-[14px]" />
                      </button>
                    </div>
                  </div>
                  <SceneCard
                    scene={`Сцена ${idx + 1}`}
                    time={scene.timecode}
                    description={scene.fragments[0]?.text.substring(0, 50) + '...'}
                    isActive={activeSceneId === scene.id}
                  />
                  <div className="flex gap-1 pl-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${hasAudio ? 'border-secondary/40 text-secondary bg-secondary/10 font-medium' : 'border-white/10 text-on-surface-variant/30 bg-white/5'}`}>
                      🎙️ Аудио
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${hasSync ? 'border-primary/40 text-primary bg-primary/10 font-medium' : 'border-white/10 text-on-surface-variant/30 bg-white/5'}`}>
                      ⏱️ Тайминги
                    </span>
                    {isIgnored ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/20 text-on-surface-variant bg-black font-medium" title="Черный экран при рендере">
                        ⬛ Чёрный экран
                      </span>
                    ) : (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${hasCode ? 'border-accent/40 text-accent bg-accent/10 font-medium' : 'border-white/10 text-on-surface-variant/30 bg-white/5'}`}>
                        💻 TSX
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Центральный просмотрщик */}
        <div className="flex-1 flex flex-col bg-background relative overflow-hidden">
          <div className="h-12 border-b border-white/5 flex items-center px-4 justify-between bg-surface-container-lowest/50">
            <div className="flex gap-2">
              <button
                onClick={() => setCenterView('player')}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${centerView === 'player' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}
              >
                🎬 Предпросмотр Видео
              </button>
              <button
                onClick={() => setCenterView('code')}
                className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${centerView === 'code' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}
              >
                💻 Remotion TSX Код
              </button>
            </div>
            {centerView === 'player' && (
              <Button
                variant="ghost"
                icon={playWithAudio ? "volume_up" : "volume_off"}
                onClick={() => setPlayWithAudio(!playWithAudio)}
                className="text-xs"
              >
                {playWithAudio ? 'Звук: Вкл' : 'Звук: Выкл'}
              </Button>
            )}
          </div>
          <div className="flex-1 flex flex-col justify-center items-center p-6 overflow-y-auto custom-scrollbar">
            {centerView === 'player' ? (
              <div className="w-full max-w-[840px] aspect-video bg-black rounded-xl border border-white/10 shadow-2xl relative flex items-center justify-center overflow-hidden">
                {renderedVideos[playingTargetId || ''] ? (
                  <video
                    ref={videoRef}
                    src={`${API}/api/v1/render/media?path=${encodeURIComponent(renderedVideos[playingTargetId || ''])}`}
                    controls
                    autoPlay
                    muted={!playWithAudio}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-on-surface-variant/50 font-medium flex flex-col items-center gap-3">
                    <Icon name="movie" className="text-[56px] text-primary/40" />
                    <span>Нажмите «Сгенерировать всё» или «Рендер всего проекта» для сборки</span>
                  </div>
                )}
                {audioLoaded && (
                  <audio ref={audioRef} src={`${API}/api/v1/render/media?path=${encodeURIComponent(audioLoaded)}`} className="hidden" />
                )}
              </div>
            ) : (
              <div className="w-full h-full max-w-[900px] flex flex-col gap-2">
                {activeScene?.ignoreTsx ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-black border border-white/10 rounded-xl text-on-surface-variant/60 font-mono text-sm gap-2">
                    <Icon name="block" className="text-[32px] text-error" />
                    <span>Сцена помечена как «Игнорировать TSX»</span>
                    <span className="text-xs opacity-60">При рендере будет отображаться черный экран</span>
                  </div>
                ) : (
                  <textarea
                    className="w-full h-full font-mono text-[12px] bg-surface-container-lowest/60 border border-white/10 p-4 rounded-xl text-on-surface resize-none outline-none focus:border-primary/50"
                    value={activeScene?.remotionCode || ''}
                    onChange={(e) => {
                      if (!activeScene) return
                      onUpdateProject({
                        ...project,
                        scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, remotionCode: e.target.value } : s)
                      })
                    }}
                    placeholder="// TSX код компонента сгенерируется здесь..."
                    spellCheck={false}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Правый инспектор */}
        <aside className="w-[380px] border-l border-white/10 flex flex-col bg-surface-container/60 backdrop-blur-2xl shrink-0">
          <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <h3 className="font-title-md text-title-md text-on-surface">Инспектор Пайплайна</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">
            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="font-label text-xs uppercase tracking-wider text-primary">Сценарий фрагментов</span>
                <button className="text-xs text-secondary hover:underline flex items-center gap-1" onClick={handleAddFragment}>
                  <Icon name="add" className="text-[14px]" /> Фрагмент
                </button>
              </div>
              {activeScene?.fragments.map((frag, i) => (
                <div
                  key={frag.id}
                  draggable
                  onDragStart={handleFragDragStart(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFragDrop(i)}
                  className="p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl flex flex-col gap-2 relative group"
                >
                  <Icon name="drag_indicator" className="text-[12px] text-on-surface-variant/30 absolute -left-0.5 top-6 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-secondary font-medium">
                      Фрагмент {i + 1} ({frag.startTime?.toFixed(1) || '0'}s - {frag.endTime?.toFixed(1) || '0'}s)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-0.5"
                        onClick={() => {
                          if (activeScene) {
                            navigator.clipboard.writeText(generateFragmentPrompt(project, activeScene, frag))
                            showNotification(`Промпт фрагмента ${i + 1} скопирован!`, 'success')
                          }
                        }}
                      >
                        <Icon name="content_copy" className="text-[12px]" /> Промпт
                      </button>
                      <button className="text-on-surface-variant hover:text-error" onClick={() => handleDeleteFragment(frag.id)}>
                        <Icon name="delete" className="text-[14px]" />
                      </button>
                    </div>
                  </div>
                  <input
                    className="text-xs bg-transparent border-b border-white/10 text-on-surface-variant focus:border-primary outline-none py-1"
                    value={frag.visualNote}
                    onChange={(e) => handleFragmentTextChange(frag.id, frag.text, e.target.value)}
                    placeholder="Визуальная ремарка..."
                  />
                  <textarea
                    className="text-xs bg-transparent text-on-surface resize-none outline-none"
                    rows={2}
                    value={frag.text}
                    onChange={(e) => handleFragmentTextChange(frag.id, e.target.value)}
                  />
                </div>
              ))}
            </section>
            
            <div className="h-px bg-white/5" />

            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="font-label text-xs uppercase tracking-wider text-primary">1. Озвучка (OmniVoice)</span>
                <button
                  className="text-xs text-secondary hover:underline flex items-center gap-1 font-medium"
                  onClick={() => setIsVoiceboxOpen(true)}
                >
                  <Icon name="record_voice_over" className="text-[14px]" /> Voicebox Студия
                </button>
              </div>
              <FieldGroup label="Голосовая модель">
                <Select value={voiceModel} onChange={(e) => setVoiceModel(e.target.value)}>
                  <option value="aria">Neural - Aria (Женский, Спокойный)</option>
                  <option value="marcus">Neural - Marcus (Мужской, Глубокий)</option>
                  <option value="nova">Expressive - Nova (Энергичный)</option>
                  {project.customVoices?.map(v => (
                    <option key={v.id} value={v.id}>🎙️ Cloned - {v.name} {v.tags?.length ? `[${v.tags.join(', ')}]` : ''}</option>
                  ))}
                </Select>
              </FieldGroup>
              <Button variant="dashed" disabled={isGeneratingAudio} onClick={() => runVoiceGenAllScenes()}>
                {isGeneratingAudio ? <Spinner /> : 'Сгенерировать голос для всех сцен'}
              </Button>
            </section>

            <div className="h-px bg-white/5" />

            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="font-label text-xs uppercase tracking-wider text-primary">2. Синхронизация (Whisper)</span>
                <div className="flex items-center gap-2">
                  {project.scenes.some(s => s.fragments.some(f => f.startTime !== undefined)) && (
                    <button
                      className="text-[11px] text-on-surface-variant hover:text-error flex items-center gap-1 transition-colors"
                      onClick={handleResetAllSync}
                      title="Сбросить все тайминги"
                    >
                      <Icon name="restart_alt" className="text-[14px]" /> Сбросить
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2.5 p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl">
                <label className="flex items-center justify-between text-xs text-on-surface-variant cursor-pointer">
                  Использовать WhisperX ИИ
                  <input type="checkbox" checked={useWhisper} onChange={e => setUseWhisper(e.target.checked)} className="accent-primary size-3.5" />
                </label>
                <label className="flex items-center justify-between text-xs text-on-surface-variant cursor-pointer">
                  Авто-освобождение VRAM
                  <input type="checkbox" checked={autoOffloadVram} onChange={e => setAutoOffloadVram(e.target.checked)} className="accent-primary size-3.5" />
                </label>
                <button
                  onClick={handleUnloadVram}
                  className="text-[11px] text-secondary hover:underline flex items-center gap-1 mt-1 self-start"
                >
                  <Icon name="memory" className="text-[14px]" /> Очистить VRAM вручную
                </button>
              </div>
              <Button variant="dashed" disabled={isSyncing} onClick={() => runSyncAllScenes()}>
                {isSyncing ? <Spinner /> : 'Синхронизировать все сцены'}
              </Button>
            </section>

            <div className="h-px bg-white/5" />

            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="font-label text-xs uppercase tracking-wider text-primary">3. Код Remotion (TSX)</span>
                <div className="flex gap-1">
                  <button
                    className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10"
                    onClick={() => {
                      if (activeScene) {
                        navigator.clipboard.writeText(generateRemotionPrompt(project, activeScene))
                        showNotification('Промпт сцены с таймкодами скопирован!', 'success')
                      }
                    }}
                  >
                    <Icon name="content_copy" className="text-[12px]" /> Сцену
                  </button>
                  <button
                    className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10"
                    onClick={() => {
                      navigator.clipboard.writeText(generateProjectPrompt(project))
                      showNotification('Промпт проекта скопирован!', 'success')
                    }}
                  >
                    <Icon name="content_copy" className="text-[12px]" /> Проект
                  </button>
                </div>
              </div>

              {activeScene && (
                <div className="p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl">
                  <Switch
                    checked={Boolean(activeScene.ignoreTsx)}
                    onChange={() => toggleIgnoreTsx(activeScene.id)}
                    label="Игнорировать TSX (черный экран)"
                  />
                </div>
              )}

              <Button
                variant="dashed"
                disabled={isGeneratingCode || Boolean(activeScene?.ignoreTsx)}
                onClick={() => runCodeGen()}
              >
                {isGeneratingCode ? <Spinner /> : 'Сгенерировать TSX через Ollama'}
              </Button>
            </section>

            <div className="h-px bg-white/5" />

            <section className="flex flex-col gap-3">
              <span className="font-label text-xs uppercase tracking-wider text-primary">4. Финальный Рендер</span>
              <Button variant="primary" disabled={isRendering} onClick={runProjectRender}>
                {isRendering ? <Spinner /> : '🎬 Собрать весь MP4 проект'}
              </Button>
            </section>
          </div>
        </aside>
      </main>

      {/* Модальные окна */}
      <Modal isOpen={isVoiceboxOpen} onClose={() => setIsVoiceboxOpen(false)} title="Voicebox — Клонирование голоса">
        <div className="flex flex-col gap-5 w-full pb-4">
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-label uppercase text-primary">Добавить новый голос</h4>
            <FieldGroup label="Имя диктора / Модели">
              <Input
                value={newVoiceName}
                onChange={e => setNewVoiceName(e.target.value)}
                placeholder="Например: Артем (Информационный)"
              />
            </FieldGroup>
            <FieldGroup label="Аудио референс (.wav/.mp3)">
              <input type="file" ref={refVoiceInputRef} className="hidden" accept="audio/*" onChange={handleUploadRefVoiceAudio} />
              <Button variant="dashed" icon="upload" onClick={() => refVoiceInputRef.current?.click()}>
                {newVoiceAudioPath ? 'Заменить референс' : 'Загрузить аудиофайл'}
              </Button>
              {newVoiceAudioPath && <span className="text-[11px] text-secondary font-mono truncate">{newVoiceAudioPath}</span>}
            </FieldGroup>
            <FieldGroup label="Текст референса (опционально)">
              <Input
                value={newVoiceText}
                onChange={e => setNewVoiceText(e.target.value)}
                placeholder="Текст, произнесенный в референсе..."
              />
            </FieldGroup>
            <FieldGroup label="Теги (через запятую)">
              <Input
                value={newVoiceTags}
                onChange={e => setNewVoiceTags(e.target.value)}
                placeholder="мужской, глубокий, рус"
              />
            </FieldGroup>
            <Button variant="primary" onClick={handleSaveCustomVoice} className="mt-2">
              Сохранить голос
            </Button>
          </div>
          {project.customVoices && project.customVoices.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
              <h4 className="text-xs font-label uppercase text-on-surface-variant">Сохранённые голоса</h4>
              {project.customVoices.map(v => (
                <div key={v.id} className="flex justify-between items-center p-2 rounded-lg bg-surface-container-lowest/50 border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-on-surface">{v.name}</span>
                    <span className="text-[10px] text-on-surface-variant/60">{v.tags?.join(', ')}</span>
                  </div>
                  <button className="text-error hover:text-error/80 p-1" onClick={() => handleDeleteCustomVoice(v.id)}>
                    <Icon name="delete" className="text-[16px]" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Настройки проекта">
        <div className="flex flex-col gap-4">
          <Button variant="dashed" className="text-error border-error/30 hover:bg-error/10" onClick={() => onDeleteProject(project.name)}>
            Удалить проект
          </Button>
        </div>
      </Modal>
    </div>
  )
}
