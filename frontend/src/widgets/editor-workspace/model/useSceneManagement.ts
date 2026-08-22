import { useState } from 'react'
import type { ProjectSettings, Scene } from '@entities/project'
import { parseSceneMarkdown, serializeSceneToMarkdown } from '@entities/project'
import { API, getProjectPath, hashCode } from '../lib/helpers'
import { normalizeText, recalculateTimingsProportionally } from '../lib/timingAlgorithms'

interface UseSceneManagementProps {
  project: ProjectSettings
  activeSceneId?: string
  setActiveSceneId: (id: string) => void
  onUpdateProjectSync: (project: ProjectSettings) => void
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
  runSyncAllScenes: (scenes?: Scene[]) => Promise<Scene[]>
  handleProcessAudio: (action: string, scope: 'scene' | 'project', targetSceneId?: string) => Promise<void>
}

export const useSceneManagement = ({
  project,
  activeSceneId,
  setActiveSceneId,
  onUpdateProjectSync,
  showNotification,
  runSyncAllScenes,
  handleProcessAudio,
}: UseSceneManagementProps) => {
  const [draggedSceneIdx, setDraggedSceneIdx] = useState<number | null>(null)

  const handleSceneDragStart = (idx: number) => () => setDraggedSceneIdx(idx)

  const handleSceneDrop = (dropIdx: number) => () => {
    if (draggedSceneIdx === null || draggedSceneIdx === dropIdx) {
      setDraggedSceneIdx(null)
      return
    }
    const scenes = [...project.scenes]
    const [moved] = scenes.splice(draggedSceneIdx, 1)
    scenes.splice(dropIdx, 0, moved)
    onUpdateProjectSync({ ...project, scenes })
    setDraggedSceneIdx(null)
  }

  const toggleIgnoreTsx = (sceneId: string) => {
    const updatedScenes = project.scenes.map(s => (s.id === sceneId ? { ...s, ignoreTsx: !s.ignoreTsx } : s))
    onUpdateProjectSync({ ...project, scenes: updatedScenes })
  }

  const handleAddScene = () => {
    const newScene: Scene = {
      id: crypto.randomUUID(),
      title: `Сцена ${project.scenes.length + 1}`,
      timecode: '00:00:00',
      fragments: [{ id: crypto.randomUUID(), visualNote: 'A-roll: Описание кадра', text: 'Текст новой сцены...' }],
    }
    onUpdateProjectSync({ ...project, scenes: [...project.scenes, newScene] })
    setActiveSceneId(newScene.id)
    showNotification('Новая сцена добавлена', 'success')
  }

  const handleDeleteScene = (sceneId: string) => {
    if (project.scenes.length <= 1) {
      showNotification('Сценарий должен содержать хотя бы одну сцену', 'error')
      return
    }
    const updatedScenes = project.scenes.filter(s => s.id !== sceneId)
    onUpdateProjectSync({ ...project, scenes: updatedScenes })
    if (activeSceneId === sceneId) setActiveSceneId(updatedScenes[0].id)
    showNotification('Сцена удалена', 'info')
  }

  const handleUpdateSceneTitle = (sceneId: string, title: string, timecode: string) => {
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === sceneId ? { ...s, title, timecode } : s)),
    })
  }

  const handleExportScene = (sceneId: string) => {
    const scene = project.scenes.find(s => s.id === sceneId)
    if (!scene) return
    void navigator.clipboard.writeText(serializeSceneToMarkdown(scene))
    showNotification('Сцена скопирована в буфер (Markdown)', 'success')
  }

  const handleReplaceScene = async (sceneId: string) => {
    try {
      const text = await navigator.clipboard.readText()
      const newSceneData = parseSceneMarkdown(text)
      if (!newSceneData) {
        showNotification('Буфер не содержит корректной сцены [Название](00:00)', 'error')
        return
      }
      const newScene: Scene = { ...newSceneData, id: crypto.randomUUID() }
      onUpdateProjectSync({
        ...project,
        scenes: project.scenes.map(s => (s.id === sceneId ? newScene : s)),
      })
      showNotification('Сцена успешно заменена', 'success')
    } catch {
      showNotification('Ошибка чтения буфера обмена', 'error')
    }
  }

  const handleFixAudioPacing = async (sceneId: string) => {
    await handleProcessAudio('silero_vad', 'scene', sceneId)
    const scene = project.scenes.find(s => s.id === sceneId)
    if (scene) {
      showNotification('Синхронизация новых таймингов...', 'info')
      await runSyncAllScenes([scene])
    }
  }

  const handleReplaceSceneAudio = async (sceneId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('project_path', getProjectPath(project))
    fd.append('target_id', sceneId)
    try {
      const res = await fetch(`${API}/api/v1/media/upload-audio`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.status === 'ok') {
        const scene = project.scenes.find(s => s.id === sceneId)
        if (!scene) return
        const remapped = recalculateTimingsProportionally(scene.fragments, data.duration)
        const newFragments = remapped.map(f => ({
          ...f,
          audioFileName: data.path as string,
          lastAudioHash: hashCode(f.text),
          lastAudioTextNormalized: normalizeText(f.text),
        }))
        onUpdateProjectSync({
          ...project,
          scenes: project.scenes.map(s => (s.id === sceneId ? { ...s, fragments: newFragments } : s)),
        })
        showNotification('Аудио заменено. Тайминги пересчитаны!', 'success')
      }
    } catch {
      showNotification('Ошибка загрузки аудио', 'error')
    }
  }

  return {
    handleSceneDragStart,
    handleSceneDrop,
    toggleIgnoreTsx,
    handleAddScene,
    handleDeleteScene,
    handleUpdateSceneTitle,
    handleExportScene,
    handleReplaceScene,
    handleFixAudioPacing,
    handleReplaceSceneAudio,
  }
}
