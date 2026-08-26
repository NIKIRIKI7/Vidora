import { useState, useRef, useCallback } from 'react'
import type { ProjectSettings, Scene, SceneFragment, VideoFormat } from '@entities/project'
import { useNotificationStore, useProjectStore, useSettingsStore, parseMarkdownFull, serializeProjectToMarkdown } from '@entities/project'
import { generateRemotionPrompt } from '../lib/generateRemotionPrompt'
import { useHotkeys } from '@shared/lib/useHotkeys'
import { hashCode } from '../lib/helpers'
import { normalizeText, recalculateTimingsProportionally } from '../lib/timingAlgorithms'
import type { CenterViewMode } from './types'
import { useAudio, type AudioOptions } from './useAudio'
import { useRender, pushCodeHistory } from './useRender'
import { useSceneManagement } from './useSceneManagement'
import { useTimelineOperations } from './useTimelineOperations'
import { useVoiceManagement } from './useVoiceManagement'
import { useAutoPipeline } from './useAutoPipeline'

interface Props {
  project: ProjectSettings
  onUpdateProject: (project: ProjectSettings) => void
}

export const useEditorWorkspace = ({ project, onUpdateProject }: Props) => {
  const [activeSceneId, setActiveSceneId] = useState(project.scenes[0]?.id)
  const [centerView, setCenterView] = useState<CenterViewMode>('player')
  const [previewFormat, setPreviewFormat] = useState<VideoFormat | null>(null)
  const [voiceModel, setVoiceModel] = useState('aria')
  const [speed, setSpeed] = useState(1)
  const [numSteps, setNumSteps] = useState(64)
  const [guidanceScale, setGuidanceScale] = useState(3.0)
  const [duration, setDuration] = useState(0.0)
  const [denoise, setDenoise] = useState(true)
  const [preprocessPrompt, setPreprocessPrompt] = useState(true)
  const [postprocessOutput, setPostprocessOutput] = useState(true)
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false)
  const [playWithAudio, setPlayWithAudio] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [useWhisper, setUseWhisper] = useState(true)
  const [autoOffloadVram, setAutoOffloadVram] = useState(true)

  // B-Roll Modal state
  const [isBRollModalOpen, setIsBRollModalOpen] = useState(false)
  const [bRollScope, setBRollScope] = useState<'fragment' | 'scene' | 'project'>('fragment')
  const [bRollTargetFragId, setBRollTargetFragId] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)

  const showNotification = useNotificationStore(s => s.showNotification)
  const undo = useProjectStore(s => s.undo)
  const redo = useProjectStore(s => s.redo)
  const taskModes = useSettingsStore(s => s.taskModes)
  const cloudProvider = useSettingsStore(s => s.cloudProvider)
  const cloudEngines = useSettingsStore(s => s.cloudEngines)
  const localEngines = useSettingsStore(s => s.localEngines)
  const apiKeys = useSettingsStore(s => s.apiKeys)

  const activeApiKeys = {
    ...apiKeys,
    routerai: cloudProvider === 'routerai' ? apiKeys.routerai : undefined,
    aitunnel: cloudProvider === 'aitunnel' ? apiKeys.aitunnel : undefined,
  }

  const ttsEngine = taskModes.audio === 'cloud' ? cloudEngines.audio : localEngines.audio
  const llmEngine = taskModes.visual === 'cloud' ? cloudEngines.visual : localEngines.visual
  const brollEngine = taskModes.broll === 'cloud' ? cloudEngines.broll : localEngines.broll

  const activeScene = project.scenes.find(s => s.id === activeSceneId)

  // Активный глобальный голос сменился — применяем его настройки к слайдерам.
  // Guarded render-phase reset (React-рекомендованный паттерн "adjust state on prop change").
  // Нельзя выносить в useEffect: react-hooks/set-state-in-effect запрещает синхронный setState в эффекте.
  const [appliedVoiceId, setAppliedVoiceId] = useState(project.activeGlobalVoiceId)
  if (project.activeGlobalVoiceId !== appliedVoiceId) {
    setAppliedVoiceId(project.activeGlobalVoiceId)
    const gv = project.activeGlobalVoiceId
      ? useSettingsStore.getState().globalVoices.find(v => v.id === project.activeGlobalVoiceId)
      : undefined
    if (gv) {
      setSpeed(gv.settings.speed)
      setNumSteps(gv.settings.numSteps)
      setGuidanceScale(gv.settings.guidanceScale)
    }
  }

  const handleUpdateProjectSync = useCallback(
    (newProject: ProjectSettings, skipMdSync = false) => {
      if (
        !skipMdSync &&
        (newProject.scenes !== project.scenes ||
          newProject.metadata !== project.metadata ||
          newProject.montage !== project.montage)
      ) {
        newProject.rawMarkdown = serializeProjectToMarkdown(newProject)
      }
      onUpdateProject(newProject)
    },
    [project, onUpdateProject]
  )

  const voiceOpts: AudioOptions = {
    voiceModel,
    speed,
    numSteps,
    guidanceScale,
    duration,
    denoise,
    preprocessPrompt,
    postprocessOutput,
    autoOffloadVram,
    ttsEngine,
    apiKeys: activeApiKeys,
    customVoices: project.customVoices,
  }

  const audio = useAudio({
    project,
    onUpdateProject: handleUpdateProjectSync,
    activeScene,
    activeSceneId,
    voiceOpts,
    useWhisper,
    autoOffloadVram,
    showNotification,
    abortControllerRef,
  })

  const render = useRender({
    project,
    onUpdateProject: handleUpdateProjectSync,
    activeScene,
    llmEngine,
    apiKeys: activeApiKeys,
    audioLoaded: audio.audioLoaded,
    showNotification,
    abortControllerRef,
    currentTaskIdRef,
  })

  const scenesManager = useSceneManagement({
    project,
    activeSceneId,
    setActiveSceneId,
    onUpdateProjectSync: handleUpdateProjectSync,
    showNotification,
    runSyncAllScenes: audio.runSyncAllScenes,
    handleProcessAudio: audio.handleProcessAudio,
  })

  const timelineOps = useTimelineOperations({
    project,
    activeScene,
    onUpdateProjectSync: handleUpdateProjectSync,
    showNotification,
  })

  const voiceManager = useVoiceManagement({
    project,
    onUpdateProjectSync: handleUpdateProjectSync,
    showNotification,
    setVoiceModel,
    voiceModel,
  })

  const autoPipeline = useAutoPipeline({
    project,
    activeScene,
    activeSceneId,
    brollEngine,
    activeApiKeys,
    onUpdateProjectSync: handleUpdateProjectSync,
    showNotification,
    videoRef,
    abortControllerRef,
    currentTaskIdRef,
    runVoiceGenAllScenes: audio.runVoiceGenAllScenes,
    runSyncAllScenes: audio.runSyncAllScenes,
    runCodeGen: render.runCodeGen,
    runProjectRender: render.runProjectRender,
  })

  const handleOpenBRollModal = (scope: 'fragment' | 'scene' | 'project', fragId?: string) => {
    setBRollScope(scope)
    setBRollTargetFragId(fragId || null)
    setIsBRollModalOpen(true)
  }

  const handleSelectScene = (id: string) => {
    setActiveSceneId(id)
    render.setPlayingTargetId(id)
    timelineOps.setSelectedFragmentId(null)
  }

  const handleUpdateMarkdown = (newMd: string) => {
    const parsed = parseMarkdownFull(newMd)
    const mergedScenes: Scene[] = (parsed.scenes || []).map((newScene, sIdx) => {
      const oldScene: Scene | undefined = project.scenes[sIdx]
      const oldTotalText = oldScene?.fragments?.map(f => normalizeText(f.text || '')).join('') || ''
      const newTotalText = newScene.fragments.map(f => normalizeText(f.text)).join('')
      let mergedFragments: SceneFragment[] = newScene.fragments.map((newFrag, fIdx) => {
        const oldFrag: SceneFragment | undefined = oldScene?.fragments?.[fIdx]
        return {
          ...newFrag,
          id: oldFrag?.id || newFrag.id,
          audioFileName: oldFrag?.audioFileName,
          bRollFileName: newFrag.bRollFileName || oldFrag?.bRollFileName,
          startTime: oldFrag?.startTime,
          endTime: oldFrag?.endTime,
          lastAudioHash: oldFrag?.lastAudioHash,
        }
      })
      if (oldTotalText === newTotalText && project.audioMode === 'scene' && oldScene?.fragments?.length) {
        const firstStart = oldScene.fragments[0].startTime || 0
        const lastEnd = oldScene.fragments[oldScene.fragments.length - 1].endTime || 0
        if (lastEnd > firstStart) {
          mergedFragments = recalculateTimingsProportionally(mergedFragments, lastEnd - firstStart)
        }
      }
      return {
        ...newScene,
        id: oldScene?.id || newScene.id,
        remotionCode: oldScene?.remotionCode,
        remotionCodeHistory: oldScene?.remotionCodeHistory,
        historyIndex: oldScene?.historyIndex,
        ignoreTsx: oldScene?.ignoreTsx,
        lastCodeHash: oldScene?.lastCodeHash,
        fragments: mergedFragments,
      }
    })
    handleUpdateProjectSync(
      {
        ...project,
        rawMarkdown: newMd,
        metadata: parsed.metadata ?? project.metadata,
        montage: parsed.montage ?? project.montage,
        scenes: mergedScenes.length > 0 ? mergedScenes : project.scenes,
      },
      true
    )
  }

  const handleUpdateCode = (code: string) => {
    if (!activeScene) return
    handleUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s =>
        s.id === activeScene.id ? { ...s, ...pushCodeHistory(activeScene, code, project) } : s
      ),
    })
  }

  const handleCodeHistory = (step: number) => {
    if (!activeScene) return
    const hist = activeScene.remotionCodeHistory || []
    if (hist.length === 0) return
    let idx = activeScene.historyIndex ?? hist.length - 1
    idx = Math.max(0, Math.min(hist.length - 1, idx + step))
    handleUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s =>
        s.id === activeScene.id ? { ...s, remotionCode: hist[idx], historyIndex: idx } : s
      ),
    })
  }

  useHotkeys('Space', false, () => setPlayWithAudio(p => !p))
  useHotkeys('Enter', true, () => render.runRender())
  useHotkeys('KeyS', true, () => render.handleExportProject())
  useHotkeys('KeyZ', true, () => undo())
  useHotkeys('KeyY', true, () => redo())
  useHotkeys('ArrowUp', true, () => {
    const idx = project.scenes.findIndex(s => s.id === activeSceneId)
    if (idx > 0) handleSelectScene(project.scenes[idx - 1].id)
  })
  useHotkeys('ArrowDown', true, () => {
    const idx = project.scenes.findIndex(s => s.id === activeSceneId)
    if (idx !== -1 && idx < project.scenes.length - 1) handleSelectScene(project.scenes[idx + 1].id)
  })
  useHotkeys('KeyJ', true, () => {
    if (!activeScene) return
    const dirtyFrag = activeScene.fragments.find(
      f => !f.audioFileName || (f.lastAudioHash && f.lastAudioHash !== hashCode(f.text))
    )
    if (dirtyFrag) {
      void audio.runVoiceGenFragment(activeScene.id, dirtyFrag.id)
      return
    }
    if (!activeScene.ignoreTsx) {
      const cd =
        !activeScene.remotionCode ||
        (activeScene.lastCodeHash &&
          activeScene.lastCodeHash !== hashCode(generateRemotionPrompt(project, activeScene)))
      if (cd) {
        void render.runCodeGen(activeScene)
        return
      }
    }
    showNotification('Сцена актуальна, генерация не требуется', 'info')
  })

  return {
    ...audio,
    ...render,
    ...scenesManager,
    ...timelineOps,
    ...voiceManager,
    ...autoPipeline,
    activeSceneId,
    activeScene,
    centerView,
    previewFormat,
    voiceModel,
    speed,
    numSteps,
    guidanceScale,
    duration,
    denoise,
    preprocessPrompt,
    postprocessOutput,
    isAiSettingsOpen,
    playWithAudio,
    isSettingsOpen,
    useWhisper,
    autoOffloadVram,
    videoRef,
    audioRef,
    ttsEngine,
    llmEngine,
    brollEngine,
    apiKeys: activeApiKeys,
    isBRollModalOpen,
    bRollScope,
    bRollTargetFragId,
    setIsBRollModalOpen,
    handleOpenBRollModal,
    setActiveSceneId: handleSelectScene,
    setCenterView,
    setPreviewFormat,
    setVoiceModel,
    setSpeed,
    setNumSteps,
    setGuidanceScale,
    setDuration,
    setDenoise,
    setPreprocessPrompt,
    setPostprocessOutput,
    setIsAiSettingsOpen,
    setPlayWithAudio,
    setIsSettingsOpen,
    setUseWhisper,
    setAutoOffloadVram,
    handleUpdateMarkdown,
    handleUpdateCode,
    handleCodeHistory,
    showNotification,
    handleSelectFragment: timelineOps.setSelectedFragmentId,
  }
}
