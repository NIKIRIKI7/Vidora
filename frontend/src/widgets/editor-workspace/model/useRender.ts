import { useState } from 'react'
import { API, getProjectPath, getAudioPathForScene, sanitizeFilename, hashCode, generateDefaultSceneTsx } from '@widgets/editor-workspace/lib/helpers'
import { generateRemotionPrompt } from '@widgets/editor-workspace/lib/generateRemotionPrompt'
import { serializeProjectToMarkdown } from '@entities/project'
import type { ProjectSettings, Scene, SceneFragment, ApiKeys } from '@entities/project'
import { useRenderWebSocket } from './useRenderWebSocket'
import type { RenderPayload } from './types'

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

// ponytail: бэкенд при сбое генерации возвращает текст ошибки в tsx_code (комментарий // Ошибка: ...).
// Такой "код" нельзя сохранять/рендерить — иначе Remotion падает с React #130 (пустой компонент).
const isUsableCode = (code?: string | null): boolean => {
  const c = (code || '').trim()
  return c.length > 0 && !c.startsWith('//')
}

// Пути B-Roll: и абсолютные (вне проекта), и относительные (внутри assets/b-roll).
// Бэкенд найдёт файл на диске (проект, Videos, Downloads, ...) и скопирует в public/assets/b-roll.
const collectBRollSources = (fragments: SceneFragment[]): string[] => {
  const sources: string[] = []
  for (const f of fragments) {
    const p = (f.bRollFileName || '').trim()
    if (p) sources.push(p)
  }
  return sources
}

