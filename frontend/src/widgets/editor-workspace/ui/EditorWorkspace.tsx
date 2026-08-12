import { useState, useCallback } from 'react'
import type { ProjectSettings, Resolution, VideoFormat } from '@entities/project'
import { useSettingsStore } from '@entities/project'
import { Button, Modal, FieldGroup, Switch, Input, Select, Slider } from '@shared/ui'
import { THEME_PRESETS, type ThemePreset } from '@shared/config'
import { useEditorWorkspace } from '@widgets/editor-workspace/model/useEditorWorkspace'
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
  onOpenGlobalSettings: () => void
}

export const EditorWorkspace = ({
  project,
  projects,
  onSwitchProject,
  onNewProject,
  onUpdateProject,
  onDeleteProject,
  onOpenGlobalSettings,
}: Props) => {
  const model = useEditorWorkspace({ project, onUpdateProject })
  const [settingsTab, setSettingsTab] = useState<'project' | 'ui'>('project')

  const { uiPreferences, setUiPreferences, setGlobalVoices } = useSettingsStore()

  const [leftWidth, setLeftWidth] = useState(() => Number(localStorage.getItem('vidora:left-panel-width')) || 320)
  const [rightWidth, setRightWidth] = useState(() => Number(localStorage.getItem('vidora:right-panel-width')) || 380)

  const handleLeftDrag = useCallback((e: MouseEvent) => {
    let newWidth = e.clientX
    if (newWidth < 220) newWidth = 220
    if (newWidth > 600) newWidth = 600
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
        onOpenGlobalSettings={onOpenGlobalSettings}
        onFullAutoPipeline={model.handleFullAutoPipeline}
      />

      <main className="flex-1 flex overflow-hidden">
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
                onUpdateActiveGlobalVoice={(id) => onUpdateProject({ ...project, activeGlobalVoiceId: id })}
              />
            </div>
          )}
        </div>
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

      <Modal isOpen={model.isSettingsOpen} onClose={() => model.setIsSettingsOpen(false)} title="Настройки Проекта">
        <div className="flex flex-wrap gap-1 mb-5 p-1 bg-surface-container-lowest/50 rounded-lg border border-white/5">
          <button onClick={() => setSettingsTab('project')} className={`flex-auto text-center py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${settingsTab === 'project' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white hover:bg-white/5'}`}>Проект</button>
          <button onClick={() => setSettingsTab('ui')} className={`flex-auto text-center py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${settingsTab === 'ui' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white hover:bg-white/5'}`}>Интерфейс</button>
        </div>

        <div className="flex flex-col gap-4 pb-2">
          {settingsTab === 'ui' ? (
            <div className="bg-surface-container-lowest/50 p-4 rounded-xl border border-white/5 flex flex-col gap-4">
              <Switch label="Показывать левую панель (Сайдбар сцен)" checked={uiPreferences.showSceneSidebar} onChange={(v) => setUiPreferences({ showSceneSidebar: v })} />
              <Switch label="Показывать нижнюю панель (Таймлайн)" checked={uiPreferences.showTimeline} onChange={(v) => setUiPreferences({ showTimeline: v })} />
              <Switch label="Показывать правую панель (Инспектор)" checked={uiPreferences.showInspector} onChange={(v) => setUiPreferences({ showInspector: v })} />
            </div>
          ) : (
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
                <Switch label="Использовать 3D графику (Beta, React Three Fiber)" checked={project.use3D ?? false} onChange={val => onUpdateProject({ ...project, use3D: val })} />
                <p className="text-[10px] text-on-surface-variant mt-2 leading-relaxed">
                  Если включено, ИИ сможет генерировать 3D-сцены с помощью @remotion/three. Рендер сложных 3D-объектов может занимать больше времени.
                </p>
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
          )}
        </div>
      </Modal>

      <Modal isOpen={model.isAiSettingsOpen} onClose={() => model.setIsAiSettingsOpen(false)} title="⚙️ Настройки OmniVoice / MiniMax">
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
                setGlobalVoices(useSettingsStore.getState().globalVoices.map(v => v.id === project.activeGlobalVoiceId ? { ...v, settings: { ...v.settings, numSteps: val } } : v))
              }
            }} />
          </FieldGroup>

          <FieldGroup label={`Guidance Scale: ${model.guidanceScale.toFixed(1)}`}>
            <Slider min={0} max={10} step={0.1} value={model.guidanceScale} onChange={e => {
              const val = Number(e.target.value)
              model.setGuidanceScale(val)
              if (project.activeGlobalVoiceId) {
                setGlobalVoices(useSettingsStore.getState().globalVoices.map(v => v.id === project.activeGlobalVoiceId ? { ...v, settings: { ...v.settings, guidanceScale: val } } : v))
              }
            }} />
          </FieldGroup>

          <FieldGroup label={`Скорость (speed): ${model.speed.toFixed(2)}x`}>
            <Slider min={0.5} max={2.0} step={0.05} value={model.speed} onChange={e => {
              const val = Number(e.target.value)
              model.setSpeed(val)
              if (project.activeGlobalVoiceId) {
                setGlobalVoices(useSettingsStore.getState().globalVoices.map(v => v.id === project.activeGlobalVoiceId ? { ...v, settings: { ...v.settings, speed: val } } : v))
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
