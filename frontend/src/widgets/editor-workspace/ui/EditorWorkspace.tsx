import type { ProjectSettings } from '@entities/project'
import { Button, Modal, FieldGroup, Slider, Switch, Input } from '@shared/ui'
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
        />
        <CenterCanvas
          centerView={model.centerView}
          onChangeView={model.setCenterView}
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
          isRendering={model.isRendering}
          renderType={model.renderType}
          isAutoPipelineRunning={model.isAutoPipelineRunning}
          pipelineStep={model.pipelineStep}
          renderProgress={model.renderProgress}
          onCancelAll={model.handleCancelAll}
          isMerging={model.isMerging}
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
          onResetAllSync={model.handleResetAllSync}
          onResetAudio={model.handleResetAudio}
          onUnloadVram={model.handleUnloadVram}
          onRunSync={() => model.runSyncAllScenes()}
          onToggleIgnoreTsx={model.toggleIgnoreTsx}
          onRunCodeGen={() => model.runCodeGen()}
          onRunProjectRender={model.runProjectRender}
          onMergeAudioAndVideo={model.handleMergeAudioAndVideo}
          onShowNotification={model.showNotification}
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

      <Modal isOpen={model.isSettingsOpen} onClose={() => model.setIsSettingsOpen(false)} title="Настройки проекта">
        <div className="flex flex-col gap-4 pb-2">
          {/* ponytail: inline state updates for metadata, no local buffering needed */}
          <FieldGroup label="Название видео (Title)">
            <Input 
              value={project.metadata?.title || ''} 
              onChange={e => onUpdateProject({ ...project, metadata: { ...project.metadata, title: e.target.value } })} 
            />
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

          <div className="h-px bg-white/10 my-2" />

          <Button
            variant="dashed"
            className="text-error border-error/30 hover:bg-error/10"
            onClick={() => onDeleteProject(project.name)}
          >
            Удалить проект
          </Button>
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
