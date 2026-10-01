import React, { useCallback, useRef, useState } from 'react'
import { Series } from 'remotion'
import type { ProjectSettings, Scene } from '@entities/project'
import { sanitizeFilename } from '@entities/project'
import { remotionSuite, assetResolver } from '@shared/lib'
import { useLastRenderStore } from './useLastRenderStore'

export type RenderScope = 'current' | 'selected' | 'project'
export type RenderStage = 'idle' | 'compiling' | 'rendering' | 'finalizing'

export interface RenderProjectState {
  isRendering: boolean
  stage: RenderStage
  currentSceneIndex: number
  totalScenes: number
  currentSceneTitle: string
  progress: number
  error: string | null
}

const INITIAL_STATE: RenderProjectState = {
  isRendering: false,
  stage: 'idle',
  currentSceneIndex: 0,
  totalScenes: 0,
  currentSceneTitle: '',
  progress: 0,
  error: null,
}

const RESOLUTION_LONG_EDGE: Record<string, number> = {
  '1080p': 1920,
  '1440p': 2560,
  '2160p': 3840,
}

export const getRenderDimensions = (resolution: string, format: string) => {
  const long = RESOLUTION_LONG_EDGE[resolution] ?? 1920
  const short = Math.round((long * 9) / 16)
  return format === '16:9' ? { width: long, height: short } : { width: short, height: long }
}

/**
 * Длительность сцены в секундах. Приоритет у фактических таймингов
 * последнего фрагмента; иначе — грубая оценка по длине текста.
 */
export const sceneDurationSeconds = (scene: Scene): number => {
  const last = scene.fragments[scene.fragments.length - 1]
  if (last && typeof last.endTime === 'number' && last.endTime > 0) return last.endTime
  return scene.fragments.reduce(
    (acc, f) => acc + Math.max((f.text || '').split(/\s+/).filter(Boolean).length / 2.5, 1),
    0
  )
}

/**
 * Оборачивает скомпилированные сцены в одну композицию через <Series>.
 *
 * Series.Sequence не только показывает сегмент в нужном окне, но и сдвигает
 * useCurrentFrame() для ребёнка — без этого сцена №2 стартовала бы с кадра 0
 * всей композиции и её анимации были бы «привязаны» к началу видео.
 */
const makeSeriesComposition = (
  components: React.ComponentType<Record<string, unknown>>[],
  durations: number[]
): React.FC => {
  return function ProjectComposition() {
    return React.createElement(
      Series,
      null,
      ...components.map((C, i) =>
        React.createElement(
          Series.Sequence,
          { key: i, durationInFrames: durations[i] },
          React.createElement(C, {})
        )
      )
    )
  }
}

/** Сцены, которые вообще можно отрендерить: не игнорируются и имеют TSX. */
export const collectRenderableScenes = (project: ProjectSettings): Scene[] =>
  project.scenes.filter((s) => !s.ignoreTsx && Boolean(s.remotionCode?.trim()))

interface UseRenderProjectArgs {
  project: ProjectSettings
  activeScene?: Scene
  showNotification: (msg: string, type?: 'success' | 'error' | 'info', details?: string) => void
}

