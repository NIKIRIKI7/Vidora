import { useState, useRef, useEffect, ChangeEvent } from 'react'
import { SceneCard, Icon, Button, Modal, FieldGroup, Input, Dropdown, DropdownItem, Spinner, Slider, Select } from '@shared/ui'
import { generateRemotionPrompt, generateFragmentPrompt, generateProjectPrompt } from '../lib/generateRemotionPrompt'
import { useNotificationStore } from '@entities/project'
import { saveProjectToDisk } from '@features/file-system'
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

  const [isProcessingAudio, setIsProcessingAudio] = useState(false)
  const [activeProcess, setActiveProcess] = useState<string | null>(null)
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const [renderedVideos, setRenderedVideos] = useState<Record<string, string>>({})
  const [playingTargetId, setPlayingTargetId] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const refVoiceInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const showNotification = useNotificationStore(s => s.showNotification)
  const activeScene = project.scenes.find(s => s.id === activeSceneId)

  const saveProject = (updatedProject: ProjectSettings) => {
    onUpdateProject(updatedProject)
    saveProjectToDisk(updatedProject)
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
  }, [showNotification])

  // --- CRUD СЦЕН ---
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
    saveProject(updated)
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
    saveProject(updated)
    if (activeSceneId === sceneId) setActiveSceneId(updatedScenes[0].id)
    showNotification('Сцена удалена', 'info')
  }

  const handleUpdateSceneTitle = (sceneId: string, title: string, timecode: string) => {
    const updated = {
      ...project,
      scenes: project.scenes.map(s => s.id === sceneId ? { ...s, title, timecode } : s)
    }
    saveProject(updated)
  }

  // --- CRUD ФРАГМЕНТОВ ---
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
    saveProject(updated)
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
    saveProject(updated)
    showNotification('Фрагмент удален', 'info')
  }

  const handleFragmentTextChange = (fragId: string, newText: string, newVisualNote?: string) => {
    if (!activeScene) return
    const updated = {
      ...project,
      scenes: project.scenes.map(s => s.id === activeScene.id ? {
        ...s,
        fragments: s.fragments.map(f => f.id === fragId ? {
          ...f, text: newText, visualNote: newVisualNote !== undefined ? newVisualNote : f.visualNote
        } : f)
      } : s)
    }
    saveProject(updated)
  }

  // --- VOICEBOX / КЛОНИРОВАНИЕ ГОЛОСА ---
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
      showNotification('Укажите имя голоса и загрузите аудиофайла', 'error')
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
    saveProject({ ...project, customVoices: updatedVoices })
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
    saveProject({ ...project, customVoices: updatedVoices })
    if (voiceModel === voiceId) setVoiceModel('aria')
    showNotification('Голос удален из Voicebox', 'info')
  }

  // --- ОЗВУЧКА ---
  const runVoiceGen = async (): Promise<string | null> => {
    if (!activeScene) return null
    setIsGeneratingAudio(true)
    try {
      const customVoice = project.customVoices?.find(v => v.id === voiceModel)
      const text = activeScene.fragments.map(f => f.text).join(' ')
      
      const payload = {
        fragment_id: activeScene.id,
        file_prefix: `Scene_${activeScene.title}`,
        text,
        voice_model: customVoice ? 'clone' : voiceModel,
        ref_audio_path: customVoice ? customVoice.refAudioPath : null,
        ref_text: customVoice ? customVoice.refText : null,
        speed,
        num_steps: numSteps,
        project_path: getProjectPath(project),
      }

      const res = await fetch(`${API}/api/v1/audio/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        setAudioLoaded(data.absolute_path)
        showNotification('Озвучка успешно сгенерирована!', 'success')
        return data.absolute_path
      }
    } catch {
      showNotification('Сбой генерации голоса', 'error')
    } finally {
      setIsGeneratingAudio(false)
    }
    return null
  }

  // --- СИНХРОНИЗАЦИЯ ---
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
        saveProject({
          ...project,
          scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)
        })
        showNotification('Тайминги выровнены', 'success')
      }
    } catch {
      showNotification('Сбой синхронизации', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  // --- ГЕНЕРАЦИЯ TSX ---
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
        saveProject({
          ...project,
          scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, remotionCode: data.tsx_code } : s)
        })
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

  // --- РЕНДЕР ---
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
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* ЛЕВЫЙ САЙДБАР: CRUD СЦЕН */}
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
              const hasAudio = Boolean(scene.fragments.some(f => f.audioFileName) || audioLoaded)
              const hasSync = Boolean(scene.fragments.some(f => f.startTime !== undefined))
              const hasCode = Boolean(scene.remotionCode)

              return (
                <div key={scene.id} onClick={() => setActiveSceneId(scene.id)} className="flex flex-col gap-1 group relative">
                  <div className="flex items-center justify-between">
                    <input
                      className="text-xs font-semibold bg-transparent text-primary outline-none focus:border-b border-primary/50 w-full"
                      value={scene.title}
                      onChange={(e) => handleUpdateSceneTitle(scene.id, e.target.value, scene.timecode)}
                    />
                    <button
                      className="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      onClick={(e) => { e.stopPropagation(); handleDeleteScene(scene.id) }}
                      title="Удалить сцену"
                    >
                      <Icon name="delete" className="text-[14px]" />
                    </button>
                  </div>
                  <SceneCard
                    scene={`Сцена ${idx + 1}`}
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

        {/* ЦЕНТРАЛЬНЫЙ ХОЛСТ */}
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
                    <span>Нажмите «Сгенерировать всё» для начала сборки</span>
                  </div>
                )}
                {audioLoaded && (
                  <audio ref={audioRef} src={`${API}/api/v1/render/media?path=${encodeURIComponent(audioLoaded)}`} className="hidden" />
                )}
              </div>
            ) : (
              <div className="w-full h-full max-w-[900px] flex flex-col gap-2">
                <textarea
                  className="w-full h-full font-mono text-[12px] bg-surface-container-lowest/60 border border-white/10 p-4 rounded-xl text-on-surface resize-none outline-none focus:border-primary/50"
                  value={activeScene?.remotionCode || ''}
                  onChange={(e) => {
                    if (!activeScene) return
                    saveProject({
                      ...project,
                      scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, remotionCode: e.target.value } : s)
                    })
                  }}
                  placeholder="// Введите или сгенерируйте TSX код Remotion..."
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        </div>

        {/* ПРАВЫЙ ИНСПЕКТОР */}
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
              <Button variant="dashed" disabled={isGeneratingAudio} onClick={() => runVoiceGen()}>
                {isGeneratingAudio ? <Spinner /> : 'Сгенерировать голос'}
              </Button>
            </section>

            <div className="h-px bg-white/5" />

            <section className="flex flex-col gap-3">
              <span className="font-label text-xs uppercase tracking-wider text-primary">2. Синхронизация (Whisper)</span>
              <Button variant="dashed" disabled={isSyncing || !audioLoaded} onClick={() => runSync(audioLoaded || '')}>
                {isSyncing ? <Spinner /> : 'Синхронизировать тайминги'}
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
              <Button variant="dashed" disabled={isGeneratingCode} onClick={() => runCodeGen()}>
                {isGeneratingCode ? <Spinner /> : 'Сгенерировать TSX через Ollama'}
              </Button>
            </section>

            <div className="h-px bg-white/5" />

            <section className="flex flex-col gap-3">
              <span className="font-label text-xs uppercase tracking-wider text-primary">4. Финальный Рендер</span>
              <Button variant="primary" disabled={isRendering} onClick={() => runRender(activeScene?.remotionCode || '')}>
                {isRendering ? <Spinner /> : 'Собрать MP4'}
              </Button>
            </section>
          </div>
        </aside>
      </main>

      {/* VOICEBOX СТУДИЯ КЛОНИРОВАНИЯ ГОЛОСА */}
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
              <button
                className="w-full flex items-center justify-center p-3 rounded-lg border border-dashed border-white/20 hover:border-primary/50 gap-2 transition-all"
                onClick={() => refVoiceInputRef.current?.click()}
              >
                <Icon name={newVoiceAudioPath ? "audio_file" : "upload_file"} className="text-[20px] text-secondary" />
                <span className="text-xs text-on-surface-variant truncate max-w-[260px]">
                  {newVoiceAudioPath ? newVoiceAudioPath : 'Загрузить образцы голоса'}
                </span>
              </button>
            </FieldGroup>
            <FieldGroup label="Текст, произнесенный в референсе (для точного клонирования)">
              <Input
                value={newVoiceText}
                onChange={e => setNewVoiceText(e.target.value)}
                placeholder="Точный текст записи..."
              />
            </FieldGroup>
            <FieldGroup label="Теги / Метки (через запятую)">
              <Input
                value={newVoiceTags}
                onChange={e => setNewVoiceTags(e.target.value)}
                placeholder="диктор, быстрый, мужской"
              />
            </FieldGroup>

            <Button variant="primary" onClick={handleSaveCustomVoice} className="mt-2">
              Сохранить голос в Voicebox
            </Button>
          </div>

          <div className="h-px bg-white/10" />

          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-label uppercase text-on-surface-variant">Сохраненные голоса ({project.customVoices?.length || 0})</h4>
            {(!project.customVoices || project.customVoices.length === 0) ? (
              <span className="text-xs text-on-surface-variant/50 text-center py-3">Нет клонированных голосов</span>
            ) : (
              project.customVoices.map(voice => (
                <div key={voice.id} className="p-3 rounded-xl bg-surface-container-lowest/50 border border-white/10 flex justify-between items-center">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-on-surface">{voice.name}</span>
                    <span className="text-[10px] text-secondary font-mono truncate max-w-[220px]">{voice.refAudioPath}</span>
                    {voice.tags?.length ? (
                      <div className="flex gap-1 mt-1">
                        {voice.tags.map((t, ti) => (
                          <span key={ti} className="text-[9px] px-1 py-0.2 rounded bg-white/5 border border-white/10 text-on-surface-variant">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="text-on-surface-variant hover:text-error transition-colors p-1"
                    onClick={() => handleDeleteCustomVoice(voice.id)}
                    title="Удалить голос"
                  >
                    <Icon name="delete" className="text-[16px]" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* НАСТРОЙКИ ПРОЕКТА */}
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
