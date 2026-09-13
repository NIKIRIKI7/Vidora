import { useState, useCallback, useEffect, useRef } from 'react'
import type { ProjectSettings, Resolution, VideoFormat, BackgroundMusicSettings, MusicTrackItem } from '@entities/project'
import {
  useSettingsStore, useNotificationStore, astToProjectDelta, useScenarioEngineStore,
} from '@entities/project'
import { Button, Modal, Tabs, OptionCard, FieldGroup, Switch, Input, Select, Slider, TextArea } from '@shared/ui'
import { THEME_PRESETS, DEFAULT_BACKGROUND_MUSIC, type ThemePreset } from '@shared/config'
import { createProductionProject } from '@shared/api'
import { useEditorWorkspace } from '@pages/editor/model/useEditorWorkspace'
import { CenterCanvas, LogsViewer } from '@widgets/center-canvas'
import { EditorHeader } from '@widgets/editor-header'
import { PipelineInspector } from '@widgets/pipeline-inspector'
import { SceneSidebar } from '@widgets/scene-sidebar'
import { Timeline } from '@widgets/timeline'
import { VoiceboxModal, CustomAudioModal } from '@features/voice-tagger'
import { MusicSettingsModal, MusicLibraryModal } from '@features/audio-ducking'
import { BRollModal } from '@features/manage-broll'

interface Props {
  project: ProjectSettings
  projects: ProjectSettings[]
  onSwitchProject: (id: string) => void
  onNewProject: () => void
  onBack: () => void
  onUpdateProject: (project: ProjectSettings) => void
  onDeleteProject: (id: string) => void
  onOpenGlobalSettings: () => void
}