export const useRenderProject = ({ project, activeScene, showNotification }: UseRenderProjectArgs) => {
  const [state, setState] = useState<RenderProjectState>(INITIAL_STATE)
  const cancelRef = useRef(false)
  const originalTitleRef = useRef<string>('')
  // Зеркало isRendering в ref: guard внутри run() не должен зависеть от state,
  // иначе run пересоздаётся на каждом тике прогресса.
  const busyRef = useRef(false)
  const saveLast = useLastRenderStore((s) => s.save)

  const reset = useCallback(() => {
    cancelRef.current = false
    busyRef.current = false
    setState(INITIAL_STATE)
  }, [])

  const cancel = useCallback(() => {
    if (state.stage === 'rendering' || state.stage === 'finalizing') {
      showNotification('Отмена невозможна во время кодирования MP4 — дождитесь завершения.', 'info')
      return
    }
    cancelRef.current = true
    showNotification('Отмена рендера запрошена.', 'info')
  }, [state.stage, showNotification])

  const run = useCallback(
    async (scope: RenderScope, selectedSceneIds: string[] = []) => {
      if (busyRef.current) return

      let scenesToRender: Scene[]
      if (scope === 'current') {
        if (!activeScene) {
          showNotification('Нет активной сцены для рендера', 'error')
          return
        }
        scenesToRender = [activeScene]
      } else if (scope === 'selected') {
        scenesToRender = project.scenes.filter((s) => selectedSceneIds.includes(s.id))
      } else {
        scenesToRender = project.scenes.slice()
      }

      scenesToRender = scenesToRender.filter((s) => !s.ignoreTsx)

      if (scenesToRender.length === 0) {
        showNotification('Нет сцен для рендера', 'error')
        return
      }

      const missing = scenesToRender.filter((s) => !s.remotionCode?.trim())
      if (missing.length > 0) {
        showNotification(
          'Некоторые сцены не имеют TSX-кода',
          'error',
          missing.map((s) => `• ${s.title}`).join('\n')
        )
        return
      }

      const { width, height } = getRenderDimensions(project.resolution, project.format)
      const fps = Number(project.montage.fps) || 30

      // Сканируем поддержку до компиляции: дешёвая проверка, но избавляет от
      // падения на середине многосекундного кодирования.
      const { canRender, reason } = await remotionSuite.exporter.canExport({ width, height, fps })
      if (!canRender) {
        showNotification('Браузер не может рендерить в этом разрешении', 'error', reason)
        return
      }

      originalTitleRef.current = document.title
      cancelRef.current = false
      busyRef.current = true
      setState({
        isRendering: true,
        stage: 'compiling',
        currentSceneIndex: 0,
        totalScenes: scenesToRender.length,
        currentSceneTitle: scenesToRender[0].title,
        progress: 0,
        error: null,
      })

      try {
        const components: React.ComponentType<Record<string, unknown>>[] = []
        const durations: number[] = []

        for (let i = 0; i < scenesToRender.length; i++) {
          if (cancelRef.current) {
            document.title = originalTitleRef.current
            reset()
            return
          }
          const scene = scenesToRender[i]
          setState((s) => ({
            ...s,
            stage: 'compiling',
            currentSceneIndex: i,
            currentSceneTitle: scene.title,
            progress: (i / scenesToRender.length) * 0.15,
          }))
          document.title = `⏳ Компиляция ${i + 1}/${scenesToRender.length} — Vidora`

          const compiled = await remotionSuite.compiler.compile(scene.remotionCode!, undefined, undefined, {
            assetResolver,
          })
          components.push(compiled.Component)
          durations.push(Math.max(1, Math.ceil(sceneDurationSeconds(scene) * fps)))
        }

        const ProjectComposition = makeSeriesComposition(components, durations)
        const totalFrames = durations.reduce((a, b) => a + b, 0)

        setState((s) => ({ ...s, stage: 'rendering', progress: 0.15 }))
        document.title = '🎬 Рендер 0% — Vidora'

        const result = await remotionSuite.exporter.exportMedia(
          ProjectComposition,
          { durationInFrames: totalFrames, fps, width, height },
          {},
          {
            format: 'mp4',
            quality: 'high',
            onProgress: ({ progress }) => {
              const currentFrame = Math.round(progress * totalFrames)
              // По умолчанию — последний сегмент: если progress уже равен 1,
              // цикл не найдёт совпадения и idx должен оставаться валидным.
              let acc = 0
              let idx = durations.length - 1
              for (let i = 0; i < durations.length; i++) {
                if (currentFrame < acc + durations[i]) {
                  idx = i
                  break
                }
                acc += durations[i]
              }
              const title = scenesToRender[idx]?.title ?? ''
              const overall = 0.15 + progress * 0.8
              setState((s) => ({
                ...s,
                progress: overall,
                currentSceneIndex: idx,
                currentSceneTitle: title,
              }))
              document.title = `🎬 Рендер ${Math.round(overall * 100)}% — ${title}`
            },
          }
        )

        setState((s) => ({ ...s, stage: 'finalizing', progress: 0.97 }))
        document.title = '📦 Финализация — Vidora'

        const suffix =
          scope === 'current'
            ? sanitizeFilename(scenesToRender[0].title)
            : scope === 'selected'
              ? `${scenesToRender.length}scenes`
              : 'full'
        const fileName = `${sanitizeFilename(project.name || 'vidora')}_${suffix}.mp4`

        const scopeLabel =
          scope === 'current'
            ? `Сцена: ${scenesToRender[0].title}`
            : scope === 'selected'
              ? `Выбранные (${scenesToRender.length})`
              : 'Весь проект'

        // Сохраняем blob до скачивания: если пользователь закроет вкладку с
        // недокачанным файлом, результат всё равно останется доступен.
        saveLast(result.blob, fileName, scopeLabel)
        result.download(fileName)

        document.title = originalTitleRef.current
        setState((s) => ({ ...s, stage: 'idle', progress: 1, isRendering: false }))
        showNotification(`Рендер завершен: ${fileName}`, 'success')
        setTimeout(reset, 1500)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('useRenderProject.run:', err)
        document.title = originalTitleRef.current
        // Сбрасываем guard: иначе после любой ошибки повторный рендер
        // молча игнорировался бы навсегда.
        busyRef.current = false
        setState((s) => ({ ...s, isRendering: false, stage: 'idle', error: msg }))
        showNotification('Ошибка рендера', 'error', msg)
      }
    },
    [project, activeScene, showNotification, reset, saveLast]
  )

  return { ...state, run, cancel, reset }
}
