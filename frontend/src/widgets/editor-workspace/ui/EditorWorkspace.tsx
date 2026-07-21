import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { Badge, SceneCard, Icon, Button, Modal, FieldGroup, Input, Dropdown, DropdownItem, Spinner, Slider, Select } from '@shared/ui'
import { generateRemotionPrompt, generateFragmentPrompt } from '../lib/generateRemotionPrompt'
import { saveSceneCodeToDisk, saveAudioToDisk, saveAssetToDisk } from '@features/file-system'
import type { ProjectSettings, AppColors, SceneFragment, AppTypography } from '@entities/project'

const API = 'http://127.0.0.1:8355'

interface Props {
  project: ProjectSettings
  projects: ProjectSettings[]
  onSwitchProject: (id: string) => void
  onNewProject: () => void
  onUpdateProject: (project: ProjectSettings) => void
  onDeleteProject: (id: string) => void
}

export const EditorWorkspace = ({ project, projects, onSwitchProject, onNewProject, onUpdateProject, onDeleteProject }: Props) => {
  const [activeSceneId, setActiveSceneId] = useState(project.scenes[0]?.id)
  const [activeTab, setActiveTab] = useState<'script' | 'code'>('script')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [copiedFragId, setCopiedFragId] = useState<string | null>(null)
  const [expandedCodeFrags, setExpandedCodeFrags] = useState<Set<string>>(new Set())
  const [codeInput, setCodeInput] = useState('')
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)
  const [audioLoaded, setAudioLoaded] = useState<string | null>(null)

  const [voiceModel, setVoiceModel] = useState('aria')
  const [voiceStability, setVoiceStability] = useState(75)
  const [voiceClarity, setVoiceClarity] = useState(90)
  const [audioRefName, setAudioRefName] = useState<string | null>(null)
  const [cloneText, setCloneText] = useState('')
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isProcessingAudio, setIsProcessingAudio] = useState(false)
  const [activeProcess, setActiveProcess] = useState<'denoise' | 'normalize' | 'remove_silence' | 'enhance' | null>(null)

  const [isRendering, setIsRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderTarget, setRenderTarget] = useState('проекта')
  const [targetFrag, setTargetFrag] = useState<string | null>(null)

  // ponytail: single WS connection for render progress
  const wsRef = useRef<WebSocket | null>(null)
  useEffect(() => {
    const ws = new WebSocket(`${API.replace('http', 'ws')}/ws/events/frontend`)
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'RENDER_PROGRESS') {
          setRenderProgress(msg.payload.progress)
          if (msg.payload.progress >= 100 || msg.payload.status === 'done') {
            setTimeout(() => setIsRendering(false), 500)
          }
        }
      } catch { /* ignore */ }
    }
    wsRef.current = ws
    return () => ws.close()
  }, [])

  const audioInputRef = useRef<HTMLInputElement>(null)
  const assetInputRef = useRef<HTMLInputElement>(null)
  const fragmentAudioRef = useRef<HTMLInputElement>(null)
  const fragmentAssetRef = useRef<HTMLInputElement>(null)
  const cloneAudioRef = useRef<HTMLInputElement>(null)

  const activeScene = project.scenes.find(s => s.id === activeSceneId)

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
    try {
      const prompt = generateRemotionPrompt(project, activeScene)
      const res = await fetch(`${API}/api/v1/code/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_id: activeScene.id,
          prompt,
          project_data: project,
          project_path: project.projectDir ? project.projectDir.name : '',
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
      }
    } catch (e) {
      console.error('Code generation failed', e)
    } finally {
      setIsGeneratingCode(false)
    }
  }

  const handleColorChange = (key: keyof AppColors, value: string) => {
    onUpdateProject({ ...project, montage: { ...project.montage, colors: { ...project.montage.colors, [key]: value } } })
  }

  const handleTypographyChange = (key: keyof AppTypography, value: string) => {
    onUpdateProject({ ...project, montage: { ...project.montage, typography: { ...project.montage.typography, [key]: value } } })
  }

  const handleMetadataChange = (key: keyof typeof project.metadata, value: string) => {
    onUpdateProject({ ...project, metadata: { ...project.metadata, [key]: key === 'tags' ? value.split(',').map(t => t.trim()) : value } })
  }

  const copyPromptForAI = async () => {
    if (!activeScene) return
    const prompt = generateRemotionPrompt(project, activeScene)
    await navigator.clipboard.writeText(prompt)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const copyFragmentPrompt = async (frag: SceneFragment) => {
    if (!activeScene) return
    const prompt = generateFragmentPrompt(project, activeScene, frag)
    await navigator.clipboard.writeText(prompt)
    setCopiedFragId(frag.id)
    setTimeout(() => setCopiedFragId(null), 2000)
  }

  const toggleFragCode = (id: string) => {
    setExpandedCodeFrags(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSaveCode = async () => {
    if (!activeScene) return
    onUpdateProject({
      ...project,
      scenes: project.scenes.map(s => s.id === activeScene.id ? { ...s, remotionCode: codeInput } : s),
    })
    if (project.projectDir) {
      await saveSceneCodeToDisk(project.projectDir, `Scene_${activeScene.id}`, codeInput)
    }
  }

  const handleAudioUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('project_path', project.projectDir?.name || '')
    try {
      const res = await fetch(`${API}/api/v1/audio/upload-ref`, { method: 'POST', body: formData })
      const data = await res.json()
      if (data.status === 'ok') setAudioLoaded(data.ref_audio_path)
    } catch {
      if (project.projectDir) await saveAudioToDisk(project.projectDir, file)
      setAudioLoaded(file.name)
    }
    e.target.value = ''
  }

  const handleAssetUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (project.projectDir) await saveAssetToDisk(project.projectDir, file, 'b-roll')
    e.target.value = ''
  }

  const handleFragmentAudio = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !targetFrag) return
    if (project.projectDir) await saveAudioToDisk(project.projectDir, file)
    updateFragment(targetFrag, { audioFileName: file.name })
    e.target.value = ''
  }

  const handleFragmentAsset = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !targetFrag) return
    if (project.projectDir) await saveAssetToDisk(project.projectDir, file, 'b-roll')
    updateFragment(targetFrag, { bRollFileName: file.name })
    e.target.value = ''
  }

  const handleCloneAudioUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const projectPath = project.projectDir?.name || project.name || 'temp_project'
    const formData = new FormData()
    formData.append('file', file)
    formData.append('project_path', projectPath)

    try {
      const res = await fetch(`${API}/api/v1/audio/upload-ref`, { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok && data.ref_audio_path) {
        setAudioRefName(data.ref_audio_path)
      }
    } catch {
      setAudioRefName(file.name)
    }
    e.target.value = ''
  }

  const handleGenerateAudio = async () => {
    if (!activeScene) return
    const projectPath = project.projectDir?.name || project.name || 'temp_project'
    setIsGeneratingAudio(true)

    const frags = activeScene.fragments.filter(f => f.text?.trim())
    const fullText = frags.map(f => f.text).join(' ')

    try {
      const payload = {
        fragment_id: activeScene.id,
        text: fullText,
        voice_model: voiceModel,
        stability: voiceStability / 100,
        clarity: voiceClarity / 100,
        ref_audio_path: audioRefName || null,
        ref_text: cloneText || null,
        project_path: projectPath,
      }

      const res = await fetch(`${API}/api/v1/audio/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (res.ok && data.status === 'ok') {
        setAudioLoaded(data.absolute_path)
      } else {
        console.error('Ошибка генерации аудио:', data)
      }
    } catch (e) {
      console.error('Сбой запроса генерации:', e)
    } finally {
      setIsGeneratingAudio(false)
    }
  }

  const handleSyncAudioVideo = async () => {
    if (!activeScene || !audioLoaded) return
    const projectPath = project.projectDir?.name || project.name || 'temp_project'
    setIsSyncing(true)
    try {
      const res = await fetch(`${API}/api/v1/audio/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_id: activeScene.id,
          audio_path: audioLoaded,
          fragments: activeScene.fragments.map(f => ({ id: f.id, text: f.text })),
          project_path: projectPath,
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
        onUpdateProject({
          ...project,
          scenes: project.scenes.map(s =>
            s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s
          ),
        })
      }
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleProcessAudio = async (action: 'denoise' | 'normalize' | 'remove_silence' | 'enhance') => {
    if (!audioLoaded) return
    setIsProcessingAudio(true)
    setActiveProcess(action)
    try {
      const res = await fetch(`${API}/api/v1/audio/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_id: activeScene?.id, audio_path: audioLoaded, action, project_path: project.projectDir?.name || project.name || 'temp_project' }),
      })
      const data = await res.json()
      if (data.status === 'ok') {
        setAudioLoaded(data.processed_audio_path)
      }
    } catch (e) {
      console.error('Audio processing error:', e)
    } finally {
      setIsProcessingAudio(false)
      setActiveProcess(null)
    }
  }

  const startRender = async (target: string) => {
    if (!activeScene) return
    setIsRendering(true)
    setRenderProgress(0)
    setRenderTarget(target)

    const targetId = target === 'сцены' ? activeScene.id : target === 'проекта' ? project.scenes[0]?.id : ''
    const projectPath = project.projectDir?.name || ''

    try {
      const res = await fetch(`${API}/api/v1/render/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.name,
          target,
          target_id: targetId,
          project_path: projectPath,
        }),
      })
      const { task_id } = await res.json()
      if (task_id) setRenderTarget(`задача ${task_id.slice(0, 8)}`)
    } catch {
      setIsRendering(false)
    }
  }

  const updateFragment = (fragId: string, updates: Partial<SceneFragment>) => {
    if (!activeScene) return
    onUpdateProject({
      ...project,
      scenes: project.scenes.map(s => s.id === activeScene.id ? {
        ...s,
        fragments: s.fragments.map(f => f.id === fragId ? { ...f, ...updates } : f)
      } : s)
    })
  }

  const addFragment = () => {
    if (!activeScene) return
    onUpdateProject({
      ...project,
      scenes: project.scenes.map(s => s.id === activeScene.id ? {
        ...s,
        fragments: [...s.fragments, { id: crypto.randomUUID(), visualNote: 'Новый визуал', text: '' }]
      } : s)
    })
  }

  const deleteFragment = (fragId: string) => {
    if (!activeScene) return
    onUpdateProject({
      ...project,
      scenes: project.scenes.map(s => s.id === activeScene.id ? {
        ...s,
        fragments: s.fragments.filter(f => f.id !== fragId)
      } : s)
    })
  }

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-background">
      <input type="file" ref={fragmentAudioRef} className="hidden" accept="audio/*" onChange={handleFragmentAudio} />
      <input type="file" ref={fragmentAssetRef} className="hidden" accept="video/mp4, image/*" onChange={handleFragmentAsset} />

      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-surface-container-lowest shrink-0 z-10">
        <div className="flex items-center gap-6">
          <Dropdown
            align="left"
            trigger={
              <div className="flex items-center gap-2 cursor-pointer bg-surface-container hover:bg-surface-container-high py-2 px-3 rounded-lg transition-colors border border-white/5 group">
                <span className="font-title-md font-bold text-on-surface group-hover:text-primary transition-colors">{project.name}</span>
                <Icon name="unfold_more" className="text-on-surface-variant group-hover:text-primary text-[18px]" />
              </div>
            }
          >
            {projects.map(p => (
              <DropdownItem key={p.name} onClick={() => onSwitchProject(p.name)}>
                {p.name} {p.name === project.name && '✓'}
              </DropdownItem>
            ))}
            <div className="h-px bg-white/10 my-1" />
            <DropdownItem onClick={onNewProject}>
              <div className="flex items-center gap-2 text-primary">
                <Icon name="add" className="text-[16px]" /> Новый проект
              </div>
            </DropdownItem>
          </Dropdown>

          <div className="flex gap-2">
            <Badge variant="mono" className="bg-surface-container border border-white/5">{project.format}</Badge>
            <Badge variant="primary" className="bg-primary/10 border border-primary/20">{project.resolution}</Badge>
            <Badge variant="neutral" className="bg-surface-container border border-white/5">{project.montage.fps} FPS</Badge>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" icon="settings" onClick={() => setIsSettingsOpen(true)} className="!py-2 !px-4">Настройки</Button>
          {isRendering ? (
            <div className="flex items-center gap-3 bg-secondary/10 border border-secondary/30 px-5 py-2 rounded-lg">
              <Spinner className="text-[16px]" />
              <span className="font-label text-xs text-secondary font-medium tracking-wider">Рендеринг {renderTarget}... {renderProgress}%</span>
            </div>
          ) : (
            <Button variant="primary" icon="play_arrow" onClick={() => startRender('проекта')} className="!py-2 !px-6 shadow-lg shadow-primary/20">Рендер</Button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-[300px] border-r border-white/5 flex flex-col bg-surface-container/20">
          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-surface-container-lowest/30">
            <div className="flex items-center gap-2">
              <span className="font-label text-sm uppercase tracking-wider text-on-surface">Сцены</span>
            </div>
            <span className="font-mono text-xs text-on-surface-variant bg-white/5 px-2 py-0.5 rounded">{project.scenes.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
            {project.scenes.map((scene) => (
              <div key={scene.id} onClick={() => handleSceneChange(scene.id)}>
                <SceneCard scene={scene.title} time={scene.timecode} description={`${scene.fragments.length} фрагментов`} isActive={activeSceneId === scene.id} />
              </div>
            ))}
          </div>
        </aside>

        <div className="flex-1 flex flex-col relative bg-surface-container-lowest/50 overflow-hidden">
          <div className="flex px-6 border-b border-white/5 bg-surface-container/30">
            <button onClick={() => setActiveTab('script')} className={`py-4 mr-8 font-label text-sm border-b-2 transition-colors ${activeTab === 'script' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
              Сценарий
            </button>
            <button onClick={() => setActiveTab('code')} className={`py-4 font-label text-sm border-b-2 transition-colors ${activeTab === 'code' ? 'border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
              TSX-Код
            </button>
          </div>

          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            {activeTab === 'script' ? (
              <div className="flex flex-col gap-5 max-w-3xl">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
                    <Icon name="movie" className="text-primary" /> {activeScene?.title} ({activeScene?.timecode})
                  </h2>
                  <div className="flex gap-2">
                    <Button variant="ghost" icon="play_circle" onClick={() => startRender('сцены')}>
                      Рендер сцены
                    </Button>
                    <Button variant={isCopied ? 'primary' : 'secondary'} icon={isCopied ? 'check' : 'smart_toy'} onClick={copyPromptForAI}>
                      {isCopied ? 'Скопировано!' : 'Промпт сцены'}
                    </Button>
                  </div>
                </div>

                {activeScene?.fragments.map((frag, index) => (
                  <div key={frag.id} className="bg-surface-container/30 border border-white/5 rounded-xl p-5 flex gap-4 transition-colors focus-within:border-primary/40 focus-within:bg-surface-container/50 relative group">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-container-high border border-white/10 text-on-surface-variant flex items-center justify-center font-bold text-xs mt-0.5 group-focus-within:bg-primary/20 group-focus-within:text-primary group-focus-within:border-primary/30 transition-colors">
                      {index + 1}
                    </div>
                    <div className="flex-1 flex flex-col min-w-0 gap-3">
                      <div className="flex justify-between items-start gap-4">
                        <input
                          className="bg-transparent border-b border-transparent focus:border-primary/50 text-[13px] font-label uppercase tracking-wider text-primary outline-none transition-colors w-full pb-1"
                          value={frag.visualNote}
                          placeholder="Визуал фрагмента"
                          onChange={e => updateFragment(frag.id, { visualNote: e.target.value })}
                        />
                        <button onClick={() => deleteFragment(frag.id)} className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error transition-opacity flex-shrink-0" title="Удалить фрагмент">
                          <Icon name="delete" className="text-[18px]"/>
                        </button>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] text-secondary font-label uppercase flex items-center gap-1">
                          <Icon name="speaker_notes" className="text-[14px]" /> Текст суфлера (Озвучка / Экран)
                        </label>
                        <textarea
                          className="w-full bg-black/30 border border-white/5 rounded-lg p-3 text-sm text-on-surface outline-none resize-none focus:border-secondary/50 focus:bg-black/40 custom-scrollbar transition-colors leading-relaxed"
                          rows={3}
                          placeholder="Текст для суфлера и генерации..."
                          value={frag.text || ''}
                          onChange={e => updateFragment(frag.id, { text: e.target.value })}
                        />
                      </div>

                      <div className="flex items-center gap-2 mt-1 pt-3 border-t border-white/5 overflow-x-auto custom-scrollbar pb-1">
                        <Button
                          variant="primary"
                          icon="play_circle"
                          className="!py-1.5 !px-3 text-[11px] whitespace-nowrap"
                          onClick={() => startRender('фрагмента')}
                        >
                          <span className="truncate">Render</span>
                        </Button>
                        <Button
                          variant={copiedFragId === frag.id ? 'primary' : 'dashed'}
                          icon={copiedFragId === frag.id ? 'check' : 'smart_toy'}
                          className="!py-1.5 !px-3 text-[11px] whitespace-nowrap"
                          onClick={() => copyFragmentPrompt(frag)}
                        >
                          <span className="truncate">Prompt</span>
                        </Button>
                        <Button
                          variant={expandedCodeFrags.has(frag.id) ? 'primary' : 'dashed'}
                          icon="code"
                          className="!py-1.5 !px-3 text-[11px] whitespace-nowrap"
                          onClick={() => toggleFragCode(frag.id)}
                        >
                          <span className="truncate">Code</span>
                        </Button>
                        <Button
                          variant={frag.bRollFileName ? 'primary' : 'dashed'}
                          icon="movie"
                          className="!py-1.5 !px-3 text-[11px] whitespace-nowrap max-w-[140px]"
                          onClick={() => { setTargetFrag(frag.id); fragmentAssetRef.current?.click() }}
                          title={frag.bRollFileName}
                        >
                          <span className="truncate">{frag.bRollFileName || 'B-roll'}</span>
                        </Button>
                        <Button
                          variant={frag.audioFileName ? 'primary' : 'dashed'}
                          icon="mic"
                          className="!py-1.5 !px-3 text-[11px] whitespace-nowrap max-w-[140px]"
                          onClick={() => { setTargetFrag(frag.id); fragmentAudioRef.current?.click() }}
                          title={frag.audioFileName}
                        >
                          <span className="truncate">{frag.audioFileName || 'Audio'}</span>
                        </Button>
                      </div>

                      {expandedCodeFrags.has(frag.id) && (
                        <div className="mt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                          <textarea
                            className="w-full bg-[#0d1117] text-[#e6edf3] font-mono text-xs p-3 rounded-lg border border-white/10 focus:border-secondary/50 outline-none resize-y custom-scrollbar transition-colors"
                            rows={8}
                            placeholder="Вставьте TSX код для этого фрагмента..."
                            value={frag.remotionCode || ''}
                            onChange={e => updateFragment(frag.id, { remotionCode: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  className="w-full py-4 border border-dashed border-white/10 hover:border-primary/40 hover:bg-primary/5 rounded-xl text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center gap-2 font-label text-sm mt-2"
                  onClick={addFragment}
                >
                  <Icon name="add" className="text-[18px]" /> Добавить фрагмент
                </button>
              </div>
            ) : (
              <div className="flex flex-col h-full gap-4 max-w-4xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-sm font-label text-secondary uppercase">Remotion TSX (Сцена: {activeScene?.title})</h2>
                  <div className="flex gap-2">
                    <Button variant="ghost" icon="play_circle" onClick={() => startRender('сцены')}>Рендер</Button>
                    <Button variant="ghost" icon="upload" onClick={() => assetInputRef.current?.click()}>Импорт футажа (B-roll)</Button>
                    <Button variant="primary" icon="save" onClick={handleSaveCode}>Сохранить .tsx файл</Button>
                  </div>
                </div>
                <input type="file" ref={assetInputRef} className="hidden" accept="video/mp4, image/*" onChange={handleAssetUpload} />
                <textarea
                  className="flex-1 w-full bg-[#0d1117] text-[#e6edf3] font-mono text-sm p-4 rounded-xl border border-white/10 focus:border-secondary/50 focus:outline-none resize-none custom-scrollbar"
                  placeholder="Вставьте сгенерированный ИИ код сцены сюда..."
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <aside className="w-[380px] border-l border-white/10 flex flex-col bg-surface-container/60 backdrop-blur-2xl shrink-0">
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 custom-scrollbar">
            {/* Remotion Code Panel */}
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
                  <button className="text-on-surface-variant hover:text-white" onClick={() => navigator.clipboard.writeText(displayCode)} title="Копировать TSX">
                    <Icon name="content_copy" className="text-[16px]" />
                  </button>
                </div>
              </div>
              <div className="border border-white/5 shadow-inner bg-surface-container-lowest/50 p-4 rounded-lg overflow-x-auto custom-scrollbar max-h-[400px]">
                <pre className="font-mono text-[12px] text-on-surface-variant leading-relaxed">
                  <code>{displayCode}</code>
                </pre>
              </div>
            </section>

            <div className="h-px w-full bg-white/5" />

            <section className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Icon name="record_voice_over" className="text-primary text-[18px]" />
                <h3 className="font-title-md text-title-md text-on-surface">OmniVoice AI</h3>
              </div>
            <FieldGroup label="Голосовая модель">
              <Select value={voiceModel} onChange={(e) => setVoiceModel(e.target.value)}>
                <option value="aria">Neural - Aria (Женский, Спокойный)</option>
                <option value="marcus">Neural - Marcus (Мужской, Глубокий)</option>
                <option value="nova">Expressive - Nova (Женский, Энергичный)</option>
                <option value="clone">Cloning - Клонирование голоса</option>
              </Select>
            </FieldGroup>

            {voiceModel === 'clone' && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <input type="file" ref={cloneAudioRef} className="hidden" accept="audio/*" onChange={handleCloneAudioUpload} />
                <button
                  className="w-full flex flex-col items-center justify-center p-3 rounded-lg border border-dashed border-white/20 hover:border-secondary/50 hover:bg-white/5 transition-all group"
                  onClick={() => cloneAudioRef.current?.click()}
                >
                  <Icon name="upload_file" className="text-[20px] text-on-surface-variant group-hover:text-secondary" />
                  <span className="text-[11px] text-on-surface-variant group-hover:text-secondary mt-1">
                    {audioRefName ? audioRefName : 'Загрузить Audio Ref (.wav/.mp3)'}
                  </span>
                </button>
                <FieldGroup label="Текст референса (Опционально)">
                  <Input value={cloneText} onChange={(e) => setCloneText(e.target.value)} placeholder="Текст, который звучит в аудио-примере..." />
                </FieldGroup>
              </div>
            )}

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="font-label text-xs text-on-surface-variant">Стабильность</label>
                  <span className="font-mono text-[10px] text-on-surface-variant">{voiceStability}%</span>
                </div>
                <Slider value={voiceStability} onChange={(e) => setVoiceStability(Number(e.target.value))} min={0} max={100} />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="font-label text-xs text-on-surface-variant">Четкость</label>
                  <span className="font-mono text-[10px] text-on-surface-variant">{voiceClarity}%</span>
                </div>
                <Slider value={voiceClarity} onChange={(e) => setVoiceClarity(Number(e.target.value))} min={0} max={100} />
              </div>
            </div>

            <div className="h-px bg-white/5 w-full my-1" />

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-label text-[11px] uppercase tracking-wider text-on-surface-variant">Аудиодорожка (Сцена)</span>
                <button className="text-[11px] text-secondary hover:underline" onClick={() => audioInputRef.current?.click()}>
                  Загрузить вручную
                </button>
              </div>

              <input type="file" ref={audioInputRef} className="hidden" accept="audio/*" onChange={handleAudioUpload} />

              {audioLoaded ? (
                <div className="flex flex-col gap-4">
                  <div className="bg-secondary/10 border border-secondary/30 p-3 rounded-xl flex items-center justify-between group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Icon name="audio_file" className="text-secondary text-[20px] shrink-0" />
                      <span className="text-xs text-secondary font-medium truncate" title={audioLoaded}>{audioLoaded}</span>
                    </div>
                    <button className="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setAudioLoaded(null)}>
                      <Icon name="close" className="text-[16px]" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase font-label text-on-surface-variant">Инструменты обработки</span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="dashed"
                        icon={activeProcess === 'denoise' ? undefined : "noise_aware"}
                        className="!py-1.5 !px-2 text-[11px] flex justify-center gap-1.5"
                        disabled={isProcessingAudio || isSyncing}
                        onClick={() => handleProcessAudio('denoise')}
                      >
                        {activeProcess === 'denoise' ? <Spinner className="text-[14px]" /> : 'Убрать шум'}
                      </Button>
                      <Button
                        variant="dashed"
                        icon={activeProcess === 'normalize' ? undefined : "equalizer"}
                        className="!py-1.5 !px-2 text-[11px] flex justify-center gap-1.5"
                        disabled={isProcessingAudio || isSyncing}
                        onClick={() => handleProcessAudio('normalize')}
                      >
                        {activeProcess === 'normalize' ? <Spinner className="text-[14px]" /> : 'Нормализация'}
                      </Button>
                      <Button
                        variant="dashed"
                        icon={activeProcess === 'remove_silence' ? undefined : "content_cut"}
                        className="!py-1.5 !px-2 text-[11px] flex justify-center gap-1.5"
                        disabled={isProcessingAudio || isSyncing}
                        onClick={() => handleProcessAudio('remove_silence')}
                      >
                        {activeProcess === 'remove_silence' ? <Spinner className="text-[14px]" /> : 'Убрать паузы'}
                      </Button>
                      <Button
                        variant="dashed"
                        icon={activeProcess === 'enhance' ? undefined : "auto_fix_high"}
                        className="!py-1.5 !px-2 text-[11px] flex justify-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                        disabled={isProcessingAudio || isSyncing}
                        onClick={() => handleProcessAudio('enhance')}
                      >
                        {activeProcess === 'enhance' ? <Spinner className="text-[14px]" /> : 'Улучшить (AI)'}
                      </Button>
                    </div>
                  </div>

                  <Button
                    variant={isSyncing ? "dashed" : "secondary"}
                    icon={isSyncing ? undefined : "sync"}
                    disabled={isProcessingAudio || isSyncing}
                    className="w-full justify-center shadow-[0_0_15px_rgba(4,180,162,0.15)] transition-all"
                    onClick={handleSyncAudioVideo}
                  >
                    {isSyncing ? (
                      <><Spinner className="text-[18px] text-secondary" /> Синхронизация...</>
                    ) : (
                      'Синхронизировать с видео'
                    )}
                  </Button>
                </div>
              ) : (
                <div className="border border-white/5 bg-surface-container-lowest/50 p-4 rounded-xl flex flex-col items-center justify-center text-center gap-2">
                  <span className="text-xs text-on-surface-variant">Аудиодорожка пуста</span>
                </div>
              )}
            </div>

            <div className="mt-auto pt-4">
              <Button
                variant="primary"
                className="w-full justify-center !py-3 shadow-[0_0_20px_rgba(221,183,255,0.15)]"
                disabled={isGeneratingAudio || (!activeScene?.fragments.some(f => f.text))}
                onClick={handleGenerateAudio}
              >
                {isGeneratingAudio ? (
                  <><Spinner className="text-[18px]" /> Генерация...</>
                ) : (
                  <><Icon name="bolt" className="text-[20px]" filled /> Генерировать аудио</>
                )}
              </Button>
            </div>
          </section>
          </div>
        </aside>
      </main>

      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Параметры проекта">
        <div className="flex flex-col gap-6 w-full pb-4">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-label uppercase text-secondary">Метаданные YouTube (Из сценария)</h3>
            <FieldGroup label="Название видео">
              <Input value={project.metadata.title} onChange={(e: ChangeEvent<HTMLInputElement>) => handleMetadataChange('title', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Описание">
              <Input value={project.metadata.description} onChange={(e: ChangeEvent<HTMLInputElement>) => handleMetadataChange('description', e.target.value)} />
            </FieldGroup>
            <FieldGroup label="Теги">
              <Input value={project.metadata.tags.join(', ')} onChange={(e: ChangeEvent<HTMLInputElement>) => handleMetadataChange('tags', e.target.value)} />
            </FieldGroup>
          </section>

          <div className="h-px bg-white/10" />

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-label uppercase text-primary">Цветовая палитра проекта</h3>
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: 'Primary', key: 'primary' as const },
                { label: 'Secondary', key: 'secondary' as const },
                { label: 'Accent', key: 'accent' as const },
                { label: 'Background', key: 'background' as const },
                { label: 'Surface', key: 'surface' as const },
                { label: 'Text', key: 'text' as const },
              ]).map(color => (
                <FieldGroup key={color.key} label={color.label}>
                  <div className="flex items-center gap-2 bg-surface-container-lowest border border-white/10 p-1.5 rounded-lg">
                    <input type="color" value={project.montage.colors[color.key]} onChange={(e) => handleColorChange(color.key, e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent" />
                    <span className="font-mono text-xs">{project.montage.colors[color.key]}</span>
                  </div>
                </FieldGroup>
              ))}
            </div>
          </section>

          <div className="h-px bg-white/10" />

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-label uppercase text-primary">Типографика проекта</h3>
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Шрифт заголовков (Heading)">
                <Input value={project.montage.typography.heading} onChange={(e) => handleTypographyChange('heading', e.target.value)} />
              </FieldGroup>
              <FieldGroup label="Шрифт текста (Body)">
                <Input value={project.montage.typography.body} onChange={(e) => handleTypographyChange('body', e.target.value)} />
              </FieldGroup>
            </div>
          </section>

          <div className="h-px bg-white/10" />

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-label uppercase text-error">Опасная зона</h3>
            <Button variant="dashed" className="border-error/30 text-error hover:bg-error/10 hover:border-error/50 w-full" onClick={() => onDeleteProject(project.name)}>
              Удалить проект
            </Button>
          </section>
        </div>
      </Modal>
    </div>
  )
}
