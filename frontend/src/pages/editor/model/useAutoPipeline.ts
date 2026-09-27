import { fetchClient, apiErrorMessage } from '@shared/api'
import { useState, type RefObject } from 'react'
import type { ProjectSettings, Scene, SceneFragment, ApiKeys } from '@entities/project'
import { getProjectPath } from '@entities/project'
import { serializeSceneToMarkdown, getActivePrompt, useSettingsStore } from '@entities/project'

interface UseAutoPipelineProps {
  project: ProjectSettings
  activeScene?: Scene
  activeSceneId?: string
  brollEngine: string
  activeApiKeys: ApiKeys
  onUpdateProjectSync: (project: ProjectSettings) => void
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
  abortControllerRef: RefObject<AbortController | null>
  currentTaskIdRef: RefObject<string | null>
  runVoiceGenAllScenes: (scenes?: Scene[]) => Promise<{ scenes: Scene[]; activeAudio: string | null }>
  runSyncAllScenes: (scenes?: Scene[]) => Promise<Scene[]>
  runCodeGen: (targetScene?: Scene) => Promise<string | null>
}

export const useAutoPipeline = ({
  project,
  activeScene,
  activeSceneId,
  brollEngine,
  activeApiKeys,
  onUpdateProjectSync,
  showNotification,
  abortControllerRef,
  runVoiceGenAllScenes,
  runSyncAllScenes,
  runCodeGen,
}: UseAutoPipelineProps) => {
  const [isAutoPipelineRunning, setIsAutoPipelineRunning] = useState(false)
  const [pipelineStep, setPipelineStep] = useState<string>('')

  const handleAutoMatchBRoll = async (
    scope: 'fragment' | 'scene' | 'project',
    targetFragId?: string,
    scenesToProcess?: Scene[]
  ) => {
    if (project.autoBRollEnabled === false) {
      showNotification('Автоподбор B-Roll выключен в настройках проекта', 'info')
      return
    }

    let fragmentsToProcess: SceneFragment[] = []
    if (scope === 'fragment' && activeScene && targetFragId) {
      const f = activeScene.fragments.find(frag => frag.id === targetFragId)
      if (f) fragmentsToProcess = [f]
    } else if (scope === 'scene' && activeScene) {
      fragmentsToProcess = activeScene.fragments
    } else if (scope === 'project') {
      const scenes = scenesToProcess ?? project.scenes
      fragmentsToProcess = scenes.flatMap(s => s.fragments)
    }

    if (fragmentsToProcess.length === 0) return

    showNotification(`Поиск B-Roll (${brollEngine.split('/').pop()})...`, 'info')
    try {
      const payload = {
        project_path: getProjectPath(project),
        format: project.format,
        engine: brollEngine,
        api_keys: activeApiKeys,
        fragments: fragmentsToProcess.map(f => {
          const start = f.startTime ?? 0
          const end = f.endTime ?? (start + Math.max(f.text.split(' ').length / 2.5, 3.0))
          return {
            id: f.id,
            visual_note: f.visualNote,
            text: f.text,
            start_time: start,
            end_time: end,
            duration: Math.max(0.5, end - start),
          }
        }),
      }

      const { data, error } = await fetchClient.POST('/api/v1/media/auto-broll', { body: payload })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status !== 'ok') {
        showNotification((data as typeof data & { detail?: string | null }).detail || 'Ошибка подбора B-Roll', 'error')
        return
      }

      const matchedMap = new Map<string, string>()
      let matchCount = 0
      const results = (data.results ?? []) as { fragment_id: string; matched: boolean; filename: string }[]
      results.forEach(r => {
        if (r.matched && r.filename) {
          matchedMap.set(r.fragment_id, r.filename)
          matchCount++
        }
      })

      if (matchCount === 0) {
        showNotification('Не найдено B-Roll футажей по ремаркам', 'info')
        return
      }

      const updatedScenes = project.scenes.map(s => ({
        ...s,
        fragments: s.fragments.map(f => (matchedMap.has(f.id) ? { ...f, bRollFileName: matchedMap.get(f.id) } : f)),
      }))

      onUpdateProjectSync({ ...project, scenes: updatedScenes })
      showNotification(`Обрезано и привязано ${matchCount} B-Roll футажей!`, 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showNotification(`Ошибка Auto B-Roll: ${msg}`, 'error')
    }
  }

  const handleFullAutoPipeline = async () => {
    if (!activeScene) return
    setIsAutoPipelineRunning(true)
    setPipelineStep('1/5 Озвучка всех сцен...')
    const { scenes: voiceScenes } = await runVoiceGenAllScenes(project.scenes)
    if (abortControllerRef.current?.signal.aborted) return

    setPipelineStep('2/5 Whisper Alignment...')
    const syncedScenes = await runSyncAllScenes(voiceScenes)
    if (abortControllerRef.current?.signal.aborted) return

    if (project.autoBRollEnabled !== false) {
      setPipelineStep('3/5 Автоподбор и нарезка B-Roll...')
      await handleAutoMatchBRoll('project', undefined, syncedScenes)
      if (abortControllerRef.current?.signal.aborted) return
    }

    const currentActiveScene = syncedScenes.find(s => s.id === activeSceneId) || activeScene
    setPipelineStep('4/4 Remotion TSX...')
    await runCodeGen(currentActiveScene)
    if (abortControllerRef.current?.signal.aborted) return

    setIsAutoPipelineRunning(false)
    setPipelineStep('')
  }

  const handleCancelAll = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsAutoPipelineRunning(false)
    setPipelineStep('')
    showNotification('Все процессы отменены', 'info')
  }

  const handleCopyFixPacingPrompt = (sceneId: string, currentPacing: number, threshold: number) => {
    const scene = project.scenes.find(s => s.id === sceneId)
    if (!scene) return
    const md = serializeSceneToMarkdown(scene)
    const template = project.promptOverrides?.fixPacing || getActivePrompt(useSettingsStore.getState().globalPrompts.fixPacing) || ''
    const prompt = template
      .replaceAll('{{CURRENT_PACING}}', currentPacing.toFixed(1))
      .replaceAll('{{THRESHOLD}}', threshold.toString())
      .replaceAll('{{SCENE_MARKDOWN}}', md)
    void navigator.clipboard.writeText(prompt)
    showNotification('Промпт для ИИ скопирован в буфер!', 'success')
  }

  return {
    isAutoPipelineRunning,
    pipelineStep,
    handleFullAutoPipeline,
    handleAutoMatchBRoll,
    handleCancelAll,
    handleCopyFixPacingPrompt,
  }
}
