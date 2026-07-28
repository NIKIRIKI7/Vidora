import { useState, useEffect, useCallback } from 'react'
import type { ProjectSettings, ApiKeys, Resolution, VideoFormat } from '@entities/project'
import { useSettingsStore } from '@entities/project'
import { Button, Modal, FieldGroup, Slider, Switch, Input, Select, Icon } from '@shared/ui'
import { THEME_PRESETS, type ThemePreset } from '@shared/config'
import { useEditorWorkspace } from '@widgets/editor-workspace/model/useEditorWorkspace'
import { CenterCanvas } from './CenterCanvas'
import { EditorHeader } from './EditorHeader'
import { PipelineInspector } from './PipelineInspector'
import { SceneSidebar } from './SceneSidebar'
import { VoiceboxModal } from './VoiceboxModal'
import { API } from '@widgets/editor-workspace/lib/helpers'

// ponytail: flat model DB, no class hierarchy
const AI_MODELS_DB = {
  omnivoice: { name: 'OmniVoice (Локально)', type: 'local', vram: 4, voice_id: 'aria' },
  silero: { name: 'Silero (Локально)', type: 'local', vram: 1, voice_id: 'kseniya' },
  elevenlabs: { name: 'ElevenLabs (Облако)', type: 'cloud', key_provider: 'elevenlabs' as keyof ApiKeys, default_voice: '21m00Tcm4TlvDq8ikWAM' },
  openai: { name: 'OpenAI TTS (Облако)', type: 'cloud', key_provider: 'openai' as keyof ApiKeys, default_voice: 'nova' },
  ollama: { name: 'Ollama qwen2.5-coder (Локально)', type: 'local', vram: 4 },
  claude: { name: 'Claude Sonnet (Облако)', type: 'cloud', key_provider: 'anthropic' as keyof ApiKeys },
} as const

