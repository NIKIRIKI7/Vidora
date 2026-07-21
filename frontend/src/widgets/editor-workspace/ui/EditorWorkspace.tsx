import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { Badge, SceneCard, Icon, Button, Modal, FieldGroup, Input, Dropdown, DropdownItem, Spinner, Slider, Select } from '@shared/ui'
import { generateRemotionPrompt, generateFragmentPrompt, generateProjectPrompt } from '../lib/generateRemotionPrompt'
import { useNotificationStore } from '@entities/project'
import type { ProjectSettings, AppColors, SceneFragment, AppTypography, Scene } from '@entities/project'

const API = 'http://127.0.0.1:8355'

interface Props {
  project: ProjectSettings
  projects: ProjectSettings[]
  onSwitchProject: (id: string) => void
  onNewProject: () => void
  onUpdateProject: (project: ProjectSettings) => void
  onDeleteProject: (id: string) => void
}

const getProjectPath = (project: ProjectSettings) =>
  project.projectDir?.name || project.name || 'vidora_projects'

export const EditorWorkspace = ({ project, projects, onSwitchProject, onNewProject, onUpdateProject, onDeleteProject }: Props) => {
  const [activeSceneId, setActiveSceneId] = useState(project.scenes[0]?.id)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)

  const [previewTab, setPreviewTab] = useState<'video' | 'scene' | 'fragment'>('video')

  const [audioLoaded, setAudioLoaded] = useState<string | null>(null)
  const [voiceModel, setVoiceModel] = useState('aria')
  const [guidanceScale, setGuidanceScale] = useState(3.0)
  const [numSteps, setNumSteps] = useState(32)
  const [speed, setSpeed] = useState(1.0)
  const [duration, setDuration] = useState(0)
  const [denoise, setDenoise] = useState(true)
  const [preprocessPrompt, setPreprocessPrompt] = useState(true)
  const [postprocessOutput, setPostprocessOutput] = useState(true)
  const [audioTarget, setAudioTarget] = useState<'fragment' | 'scene' | 'all'>('scene')

  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isProcessingAudio, setIsProcessingAudio] = useState(false)
  const [activeProcess, setActiveProcess] = useState<'denoise' | 'normalize' | 'remove_silence' | 'enhance' | 'undo' | null>(null)

  const [isVoiceManagerOpen, setIsVoiceManagerOpen] = useState(false)
  const [newVoiceName, setNewVoiceName] = useState('')
  const [newVoiceText, setNewVoiceText] = useState('')
  const [newVoiceAudioPath, setNewVoiceAudioPath] = useState<string | null>(null)

  const [isRendering, setIsRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderTaskId, setRenderTaskId] = useState<string | null>(null)
  const [targetFrag, setTargetFrag] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioAbortController = useRef<AbortController | null>(null)
  const showNotification = useNotificationStore(s => s.showNotification)

  const activeScene = project.scenes.find(s => s.id === activeSceneId)

  useEffect(() => {
    if (activeScene && activeScene.fragments.length > 0) {
      if (!activeScene.fragments.find(f => f.id === targetFrag)) {
        setTargetFrag(activeScene.fragments[0].id)
      }
    } else {
      setTargetFrag(null)
    }
  }, [activeSceneId, activeScene])

  useEffect(() => {
    const ws = new WebSocket(`${API.replace('http', 'ws')}/ws/events/frontend`)
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'RENDER_PROGRESS') {
          setRenderProgress(msg.payload.progress)
          if (msg.payload.progress >= 100 || msg.payload.status === 'done') {
            setTimeout(() => {
              setIsRendering(false)
              setRenderTaskId(null)
              showNotification('Рендер успешно завершен!', 'success')
            }, 500)
          }
        }
      } catch { /* ignore */ }
    }
    wsRef.current = ws
    return () => ws.close()
  }, [])

  const audioInputRef = useRef<HTMLInputElement>(null)
  const customVoiceAudioRef = useRef<HTMLInputElement>(null)

  const handleSceneChange = (id: string) => {
    setActiveSceneId(id)
    const scene = project.scenes.find(s => s.id === id)
    setCodeInput(scene?.remotionCode || '')
  }

  const getDisplayCode = () => {
    if (codeInput) return codeInput
    if (!activeScene) return '// Выберите сцену'
    const frags = activeScene.fragments
    return `import React from 'react';
import { Composition, Sequence, AbsoluteFill } from 'remotion';

const COLORS = {
  primary: '${project.montage.colors.primary}',
  background: '${project.montage.colors.background}',
  text: '${project.montage.colors.text}'
};

export const Scene_${(activeScene.id || '01').replace(/[^a-zA-Z0-9]/g, '')} = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      ${frags.map((f, i) => {
      const start = Math.round((f.startTime ?? i * 2) * 30)
      const dur = Math.round(((f.endTime ?? (i + 1) * 2) - (f.startTime ?? i * 2)) * 30)
      return `      <Sequence from={${start}} durationInFrames={${dur}}>
        {/* ${f.visualNote} */}
        <div style={{ color: COLORS.text, fontSize: 48, padding: 40, fontFamily: 'system-ui' }}>
          ${f.text}
        </div>
      </Sequence>`
    }).join('\n')}
    </AbsoluteFill>
  );
};`
  }

  const displayCode = getDisplayCode()

  const handleGenerateCode = async () => {
    if (!activeScene) return
    setIsGeneratingCode(true)
    showNotification('Идет генерация TSX кода...', 'info')
    try {
      const prompt = generateRemotionPrompt(project, activeScene)
      const res = await fetch(`${API}/api/v1/code/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_id: activeScene.id,
          prompt,
          project_data: project,
          project_path: getProjectPath(project),
        }),
      })
      const data = await res.json()
      if (data.tsx_code) {
        setCodeInput(data.tsx_code)
        onUpdateProject({
          ...project,
          scenes: project.scenes.map(s =>
            s.id === activeScene.id ? { ...s, remotionCode: data.tsx_code } : s
          ),
        })
        showNotification('Код успешно сгенерирован', 'success')
      }
    } catch {
      showNotification('Ошибка генерации кода. Сервер LLM недоступен.', 'error')
    } finally {
      setIsGeneratingCode(false)
    }
  }

  const handleAudioUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    showNotification('Загрузка аудио...', 'info')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('project_path', getProjectPath(project))
    try {
      const res = await fetch(`${API}/api/v1/audio/upload-ref`, { method: 'POST', body: formData })
      const data = await res.json()
      if (data.status === 'ok') {
        setAudioLoaded(data.ref_audio_path)
        showNotification('Аудио загружено', 'success')
      }
    } catch {
      setAudioLoaded(file.name)
      showNotification('Ошибка загрузки', 'error')
    }
    e.target.value = ''
  }

  const handleCustomVoiceAudioUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('project_path', getProjectPath(project))

    showNotification('Загрузка референса...', 'info')
    try {
      const res = await fetch(`${API}/api/v1/audio/upload-ref`, { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok && data.ref_audio_path) {
        setNewVoiceAudioPath(data.ref_audio_path)
        showNotification('Референс загружен', 'success')
      }
    } catch {
      setNewVoiceAudioPath(file.name)
    }
    e.target.value = ''
  }

  const handleSaveCustomVoice = () => {
    if (!newVoiceName || !newVoiceAudioPath) {
      showNotification('Укажите имя голоса и загрузите аудио-референс', 'error')
      return
    }
    const newVoice = {
      id: crypto.randomUUID(),
      name: newVoiceName,
      refAudioPath: newVoiceAudioPath,
      refText: newVoiceText
    }
    const currentVoices = project.customVoices || []
    onUpdateProject({ ...project, customVoices: [...currentVoices, newVoice] })
    setVoiceModel(newVoice.id)
    setIsVoiceManagerOpen(false)
    setNewVoiceName('')
    setNewVoiceText('')
    setNewVoiceAudioPath(null)
    showNotification('Голос успешно добавлен', 'success')
  }

  const handleDeleteCustomVoice = (id: string) => {
    const currentVoices = project.customVoices || []
    onUpdateProject({ ...project, customVoices: currentVoices.filter(v => v.id !== id) })
    if (voiceModel === id) setVoiceModel('aria')
    showNotification('Голос удален', 'info')
  }

  const handleGenerateAudio = async (target?: 'fragment' | 'scene' | 'all') => {
    if (isGeneratingAudio && audioAbortController.current) {
      audioAbortController.current.abort()
      setIsGeneratingAudio(false)
      showNotification('Генерация отменена пользователем', 'info')
      return
    }

    const mode = target || audioTarget
    if (!activeScene) return

    if (mode === 'fragment' && !targetFrag) {
      showNotification('Пожалуйста, выберите фрагмент для генерации', 'error')
      return
    }

    setIsGeneratingAudio(true)
    audioAbortController.current = new AbortController()
    showNotification('Запущена ИИ генерация аудио. Это может занять время...', 'info')

    const scenes = mode === 'all' ? project.scenes : [activeScene]

    try {
      for (const scene of scenes) {
        if (audioAbortController.current?.signal.aborted) break

        let frags = scene.fragments.filter(f => f.text?.trim())
        if (mode === 'fragment') frags = frags.filter(f => f.id === targetFrag)
        if (!frags.length) continue

        const fullText = frags.map(f => f.text).join(' ')
        const sIdx = project.scenes.findIndex(s => s.id === scene.id) + 1
        const filePrefix = mode === 'fragment'
          ? `Scene_${sIdx}_Frag_${scene.fragments.findIndex(f => f.id === targetFrag) + 1}`
          : `Scene_${sIdx}_Full`

        const customVoice = project.customVoices?.find(v => v.id === voiceModel)

        const payload = {
          fragment_id: mode === 'fragment' ? (targetFrag || scene.id) : scene.id,
          file_prefix: filePrefix,
          text: fullText,
          voice_model: customVoice ? 'clone' : voiceModel,
          guidance_scale: guidanceScale,
          num_steps: numSteps,
          speed: speed,
          duration: duration,
          denoise: denoise,
          preprocess_prompt: preprocessPrompt,
          postprocess_output: postprocessOutput,
          ref_audio_path: customVoice?.refAudioPath || null,
          ref_text: customVoice?.refText || null,
          project_path: getProjectPath(project),
        }

        const res = await fetch(`${API}/api/v1/audio/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: audioAbortController.current.signal
        })
        const data = await res.json()
        if (res.ok && data.status === 'ok') {
          if (scene.id === activeScene.id) setAudioLoaded(data.absolute_path)
          showNotification(`Сцена ${sIdx}: Аудио успешно сгенерировано`, 'success')
        } else {
          showNotification(data.detail || 'Ошибка генерации аудио', 'error')
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        showNotification('Отменено', 'info')
      } else {
        showNotification('Сервер недоступен', 'error')
      }
    } finally {
      setIsGeneratingAudio(false)
      audioAbortController.current = null
    }
  }

  const recalculateTimecodes = (scenes: Scene[]) => {
    let currentTime = 0
    return scenes.map(s => {
      const m = Math.floor(currentTime / 60).toString().padStart(2, '0')
      const sec = Math.floor(currentTime % 60).toString().padStart(2, '0')
      const duration = s.fragments.length > 0 ? (s.fragments[s.fragments.length - 1].endTime ?? 5) : 5
      const newSc = { ...s, timecode: `00:${m}:${sec}` }
      currentTime += duration
      return newSc
    })
  }

  const handleSyncAudioVideo = async () => {
    if (!activeScene || !audioLoaded) return
    setIsSyncing(true)
    showNotification('Whisper: Анализ таймингов...', 'info')

    try {
      const res = await fetch(`${API}/api/v1/audio/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_id: activeScene.id,
          audio_path: audioLoaded,
          fragments: activeScene.fragments.map(f => ({ id: f.id, text: f.text })),
          project_path: getProjectPath(project),
        }),
      })
      const data = await res.json()
      if (data.status === 'ok' && data.fragments_timings) {
        const timingMap = Object.fromEntries(
          data.fragments_timings.map((t: { id: string; startTime: number; endTime: number }) => [t.id, t])
        )
        const updatedFragments = activeScene.fragments.map(frag => {
          const t = timingMap[frag.id]
          return t ? { ...frag, startTime: t.startTime, endTime: t.endTime } : frag
        })
        let newScenes = project.scenes.map(s =>
          s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s
        )
        newScenes = recalculateTimecodes(newScenes)
        onUpdateProject({ ...project, scenes: newScenes })
        showNotification(data.fallback ? 'Синхронизировано приблизительно' : 'Аудио точно синхронизировано', 'success')
      }
    } catch {
      showNotification('Ошибка синхронизации', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleProcessAudio = async (action: 'denoise' | 'normalize' | 'remove_silence' | 'enhance' | 'undo') => {
    if (!audioLoaded) return
    setIsProcessingAudio(true)
    setActiveProcess(action)
    showNotification(action === 'undo' ? 'Откат изменений...' : 'Обработка аудио...', 'info')

    try {
      const endpoint = action === 'undo' ? '/api/v1/audio/undo' : '/api/v1/audio/process'
      const payload = {
        scene_id: activeScene?.id,
        audio_path: audioLoaded,
        action,
        project_path: getProjectPath(project),
      }
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.status === 'ok') {
        setAudioLoaded(data.processed_audio_path)
        showNotification(action === 'undo' ? 'Изменения отменены' : 'Аудио обработано', 'success')
      } else {
        showNotification(data.detail || 'Ошибка', 'error')
      }
    } catch {
      showNotification('Сбой запроса', 'error')
    } finally {
      setIsProcessingAudio(false)
      setActiveProcess(null)
    }
  }

  const startRender = async (target: 'scene' | 'fragment' | 'project') => {
    if (!activeScene) return
    setIsRendering(true)
    setRenderProgress(0)

    const targetId = target === 'fragment'
      ? (targetFrag || activeScene.id)
      : target === 'scene' ? activeScene.id : project.scenes[0]?.id || ''

    showNotification('Запуск процесса рендера...', 'info')
    try {
      const res = await fetch(`${API}/api/v1/render/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.name,
          target,
          target_id: targetId,
          project_path: getProjectPath(project),
        }),
      })
      const { task_id } = await res.json()
      if (task_id) {
        setRenderTaskId(task_id)
        showNotification('Рендер начался', 'success')
      }
    } catch {
      setIsRendering(false)
      showNotification('Ошибка старта рендера', 'error')
    }
  }

  const cancelRender = async () => {
    if (!renderTaskId) return
    showNotification('Отмена рендера...', 'info')
    try {
      await fetch(`${API}/api/v1/render/cancel/${renderTaskId}`, { method: 'POST' })
      setIsRendering(false)
      setRenderTaskId(null)
      setRenderProgress(0)
      showNotification('Рендер отменен', 'success')
    } catch {
      showNotification('Ошибка отмены', 'error')
    }
  }

  const handleProjectDelete = () => {
    onDeleteProject(project.name)
    showNotification('Проект удален', 'info')
    setIsSettingsOpen(false)
  }

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-background">
      <header className="h-16 shrink-0 border-b border-white/10 bg-surface-container/60 backdrop-blur-2xl px-6 flex justify-between items-center z-20">
        <div className="flex items-center gap-4">
          <span className="font-display text-2xl font-bold text-primary tracking-tight">Vidora</span>
          <div className="h-4 w-px bg-white/20" />
          <Dropdown
            trigger={
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors font-medium text-sm">
                <Icon name="folder" className="text-secondary text-[18px]" />
                {project.name}
                <Icon name="expand_more" className="text-on-surface-variant text-[18px]" />
              </button>
            }
          >
            {projects.map(p => (
              <DropdownItem key={p.name} onClick={() => { onSwitchProject(p.name); showNotification(`Открыт проект: ${p.name}`, 'success') }}>
                {p.name === project.name ? '✓ ' : ''}{p.name}
              </DropdownItem>
            ))}
            <div className="h-px bg-white/10 my-1" />
            <DropdownItem onClick={onNewProject} className="text-primary"><Icon name="add" className="inline text-[16px] mr-1 align-text-bottom" /> Новый проект</DropdownItem>
            <DropdownItem onClick={() => setIsSettingsOpen(true)}><Icon name="settings" className="inline text-[16px] mr-1 align-text-bottom" /> Настройки проекта</DropdownItem>
          </Dropdown>
        </div>

        <div className="flex items-center gap-2">
          <Dropdown
            align="right"
            trigger={
              <Button variant="primary" icon="file_export" disabled={isRendering}>
                {isRendering ? `Рендер... ${renderProgress}%` : 'Рендер'} <Icon name="expand_more" />
              </Button>
            }
          >
            <DropdownItem onClick={() => startRender('project')}>Рендер всего проекта</DropdownItem>
            <DropdownItem onClick={() => startRender('scene')}>Рендер текущей сцены</DropdownItem>
            <DropdownItem onClick={() => startRender('fragment')}>Рендер фрагмента</DropdownItem>
          </Dropdown>
          {isRendering && (
            <Button variant="ghost" icon="close" onClick={cancelRender} className="text-error hover:bg-error/10 hover:text-error" title="Отменить рендер" />
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-[320px] border-r border-white/10 bg-surface-container/30 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5 bg-surface-container-lowest/30 flex justify-between items-center">
            <h2 className="font-title-md text-title-md text-on-surface">Сценарий</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
            {project.scenes.map((scene) => (
              <div key={scene.id} onClick={() => handleSceneChange(scene.id)}>
                <SceneCard
                  scene={scene.title}
                  time={scene.timecode}
                  description={scene.fragments[0]?.text.substring(0, 60) + '...'}
                  isActive={activeSceneId === scene.id}
                />
              </div>
            ))}
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-background relative overflow-hidden">
          <div className="h-12 border-b border-white/5 flex items-center px-4 gap-2 bg-surface-container-lowest/50">
            <button
              onClick={() => setPreviewTab('video')}
              className={`px-4 py-1.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${previewTab === 'video' ? 'text-primary border-primary bg-primary/5' : 'text-on-surface-variant border-transparent hover:text-on-surface'}`}
            >
              Плеер (Видео)
            </button>
            <button
              onClick={() => setPreviewTab('scene')}
              className={`px-4 py-1.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${previewTab === 'scene' ? 'text-primary border-primary bg-primary/5' : 'text-on-surface-variant border-transparent hover:text-on-surface'}`}
            >
              Режиссура (Сцена)
            </button>
            <button
              onClick={() => setPreviewTab('fragment')}
              className={`px-4 py-1.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${previewTab === 'fragment' ? 'text-primary border-primary bg-primary/5' : 'text-on-surface-variant border-transparent hover:text-on-surface'}`}
            >
              Настройка Фрагмента
            </button>
          </div>

          <div className="flex-1 flex justify-center items-center p-8 overflow-y-auto custom-scrollbar">
            {previewTab === 'video' && (
              <div className="w-full max-w-[800px] aspect-video bg-black rounded-xl border border-white/10 shadow-2xl relative flex items-center justify-center">
                <span className="text-on-surface-variant/50 font-medium flex flex-col items-center gap-2">
                  <Icon name="movie" className="text-[48px]" />
                  Player Canvas (Remotion Preview)
                </span>
                <div className="absolute bottom-4 left-4 right-4 h-12 bg-surface-container/80 backdrop-blur-xl rounded-lg border border-white/10 flex items-center px-4 gap-4">
                  <Icon name="play_arrow" className="text-white text-[24px] cursor-pointer" filled />
                  <div className="flex-1 h-1 bg-white/20 rounded-full cursor-pointer">
                    <div className="w-1/3 h-full bg-primary rounded-full relative">
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full" />
                    </div>
                  </div>
                  <Icon name="volume_up" className="text-white text-[20px] cursor-pointer" />
                </div>
              </div>
            )}

            {previewTab === 'scene' && activeScene && (
              <div className="w-full max-w-[800px] flex flex-col gap-6 text-on-surface">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-bold font-display">{activeScene.title}</h2>
                  <div className="flex gap-2">
                    <button className="text-on-surface-variant hover:text-primary transition-colors text-xs flex items-center gap-1" onClick={() => { navigator.clipboard.writeText(generateRemotionPrompt(project, activeScene)); showNotification('Промпт сцены скопирован!', 'success') }} title="Копировать промпт сцены">
                      <Icon name="content_copy" className="text-[14px]" /> Сцену
                    </button>
                    <button className="text-on-surface-variant hover:text-primary transition-colors text-xs flex items-center gap-1" onClick={() => { navigator.clipboard.writeText(generateProjectPrompt(project)); showNotification('Промпт проекта скопирован!', 'success') }} title="Копировать промпт проекта">
                      <Icon name="content_copy" className="text-[14px]" /> Проект
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  {activeScene.fragments.map((frag, idx) => (
                    <div key={frag.id} className="p-4 rounded-xl bg-surface-container/40 border border-white/10 flex flex-col gap-2">
                      <div className="flex justify-between items-center text-xs font-mono text-secondary">
                        <span>Фрагмент {idx + 1}</span>
                        <span>{frag.startTime?.toFixed(2) || '0.00'}s - {frag.endTime?.toFixed(2) || '5.00'}s</span>
                      </div>
                      <div className="p-3 bg-black/40 rounded-lg text-sm text-on-surface-variant italic">
                        {frag.visualNote}
                      </div>
                      <div className="text-base">{frag.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {previewTab === 'fragment' && activeScene && (
              <div className="w-full max-w-[600px] flex flex-col gap-4">
                <FieldGroup label="Выберите фрагмент текста">
                  <Select value={targetFrag || ''} onChange={(e) => setTargetFrag(e.target.value)}>
                    {activeScene.fragments.map((f, i) => (
                      <option key={f.id} value={f.id}>
                        Фрагмент {i + 1}: {f.text.substring(0, 40)}...
                      </option>
                    ))}
                  </Select>
                </FieldGroup>
                {targetFrag && (() => {
                  const f = activeScene.fragments.find(x => x.id === targetFrag)
                  if (!f) return null
                  return (
                    <div className="p-6 rounded-xl bg-surface-container border border-primary/20 flex flex-col gap-4 shadow-2xl">
                      <FieldGroup label="Визуальная ремарка">
                        <textarea className="w-full bg-surface-container-lowest border border-white/10 rounded-lg p-3 text-sm text-on-surface focus:border-primary/50 outline-none" rows={3} value={f.visualNote} readOnly />
                      </FieldGroup>
                      <FieldGroup label="Текст суфлера">
                        <textarea className="w-full bg-surface-container-lowest border border-white/10 rounded-lg p-3 text-sm text-on-surface focus:border-primary/50 outline-none" rows={4} value={f.text} readOnly />
                      </FieldGroup>
                      <button className="text-on-surface-variant hover:text-primary transition-colors text-xs flex items-center gap-1 self-end" onClick={() => { navigator.clipboard.writeText(generateFragmentPrompt(project, activeScene, f)); showNotification('Промпт фрагмента скопирован!', 'success') }} title="Копировать промпт фрагмента">
                        <Icon name="content_copy" className="text-[14px]" /> Копировать промпт
                      </button>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>

        <aside className="w-[380px] border-l border-white/10 flex flex-col bg-surface-container/60 backdrop-blur-2xl shrink-0">
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 custom-scrollbar">
            <section className="flex flex-col gap-2">
              <div className="flex justify-between items-center mb-1">
                <h3 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
                  <Icon name="code" className="text-secondary text-[18px]" />
                  Remotion Code
                </h3>
                <div className="flex gap-2">
                  <button className="text-on-surface-variant hover:text-primary transition-colors" onClick={handleGenerateCode} disabled={isGeneratingCode} title="Сгенерировать ИИ">
                    {isGeneratingCode ? <Spinner className="text-[16px]" /> : <Icon name="bolt" className="text-[16px]" />}
                  </button>
                  <button className="text-on-surface-variant hover:text-white" onClick={() => { navigator.clipboard.writeText(displayCode); showNotification('Код скопирован!', 'success') }} title="Копировать TSX">
                    <Icon name="content_copy" className="text-[16px]" />
                  </button>
                </div>
              </div>
              <div className="border border-white/5 shadow-inner bg-surface-container-lowest/50 p-4 rounded-lg overflow-x-auto custom-scrollbar max-h-[300px]">
                <pre className="font-mono text-[12px] text-on-surface-variant leading-relaxed">
                  <code>{displayCode}</code>
                </pre>
              </div>
            </section>

            <div className="h-px w-full bg-white/5" />

            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
                  <Icon name="record_voice_over" className="text-primary text-[18px]" />
                  OmniVoice AI
                </h3>
                <button className="text-[11px] text-primary hover:underline flex items-center gap-1" onClick={() => setIsVoiceManagerOpen(true)}>
                  <Icon name="settings_voice" className="text-[14px]" /> Настроить голоса
                </button>
              </div>

              <FieldGroup label="Голосовая модель">
                <Select value={voiceModel} onChange={(e) => setVoiceModel(e.target.value)}>
                  <option value="aria">Neural - Aria (Женский, Спокойный)</option>
                  <option value="marcus">Neural - Marcus (Мужской, Глубокий)</option>
                  <option value="nova">Expressive - Nova (Женский, Энергичный)</option>
                  {project.customVoices?.map(cv => (
                    <option key={cv.id} value={cv.id}>Custom - {cv.name}</option>
                  ))}
                </Select>
              </FieldGroup>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-label text-xs text-on-surface-variant">Inference Steps</label>
                    <span className="font-mono text-[10px] text-on-surface-variant">{numSteps}</span>
                  </div>
                  <Slider value={numSteps} onChange={(e) => setNumSteps(Number(e.target.value))} min={8} max={64} />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-label text-xs text-on-surface-variant">Скорость</label>
                    <span className="font-mono text-[10px] text-on-surface-variant">{speed.toFixed(2)}x</span>
                  </div>
                  <Slider value={speed * 100} onChange={(e) => setSpeed(Math.round(Number(e.target.value)) / 100)} min={50} max={200} />
                </div>
              </div>

              <div className="h-px bg-white/5 w-full my-1" />

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-label text-[11px] uppercase tracking-wider text-on-surface-variant">Аудиодорожка</span>
                  <button className="text-[11px] text-secondary hover:underline" onClick={() => audioInputRef.current?.click()}>
                    Загрузить вручную
                  </button>
                </div>
                <input type="file" ref={audioInputRef} className="hidden" accept="audio/*" onChange={handleAudioUpload} />

                {audioLoaded ? (
                  <div className="flex flex-col gap-4 animate-in fade-in">
                    <div className="bg-secondary/10 border border-secondary/30 p-3 rounded-xl flex items-center justify-between group">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <Icon name="audio_file" className="text-secondary text-[20px] shrink-0" />
                        <span className="text-xs text-secondary font-medium truncate" title={audioLoaded}>{audioLoaded}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="text-on-surface-variant hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Отменить последнее изменение" onClick={() => handleProcessAudio('undo')}>
                          <Icon name="undo" className="text-[16px]" />
                        </button>
                        <button className="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity" title="Удалить" onClick={() => { setAudioLoaded(null); showNotification('Аудиодорожка очищена', 'info') }}>
                          <Icon name="close" className="text-[16px]" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] uppercase font-label text-on-surface-variant">Инструменты обработки</span>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="dashed" icon={activeProcess === 'denoise' ? undefined : "noise_aware"} className="!py-1.5 !px-2 text-[11px] flex justify-center gap-1.5" disabled={isProcessingAudio || isSyncing} onClick={() => handleProcessAudio('denoise')}>
                          {activeProcess === 'denoise' ? <Spinner className="text-[14px]" /> : 'Убрать шум'}
                        </Button>
                        <Button variant="dashed" icon={activeProcess === 'normalize' ? undefined : "equalizer"} className="!py-1.5 !px-2 text-[11px] flex justify-center gap-1.5" disabled={isProcessingAudio || isSyncing} onClick={() => handleProcessAudio('normalize')}>
                          {activeProcess === 'normalize' ? <Spinner className="text-[14px]" /> : 'Нормализация'}
                        </Button>
                        <Button variant="dashed" icon={activeProcess === 'remove_silence' ? undefined : "content_cut"} className="!py-1.5 !px-2 text-[11px] flex justify-center gap-1.5" disabled={isProcessingAudio || isSyncing} onClick={() => handleProcessAudio('remove_silence')}>
                          {activeProcess === 'remove_silence' ? <Spinner className="text-[14px]" /> : 'Убрать паузы'}
                        </Button>
                        <Button variant="dashed" icon={activeProcess === 'enhance' ? undefined : "auto_fix_high"} className="!py-1.5 !px-2 text-[11px] flex justify-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10" disabled={isProcessingAudio || isSyncing} onClick={() => handleProcessAudio('enhance')}>
                          {activeProcess === 'enhance' ? <Spinner className="text-[14px]" /> : 'Улучшить (AI)'}
                        </Button>
                      </div>
                    </div>

                    <Button variant={isSyncing ? "dashed" : "secondary"} icon={isSyncing ? undefined : "sync"} disabled={isProcessingAudio || isSyncing} className="w-full justify-center shadow-[0_0_15px_rgba(4,180,162,0.15)] transition-all" onClick={handleSyncAudioVideo}>
                      {isSyncing ? <><Spinner className="text-[18px] text-secondary" /> Синхронизация...</> : 'Синхронизировать с видео'}
                    </Button>
                  </div>
                ) : (
                  <div className="border border-white/5 bg-surface-container-lowest/50 p-4 rounded-xl flex flex-col items-center justify-center text-center gap-2">
                    <span className="text-xs text-on-surface-variant">Аудиодорожка пуста</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3 p-4 bg-surface-container-lowest/30 rounded-xl border border-white/5">
                <div className="flex flex-col gap-2">
                  <label className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant">Область генерации</label>
                  <div className="flex gap-1">
                    {(['fragment', 'scene', 'all'] as const).map(t => (
                      <button key={t} onClick={() => setAudioTarget(t)}
                        className={`flex-1 text-[11px] py-1.5 rounded-lg border transition-all ${audioTarget === t
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-white/10 text-on-surface-variant hover:border-white/30'
                          }`}>
                        {t === 'fragment' ? 'Фрагмент' : t === 'scene' ? 'Сцену' : 'Проект'}
                      </button>
                    ))}
                  </div>
                </div>

                {audioTarget === 'fragment' && activeScene && (
                  <div className="animate-in fade-in slide-in-from-top-1">
                    <FieldGroup label="Выберите фрагмент текста">
                      <Select value={targetFrag || ''} onChange={(e) => setTargetFrag(e.target.value)}>
                        <option value="" disabled>-- Выберите фрагмент --</option>
                        {activeScene.fragments.map((f, i) => (
                          <option key={f.id} value={f.id}>
                            Фрагмент {i + 1}: {f.text.substring(0, 30)}...
                          </option>
                        ))}
                      </Select>
                    </FieldGroup>
                  </div>
                )}

                {isGeneratingAudio ? (
                  <Button
                    variant="dashed"
                    className="w-full justify-center mt-2 border-error/30 text-error hover:bg-error/10 hover:border-error/50"
                    onClick={() => handleGenerateAudio()}
                  >
                    <Icon name="close" className="text-[20px]" /> Отменить генерацию
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    className="w-full justify-center mt-2 shadow-[0_0_20px_rgba(221,183,255,0.15)]"
                    disabled={(!activeScene?.fragments.some(f => f.text))}
                    onClick={() => handleGenerateAudio()}
                  >
                    <Icon name="mic" className="text-[20px]" filled /> Генерировать голос
                  </Button>
                )}
              </div>
            </section>
          </div>
        </aside>
      </main>

      <Modal isOpen={isVoiceManagerOpen} onClose={() => setIsVoiceManagerOpen(false)} title="Менеджер голосов">
        <div className="flex flex-col gap-6 w-full pb-4">
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-label uppercase text-primary">Добавить новый голос</h3>

            <FieldGroup label="Имя диктора">
              <Input value={newVoiceName} onChange={e => setNewVoiceName(e.target.value)} placeholder="Например: Иван (Реклама)" />
            </FieldGroup>

            <FieldGroup label="Аудио референс">
              <input type="file" ref={customVoiceAudioRef} className="hidden" accept="audio/*" onChange={handleCustomVoiceAudioUpload} />
              <button
                className="w-full flex items-center justify-center p-3 rounded-lg border border-dashed border-white/20 hover:border-primary/50 hover:bg-white/5 transition-all gap-2"
                onClick={() => customVoiceAudioRef.current?.click()}
              >
                <Icon name={newVoiceAudioPath ? "audio_file" : "upload_file"} className="text-[20px] text-on-surface-variant" />
                <span className="text-sm text-on-surface-variant">
                  {newVoiceAudioPath ? newVoiceAudioPath.substring(0, 30) : 'Загрузить .wav/.mp3'}
                </span>
              </button>
            </FieldGroup>

            <FieldGroup label="Текст, который звучит в референсе (Желательно)">
              <Input value={newVoiceText} onChange={e => setNewVoiceText(e.target.value)} placeholder="Точный текст диктора..." />
            </FieldGroup>

            <Button variant="primary" onClick={handleSaveCustomVoice}>Сохранить голос</Button>
          </div>

          <div className="h-px bg-white/10" />

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-label uppercase text-on-surface-variant">Сохраненные голоса</h3>
            {(!project.customVoices || project.customVoices.length === 0) && (
              <div className="text-sm text-on-surface-variant/50 text-center py-4">Список пуст</div>
            )}
            {project.customVoices?.map(voice => (
              <div key={voice.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-container border border-white/5">
                <div className="flex items-center gap-3">
                  <Icon name="record_voice_over" className="text-secondary text-[20px]" />
                  <span className="text-sm font-medium text-on-surface">{voice.name}</span>
                </div>
                <button className="text-on-surface-variant hover:text-error" onClick={() => handleDeleteCustomVoice(voice.id)}>
                  <Icon name="delete" className="text-[18px]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Параметры проекта">
        <div className="flex flex-col gap-6 w-full pb-4">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-label uppercase text-error">Опасная зона</h3>
            <Button variant="dashed" className="border-error/30 text-error hover:bg-error/10 hover:border-error/50 w-full" onClick={handleProjectDelete}>
              Удалить проект
            </Button>
          </section>
        </div>
      </Modal>
    </div>
  )
}
