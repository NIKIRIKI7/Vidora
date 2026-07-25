import { useEffect, useRef, useState } from 'react'
import { useNotificationStore } from '@entities/project'
import { saveRenderedVideoToDisk } from '@features/file-system'
import { API } from '../lib/helpers'
import type { RenderPayload } from './types'

export const useRenderWebSocket = (projectDir?: FileSystemDirectoryHandle) => {
  const [isRendering, setIsRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderedVideos, setRenderedVideos] = useState<Record<string, string>>({})
  const [playingTargetId, setPlayingTargetId] = useState<string | null>(null)

  const renderListenersRef = useRef<Map<string, (payload: RenderPayload) => void>>(new Map())
  const projectDirRef = useRef(projectDir)
  const showNotification = useNotificationStore(s => s.showNotification)
  const showNotificationRef = useRef(showNotification)

  useEffect(() => {
    projectDirRef.current = projectDir
  }, [projectDir])

  useEffect(() => {
    showNotificationRef.current = showNotification
  }, [showNotification])

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout>
    let isDisposed = false

    const connect = () => {
      if (isDisposed) return
      const socket = new WebSocket(`${API.replace('http', 'ws')}/ws/events/frontend`)

      socket.onopen = () => {
        console.log('[WS] ✅ Успешное подключение к событиям бэкенда')
      }

      socket.onmessage = e => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'RENDER_PROGRESS' && msg.payload) {
            const taskId = msg.payload.task_id
            const progress = Number(msg.payload.progress) || 0
            setRenderProgress(progress)

            if (taskId && renderListenersRef.current.has(taskId)) {
              renderListenersRef.current.get(taskId)!(msg.payload)
            }

            if (msg.payload.status === 'done' && msg.payload.output_path) {
              console.log(`[WS] 🎉 Рендер ЗАВЕРШЕН для target: ${msg.payload.target_id}, path: ${msg.payload.output_path}`)
              setRenderedVideos(prev => ({ ...prev, [msg.payload.target_id]: msg.payload.output_path }))
              setPlayingTargetId(msg.payload.target_id)

              if (projectDirRef.current) {
                const mediaUrl = `${API}/api/v1/render/media?path=${encodeURIComponent(msg.payload.output_path)}`
                fetch(mediaUrl)
                  .then(res => res.blob())
                  .then(blob => {
                    const videoFile = new File([blob], `${msg.payload.target_id}.mp4`, { type: 'video/mp4' })
                    void saveRenderedVideoToDisk(
                      projectDirRef.current!,
                      videoFile,
                      msg.payload.target,
                      msg.payload.target_id,
                    )
                  })
                  .catch(err => console.warn('Ошибка сохранения видео на диск:', err))
              }
            }

            if (progress >= 100 || msg.payload.status === 'done' || msg.payload.status === 'error') {
              setIsRendering(false)
              showNotificationRef.current(
                msg.payload.status === 'error' ? 'Ошибка рендера' : 'Рендер завершен!',
                msg.payload.status === 'error' ? 'error' : 'success',
              )
            }
          }
        } catch (err) {
          console.error('[WS] Ошибка парсинга сообщения:', err)
        }
      }

      socket.onclose = () => {
        if (!isDisposed) {
          console.warn('[WS] Соединение закрыто, переподключение через 2с...')
          reconnectTimeout = setTimeout(connect, 2000)
        }
      }

      socket.onerror = err => {
        console.error('[WS] Ошибка сокета:', err)
        socket.close()
      }

      ws = socket
    }

    connect()

    return () => {
      isDisposed = true
      clearTimeout(reconnectTimeout)
      if (ws) ws.close()
    }
  }, [])

  return {
    isRendering,
    setIsRendering,
    renderProgress,
    setRenderProgress,
    renderedVideos,
    setRenderedVideos,
    playingTargetId,
    setPlayingTargetId,
    renderListenersRef,
  }
}