type AiEngineId = keyof typeof AI_MODELS_DB

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
  
  const [settingsTab, setSettingsTab] = useState<'project' | 'prompts' | 'ai-engines' | 'global-voices' | 'audio-processing'>('project')
  const { globalPrompts, setGlobalPrompts, resetGlobalPrompts, ttsEngine, llmEngine, apiKeys, setTtsEngine, setLlmEngine, setApiKey, visualPacingThreshold, audioSilenceThreshold, audioWpmMin, setVisualPacingThreshold, setAudioSilenceThreshold, setAudioWpmMin } = useSettingsStore()
  const isLocalPrompts = project.promptOverrides !== undefined
  const [hardware, setHardware] = useState<{ vram_gb: number; ram_gb: number; device: string; gpu_type: string } | null>(null)
  const [pulling, setPulling] = useState<string | null>(null)

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
        renderProgress={model.renderProgress}
        onSwitchProject={onSwitchProject}
        onNewProject={onNewProject}
        onOpenSettings={() => model.setIsSettingsOpen(true)}
        onFullAutoPipeline={model.handleFullAutoPipeline}
        onProjectRender={model.runProjectRender}
        onSingleSceneRender={() => model.runRender()}
        onExportProject={model.handleExportProject}
      />

      <main className="flex-1 flex overflow-hidden">
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
        />
        <CenterCanvas
          centerView={model.centerView}
          previewFormat={model.previewFormat}
          onChangeView={model.setCenterView}
          onPreviewFormatChange={model.setPreviewFormat}
          playWithAudio={model.playWithAudio}
          onTogglePlayWithAudio={() => model.setPlayWithAudio(!model.playWithAudio)}
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
          onShowNotification={model.showNotification}
          onUpdateFragmentBRoll={model.handleUpdateFragmentBRoll}
          onUnlinkFragmentBRoll={model.handleUnlinkFragmentBRoll}
          onNudgeTiming={model.handleNudgeTiming}
        />
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
        <div className="flex border-b border-white/10 mb-5">
          <button 
            onClick={() => setSettingsTab('project')} 
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${settingsTab === 'project' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-white'}`}
          >
            Проект
          </button>
          <button 
            onClick={() => setSettingsTab('prompts')} 
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${settingsTab === 'prompts' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-white'}`}
          >
            Промпты LLM
          </button>
          <button 
            onClick={() => setSettingsTab('ai-engines')} 
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${settingsTab === 'ai-engines' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-white'}`}
          >
            AI Движки
          </button>
          <button 
            onClick={() => setSettingsTab('global-voices')} 
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${settingsTab === 'global-voices' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-white'}`}
          >
            Голоса
          </button>
          <button 
            onClick={() => setSettingsTab('audio-processing')} 
            className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${settingsTab === 'audio-processing' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-white'}`}
          >
            Аудио
          </button>
        </div>

        <div className="flex flex-col gap-4 pb-2">
          {settingsTab === 'project' ? (
            <>
              <div className="grid grid-cols-3 gap-4 mb-4">
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
              </div>
              <div className="text-[10px] font-mono text-on-surface-variant mt-2 uppercase tracking-wider">Индикаторы удержания (Pacing)</div>
              <div className="grid grid-cols-3 gap-4 mb-4 bg-surface-container-lowest/50 p-3 rounded-xl border border-white/5">
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
            </>
          ) : settingsTab === 'global-voices' ? (
            <>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Список глобальных голосов</span>
                <Button variant="secondary" onClick={() => {
                  const newVoice = {
                    id: crypto.randomUUID(),
                    name: `Глобальный Голос ${(project.globalVoices?.length || 0) + 1}`,
                    ttsEngine: ttsEngine,
                    voiceModel: model.voiceModel,
                    settings: { speed: model.speed, guidanceScale: model.guidanceScale, numSteps: model.numSteps },
                  }
                  onUpdateProject({ ...project, globalVoices: [...(project.globalVoices || []), newVoice], activeGlobalVoiceId: newVoice.id })
                }}>Сохранить текущие настройки</Button>
              </div>
              {(project.globalVoices || []).map(gv => (
                <div key={gv.id} className={`p-3 rounded-xl border ${project.activeGlobalVoiceId === gv.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-surface-container-lowest'} flex justify-between items-center transition-colors`}>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{gv.name}</span>
                    <span className="text-xs text-on-surface-variant">{gv.ttsEngine} • Модель: {gv.voiceModel}</span>
                  </div>
                  <div className="flex gap-2">
                    {project.activeGlobalVoiceId !== gv.id ? (
                      <Button variant="dashed" onClick={() => onUpdateProject({ ...project, activeGlobalVoiceId: gv.id })}>Активировать</Button>
                    ) : (
                      <Button variant="ghost" className="text-primary cursor-default font-semibold"><Icon name="check" className="text-lg mr-1" /> Активен</Button>
                    )}
                    <Button variant="ghost" className="text-error" onClick={() => {
                      const newVoices = project.globalVoices.filter(v => v.id !== gv.id)
                      onUpdateProject({ ...project, globalVoices: newVoices, activeGlobalVoiceId: project.activeGlobalVoiceId === gv.id ? undefined : project.activeGlobalVoiceId })
                    }}><Icon name="delete" className="text-base" /></Button>
                  </div>
                </div>
              ))}
              {(!project.globalVoices || project.globalVoices.length === 0) && (
                <div className="text-center text-on-surface-variant py-8 border border-dashed border-white/10 rounded-xl">Нет сохраненных глобальных голосов.<br/>Настройки применяются для каждой сцены индивидуально.</div>
              )}
              {project.activeGlobalVoiceId && (
                <Button variant="dashed" className="mt-2 text-warning hover:bg-warning/10" onClick={() => onUpdateProject({ ...project, activeGlobalVoiceId: undefined })}>Отключить глобальный голос</Button>
              )}
            </>
          ) : settingsTab === 'audio-processing' ? (
            <>
              <div className="bg-surface-container-lowest/50 p-4 rounded-xl border border-white/5 flex flex-col gap-4">
                <FieldGroup label={`Порог тишины (дБ): ${(project.audioProcessing?.silenceThresholdDb ?? -40).toFixed(1)}`}>
                  <Slider min={-60} max={-10} step={1} value={project.audioProcessing?.silenceThresholdDb ?? -40} onChange={e => onUpdateProject({ ...project, audioProcessing: { ...(project.audioProcessing || { silenceThresholdDb: -40, minSilenceMs: 500, maxSilenceMs: 250, removeEdges: true }), silenceThresholdDb: Number(e.target.value) } })} />
                </FieldGroup>
                <FieldGroup label={`Мин. тишина для детекции (мс): ${project.audioProcessing?.minSilenceMs ?? 500}`}>
                  <Slider min={100} max={2000} step={50} value={project.audioProcessing?.minSilenceMs ?? 500} onChange={e => onUpdateProject({ ...project, audioProcessing: { ...(project.audioProcessing || { silenceThresholdDb: -40, minSilenceMs: 500, maxSilenceMs: 250, removeEdges: true }), minSilenceMs: Number(e.target.value) } })} />
                </FieldGroup>
                <FieldGroup label={`Урезать до (мс) [0 = удалить]: ${project.audioProcessing?.maxSilenceMs ?? 250}`}>
                  <Slider min={0} max={1000} step={50} value={project.audioProcessing?.maxSilenceMs ?? 250} onChange={e => onUpdateProject({ ...project, audioProcessing: { ...(project.audioProcessing || { silenceThresholdDb: -40, minSilenceMs: 500, maxSilenceMs: 250, removeEdges: true }), maxSilenceMs: Number(e.target.value) } })} />
                </FieldGroup>
                <Switch label="Удалять краевую тишину" checked={project.audioProcessing?.removeEdges ?? true} onChange={val => onUpdateProject({ ...project, audioProcessing: { ...(project.audioProcessing || { silenceThresholdDb: -40, minSilenceMs: 500, maxSilenceMs: 250, removeEdges: true }), removeEdges: val } })} />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4 bg-surface-container-lowest rounded-xl p-3">
                <div className={`w-2 h-2 rounded-full ${hardware ? 'bg-success' : 'bg-warning'}`} />
                <div className="text-xs text-on-surface-variant">
                  {hardware
                    ? `${hardware.device} · ${hardware.vram_gb.toFixed(1)} GB VRAM · ${hardware.ram_gb.toFixed(1)} GB RAM · ${hardware.gpu_type}`
                    : 'Проверка оборудования...'}
                </div>
              </div>

              <div className="text-[10px] text-on-surface-variant mb-3 font-mono">TTS — Модели озвучки</div>
              {(['omnivoice', 'silero', 'elevenlabs', 'openai'] as AiEngineId[]).map(id => {
                const info = AI_MODELS_DB[id]
                const isActive = ttsEngine === id
                return (
                  <div key={id} className={`flex items-center gap-3 p-2.5 rounded-xl mb-2 cursor-pointer transition-colors ${isActive ? 'bg-primary/10 border border-primary/30' : 'bg-surface-container-lowest hover:bg-surface-container-low'}`}
                    onClick={() => setTtsEngine(id)}>
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${info.type === 'local'
                      ? (hardware && hardware.vram_gb >= info.vram ? 'bg-success' : 'bg-error')
                      : 'bg-warning'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-on-surface truncate">{info.name}</div>
                      {info.type === 'local' ? (
                        <div className="text-[10px] text-on-surface-variant mt-0.5">
                          {hardware && hardware.vram_gb >= info.vram ? 'Установлено' : `Требуется ${info.vram} GB VRAM`}
                        </div>
                      ) : info.key_provider && apiKeys[info.key_provider as keyof ApiKeys] ? (
                        <div className="text-[10px] text-success mt-0.5">API ключ задан</div>
                      ) : (
                        <div className="text-[10px] text-warning mt-0.5">Требуется API ключ</div>
                      )}
                    </div>
                    <div className="text-[10px] text-on-surface-variant bg-white/5 px-2 py-0.5 rounded shrink-0">{info.type === 'local' ? 'local' : 'cloud'}</div>
                    {info.type === 'local' && !(hardware && hardware.vram_gb >= info.vram) && (
                      <Button variant="dashed" className="text-[10px] py-1 px-2 shrink-0" onClick={(e) => { e.stopPropagation(); void handlePull(id) }} disabled={pulling === id}>
                        {pulling === id ? '...' : 'Pull'}
                      </Button>
                    )}
                    {info.type === 'cloud' && info.key_provider && (
                      <input
                        type="password"
                        value={apiKeys[info.key_provider as keyof ApiKeys] || ''}
                        onChange={e => setApiKey(info.key_provider as keyof ApiKeys, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder={`${info.key_provider as string} API key`}
                        className="w-24 bg-surface border border-white/10 rounded text-[10px] px-1.5 py-1 text-on-surface outline-none shrink-0"
                      />
                    )}
                  </div>
                )
              })}

              <div className="h-px bg-white/10 my-3" />

              <div className="text-[10px] text-on-surface-variant mb-3 font-mono">LLM — Генерация кода</div>
              {(['ollama', 'claude', 'openai'] as AiEngineId[]).map(id => {
                const info = AI_MODELS_DB[id]
                const isActive = llmEngine === id
                return (
                  <div key={id} className={`flex items-center gap-3 p-2.5 rounded-xl mb-2 cursor-pointer transition-colors ${isActive ? 'bg-primary/10 border border-primary/30' : 'bg-surface-container-lowest hover:bg-surface-container-low'}`}
                    onClick={() => setLlmEngine(id)}>
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${info.type === 'local'
                      ? (hardware && hardware.vram_gb >= info.vram ? 'bg-success' : 'bg-error')
                      : 'bg-warning'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-on-surface truncate">{info.name}</div>
                      {info.type === 'local' ? (
                        <div className="text-[10px] text-on-surface-variant mt-0.5">
                          {hardware && hardware.vram_gb >= info.vram ? 'Установлено' : `Требуется ${info.vram} GB VRAM`}
                        </div>
                      ) : info.key_provider && apiKeys[info.key_provider as keyof ApiKeys] ? (
                        <div className="text-[10px] text-success mt-0.5">API ключ задан</div>
                      ) : (
                        <div className="text-[10px] text-warning mt-0.5">Требуется API ключ</div>
                      )}
                    </div>
                    <div className="text-[10px] text-on-surface-variant bg-white/5 px-2 py-0.5 rounded shrink-0">{info.type === 'local' ? 'local' : 'cloud'}</div>
                    {info.type === 'local' && !(hardware && hardware.vram_gb >= info.vram) && (
                      <Button variant="dashed" className="text-[10px] py-1 px-2 shrink-0" onClick={(e) => { e.stopPropagation(); void handlePull(id) }} disabled={pulling === id}>
                        {pulling === id ? '...' : 'Pull'}
                      </Button>
                    )}
                    {info.type === 'cloud' && info.key_provider && (
                      <input
                        type="password"
                        value={apiKeys[info.key_provider as keyof ApiKeys] || ''}
                        onChange={e => setApiKey(info.key_provider as keyof ApiKeys, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder={`${info.key_provider as string} API key`}
                        className="w-24 bg-surface border border-white/10 rounded text-[10px] px-1.5 py-1 text-on-surface outline-none shrink-0"
                      />
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={model.isAiSettingsOpen} onClose={() => model.setIsAiSettingsOpen(false)} title="⚙️ Настройки OmniVoice">
        <div className="flex flex-col gap-5 pb-2">
          <FieldGroup label={`Шаги инференса (num_steps): ${model.numSteps}`}>
            <Slider min={8} max={64} step={1} value={model.numSteps} onChange={e => model.setNumSteps(Number(e.target.value))} />
          </FieldGroup>
          <FieldGroup label={`Guidance Scale: ${model.guidanceScale.toFixed(1)}`}>
            <Slider min={0} max={10} step={0.1} value={model.guidanceScale} onChange={e => model.setGuidanceScale(Number(e.target.value))} />
          </FieldGroup>
          <FieldGroup label={`Скорость (speed): ${model.speed.toFixed(2)}x`}>
            <Slider min={0.5} max={2.0} step={0.05} value={model.speed} onChange={e => model.setSpeed(Number(e.target.value))} />
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
