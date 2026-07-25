import type { ProjectSettings } from '@entities/project'
import { Button, Modal } from '@shared/ui'
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
        <div className="flex flex-col gap-4">
          <Button
            variant="dashed"
            className="text-error border-error/30 hover:bg-error/10"
            onClick={() => onDeleteProject(project.name)}
          >
            Удалить проект
          </Button>
        </div>
      </Modal>
    </div>
  )
}
