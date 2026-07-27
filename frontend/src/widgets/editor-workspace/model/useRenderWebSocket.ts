import { useEffect, useRef, useState } from 'react'
import { API } from '@widgets/editor-workspace/lib/helpers'
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
          if (msg.type === 'RENDER_PROGRESS' && msg.payload) {
            setRenderProgress(Number(msg.payload.progress) || 0)
            if (renderListenerRef.current) {
              renderListenerRef.current(msg.payload)
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
