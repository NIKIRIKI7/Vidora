import { useState } from 'react'
import type { ProjectSettings } from '@entities/project'
import { useSettingsStore } from '@entities/project'
import { Button, Modal, FieldGroup, Slider, Switch, Input, Select, Icon } from '@shared/ui'
import { THEME_PRESETS, type ThemePreset } from '@shared/config'
import { useEditorWorkspace } from '../model/useEditorWorkspace'
import { CenterCanvas } from './CenterCanvas'
import { EditorHeader } from './EditorHeader'
import { PipelineInspector } from './PipelineInspector'
import { SceneSidebar } from './SceneSidebar'
import { VoiceboxModal } from './VoiceboxModal'

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
  
  const [settingsTab, setSettingsTab] = useState<'project' | 'prompts'>('project')
  const { globalPrompts, setGlobalPrompts, resetGlobalPrompts } = useSettingsStore()
  const isLocalPrompts = project.promptOverrides !== undefined

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
          isMerging={model.isMerging}
          onUpdateMarkdown={model.handleUpdateMarkdown}
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
          isMerging={model.isMerging}
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
          onUnloadVram={model.handleUnloadVram}
          onRunSync={() => model.runSyncAllScenes()}
          onToggleIgnoreTsx={model.toggleIgnoreTsx}
          onRunCodeGen={() => model.runCodeGen()}
          onRunProjectRender={model.runProjectRender}
          onMergeAudioAndVideo={model.handleMergeAudioAndVideo}
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
        </div>

        <div className="flex flex-col gap-4 pb-2">
          {settingsTab === 'project' ? (
            <>
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
          ) : (
            <>
              <Switch
                label="Использовать индивидуальные промпты для этого проекта"
                checked={isLocalPrompts}
                onChange={(checked) => onUpdateProject({ ...project, promptOverrides: checked ? { ...globalPrompts } : undefined })}
              />
              
              <div className="text-[10px] text-on-surface-variant bg-surface-container-lowest/50 border border-white/5 p-3 rounded-lg leading-relaxed font-mono">
                <span className="text-primary">Доступные переменные:</span><br/>
                {`{{FORMAT}}, {{WIDTH}}, {{HEIGHT}}, {{DURATION}}, {{DURATION_FRAMES}}, {{FPS}}, {{COLORS}}, {{SCENE_TITLE}}, {{FRAGMENTS}}, {{VISUAL_NOTE}}, {{TEXT}}, {{SCENES_LIST}}`}
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

              {!isLocalPrompts && (
                <Button variant="dashed" onClick={resetGlobalPrompts} className="mt-2 text-on-surface-variant hover:text-white">
                  <Icon name="restore" className="text-[16px] mr-1" /> Сбросить глобальные промпты
                </Button>
              )}
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
