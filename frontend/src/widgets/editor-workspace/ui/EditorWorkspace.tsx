import { useState, useEffect, useCallback } from 'react'
import type { ProjectSettings, Resolution, VideoFormat, GlobalVoice } from '@entities/project'
import { useSettingsStore } from '@entities/project'
import { Button, Modal, FieldGroup, Slider, Switch, Input, Select, Icon, Spinner } from '@shared/ui'
import { THEME_PRESETS, REMOTION_SKILLS, type ThemePreset } from '@shared/config'
import { useEditorWorkspace } from '@widgets/editor-workspace/model/useEditorWorkspace'
import { CenterCanvas } from './CenterCanvas'
import { EditorHeader } from './EditorHeader'
import { PipelineInspector } from './PipelineInspector'
import { SceneSidebar } from './SceneSidebar'
import { YoutubeIdeasView } from './YoutubeIdeasView'
import { VoiceboxModal } from './VoiceboxModal'
import { API } from '@widgets/editor-workspace/lib/helpers'

interface Props {
  project: ProjectSettings
  projects: ProjectSettings[]
  onSwitchProject: (id: string) => void
  onNewProject: () => void
  onUpdateProject: (project: ProjectSettings) => void
  onDeleteProject: (id: string) => void
}

export const EditorWorkspace = ({
  project,
  projects,
  onSwitchProject,
  onNewProject,
  onUpdateProject,
  onDeleteProject,
}: Props) => {
  const model = useEditorWorkspace({ project, onUpdateProject })
  
  const [settingsTab, setSettingsTab] = useState<'project' | 'prompts' | 'ai-engines' | 'global-voices' | 'audio-processing' | 'ui'>('project')
  const { globalPrompts, setGlobalPrompts, resetGlobalPrompts, apiKeys, setApiKey, aiMode, setAiMode, cloudEngines, setCloudEngine, localEngines, setLocalEngine, visualPacingThreshold, audioSilenceThreshold, audioWpmMin, setVisualPacingThreshold, setAudioSilenceThreshold, setAudioWpmMin, globalVoices, setGlobalVoices, uiPreferences, setUiPreferences } = useSettingsStore()
  const isLocalPrompts = project.promptOverrides !== undefined
  const [hardware, setHardware] = useState<{ vram_gb: number; ram_gb: number; device: string; gpu_type: string } | null>(null)
  const [pulling, setPulling] = useState<string | null>(null)
  const [hfPullUrl, setHfPullUrl] = useState('')
  const [syncingSkills, setSyncingSkills] = useState(false)

  // === НОВАЯ ЛОГИКА ДЛЯ ИЗМЕНЕНИЯ ШИРИНЫ ПАНЕЛЕЙ ===
  const [leftWidth, setLeftWidth] = useState(() => Number(localStorage.getItem('vidora:left-panel-width')) || 320)
  const [rightWidth, setRightWidth] = useState(() => Number(localStorage.getItem('vidora:right-panel-width')) || 380)

  const handleLeftDrag = useCallback((e: MouseEvent) => {
    let newWidth = e.clientX
    if (newWidth < 220) newWidth = 220 // Минимальная ширина
    if (newWidth > 600) newWidth = 600 // Максимальная ширина
    setLeftWidth(newWidth)
    localStorage.setItem('vidora:left-panel-width', newWidth.toString())
  }, [])

  const startLeftDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', handleLeftDrag)
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', handleLeftDrag)
      document.body.style.cursor = ''
    }, { once: true })
  }

  const handleRightDrag = useCallback((e: MouseEvent) => {
    let newWidth = window.innerWidth - e.clientX
    if (newWidth < 280) newWidth = 280
    if (newWidth > 600) newWidth = 600
    setRightWidth(newWidth)
    localStorage.setItem('vidora:right-panel-width', newWidth.toString())
  }, [])

  const startRightDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', handleRightDrag)
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', handleRightDrag)
      document.body.style.cursor = ''
    }, { once: true })
  }
  // ===================================================

  const syncedSkills = project.syncedSkills
  const skills = [
    ...REMOTION_SKILLS,
    ...(syncedSkills?.skills || []).filter((s) => !REMOTION_SKILLS.some((rs) => rs.id === s.id)),
  ]

  const handleSyncSkills = useCallback(async () => {
    setSyncingSkills(true)
    try {
      const res = await fetch(`${API}/api/v1/system/remotion-skills-sync`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        onUpdateProject({ ...project, syncedSkills: data })
        model.showNotification(`Синхронизировано скиллов: ${data.skills.length}`, 'success')
      } else {
        model.showNotification('Не удалось синхронизировать скиллы', 'error')
      }
    } catch {
      model.showNotification('Не удалось синхронизировать скиллы', 'error')
    }
    setSyncingSkills(false)
  }, [project, onUpdateProject, model])

  // ponytail: inlined target prompts are plain text; local overrides win, else global
  const appendToPrompt = useCallback((which: 'scene' | 'fragment' | 'project', skillTitle: string, content: string) => {
    const base = isLocalPrompts ? project.promptOverrides?.[which] : globalPrompts[which]
    const text = `\n\n## Remotion Skill: ${skillTitle}\n\n${content}`
    if (isLocalPrompts) {
      onUpdateProject({ ...project, promptOverrides: { ...project.promptOverrides, [which]: `${base ?? ''}${text}` } })
    } else {
      setGlobalPrompts({ [which]: `${base ?? ''}${text}` })
    }
    model.showNotification(`Скилл «${skillTitle}» добавлен в промпт: ${which}`, 'success')
  }, [isLocalPrompts, project, onUpdateProject, globalPrompts, setGlobalPrompts, model])

  const handleCopySkill = useCallback(async (skillTitle: string, content: string) => {
    await navigator.clipboard.writeText(content)
    model.showNotification(`Скилл «${skillTitle}» скопирован`, 'success')
  }, [model])

  useEffect(() => {
    fetch(`${API}/api/v1/system/hardware`).then(r => r.ok && r.json()).then(setHardware).catch(() => {})
  }, [])

  const handlePull = useCallback(async (engine: string) => {
    setPulling(engine)
    try {
      await fetch(`${API}/api/v1/system/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine }) })
    } catch { /* ignore */ }
    setTimeout(() => setPulling(null), 2000)
  }, [])

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-background">
      <EditorHeader
        project={project}
        projects={projects}
        isAutoPipelineRunning={model.isAutoPipelineRunning}
        isRendering={model.isRendering}
        pipelineStep={model.pipelineStep}
        uiPreferences={uiPreferences}
        onToggleUi={(key) => setUiPreferences({ [key]: !uiPreferences[key] })}
        onSwitchProject={onSwitchProject}
        onNewProject={onNewProject}
        onOpenSettings={() => model.setIsSettingsOpen(true)}
        onFullAutoPipeline={model.handleFullAutoPipeline}
        workspaceView={model.workspaceView}
        onToggleIdeas={() => model.setWorkspaceView(model.workspaceView === 'ideas' ? 'editor' : 'ideas')}
      />

      <main className="flex-1 flex overflow-hidden">
        {model.workspaceView === 'ideas' ? (
          <YoutubeIdeasView project={project} />
        ) : (
          <div className="flex flex-1 min-w-0">
            {uiPreferences.showSceneSidebar && (
              <div className="relative shrink-0 h-full" style={{ width: leftWidth }}>
                <SceneSidebar
                  project={project}
                  activeSceneId={model.activeSceneId}
                  audioLoaded={model.audioLoaded}
                  onSelectScene={model.setActiveSceneId}
                  onAddScene={model.handleAddScene}
                  onDeleteScene={model.handleDeleteScene}
                  onUpdateTitle={model.handleUpdateSceneTitle}
                  onToggleIgnoreTsx={model.toggleIgnoreTsx}
                  onDragStart={model.handleSceneDragStart}
                  onDrop={model.handleSceneDrop}
                  onShowNotification={model.showNotification}
                  onExportScene={model.handleExportScene}
                  onReplaceScene={model.handleReplaceScene}
                  onFixAudioPacing={model.handleFixAudioPacing}
                  onCopyFixPacingPrompt={model.handleCopyFixPacingPrompt}
                  onReplaceSceneAudio={model.handleReplaceSceneAudio}
                />
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/50 active:bg-primary z-30 transition-colors translate-x-1/2"
                  onMouseDown={startLeftDrag}
                />
              </div>
            )}

            <CenterCanvas
              centerView={model.centerView}
              previewFormat={model.previewFormat}
              onChangeView={model.setCenterView}
              onPreviewFormatChange={model.setPreviewFormat}
              playingTargetId={model.playingTargetId}
              renderedVideos={model.renderedVideos}
              audioLoaded={model.audioLoaded}
              activeScene={model.activeScene}
              project={project}
              videoRef={model.videoRef}
              audioRef={model.audioRef}
              onUpdateCode={model.handleUpdateCode}
              onCodeHistory={model.handleCodeHistory}
              isRendering={model.isRendering}
              isAutoPipelineRunning={model.isAutoPipelineRunning}
              pipelineStep={model.pipelineStep}
              renderProgress={model.renderProgress}
              onCancelAll={model.handleCancelAll}
              onUpdateMarkdown={model.handleUpdateMarkdown}
              onCaptureFrame={model.handleCaptureFrame}
              onUpdateFragmentBounds={model.handleUpdateFragmentBounds}
              showTimeline={uiPreferences.showTimeline}
            />

            {uiPreferences.showInspector && (
              <div className="relative shrink-0 h-full" style={{ width: rightWidth }}>
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/50 active:bg-primary z-30 transition-colors -translate-x-1/2"
                  onMouseDown={startRightDrag}
                />
                <PipelineInspector
                  project={project}
                  activeScene={model.activeScene}
                  voiceModel={model.voiceModel}
                  useWhisper={model.useWhisper}
                  autoOffloadVram={model.autoOffloadVram}
                  isGeneratingAudio={model.isGeneratingAudio}
                  isSyncing={model.isSyncing}
                  isGeneratingCode={model.isGeneratingCode}
                  isRendering={model.isRendering}
                  renderProgress={model.renderProgress}
                  onChangeVoiceModel={model.setVoiceModel}
                  onChangeUseWhisper={model.setUseWhisper}
                  onChangeAutoOffloadVram={model.setAutoOffloadVram}
                  onAddFragment={model.handleAddFragment}
                  onDeleteFragment={model.handleDeleteFragment}
                  onFragmentTextChange={model.handleFragmentTextChange}
                  onFragDragStart={model.handleFragDragStart}
                  onFragDrop={model.handleFragDrop}
                  onOpenVoicebox={() => model.setIsVoiceboxOpen(true)}
                  onOpenAiSettings={() => model.setIsAiSettingsOpen(true)}
                  onRunVoiceGen={() => model.runVoiceGenAllScenes()}
                  onRunVoiceGenFragment={model.runVoiceGenFragment}
                  onResetAllSync={model.handleResetAllSync}
                  onResetAudio={model.handleResetAudio}
                  onProcessAudio={model.handleProcessAudio}
                  onProcessAdvancedSilence={model.handleProcessAdvancedSilence}
                  onUnloadVram={model.handleUnloadVram}
                  onRunSync={() => model.runSyncAllScenes()}
                  onToggleIgnoreTsx={model.toggleIgnoreTsx}
                  onRunCodeGen={() => model.runCodeGen()}
                  onRunProjectRender={model.runProjectRender}
                  onRunRender={() => model.runRender()}
                  onExportProject={model.handleExportProject}
                  onShowNotification={model.showNotification}
                  onUpdateFragmentBRoll={model.handleUpdateFragmentBRoll}
                  onUnlinkFragmentBRoll={model.handleUnlinkFragmentBRoll}
                  onNudgeTiming={model.handleNudgeTiming}
                  onReplaceFragmentAudio={model.handleReplaceFragmentAudio}
                />
              </div>
            )}
          </div>
        )}
      </main>

      <VoiceboxModal
        isOpen={model.isVoiceboxOpen}
        onClose={() => model.setIsVoiceboxOpen(false)}
        project={project}
        newVoiceName={model.newVoiceName}
        newVoiceText={model.newVoiceText}
        newVoiceTags={model.newVoiceTags}
        newVoiceAudioPath={model.newVoiceAudioPath}
        refVoiceInputRef={model.refVoiceInputRef}
        onChangeName={model.setNewVoiceName}
        onChangeText={model.setNewVoiceText}
        onChangeTags={model.setNewVoiceTags}
        onUploadRefVoiceAudio={model.handleUploadRefVoiceAudio}
        onSaveCustomVoice={model.handleSaveCustomVoice}
        onDeleteCustomVoice={model.handleDeleteCustomVoice}
      />

      <Modal isOpen={model.isSettingsOpen} onClose={() => model.setIsSettingsOpen(false)} title="Настройки">
        <div className="flex flex-wrap gap-1 mb-5 p-1 bg-surface-container-lowest/50 rounded-lg border border-white/5">
          <button onClick={() => setSettingsTab('project')} className={`flex-auto text-center py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${settingsTab === 'project' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white hover:bg-white/5'}`}>Проект</button>
          <button onClick={() => setSettingsTab('ui')} className={`flex-auto text-center py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${settingsTab === 'ui' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white hover:bg-white/5'}`}>Интерфейс</button>
          <button onClick={() => setSettingsTab('prompts')} className={`flex-auto text-center py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${settingsTab === 'prompts' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white hover:bg-white/5'}`}>Промпты LLM</button>
          <button onClick={() => setSettingsTab('ai-engines')} className={`flex-auto text-center py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${settingsTab === 'ai-engines' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white hover:bg-white/5'}`}>AI Движки</button>
          <button onClick={() => setSettingsTab('global-voices')} className={`flex-auto text-center py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${settingsTab === 'global-voices' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white hover:bg-white/5'}`}>Голоса</button>
          <button onClick={() => setSettingsTab('audio-processing')} className={`flex-auto text-center py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${settingsTab === 'audio-processing' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white hover:bg-white/5'}`}>Аудио</button>
        </div>

        <div className="flex flex-col gap-4 pb-2">
          {settingsTab === 'ui' ? (
            <div className="bg-surface-container-lowest/50 p-4 rounded-xl border border-white/5 flex flex-col gap-4">
              <Switch
                label="Показывать левую панель (Сайдбар сцен)"
                checked={uiPreferences.showSceneSidebar}
                onChange={(v) => setUiPreferences({ showSceneSidebar: v })}
              />
              <Switch
                label="Показывать нижнюю панель (Таймлайн)"
                checked={uiPreferences.showTimeline}
                onChange={(v) => setUiPreferences({ showTimeline: v })}
              />
              <Switch
                label="Показывать правую панель (Инспектор)"
                checked={uiPreferences.showInspector}
                onChange={(v) => setUiPreferences({ showInspector: v })}
              />
            </div>
          ) : settingsTab === 'project' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <FieldGroup label="Формат видео">
                  <Select value={project.format} onChange={e => onUpdateProject({ ...project, format: e.target.value as VideoFormat })}>
                    <option value="16:9">YouTube (16:9)</option>
                    <option value="9:16">Shorts / Reels (9:16)</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Разрешение">
                  <Select value={project.resolution} onChange={e => onUpdateProject({ ...project, resolution: e.target.value as Resolution })}>
                    <option value="1080p">Full HD (1080p)</option>
                    <option value="1440p">2K (1440p)</option>
                    <option value="2160p">4K (2160p)</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label="FPS">
                  <Select value={project.montage?.fps || '30'} onChange={e => onUpdateProject({ ...project, montage: { ...project.montage, fps: e.target.value as '24'|'30'|'60' } })}>
                    <option value="24">24 FPS</option>
                    <option value="30">30 FPS</option>
                    <option value="60">60 FPS</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Режим генерации аудио">
            <Select value={project.audioMode || 'scene'} onChange={e => onUpdateProject({ ...project, audioMode: e.target.value as "fragment" | "scene" | "project" })}>
              <option value="project">По проекту (Единый файл)</option>
              <option value="scene">По сценам (Идеальная речь)</option>
              <option value="fragment">По фрагментам (С паузами)</option>
            </Select>
                </FieldGroup>
              </div>
              <div className="bg-surface-container-lowest/50 p-4 rounded-xl border border-white/5 mb-4">
                <Switch
                  label="Использовать 3D графику (Beta, React Three Fiber)"
                  checked={project.use3D ?? false}
                  onChange={val => onUpdateProject({ ...project, use3D: val })}
                />
                <p className="text-[10px] text-on-surface-variant mt-2 leading-relaxed">
                  Если включено, ИИ сможет генерировать 3D-сцены с помощью @remotion/three. Рендер сложных 3D-объектов может занимать больше времени.
                </p>
              </div>
              <div className="text-[10px] font-mono text-on-surface-variant mt-2 uppercase tracking-wider">Индикаторы удержания (Pacing)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 bg-surface-container-lowest/50 p-3 rounded-xl border border-white/5">
                <FieldGroup label={`Визуал (<= ${visualPacingThreshold.toFixed(1)}с/кадр)`}>
                  <Slider min={1} max={10} step={0.5} value={visualPacingThreshold} onChange={e => setVisualPacingThreshold(Number(e.target.value))} />
                </FieldGroup>
                <FieldGroup label={`Тишина (<= ${audioSilenceThreshold.toFixed(1)}с)`}>
                  <Slider min={0.5} max={5} step={0.5} value={audioSilenceThreshold} onChange={e => setAudioSilenceThreshold(Number(e.target.value))} />
                </FieldGroup>
                <FieldGroup label={`Темп (>= ${audioWpmMin} WPM)`}>
                  <Slider min={60} max={160} step={5} value={audioWpmMin} onChange={e => setAudioWpmMin(Number(e.target.value))} />
                </FieldGroup>
              </div>

              <FieldGroup label="Название видео (Title)">
                <Input value={project.metadata?.title || ''} onChange={e => onUpdateProject({ ...project, metadata: { ...project.metadata, title: e.target.value } })} />
              </FieldGroup>
              <FieldGroup label="Описание (Description)">
                <textarea
                  className="w-full bg-surface-container-lowest border border-white/10 rounded-lg py-2 px-3 text-sm text-on-surface resize-none focus:outline-none focus:border-primary/50 transition-all"
                  rows={3}
                  value={project.metadata?.description || ''}
                  onChange={e => onUpdateProject({ ...project, metadata: { ...project.metadata, description: e.target.value } })}
                />
              </FieldGroup>
              <FieldGroup label="Теги (через запятую)">
                <Input
                  value={(project.metadata?.tags || []).join(', ')}
                  onChange={e => onUpdateProject({ ...project, metadata: { ...project.metadata, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) } })}
                  placeholder="tech, review, rtx5090"
                />
              </FieldGroup>
              <FieldGroup label="Тип переходов между сценами (Transitions)">
                <Select
                  value={project.montage?.transitions?.[0] || 'none'}
                  onChange={e => {
                    const val = e.target.value;
                    onUpdateProject({ ...project, montage: { ...project.montage, transitions: val === 'none' ? [] : [val] } })
                  }}
                >
                  <option value="none">Без переходов</option>
                  <option value="fade">Плавное затухание (Fade In/Out)</option>
                  <option value="slide_left">Свайп влево (Slide Left)</option>
                  <option value="slide_up">Свайп вверх (Slide Up)</option>
                  <option value="zoom">Наезд камеры (Zoom In/Out)</option>
                  <option value="glitch">Цифровые помехи (Glitch)</option>
                </Select>
              </FieldGroup>
              <FieldGroup label="Цветовая тема (Пресеты)">
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
                      {THEME_PRESETS.map((tpl: ThemePreset) => (
                          <button 
                              key={tpl.name}
                              onClick={() => onUpdateProject({ ...project, montage: { ...project.montage, colors: tpl.colors } })}
                              className="flex flex-col items-center gap-1 shrink-0 group"
                              title={tpl.name}
                          >
                              <div className="w-8 h-8 rounded-full border-2 border-transparent group-hover:border-white/50 flex overflow-hidden">
                                  <div className="flex-1" style={{backgroundColor: tpl.colors.primary}} />
                                  <div className="flex-1" style={{backgroundColor: tpl.colors.background}} />
                              </div>
                              <span className="text-[10px] text-on-surface-variant group-hover:text-white">{tpl.name.split(' ')[0]}</span>
                          </button>
                      ))}
                  </div>
              </FieldGroup>

              <FieldGroup label="Ручная настройка палитры">
                  <div className="grid grid-cols-3 gap-3 mt-2">
                     {(['primary', 'secondary', 'accent', 'background', 'surface', 'text'] as const).map(colorKey => (
                         <div key={colorKey} className="flex flex-col gap-1">
                             <span className="text-[10px] text-on-surface-variant uppercase">{colorKey}</span>
                             <div className="flex items-center gap-2 bg-surface-container-lowest border border-white/10 rounded-lg p-1">
                                 <input 
                                     type="color" 
                                     value={project.montage?.colors?.[colorKey] || '#000000'} 
                                     onChange={e => onUpdateProject({ ...project, montage: { ...project.montage, colors: { ...project.montage.colors, [colorKey]: e.target.value } } })}
                                     className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                                 />
                                 <input 
                                     type="text" 
                                     value={project.montage?.colors?.[colorKey] || '#000000'}
                                     onChange={e => onUpdateProject({ ...project, montage: { ...project.montage, colors: { ...project.montage.colors, [colorKey]: e.target.value } } })}
                                     className="w-full bg-transparent text-xs text-on-surface outline-none font-mono uppercase"
                                     maxLength={7}
                                 />
                             </div>
                         </div>
                     ))}
                  </div>
              </FieldGroup>
              <div className="h-px bg-white/10 my-2" />
              <Button variant="dashed" className="text-error border-error/30 hover:bg-error/10" onClick={() => onDeleteProject(project.name)}>
                Удалить проект
              </Button>
            </>
          ) : settingsTab === 'prompts' ? (
            <>
              <Switch
                label="Использовать индивидуальные промпты для этого проекта"
                checked={isLocalPrompts}
                onChange={(checked) => onUpdateProject({ ...project, promptOverrides: checked ? { ...globalPrompts } : undefined })}
              />
              
              <div className="text-[10px] text-on-surface-variant bg-surface-container-lowest/50 border border-white/5 p-3 rounded-lg leading-relaxed font-mono">
                <span className="text-primary">Доступные переменные:</span><br/>
                {`{{FORMAT}}, {{WIDTH}}, {{HEIGHT}}, {{DURATION}}, {{DURATION_FRAMES}}, {{FPS}}, {{COLORS}}, {{SCENE_TITLE}}, {{FRAGMENTS}}, {{VISUAL_NOTE}}, {{TEXT}}, {{SCENES_LIST}}, {{CURRENT_PACING}}, {{THRESHOLD}}, {{SCENE_MARKDOWN}}`}
              </div>

              <FieldGroup label="Промпт для Сцены">
                <textarea
                  className="w-full bg-surface-container-lowest border border-white/10 rounded-lg p-3 text-[12px] font-mono text-on-surface resize-y focus:outline-none focus:border-primary/50 custom-scrollbar"
                  rows={6}
                  spellCheck={false}
                  value={isLocalPrompts ? project.promptOverrides?.scene : globalPrompts.scene}
                  onChange={e => isLocalPrompts 
                    ? onUpdateProject({ ...project, promptOverrides: { ...project.promptOverrides, scene: e.target.value } })
                    : setGlobalPrompts({ scene: e.target.value })}
                />
              </FieldGroup>

              <FieldGroup label="Промпт для Фрагмента">
                <textarea
                  className="w-full bg-surface-container-lowest border border-white/10 rounded-lg p-3 text-[12px] font-mono text-on-surface resize-y focus:outline-none focus:border-primary/50 custom-scrollbar"
                  rows={4}
                  spellCheck={false}
                  value={isLocalPrompts ? project.promptOverrides?.fragment : globalPrompts.fragment}
                  onChange={e => isLocalPrompts 
                    ? onUpdateProject({ ...project, promptOverrides: { ...project.promptOverrides, fragment: e.target.value } })
                    : setGlobalPrompts({ fragment: e.target.value })}
                />
              </FieldGroup>

              <FieldGroup label="Промпт для Проекта">
                <textarea
                  className="w-full bg-surface-container-lowest border border-white/10 rounded-lg p-3 text-[12px] font-mono text-on-surface resize-y focus:outline-none focus:border-primary/50 custom-scrollbar"
                  rows={4}
                  spellCheck={false}
                  value={isLocalPrompts ? project.promptOverrides?.project : globalPrompts.project}
                  onChange={e => isLocalPrompts 
                    ? onUpdateProject({ ...project, promptOverrides: { ...project.promptOverrides, project: e.target.value } })
                    : setGlobalPrompts({ project: e.target.value })}
                />
              </FieldGroup>
              <FieldGroup label="Промпт для исправления динамики (Pacing)">
                <textarea
                  className="w-full bg-surface-container-lowest border border-white/10 rounded-lg p-3 text-[12px] font-mono text-on-surface resize-y focus:outline-none focus:border-primary/50 custom-scrollbar"
                  rows={4}
                  spellCheck={false}
                  value={isLocalPrompts ? project.promptOverrides?.fixPacing : globalPrompts.fixPacing}
                  onChange={e => isLocalPrompts 
                    ? onUpdateProject({ ...project, promptOverrides: { ...project.promptOverrides, fixPacing: e.target.value } })
                    : setGlobalPrompts({ fixPacing: e.target.value })}
                />
              </FieldGroup>

              {!isLocalPrompts && (
                <Button variant="dashed" onClick={resetGlobalPrompts} className="mt-2 text-on-surface-variant hover:text-white">
                  <Icon name="restore" className="text-[16px] mr-1" /> Сбросить глобальные промпты
                </Button>
              )}

              <div className="mt-6 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-medium">Скиллы Remotion</span>
                  <Button variant="secondary" icon="sync" onClick={handleSyncSkills} disabled={syncingSkills}>
                    {syncingSkills ? 'Синхронизация...' : syncedSkills ? 'Обновить с GitHub' : 'Синхронизировать с GitHub'}
                  </Button>
                </div>
                {syncedSkills ? (
                  <div className="text-[10px] text-success mb-2">Официальные скиллы remotion-dev/skills · {new Date(syncedSkills.synced_at).toLocaleString()}</div>
                ) : (
                  <div className="text-[10px] text-on-surface-variant mb-2">Показаны встроенные лучшие практики. Синхронизация загружает все официальные скиллы с GitHub — добавление их в промпты повышает качество генерации.</div>
                )}
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {skills.map(s => (
                    <div key={s.id} className="p-2.5 rounded-xl border border-white/10 bg-surface-container-lowest">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-on-surface truncate">{s.title}</div>
                          <div className="text-[10px] text-on-surface-variant mt-0.5 line-clamp-2">{s.description}</div>
                        </div>
                        <Button variant="ghost" className="p-1.5 shrink-0" onClick={() => handleCopySkill(s.title, s.content)} title="Копировать"><Icon name="content_copy" className="text-[16px]" /></Button>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <Button variant="dashed" className="py-1 px-2.5 text-[10px]" onClick={() => appendToPrompt('scene', s.title, s.content)}>В Сцену</Button>
                        <Button variant="dashed" className="py-1 px-2.5 text-[10px]" onClick={() => appendToPrompt('fragment', s.title, s.content)}>Во Фрагмент</Button>
                        <Button variant="dashed" className="py-1 px-2.5 text-[10px]" onClick={() => appendToPrompt('project', s.title, s.content)}>В Проект</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : settingsTab === 'global-voices' ? (
            <>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Список глобальных голосов</span>
              <Button variant="secondary" onClick={() => {
                const isCustom = project.customVoices?.find(v => v.id === model.voiceModel)
                const newVoice: GlobalVoice = {
                  id: crypto.randomUUID(),
                  name: `Глобальный Голос ${(globalVoices.length || 0) + 1}`,
                  ttsEngine: model.ttsEngine,
                  voiceModel: isCustom ? 'clone' : model.voiceModel,
                  refAudioPath: isCustom ? isCustom.refAudioPath : undefined,
                  refText: isCustom ? isCustom.refText : undefined,
                  settings: { speed: model.speed, guidanceScale: model.guidanceScale, numSteps: model.numSteps },
                }
                setGlobalVoices([...globalVoices, newVoice])
                onUpdateProject({ ...project, activeGlobalVoiceId: newVoice.id })
              }}>Сохранить текущие настройки</Button>
            </div>
            {globalVoices.map(gv => (
              <div key={gv.id} className={`p-3 rounded-xl border ${project.activeGlobalVoiceId === gv.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-surface-container-lowest'} flex justify-between items-center transition-colors`}>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{gv.name}</span>
                  <span className="text-xs text-on-surface-variant">{gv.ttsEngine} • Модель: {gv.voiceModel === 'clone' ? 'Клон (Voicebox)' : gv.voiceModel}</span>
                </div>
                <div className="flex gap-2">
                  {project.activeGlobalVoiceId !== gv.id ? (
                    <Button variant="dashed" onClick={() => onUpdateProject({ ...project, activeGlobalVoiceId: gv.id })}>Активировать</Button>
                  ) : (
                    <Button variant="ghost" className="text-primary cursor-default font-semibold"><Icon name="check" className="text-lg mr-1" /> Активен</Button>
                  )}
                  <Button variant="ghost" className="text-error" onClick={() => {
                    const newVoices = globalVoices.filter(v => v.id !== gv.id)
                    setGlobalVoices(newVoices)
                    if (project.activeGlobalVoiceId === gv.id) {
                      onUpdateProject({ ...project, activeGlobalVoiceId: undefined })
                    }
                  }}><Icon name="delete" className="text-base" /></Button>
                </div>
              </div>
            ))}
            {globalVoices.length === 0 && (
              <div className="text-center text-on-surface-variant py-8 border border-dashed border-white/10 rounded-xl">Нет сохраненных глобальных голосов.<br/>Настройки применяются для каждой сцены индивидуально.</div>
            )}
            {project.activeGlobalVoiceId && (
                <Button variant="dashed" className="mt-2 text-warning hover:bg-warning/10" onClick={() => onUpdateProject({ ...project, activeGlobalVoiceId: undefined })}>Отключить глобальный голос</Button>
              )}
            </>
          ) : settingsTab === 'audio-processing' ? (
            <>
              <div className="bg-surface-container-lowest/50 p-4 rounded-xl border border-white/5 flex flex-col gap-4">
                <FieldGroup label={`Порог тишины (дБ): ${(project.audioProcessing?.silenceThresholdDb ?? -45.0).toFixed(1)}`}>
                  <Slider min={-60} max={-10} step={1} value={project.audioProcessing?.silenceThresholdDb ?? -45.0} onChange={e => onUpdateProject({ ...project, audioProcessing: { ...(project.audioProcessing || { silenceThresholdDb: -45.0, minSilenceMs: 200, maxSilenceMs: 100, removeEdges: false }), silenceThresholdDb: Number(e.target.value) } })} />
                </FieldGroup>
                <FieldGroup label={`Мин. тишина для детекции (мс): ${project.audioProcessing?.minSilenceMs ?? 200}`}>
                  <Slider min={100} max={2000} step={50} value={project.audioProcessing?.minSilenceMs ?? 200} onChange={e => onUpdateProject({ ...project, audioProcessing: { ...(project.audioProcessing || { silenceThresholdDb: -45.0, minSilenceMs: 200, maxSilenceMs: 100, removeEdges: false }), minSilenceMs: Number(e.target.value) } })} />
                </FieldGroup>
                <FieldGroup label={`Урезать до (мс) [0 = удалить]: ${project.audioProcessing?.maxSilenceMs ?? 100}`}>
                  <Slider min={0} max={1000} step={50} value={project.audioProcessing?.maxSilenceMs ?? 100} onChange={e => onUpdateProject({ ...project, audioProcessing: { ...(project.audioProcessing || { silenceThresholdDb: -45.0, minSilenceMs: 200, maxSilenceMs: 100, removeEdges: false }), maxSilenceMs: Number(e.target.value) } })} />
                </FieldGroup>
                <Switch label="Удалять краевую тишину" checked={project.audioProcessing?.removeEdges ?? false} onChange={val => onUpdateProject({ ...project, audioProcessing: { ...(project.audioProcessing || { silenceThresholdDb: -45.0, minSilenceMs: 200, maxSilenceMs: 100, removeEdges: false }), removeEdges: val } })} />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Переключатель Облако / Локально */}
              <div className="flex p-1 bg-surface-container-lowest/50 rounded-lg border border-white/5 shrink-0">
                <button
                  onClick={() => setAiMode('cloud')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${aiMode === 'cloud' ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_15px_rgba(221,183,255,0.1)]' : 'text-on-surface-variant hover:text-white'}`}
                >
                  <Icon name="cloud" className="text-[14px] align-middle mr-1" /> Облако (RouterAI / API)
                </button>
                <button
                  onClick={() => setAiMode('local')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${aiMode === 'local' ? 'bg-success/20 text-success border border-success/30 shadow-[0_0_15px_rgba(74,222,128,0.1)]' : 'text-on-surface-variant hover:text-white'}`}
                >
                  <Icon name="dns" className="text-[14px] align-middle mr-1" /> Локально (GPU)
                </button>
              </div>

              {aiMode === 'cloud' && (
                <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* API Ключ RouterAI / AITUNNEL */}
                  <div className="bg-surface-container-lowest/40 p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Icon name="key" className="text-warning" />
                      <span className="text-sm font-medium text-white">Единый API Ключ</span>
                    </div>
                    <Input
                      type="password"
                      placeholder="sk-aitunnel-xxx или RouterAI ключ..."
                      value={apiKeys.routerai || ''}
                      onChange={(e) => setApiKey('routerai', e.target.value)}
                      className="font-mono text-xs"
                    />
                    <span className="text-[10px] text-on-surface-variant">Все запросы будут маршрутизироваться через этот ключ к выбранным провайдерам.</span>
                  </div>

                  {/* Сценарий */}
                  <FieldGroup label="🧠 Модель для сценариев (LLM)">
                    <Input list="cloud-scenario-models" placeholder="Например: openai/gpt-4o" value={cloudEngines.scenario} onChange={e => setCloudEngine('scenario', e.target.value)} />
                    <datalist id="cloud-scenario-models">
                      <option value="anthropic/claude-3.5-sonnet" />
                      <option value="openai/gpt-4o" />
                      <option value="deepseek/deepseek-r1" />
                      <option value="google/gemini-2.5-pro" />
                    </datalist>
                  </FieldGroup>

                  {/* Визуал */}
                  <FieldGroup label="🎬 Модель для визуала и кода (Remotion TSX)">
                    <Input list="cloud-visual-models" placeholder="Например: google/gemini-2.5-flash" value={cloudEngines.visual} onChange={e => setCloudEngine('visual', e.target.value)} />
                    <datalist id="cloud-visual-models">
                      <option value="google/gemini-2.5-flash" />
                      <option value="google/gemini-2.5-pro" />
                      <option value="openai/gpt-4o" />
                      <option value="anthropic/claude-3.5-sonnet" />
                    </datalist>
                  </FieldGroup>

                  {/* Аудио */}
                  <div className="flex flex-col gap-2">
                    <FieldGroup label="🎙️ Модель для озвучки (TTS)">
                      <Input list="cloud-audio-models" placeholder="Например: minimax/speech-01-hd" value={cloudEngines.audio} onChange={e => setCloudEngine('audio', e.target.value)} />
                      <datalist id="cloud-audio-models">
                        <option value="minimax/speech-01-hd" />
                        <option value="openai/tts-1-hd" />
                        <option value="x-ai/grok-voice-tts-1.0" />
                      </datalist>
                    </FieldGroup>
                    <div className="flex gap-2 mt-1">
                      <Button variant="dashed" onClick={() => model.setIsVoiceboxOpen(true)} className="flex-1 text-xs border-secondary/30 text-secondary hover:bg-secondary/10">
                        <Icon name="record_voice_over" className="text-[14px] mr-1" /> Клонировать голос
                      </Button>
                      <Button variant="dashed" onClick={() => setSettingsTab('global-voices')} className="flex-1 text-xs border-primary/30 text-primary hover:bg-primary/10">
                        <Icon name="tune" className="text-[14px] mr-1" /> Задизайнить (Настройки)
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {aiMode === 'local' && (
                <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Инфо об оборудовании */}
                  <div className="flex items-center gap-3 bg-surface-container-lowest/50 rounded-xl p-3 border border-white/5">
                    <div className={`w-2 h-2 rounded-full ${hardware?.vram_gb && hardware.vram_gb >= 8 ? 'bg-success' : 'bg-warning'}`} />
                    <div className="text-xs text-on-surface-variant font-mono">
                      {hardware ? `${hardware.device} · VRAM: ${hardware.vram_gb.toFixed(1)}GB · RAM: ${hardware.ram_gb.toFixed(1)}GB` : 'Проверка оборудования...'}
                    </div>
                  </div>

                  {/* Загрузчик Hugging Face / Ollama */}
                  <div className="bg-surface-container-lowest/40 p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Icon name="download" className="text-success" />
                      <span className="text-sm font-medium text-white">Скачать модель (Hugging Face / Ollama)</span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Например: Qwen/Qwen2.5-Coder-7B"
                        value={hfPullUrl}
                        onChange={(e) => setHfPullUrl(e.target.value)}
                        className="font-mono text-xs flex-1"
                      />
                      <Button variant="primary" onClick={() => handlePull(hfPullUrl)} disabled={!hfPullUrl || pulling !== null} className="bg-success hover:bg-success/80 text-black shrink-0">
                        {pulling ? <Spinner /> : 'Pull'}
                      </Button>
                    </div>
                  </div>

                  {/* Сценарий */}
                  <FieldGroup label="🧠 Модель для сценариев (Локально)">
                    <Input list="local-scenario-models" value={localEngines.scenario} onChange={e => setLocalEngine('scenario', e.target.value)} />
                    <datalist id="local-scenario-models">
                      <option value="qwen2.5-coder" />
                      <option value="llama3.1-8b" />
                      <option value="gemma3:4b" />
                      <option value="gemma3:8b" />
                    </datalist>
                  </FieldGroup>

                  {/* Визуал */}
                  <FieldGroup label="🎬 Модель для визуала и кода (Локально)">
                    <Input list="local-visual-models" value={localEngines.visual} onChange={e => setLocalEngine('visual', e.target.value)} />
                    <datalist id="local-visual-models">
                      <option value="qwen2.5-coder" />
                      <option value="deepseek-coder-v2" />
                      <option value="gemma3:4b" />
                      <option value="gemma3:8b" />
                    </datalist>
                  </FieldGroup>

                  {/* Аудио */}
                  <FieldGroup label="🎙️ Модель для озвучки (Локально)">
                    <Input list="local-audio-models" value={localEngines.audio} onChange={e => setLocalEngine('audio', e.target.value)} />
                    <datalist id="local-audio-models">
                      <option value="k2-fsa/OmniVoice" />
                      <option value="snakers4/silero-models" />
                      <option value="F5-TTS" />
                    </datalist>
                  </FieldGroup>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

        <Modal isOpen={model.isAiSettingsOpen} onClose={() => model.setIsAiSettingsOpen(false)} title="⚙️ Настройки OmniVoice">
        <div className="flex flex-col gap-5 pb-2">
          {project.activeGlobalVoiceId && (
            <div className="p-2 -mb-2 bg-primary/10 border border-primary/30 text-primary text-xs rounded-lg text-center">
              Вы редактируете параметры активного глобального голоса
            </div>
          )}
          <FieldGroup label={`Шаги инференса (num_steps): ${model.numSteps}`}>
            <Slider min={8} max={64} step={1} value={model.numSteps} onChange={e => {
              const val = Number(e.target.value)
              model.setNumSteps(val)
              if (project.activeGlobalVoiceId) {
                setGlobalVoices(globalVoices.map(v => v.id === project.activeGlobalVoiceId ? { ...v, settings: { ...v.settings, numSteps: val } } : v))
              }
            }} />
          </FieldGroup>
          <FieldGroup label={`Guidance Scale: ${model.guidanceScale.toFixed(1)}`}>
            <Slider min={0} max={10} step={0.1} value={model.guidanceScale} onChange={e => {
              const val = Number(e.target.value)
              model.setGuidanceScale(val)
              if (project.activeGlobalVoiceId) {
                setGlobalVoices(globalVoices.map(v => v.id === project.activeGlobalVoiceId ? { ...v, settings: { ...v.settings, guidanceScale: val } } : v))
              }
            }} />
          </FieldGroup>
          <FieldGroup label={`Скорость (speed): ${model.speed.toFixed(2)}x`}>
            <Slider min={0.5} max={2.0} step={0.05} value={model.speed} onChange={e => {
              const val = Number(e.target.value)
              model.setSpeed(val)
              if (project.activeGlobalVoiceId) {
                setGlobalVoices(globalVoices.map(v => v.id === project.activeGlobalVoiceId ? { ...v, settings: { ...v.settings, speed: val } } : v))
              }
            }} />
          </FieldGroup>
          <FieldGroup label={`Длительность (duration): ${model.duration === 0 ? 'Авто' : model.duration.toFixed(1) + 'с'}`}>
            <Slider min={0} max={30} step={0.5} value={model.duration} onChange={e => model.setDuration(Number(e.target.value))} />
          </FieldGroup>

          <div className="flex flex-col gap-3 mt-2 border-t border-white/10 pt-4">
            <Switch checked={model.denoise} onChange={model.setDenoise} label="Шумоподавление (Denoise)" />
            <Switch checked={model.preprocessPrompt} onChange={model.setPreprocessPrompt} label="Предобработка промпта (Preprocess)" />
            <Switch checked={model.postprocessOutput} onChange={model.setPostprocessOutput} label="Постобработка (Postprocess)" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
