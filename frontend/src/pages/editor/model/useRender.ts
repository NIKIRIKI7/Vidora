import { fetchClient, apiErrorMessage } from '@shared/api'
import { useState } from 'react'
import { isRequestCanceled } from '@shared/lib/http'
import { getProjectPath, sanitizeFilename, hashCode } from '@entities/project'
import { generateRemotionPrompt } from '@features/editor-utils'
import { serializeProjectToMarkdown } from '@entities/project'
import type { ProjectSettings, Scene, ApiKeys } from '@entities/project'

export const pushCodeHistory = (scene: Scene, code: string, project: ProjectSettings): Partial<Scene> => {
  const hist = scene.remotionCodeHistory || []
  const idx = scene.historyIndex ?? (hist.length - 1)
  const newHist = [...hist.slice(0, idx + 1), code]
  return {
    remotionCode: code,
    remotionCodeHistory: newHist,
    historyIndex: newHist.length - 1,
    lastCodeHash: hashCode(generateRemotionPrompt(project, scene)),
  }
}

export const useRender = ({ project, onUpdateProject, activeScene, llmEngine, apiKeys, showNotification, abortControllerRef }: {
  project: ProjectSettings, onUpdateProject: (p: ProjectSettings) => void, activeScene?: Scene, llmEngine: string, apiKeys: ApiKeys, showNotification: (msg: string, type?: 'success'|'error'|'info', details?: string) => void, abortControllerRef: React.MutableRefObject<AbortController | null>
}) => {
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)

  const runCodeGen = async (targetScene?: Scene | unknown): Promise<string | null> => {
    const sceneToUse = targetScene && typeof targetScene === 'object' && 'id' in targetScene ? (targetScene as Scene) : activeScene
    if (!sceneToUse) return null
    if (sceneToUse.ignoreTsx) { showNotification(`Сцена "${sceneToUse.title}" игнорируется`, 'info'); return null }

    setIsGeneratingCode(true)
    abortControllerRef.current = new AbortController()

    try {
      const { data, error } = await fetchClient.POST('/api/v1/code/generate', { body: { target_id: sceneToUse.id, prompt: generateRemotionPrompt(project, sceneToUse), project_data: project, project_path: getProjectPath(project), engine: llmEngine, api_keys: apiKeys }, signal: abortControllerRef.current.signal })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))

      if (data.tsx_code && data.status === 'ok') {
        const tsxCode = data.tsx_code
        onUpdateProject({
          ...project,
          scenes: project.scenes.map(s => (s.id === sceneToUse.id ? { ...s, ...pushCodeHistory(sceneToUse, tsxCode, project) } : s)),
        })
        if (!abortControllerRef.current?.signal.aborted) showNotification('TSX код сгенерирован', 'success')
        return tsxCode
      }
      if (data.tsx_code && data.status !== 'ok' && !abortControllerRef.current?.signal.aborted) {
        const msg = data.tsx_code.replace(/^\/\/\s*/, '').trim()
        if (msg) showNotification(msg, 'error')
      }
    } catch (error: unknown) {
      if (!isRequestCanceled(error)) showNotification('Сбой генерации кода', 'error')
    } finally {
      setIsGeneratingCode(false)
    }
    return null
  }

  const handleExportProject = async () => {
    const hasDirty = project.scenes.some(s => {
      if (s.ignoreTsx) return false
      const cd = !s.remotionCode || (s.lastCodeHash && s.lastCodeHash !== hashCode(generateRemotionPrompt(project, s)))
      const ad = s.fragments.some(f => !f.audioFileName || (f.lastAudioHash && f.lastAudioHash !== hashCode(f.text)))
      return cd || ad
    })

    if (hasDirty) {
      const proceed = window.confirm('Внимание!\nЧасть сцен устарела.\nЭкспортировать текущее состояние как есть?\nОтмена - прервать экспорт.')
      if (!proceed) return
    }

    showNotification('Подготовка архива...', 'info')
    try {
      const markdownContent = serializeProjectToMarkdown(project)
      const { data, error } = await fetchClient.POST('/api/v1/render/export', { body: { project_name: getProjectPath(project), markdown: markdownContent }, parseAs: 'blob' })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      const blob = data

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sanitizeFilename(project.name)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      showNotification('Проект успешно экспортирован!', 'success')
    } catch {
      showNotification('Ошибка экспорта проекта', 'error')
    }
  }

  return { isGeneratingCode, runCodeGen, handleExportProject }
}
