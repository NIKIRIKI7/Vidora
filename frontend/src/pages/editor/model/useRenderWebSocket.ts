import { useEffect, useRef, useState } from 'react'
import { API } from '@entities/project'
import type { RenderPayload } from './types'

export const useRenderWebSocket = () => {
  const [renderProgress, setRenderProgress] = useState(0)
  const renderListenerRef = useRef<((payload: RenderPayload) => void) | null>(null)
  const clientIdRef = useRef(crypto.randomUUID())

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout>
    let isDisposed = false

    const connect = () => {
      if (isDisposed) return
      ws = new WebSocket(`${API.replace('http', 'ws')}/ws/events/${clientIdRef.current}`)
      
      ws.onopen = () => console.log('[WS] ✅ Успешное подключение к событиям бэкенда')
      
      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data)
          const eventType = msg.event || msg.type
          const payload = msg.data || msg.payload

          if (eventType === 'RENDER_PROGRESS' && payload) {
            const pct = Number(payload.percentage ?? payload.progress) || 0
            setRenderProgress(pct)
            if (renderListenerRef.current) {
              renderListenerRef.current({
                task_id: payload.task_id || payload.taskId,
                progress: pct,
                status: payload.status === 'Processing' ? 'rendering' : (payload.status?.toLowerCase() || 'rendering'),
                target_id: payload.task_id || payload.scene_id
              })
            }
          }
        } catch (err) {
          console.error('[WS] Ошибка парсинга:', err)
        }
      }
      
      ws.onclose = () => {
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connect, 2000)
        }
      }
      
      ws.onerror = (err) => {
        console.error('[WS] Ошибка сокета:', err)
      }
    }

    connect()

    return () => {
      isDisposed = true
      clearTimeout(reconnectTimeout)
      if (ws) {
        ws.onerror = null
        ws.onclose = null
        ws.close()
      }
    }
  }, [])

  return { renderProgress, setRenderProgress, renderListenerRef }
}