export const useRender = ({ project, onUpdateProject, activeScene, llmEngine, apiKeys, audioLoaded, showNotification, abortControllerRef, currentTaskIdRef }: {
  project: ProjectSettings, onUpdateProject: (p: ProjectSettings) => void, activeScene?: Scene, llmEngine: string, apiKeys: ApiKeys, audioLoaded: string | null, showNotification: (msg: string, type?: 'success'|'error'|'info', details?: string) => void, abortControllerRef: React.MutableRefObject<AbortController | null>, currentTaskIdRef: React.MutableRefObject<string | null>
}) => {
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderType, setRenderType] = useState<'scene' | 'project' | null>(null)
  const [renderedVideos, setRenderedVideos] = useState<Record<string, string>>({})
  const [renderedHashes, setRenderedHashes] = useState<Record<string, string>>({})
  const [playingTargetId, setPlayingTargetId] = useState<string | null>(null)

  const { renderProgress, setRenderProgress, renderListenerRef } = useRenderWebSocket()

  const cancelRender = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    setIsRendering(false)
    setIsGeneratingCode(false)
    setRenderType(null)
    setRenderProgress(0)
    renderListenerRef.current = null
    currentTaskIdRef.current = null
  }

  const runCodeGen = async (targetScene?: Scene | unknown): Promise<string | null> => {
    const sceneToUse = targetScene && typeof targetScene === 'object' && 'id' in targetScene ? (targetScene as Scene) : activeScene
    if (!sceneToUse) return null
    if (sceneToUse.ignoreTsx) { showNotification(`Сцена "${sceneToUse.title}" игнорируется`, 'info'); return null }

    setIsGeneratingCode(true)
    abortControllerRef.current = new AbortController()

    try {
      const res = await fetch(`${API}/api/v1/code/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: sceneToUse.id, prompt: generateRemotionPrompt(project, sceneToUse), project_data: project, project_path: getProjectPath(project), engine: llmEngine, api_keys: apiKeys }),
        signal: abortControllerRef.current.signal,
      })
      const data = await res.json()

      if (data.tsx_code && data.status === 'ok') {
        onUpdateProject({
          ...project,
          scenes: project.scenes.map(s => (s.id === sceneToUse.id ? { ...s, ...pushCodeHistory(sceneToUse, data.tsx_code, project) } : s)),
        })
        if (!abortControllerRef.current?.signal.aborted) showNotification('TSX код сгенерирован', 'success')
        return data.tsx_code
      }
      if (data.tsx_code && data.status !== 'ok' && !abortControllerRef.current?.signal.aborted) {
        const msg = data.tsx_code.replace(/^\/\/\s*/, '').trim()
        if (msg) showNotification(msg, 'error')
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') showNotification('Сбой генерации кода', 'error')
    } finally {
      setIsGeneratingCode(false)
    }
    return null
  }

  const renderSingleScenePromise = (sceneId: string, code: string, audioPath: string, projectPath: string, signal: AbortSignal): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))

      const scene = project.scenes.find(s => s.id === sceneId)
      const brollSources = scene ? collectBRollSources(scene.fragments) : []

      const onAbort = () => {
        renderListenerRef.current = null
        currentTaskIdRef.current = null
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal.addEventListener('abort', onAbort, { once: true })

      fetch(`${API}/api/v1/render/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.name, target: 'scene', target_id: sceneId, project_path: projectPath, tsx_code: code, audio_path: audioPath, broll_sources: brollSources, background_music: project.backgroundMusic, render_quality: project.renderQuality || 'medium' }),
        signal,
      }).then(res => res.json()).then(data => {
        if (signal.aborted) return
        if (!data.task_id) {
          signal.removeEventListener('abort', onAbort)
          return reject(new Error('Нет task_id от сервера'))
        }
        currentTaskIdRef.current = data.task_id

        renderListenerRef.current = (payload: RenderPayload) => {
          const matchesTask = payload.task_id && payload.task_id === data.task_id
          const matchesTarget = payload.target_id && payload.target_id === sceneId
          if (!matchesTask && !matchesTarget) return

          if (payload.status === 'done') {
            signal.removeEventListener('abort', onAbort)
            renderListenerRef.current = null
            currentTaskIdRef.current = null
            resolve(payload.output_path || null)
          } else if (payload.status === 'error') {
            signal.removeEventListener('abort', onAbort)
            renderListenerRef.current = null
            currentTaskIdRef.current = null
            const err = new Error(payload.error || 'Ошибка рендера Remotion')
            if (payload.error_details) (err as Error & { details?: string }).details = payload.error_details
            reject(err)
          }
        }
      }).catch(error => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      })
    })
  }

  const retryRenderWithFix = async (scene: Scene, code: string, audioPath: string, projectPath: string, signal: AbortSignal, retriesLeft: number): Promise<string | null> => {
    let currentCode = code
    for (let attempt = 0; attempt <= retriesLeft; attempt++) {
      if (signal.aborted) return null
      try {
        return await renderSingleScenePromise(scene.id, currentCode, audioPath, projectPath, signal)
      } catch (err: unknown) {
        if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) return null
        if (attempt < retriesLeft && !scene.ignoreTsx) {
          showNotification(`Ошибка рендера. ИИ исправляет... (Попытка ${attempt + 1}/${retriesLeft})`, 'info')
          try {
            setIsGeneratingCode(true)
            const res = await fetch(`${API}/api/v1/code/generate`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                target_id: scene.id, prompt: generateRemotionPrompt(project, scene) + '\n\nПредыдущий код вызвал ошибку:\n' + (err as Error).message + '\n\nИсправь код и верни только полностью исправленный TSX.',
                project_data: project, project_path: projectPath, engine: llmEngine, api_keys: apiKeys,
              }),
              signal,
            })
            const data = await res.json()
            if (data.tsx_code && data.status === 'ok' && isUsableCode(data.tsx_code)) {
              currentCode = data.tsx_code
              onUpdateProject({ ...project, scenes: project.scenes.map(s => s.id === scene.id ? { ...s, ...pushCodeHistory(scene, currentCode, project) } : s) })
            }
          } catch (fixErr) { console.error('Ошибка автоисправления', fixErr) } finally { setIsGeneratingCode(false) }
        } else {
          // Последний рубеж: LLM-код (и его "исправления") не собрался — рендерим детерминированный
          // фоллбэк с B-Roll, чтобы пользователь хотя бы получил видео, а не пустоту.
          if (!scene.ignoreTsx) {
            const fallbackCode = generateDefaultSceneTsx(project, scene)
            if (fallbackCode !== currentCode) {
              showNotification('Код сцены не собрался — рендерю базовый шаблон с B-Roll.', 'info')
              try {
                const fallbackResult = await renderSingleScenePromise(scene.id, fallbackCode, audioPath, projectPath, signal)
                if (fallbackResult) return fallbackResult
              } catch {
                if (signal.aborted) return null
              }
            }
          }
          showNotification(`Ошибка: ${(err as Error).message}. Требуется ручное исправление.`, 'error', (err as Error & { details?: string }).details)
          return null
        }
      }
    }
    return null
  }

  const runRender = async (code?: string, audioPath?: string) => {
    if (!activeScene) return

    setRenderType('scene')
    setIsRendering(true)
    setRenderProgress(0)
    abortControllerRef.current = new AbortController()

    const codeToUse = typeof code === 'string' && isUsableCode(code)
      ? code
      : isUsableCode(activeScene.remotionCode)
      ? activeScene.remotionCode!
      : generateDefaultSceneTsx(project, activeScene)
    const audioToUse = typeof audioPath === 'string' ? audioPath : audioLoaded || getAudioPathForScene(project, activeScene)

    const result = await retryRenderWithFix(activeScene, codeToUse, audioToUse, getProjectPath(project), abortControllerRef.current.signal, 2)

    if (result) {
      const currentHash = hashCode(codeToUse + audioToUse + JSON.stringify(activeScene.fragments))
      
      setRenderedHashes(prevHashes => ({ ...prevHashes, [activeScene.id]: currentHash }))
      setRenderedVideos(prev => {
        const nextRenderedVideos = { ...prev, [activeScene.id]: result }
        
        let allScenesRendered = true
        const renderedSceneVideoPaths: string[] = []
        for (const s of project.scenes) {
          if (nextRenderedVideos[s.id]) {
            renderedSceneVideoPaths.push(nextRenderedVideos[s.id])
          } else {
            allScenesRendered = false
            break
          }
        }
        
        // ponytail: auto concat if all scenes cached + project video exists
        if (allScenesRendered && nextRenderedVideos[`Project_${project.name}`]) {
          showNotification('Обновление общего видео...', 'info')
          const finalProjectVideoPath = `${getProjectPath(project)}/preview/Project_${sanitizeFilename(project.name)}.mp4`
          fetch(`${API}/api/v1/render/concat-video`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_path: getProjectPath(project), video_paths: renderedSceneVideoPaths, output_path: finalProjectVideoPath }),
          }).then(res => res.json()).then(concatData => {
            if (concatData.status === 'ok') {
              setRenderedVideos(v => ({ ...v, [`Project_${project.name}`]: finalProjectVideoPath }))
              showNotification('Рендер сцены и склейка проекта завершены!', 'success')
            }
          }).catch(err => {
            console.error('Auto concat failed', err)
          })
        } else {
          showNotification('Рендер завершен!', 'success')
        }
        
        return nextRenderedVideos
      })
      setPlayingTargetId(activeScene.id)
    }

    setIsRendering(false)
    setRenderType(null)
  }

  const runProjectRender = async () => {
    setRenderType('project')
    setIsRendering(true)
    setRenderProgress(0)
    abortControllerRef.current = new AbortController()
    const projectPath = getProjectPath(project)
    const renderedSceneVideoPaths: string[] = []

    try {
      for (let i = 0; i < project.scenes.length; i++) {
        if (abortControllerRef.current.signal.aborted) break
        const scene = project.scenes[i]

        const codeToRender = isUsableCode(scene.remotionCode)
          ? scene.remotionCode!
          : generateDefaultSceneTsx(project, scene)

        const audioPathToUse = getAudioPathForScene(project, scene)
        let sceneVideoPath: string | null = renderedVideos[scene.id]
        const currentHash = hashCode(codeToRender + audioPathToUse + JSON.stringify(scene.fragments))

        if (sceneVideoPath && renderedHashes[scene.id] === currentHash) {
          showNotification(`Сцена "${scene.title}" взята из кэша ⚡`, 'info')
          renderedSceneVideoPaths.push(sceneVideoPath)
          setRenderProgress(Math.round(((i + 1) / project.scenes.length) * 100))
          continue
        }

        sceneVideoPath = await retryRenderWithFix(scene, codeToRender, audioPathToUse, projectPath, abortControllerRef.current.signal, 2)
        if (sceneVideoPath) {
          renderedSceneVideoPaths.push(sceneVideoPath)
          setRenderedVideos(prev => ({ ...prev, [scene.id]: sceneVideoPath! }))
          setRenderedHashes(prev => ({ ...prev, [scene.id]: currentHash }))
        }

        if (abortControllerRef.current.signal.aborted) { setIsRendering(false); setRenderType(null); return }
        setRenderProgress(Math.round(((i + 1) / project.scenes.length) * 100))
      }

      if (abortControllerRef.current.signal.aborted) return

      const finalProjectVideoPath = `${projectPath}/preview/Project_${sanitizeFilename(project.name)}.mp4`
      const concatRes = await fetch(`${API}/api/v1/render/concat-video`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: projectPath, video_paths: renderedSceneVideoPaths, output_path: finalProjectVideoPath }),
        signal: abortControllerRef.current.signal,
      })
      const concatData = await concatRes.json()

      if (concatData.status === 'ok') {
        setRenderedVideos(prev => ({ ...prev, [`Project_${project.name}`]: finalProjectVideoPath }))
        setPlayingTargetId(`Project_${project.name}`)
        showNotification('Проект успешно отрендерен!', 'success')
        onUpdateProject({ ...project, scenes: [...project.scenes] })
      } else { showNotification('Ошибка склейки проекта', 'error') }

    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') showNotification('Сбой сборки', 'error')
    } finally {
      setIsRendering(false)
      setRenderType(null)
    }
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
      const res = await fetch(`${API}/api/v1/render/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: getProjectPath(project), markdown: markdownContent }),
      })
      if (!res.ok) throw new Error('Export error')
      const blob = await res.blob()

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

  return { isGeneratingCode, isRendering, renderType, renderedVideos, renderedHashes, playingTargetId, setPlayingTargetId, renderProgress, runCodeGen, runRender, runProjectRender, handleExportProject, cancelRender }
}