export const EditorPage = ({
  project,
  projects,
  onSwitchProject,
  onNewProject,
  onBack,
  onUpdateProject,
  onDeleteProject,
  onOpenGlobalSettings,
}: Props) => {
  const model = useEditorWorkspace({ project, onUpdateProject })

  // --- Scenario Engine (тонкий клиент): Markdown -> AST через backend Gateway ---
  const projectRef = useRef(project)
  const modelRef = useRef(model)
  useEffect(() => { projectRef.current = project })
  useEffect(() => { modelRef.current = model })

  const applyEnginePayload = useCallback(
    (payload: { backendId: string; markdown: string; ast: import('@shared/api').ScenarioAstDocument }) => {
      const current = projectRef.current
      const delta = astToProjectDelta(payload.ast, current.scenes)
      const nextColors = delta.montage?.colors
        ? { ...current.montage.colors, ...delta.montage.colors }
        : current.montage.colors
      onUpdateProject({
        ...current,
        backendProjectId: payload.backendId || current.backendProjectId,
        rawMarkdown: payload.markdown,
        metadata: delta.metadata ? { ...current.metadata, ...delta.metadata } : current.metadata,
        montage: {
          ...current.montage,
          ...(delta.montage?.fps ? { fps: delta.montage.fps } : {}),
          colors: nextColors,
        },
        scenes: delta.scenes.length > 0 ? delta.scenes : current.scenes,
      })
    },
    [onUpdateProject]
  )

  const ensureBackendProject = useCallback(async () => {
    const p = projectRef.current
    if (p.backendProjectId) return p.backendProjectId
    return await createProductionProject(p.metadata?.title || p.name)
  }, [])

  const engineBridge = {
    ensureBackend: ensureBackendProject,
    onApplied: applyEnginePayload,
    // Offline / бэкенд недоступен: оставляем старый локальный путь (сырой текст переживает перезагрузку)
    onFailed: (markdown: string) => modelRef.current?.handleUpdateMarkdown(markdown),
  }
  const engineBridgeRef = useRef(engineBridge)
  useEffect(() => { engineBridgeRef.current = engineBridge })

  // Инициализация движка при открытии/смене проекта (backend-проект создаётся лениво)
  useEffect(() => {
    const p = projectRef.current
    const st = useScenarioEngineStore.getState()
    st.init(p.backendProjectId ?? null, p.rawMarkdown, engineBridgeRef.current)
  }, [project.name])

  // Внешние правки markdown (операции над сценами и т.п.) уезжают в Шлюз
  useEffect(() => {
    const st = useScenarioEngineStore.getState()
    if (!st.isTyping && st.rawMarkdown !== project.rawMarkdown) {
      st.setRawMarkdownFromExternal(project.rawMarkdown)
    }
  }, [project.rawMarkdown])

  const [settingsTab, setSettingsTab] = useState<'project' | 'ui'>('project')
  const showNotification = useNotificationStore(s => s.showNotification)
  const [isMusicSettingsOpen, setIsMusicSettingsOpen] = useState(false)
  const [isMusicLibraryOpen, setIsMusicLibraryOpen] = useState(false)
  const [isLogsOpen, setIsLogsOpen] = useState(false)

  const handleUpdateBackgroundMusic = useCallback((bgMusic: BackgroundMusicSettings) => {
    onUpdateProject({ ...project, backgroundMusic: bgMusic })
  }, [project, onUpdateProject])

  const handleSelectMusicTrack = useCallback((track: MusicTrackItem) => {
    onUpdateProject({
      ...project,
      backgroundMusic: {
        ...(project.backgroundMusic || DEFAULT_BACKGROUND_MUSIC),
        enabled: true,
        trackId: track.id,
        trackName: track.name,
        customTrackPath: track.path,
      },
    })
    setIsMusicLibraryOpen(false)
    showNotification(`Выбран трек: ${track.name}`, 'success')
  }, [project, onUpdateProject, showNotification])

  const { uiPreferences, setUiPreferences } = useSettingsStore()

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
        onBack={onBack}
        onOpenSettings={() => model.setIsSettingsOpen(true)}
        onOpenGlobalSettings={onOpenGlobalSettings}
        onOpenLogs={() => setIsLogsOpen(true)}
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
            onCaptureFrame={model.handleCaptureFrame}
            showTimeline={uiPreferences.showTimeline}
            timeline={
              <Timeline
                fragments={model.activeScene?.fragments || []}
                videoRef={model.videoRef}
                audioRef={model.audioRef}
                onUpdateBounds={model.handleUpdateFragmentBounds}
                onSplitFragment={model.handleSplitFragment}
                onDeleteFragment={model.handleDeleteFragment}
                onDuplicateFragment={model.handleDuplicateFragment}
                onSelectFragment={model.handleSelectFragment}
                selectedFragmentId={model.selectedFragmentId}
                backgroundMusic={project.backgroundMusic}
                onUpdateBackgroundMusic={handleUpdateBackgroundMusic}
                onOpenMusicSettings={() => setIsMusicSettingsOpen(true)}
                onOpenBRollModal={model.handleOpenBRollModal}
              />
            }
          />

          {uiPreferences.showInspector && (
            <div className="relative shrink-0 h-full flex flex-col" style={{ width: rightWidth }}>
              <div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/50 active:bg-primary z-30 transition-colors -translate-x-1/2"
                onMouseDown={startRightDrag}
              />
              <div className="flex-1 min-h-0 overflow-hidden">
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
                onOpenCustomAudioModal={model.handleOpenCustomAudio}
                onOpenBRollModal={model.handleOpenBRollModal}
                onAutoMatchBRoll={model.handleAutoMatchBRoll}
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
                onUpdateProjectSettings={onUpdateProject}
                onOpenMusicSettings={() => setIsMusicSettingsOpen(true)}
                onOpenMusicLibrary={() => setIsMusicLibraryOpen(true)}
              />
              </div>
            </div>
          )}
        </div>
      </main>

      <BRollModal
        isOpen={model.isBRollModalOpen}
        onClose={() => model.setIsBRollModalOpen(false)}
        project={project}
        activeScene={model.activeScene}
        activeFragmentId={model.bRollTargetFragId}
        initialScope={model.bRollScope}
        onApply={model.handleApplyBRollAdvanced}
      />

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

      <CustomAudioModal
        isOpen={model.isCustomAudioModalOpen}
        onClose={() => model.setIsCustomAudioModalOpen(false)}
        project={project}
        activeScene={model.activeScene}
        activeFragmentId={model.customAudioTargetFragId}
        initialScope={model.customAudioScope}
        onUpload={model.handleUploadCustomAudioAdvanced}
      />

      <Modal isOpen={model.isSettingsOpen} onClose={() => model.setIsSettingsOpen(false)} title="Настройки Проекта">
        <Tabs
          fill
          variant="pill"
          value={settingsTab}
          onChange={(id) => setSettingsTab(id as 'project' | 'ui')}
          items={[
            { id: 'project', label: 'Проект' },
            { id: 'ui', label: 'Интерфейс' },
          ]}
          className="mb-5 p-1 bg-surface-container-lowest/50 rounded-lg border border-outline-variant/20"
        />

        <div className="flex flex-col gap-4 pb-2">
          {settingsTab === 'ui' ? (
            <div className="bg-surface-container-lowest/50 p-4 rounded-xl border border-outline-variant/20 flex flex-col gap-4">
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

              <div className="bg-surface-container-lowest/50 p-4 rounded-xl border border-outline-variant/20 flex flex-col gap-3 mb-4">
                <Switch
                  label="Автоподбор B-Roll (Auto B-Roll Matcher)"
                  checked={project.autoBRollEnabled !== false}
                  onChange={val => onUpdateProject({ ...project, autoBRollEnabled: val })}
                />
                <p className="text-xxs text-on-surface-variant leading-relaxed">
                  Если включено, ИИ автоматически найдет и обрежет стоковые видео под тайминги фрагментов при сборке проекта.
                </p>
              </div>

              <div className="bg-surface-container-lowest/50 p-4 rounded-xl border border-outline-variant/20 mb-4">
                <Switch label="Использовать 3D графику (Beta, React Three Fiber)" checked={project.use3D ?? false} onChange={val => onUpdateProject({ ...project, use3D: val })} />
                <p className="text-xxs text-on-surface-variant mt-2 leading-relaxed">
                  Если включено, ИИ сможет генерировать 3D-сцены с помощью @remotion/three. Рендер сложных 3D-объектов может занимать больше времени.
                </p>
              </div>

              <FieldGroup label="Название видео (Title)">
                <Input value={project.metadata?.title || ''} onChange={e => onUpdateProject({ ...project, metadata: { ...project.metadata, title: e.target.value } })} />
              </FieldGroup>
              <FieldGroup label="Описание (Description)">
                <TextArea
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg py-2 px-3 text-sm text-on-surface resize-none focus:outline-none focus:border-primary/50 transition-all"
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
                    <OptionCard
                      key={tpl.name}
                      title={tpl.name.split(' ')[0]}
                      onClick={() => onUpdateProject({ ...project, montage: { ...project.montage, colors: tpl.colors } })}
                      showIcon={false}
                      className="items-center shrink-0 group"
                    >
                      <div className="w-8 h-8 rounded-full border-2 border-transparent group-hover:border-outline-variant/100 flex overflow-hidden">
                        <div className="flex-1" style={{backgroundColor: tpl.colors.primary}} />
                        <div className="flex-1" style={{backgroundColor: tpl.colors.background}} />
                      </div>
                    </OptionCard>
                  ))}
                </div>
              </FieldGroup>

              <FieldGroup label="Ручная настройка палитры">
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {(['primary', 'secondary', 'accent', 'background', 'surface', 'text'] as const).map(colorKey => (
                    <div key={colorKey} className="flex flex-col gap-1">
                      <span className="text-xxs text-on-surface-variant uppercase">{colorKey}</span>
                      <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/40 rounded-lg p-1">
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

              <div className="h-px bg-on-surface/10 my-2" />
              <Button variant="dashed" className="text-error border-error/30 hover:bg-error/10" onClick={() => onDeleteProject(project.name)}>
                Удалить проект
              </Button>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={model.isAiSettingsOpen} onClose={() => model.setIsAiSettingsOpen(false)} title="⚙️ Настройки OmniVoice / MiniMax">
        <div className="flex flex-col gap-5 pb-2">
          <FieldGroup label={`Шаги инференса (num_steps): ${model.numSteps}`}>
            <Slider min={8} max={64} step={1} value={model.numSteps} onChange={e => {
              model.setNumSteps(Number(e.target.value))
            }} />
          </FieldGroup>

          <FieldGroup label={`Guidance Scale: ${model.guidanceScale.toFixed(1)}`}>
            <Slider min={0} max={10} step={0.1} value={model.guidanceScale} onChange={e => {
              model.setGuidanceScale(Number(e.target.value))
            }} />
          </FieldGroup>

          <FieldGroup label={`Скорость (speed): ${model.speed.toFixed(2)}x`}>
            <Slider min={0.5} max={2.0} step={0.05} value={model.speed} onChange={e => {
              model.setSpeed(Number(e.target.value))
            }} />
          </FieldGroup>

          <FieldGroup label={`Длительность (duration): ${model.duration === 0 ? 'Авто' : model.duration.toFixed(1) + 'с'}`}>
            <Slider min={0} max={30} step={0.5} value={model.duration} onChange={e => model.setDuration(Number(e.target.value))} />
          </FieldGroup>

          <div className="flex flex-col gap-3 mt-2 border-t border-outline-variant/40 pt-4">
            <Switch checked={model.denoise} onChange={model.setDenoise} label="Шумоподавление (Denoise)" />
            <Switch checked={model.preprocessPrompt} onChange={model.setPreprocessPrompt} label="Предобработка промпта (Preprocess)" />
            <Switch checked={model.postprocessOutput} onChange={model.setPostprocessOutput} label="Постобработка (Postprocess)" />
          </div>
        </div>
      </Modal>

      <MusicSettingsModal
        isOpen={isMusicSettingsOpen}
        onClose={() => setIsMusicSettingsOpen(false)}
        project={project}
        onUpdateSettings={handleUpdateBackgroundMusic}
        onOpenLibrary={() => { setIsMusicSettingsOpen(false); setIsMusicLibraryOpen(true) }}
      />

      <MusicLibraryModal
        isOpen={isMusicLibraryOpen}
        onClose={() => setIsMusicLibraryOpen(false)}
        project={project}
        activeTrackId={project.backgroundMusic?.trackId}
        onSelectTrack={handleSelectMusicTrack}
      />

      <LogsViewer isOpen={isLogsOpen} onClose={() => setIsLogsOpen(false)} />
    </div>
  )
}
