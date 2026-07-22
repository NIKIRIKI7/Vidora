import { useState, useRef, useEffect, ChangeEvent } from 'react'
import { SceneCard, Icon, Button, Modal, FieldGroup, Input, Dropdown, DropdownItem, Spinner, Slider, Select } from '@shared/ui'
import { generateRemotionPrompt, generateFragmentPrompt, generateProjectPrompt } from '../lib/generateRemotionPrompt'
import { useNotificationStore } from '@entities/project'
import type { ProjectSettings, SceneFragment } from '@entities/project'

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

export const EditorWorkspace = ({ project, projects, onSwitchProject, onNewProject, onUpdateProject, onDeleteProject }: Props) => {
  const [activeSceneId, setActiveSceneId] = useState(project.scenes[0]?.id)
  const [centerView, setCenterView] = useState<'player' | 'code'>('player')
  
  const [voiceModel, setVoiceModel] = useState('aria')
  const [speed, setSpeed] = useState(1.0)
  const [numSteps, setNumSteps] = useState(32)
  const [audioLoaded, setAudioLoaded] = useState<string | null>(null)
  const [playWithAudio, setPlayWithAudio] = useState(true)

  const [isAutoPipelineRunning, setIsAutoPipelineRunning] = useState(false)
  const [pipelineStep, setPipelineStep] = useState<string>('')
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderTaskId, setRenderTaskId] = useState<string | null>(null)

  const [isProcessingAudio, setIsProcessingAudio] = useState(false)
  const [activeProcess, setActiveProcess] = useState<string | null>(null)
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const [renderedVideos, setRenderedVideos] = useState<Record<string, string>>({})
  const [playingTargetId, setPlayingTargetId] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const showNotification = useNotificationStore(s => s.showNotification)
  const activeScene = project.scenes.find(s => s.id === activeSceneId)

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
          }
          if (msg.payload.progress >= 100 || msg.payload.status === 'done' || msg.payload.status === 'error') {
            setIsRendering(false)
            setRenderTaskId(null)
            showNotification(msg.payload.status === 'error' ? 'Ошибка рендера' : 'Рендер успешно завершен!', msg.payload.status === 'error' ? 'error' : 'success')
          }
        }
      } catch {}
    }
    wsRef.current = ws
    return () => {
      isMounted = false
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [showNotification])

  // --- Синхронизация воспроизведения видео и звука ---
  const handleVideoPlay = () => {
    if (audioRef.current && playWithAudio && audioLoaded) {
      audioRef.current.currentTime = videoRef.current?.currentTime || 0
      audioRef.current.play().catch(() => {})
    }
  }
  const handleVideoPause = () => {
    if (audioRef.current) audioRef.current.pause()
  }
  const handleVideoSeek = () => {
    if (audioRef.current && videoRef.current) {
      audioRef.current.currentTime = videoRef.current.currentTime
    }
  }

  // --- CRUD ФРАГМЕНТОВ ---
  const handleAddFragment = () => {
    if (!activeScene) return
    const newFrag: SceneFragment = {
      id: crypto.randomUUID(),
      visualNote: 'Новая визуальная ремарка',
      text: 'Новый текст суфлера',
    }
    const updatedScenes = project.scenes.map(s => s.id === activeScene.id ? {
      ...s,
      fragments: [...s.fragments, newFrag]
    } : s)
    onUpdateProject({ ...project, scenes: updatedScenes })
    showNotification('Фрагмент добавлен', 'success')
  }

  const handleDeleteFragment = (fragId: string) => {
    if (!activeScene) return
    if (activeScene.fragments.length <= 1) {
      showNotification('Сцена должна содержать хотя бы один фрагмент', 'error')
      return
    }
    const updatedScenes = project.scenes.map(s => s.id === activeScene.id ? {
      ...s,
      fragments: s.fragments.filter(f => f.id !== fragId)
    } : s)
    onUpdateProject({ ...project, scenes: updatedScenes })
    showNotification('Фрагмент удален', 'info')
  }

  const handleFragmentTextChange = (fragId: string, newText: string, newVisualNote?: string) => {
    if (!activeScene) return
    const updated = project.scenes.map(s => s.id === activeScene.id ? {
      ...s,
      fragments: s.fragments.map(f => f.id === fragId ? {
        ...f,
        text: newText,
        visualNote: newVisualNote !== undefined ? newVisualNote : f.visualNote
      } : f)
    } : s)
    onUpdateProject({ ...project, scenes: updated })
  }

  // --- ОБРАБОТКА АУДИО ---
  const handleProcessAudio = async (action: 'denoise' | 'normalize' | 'remove_silence' | 'enhance' | 'undo') => {
    if (!audioLoaded) return
    setIsProcessingAudio(true)
    setActiveProcess(action)
    showNotification(action === 'undo' ? 'Откат изменений...' : 'Обработка аудио...', 'info')
    try {
      const endpoint = action === 'undo' ? '/api/v1/audio/undo' : '/api/v1/audio/process'
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_id: activeScene?.id,
          audio_path: audioLoaded,
          action,
          project_path: getProjectPath(project),
        }),
      })
      const data = await res.json()
      if (data.status === 'ok') {
        setAudioLoaded(data.processed_audio_path)
        showNotification(action === 'undo' ? 'Изменения отменены' : 'Аудио успешно обработано', 'success')
      } else {
        showNotification(data.detail || 'Ошибка обработки', 'error')
      }
    } catch {
      showNotification('Сбой запроса обработки аудио', 'error')
    } finally {
      setIsProcessingAudio(false)
      setActiveProcess(null)
    }
  }

  const handleAudioUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('project_path', getProjectPath(project))
    try {
      const res = await fetch(`${API}/api/v1/audio/upload-ref`, { method: 'POST', body: formData })
      const data = await res.json()
      if (data.status === 'ok') {
        setAudioLoaded(data.ref_audio_path)
        showNotification('Аудиодорожка загружена', 'success')
      }
    } catch {
      showNotification('Ошибка загрузки аудио', 'error')
    }
    e.target.value = ''
  }

  // --- 1. ОЗВУЧКА ---
  const runVoiceGen = async (): Promise<string | null> => {
    if (!activeScene) return null
    setIsGeneratingAudio(true)
    try {
      const text = activeScene.fragments.map(f => f.text).join(' ')
      const res = await fetch(`${API}/api/v1/audio/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fragment_id: activeScene.id,
          file_prefix: `Scene_${activeScene.title}`,
          text,
          voice_model: voiceModel,
          speed,
          num_steps: numSteps,
          project_path: getProjectPath(project),
        })
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        setAudioLoaded(data.absolute_path)
        return data.absolute_path
      }
    } catch {
      showNotification('Сбой генерации голоса', 'error')
    } finally {
      setIsGeneratingAudio(false)
    }
    return null
  }

  // --- 2. ВЫРАВНИВАНИЕ ---
  const runSync = async (audioPath: string) => {
    if (!activeScene) return
    setIsSyncing(true)
    try {
      const res = await fetch(`${API}/api/v1/audio/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_id: activeScene.id,
          audio_path: audioPath,
          fragments: activeScene.fragments.map(f => ({ id: f.id, text: f.text })),
          project_path: getProjectPath(project),
        })
      })
      const data = await res.json()
      if (data.status === 'ok' && data.fragments_timings) {
        const timingMap = Object.fromEntries(data.fragments_timings.map((t: any) => [t.id, t]))
        const updatedFragments = activeScene.fragments.map(f => {
          const t = timingMap[f.id]
          return t ? { ...f, startTime: t.startTime, endTime: t.endTime } : f
        })
        const updatedScenes = project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)
        onUpdateProject({ ...project, scenes: updatedScenes })
        showNotification('Тайминги успешно выровнены!', 'success')
      }
    } catch {
      showNotification('Сбой синхронизации', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  // --- 3. ГЕНЕРАЦИЯ TSX ---
  const runCodeGen = async (): Promise<string | null> => {
    if (!activeScene) return null
    setIsGeneratingCode(true)
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
        })
      })
      const data = await res.json()
      if (data.tsx_code) {
        const updated = project.scenes.map(s => s.id === activeScene.id ? { ...s, remotionCode: data.tsx_code } : s)
        onUpdateProject({ ...project, scenes: updated })
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

  // --- 4. РЕНДЕР И ОТМЕНА ---
  const runRender = async (code: string, audioPath?: string) => {
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
          tsx_code: code || activeScene.remotionCode || '',
          audio_path: audioPath || audioLoaded || '',
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

  const handleFullAutoPipeline = async () => {
    if (!activeScene) return
    setIsAutoPipelineRunning(true)

    setPipelineStep('1/4 Озвучка...')
    const audioPath = await runVoiceGen()

    if (audioPath) {
      setPipelineStep('2/4 Whisper Alignment...')
      await runSync(audioPath)
    }

    setPipelineStep('3/4 Remotion TSX...')
    const code = await runCodeGen()

    setPipelineStep('4/4 Рендер MP4...')
    await runRender(code || activeScene.remotionCode || '', audioPath || '')

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
            onClick={() => runRender(activeScene?.remotionCode || '')}
          >
            {isRendering ? `Рендер... ${renderProgress}%` : 'Только Рендер'}
          </Button>

          {isRendering && (
            <Button
              variant="ghost"
              icon="close"
              onClick={cancelRender}
              className="text-error hover:bg-error/10 border border-error/30"
              title="Отменить текущий рендер"
            >
              Отмена
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* ЛЕВЫЙ САЙДБАР: Список сцен и бейджи */}
        <aside className="w-[320px] border-r border-white/10 bg-surface-container/30 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-surface-container-lowest/30">
            <h2 className="font-title-md text-title-md text-on-surface">Сценарий</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
            {project.scenes.map((scene, idx) => {
              const hasAudio = Boolean(scene.fragments.some(f => f.audioFileName) || audioLoaded)
              const hasSync = Boolean(scene.fragments.some(f => f.startTime !== undefined))
              const hasCode = Boolean(scene.remotionCode)

              return (
                <div key={scene.id} onClick={() => { setActiveSceneId(scene.id) }} className="flex flex-col gap-1">
                  <SceneCard
                    scene={`Сцена ${idx + 1}: ${scene.title}`}
                    time={scene.timecode}
                    description={scene.fragments[0]?.text.substring(0, 50) + '...'}
                    isActive={activeSceneId === scene.id}
                  />
                  <div className="flex gap-1 pl-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${hasAudio ? 'border-secondary/40 text-secondary bg-secondary/10' : 'border-white/10 text-on-surface-variant/40'}`}>
                      🎙️ Аудио
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${hasSync ? 'border-primary/40 text-primary bg-primary/10' : 'border-white/10 text-on-surface-variant/40'}`}>
                      ⏱️ Тайминги
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${hasCode ? 'border-accent/40 text-accent bg-accent/10' : 'border-white/10 text-on-surface-variant/40'}`}>
                      💻 TSX
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* ЦЕНТРАЛЬНЫЙ ХОЛСТ: Плеер или код */}
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
                    onPlay={handleVideoPlay}
                    onPause={handleVideoPause}
                    onSeeked={handleVideoSeek}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-on-surface-variant/50 font-medium flex flex-col items-center gap-3">
                    <Icon name="movie" className="text-[56px] text-primary/40" />
                    <span>Нажмите «Сгенерировать всё» для начала сборки</span>
                  </div>
                )}
                {audioLoaded && (
                  <audio
                    ref={audioRef}
                    src={`${API}/api/v1/render/media?path=${encodeURIComponent(audioLoaded)}`}
                    className="hidden"
                  />
                )}
              </div>
            ) : (
              <div className="w-full h-full max-w-[900px] flex flex-col gap-2">
                <textarea
                  className="w-full h-full font-mono text-[12px] bg-surface-container-lowest/60 border border-white/10 p-4 rounded-xl text-on-surface resize-none outline-none focus:border-primary/50"
                  value={activeScene?.remotionCode || ''}
                  onChange={(e) => {
                    if (!activeScene) return
                    const updated = project.scenes.map(s => s.id === activeScene.id ? { ...s, remotionCode: e.target.value } : s)
                    onUpdateProject({ ...project, scenes: updated })
                  }}
                  placeholder="// Введите или сгенерируйте TSX код Remotion..."
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        </div>

        {/* ПРАВЫЙ ПАЙПЛАЙН ИНСПЕКТОР */}
        <aside className="w-[380px] border-l border-white/10 flex flex-col bg-surface-container/60 backdrop-blur-2xl shrink-0">
          <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <h3 className="font-title-md text-title-md text-on-surface">Инспектор Пайплайна</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">
            {/* 0. CRUD НАД ФРАГМЕНТАМИ */}
            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="font-label text-xs uppercase tracking-wider text-primary">Сценарий фрагментов</span>
                <button
                  className="text-xs text-secondary hover:underline flex items-center gap-1"
                  onClick={handleAddFragment}
                >
                  <Icon name="add" className="text-[14px]" /> Добавить фрагмент
                </button>
              </div>

              {activeScene?.fragments.map((frag, i) => (
                <div key={frag.id} className="p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl flex flex-col gap-2 relative group">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-secondary">
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
                        title="Копировать промпт фрагмента"
                      >
                        <Icon name="content_copy" className="text-[12px]" /> Промпт
                      </button>
                      <button
                        className="text-on-surface-variant hover:text-error transition-colors"
                        onClick={() => handleDeleteFragment(frag.id)}
                        title="Удалить фрагмент"
                      >
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

            {/* 1. ОЗВУЧКА С ВЫЗОВОМ СТУДИИ АУДИО */}
            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="font-label text-xs uppercase tracking-wider text-primary">1. Озвучка (OmniVoice)</span>
                <button
                  className="text-xs text-secondary hover:underline flex items-center gap-1"
                  onClick={() => setIsAudioModalOpen(true)}
                >
                  <Icon name="graphic_eq" className="text-[14px]" /> Студия Аудио
                </button>
              </div>

              <FieldGroup label="Голосовая модель">
                <Select value={voiceModel} onChange={(e) => setVoiceModel(e.target.value)}>
                  <option value="aria">Neural - Aria (Женский)</option>
                  <option value="marcus">Neural - Marcus (Мужской)</option>
                  <option value="nova">Expressive - Nova (Энергичный)</option>
                </Select>
              </FieldGroup>
              <Button variant="dashed" disabled={isGeneratingAudio} onClick={() => runVoiceGen()}>
                {isGeneratingAudio ? <Spinner /> : 'Сгенерировать голос'}
              </Button>
            </section>

            <div className="h-px bg-white/5" />

            {/* 2. СИНХРОНИЗАЦИЯ */}
            <section className="flex flex-col gap-3">
              <span className="font-label text-xs uppercase tracking-wider text-primary">2. Синхронизация (Whisper)</span>
              <Button variant="dashed" disabled={isSyncing || !audioLoaded} onClick={() => runSync(audioLoaded || '')}>
                {isSyncing ? <Spinner /> : 'Синхронизировать тайминги'}
              </Button>
            </section>

            <div className="h-px bg-white/5" />

            {/* 3. КОД REMOTION */}
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
                    title="Копировать промпт сцены с таймкодами"
                  >
                    <Icon name="content_copy" className="text-[12px]" /> Сцену
                  </button>
                  <button
                    className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10"
                    onClick={() => {
                      navigator.clipboard.writeText(generateProjectPrompt(project))
                      showNotification('Промпт проекта с таймкодами скопирован!', 'success')
                    }}
                    title="Копировать промпт проекта с таймкодами"
                  >
                    <Icon name="content_copy" className="text-[12px]" /> Проект
                  </button>
                </div>
              </div>
              <Button variant="dashed" disabled={isGeneratingCode} onClick={() => runCodeGen()}>
                {isGeneratingCode ? <Spinner /> : 'Сгенерировать TSX через Ollama'}
              </Button>
            </section>

            <div className="h-px bg-white/5" />

            {/* 4. РЕНДЕР */}
            <section className="flex flex-col gap-3">
              <span className="font-label text-xs uppercase tracking-wider text-primary">4. Финальный Рендер</span>
              <Button variant="primary" disabled={isRendering} onClick={() => runRender(activeScene?.remotionCode || '')}>
                {isRendering ? <Spinner /> : 'Собрать MP4'}
              </Button>
            </section>
          </div>
        </aside>
      </main>

      {/* МОДАЛЬНОЕ ОКНО СТУДИИ АУДИО */}
      <Modal isOpen={isAudioModalOpen} onClose={() => setIsAudioModalOpen(false)} title="Студия обработки аудио">
        <div className="flex flex-col gap-5 w-full pb-4">
          <div className="flex justify-between items-center bg-surface-container-lowest/50 p-3 rounded-xl border border-white/5">
            <span className="text-xs font-mono text-secondary truncate max-w-[280px]">
              {audioLoaded ? audioLoaded : 'Аудиодорожка не загружена'}
            </span>
            <input type="file" ref={audioInputRef} className="hidden" accept="audio/*" onChange={handleAudioUpload} />
            <Button variant="dashed" onClick={() => audioInputRef.current?.click()} className="!py-1 text-xs">
              Загрузить файл
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="dashed"
              disabled={isProcessingAudio || !audioLoaded}
              onClick={() => handleProcessAudio('denoise')}
            >
              {activeProcess === 'denoise' ? <Spinner /> : 'Убрать шум'}
            </Button>
            <Button
              variant="dashed"
              disabled={isProcessingAudio || !audioLoaded}
              onClick={() => handleProcessAudio('normalize')}
            >
              {activeProcess === 'normalize' ? <Spinner /> : 'Нормализация'}
            </Button>
            <Button
              variant="dashed"
              disabled={isProcessingAudio || !audioLoaded}
              onClick={() => handleProcessAudio('remove_silence')}
            >
              {activeProcess === 'remove_silence' ? <Spinner /> : 'Убрать паузы'}
            </Button>
            <Button
              variant="dashed"
              disabled={isProcessingAudio || !audioLoaded}
              onClick={() => handleProcessAudio('enhance')}
              className="border-primary/30 text-primary"
            >
              {activeProcess === 'enhance' ? <Spinner /> : 'AI Улучшение'}
            </Button>
          </div>

          <Button
            variant="ghost"
            disabled={isProcessingAudio || !audioLoaded}
            onClick={() => handleProcessAudio('undo')}
            className="w-full text-xs hover:bg-white/5"
          >
            <Icon name="undo" className="text-[14px]" /> Отменить последнее изменение (Undo)
          </Button>
        </div>
      </Modal>

      {/* МОДАЛЬНОЕ ОКНО НАСТРОЕК */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Параметры проекта">
        <div className="flex flex-col gap-4">
          <Button variant="dashed" className="text-error border-error/30 hover:bg-error/10" onClick={() => onDeleteProject(project.name)}>
            Удалить проект
          </Button>
        </div>
      </Modal>
    </div>
  )
}
