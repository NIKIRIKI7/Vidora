import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Loader2, Check, X, Monitor, Smartphone, AlertCircle } from 'lucide-react'
import { API } from '@shared/lib'

interface WidgetQuickRenderProps {
  widgetId: string
  widgetName?: string
  currentProps?: Record<string, unknown>
}

const clientId = `client_${Math.random().toString(36).substring(2, 9)}`

export const WidgetQuickRender: React.FC<WidgetQuickRenderProps> = ({
  widgetId,
  widgetName,
  currentProps = {},
}) => {
  const [isRendering, setIsRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearRenderTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const failRender = useCallback((message: string) => {
    clearRenderTimeout()
    setIsRendering(false)
    setError(message)
  }, [clearRenderTimeout])

  const isVertical = widgetId.includes('9x16') || widgetId.includes('Vertical')
  const duration = Number(currentProps.durationFrames) || 300

  useEffect(() => {
    const ws = new WebSocket(`${API.replace('http', 'ws')}/ws/events/${clientId}`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'RENDER_PROGRESS') {
          const payload = data.payload
          setProgress(payload.progress || 0)
          if (payload.status === 'done' && payload.output_path) {
            clearRenderTimeout()
            setVideoUrl(`${API}/api/v1/render/media?path=${encodeURIComponent(payload.output_path)}`)
            setIsRendering(false)
          } else if (payload.status === 'error') {
            failRender(payload.error || 'Сбой рендера Remotion')
          }
        }
      } catch (err) {
        console.error('WS Error:', err)
      }
    }

    return () => {
      clearRenderTimeout()
      ws.close()
    }
  }, [failRender, clearRenderTimeout])

  const buildTsx = (): string => {
    const formatPropValue = (val: unknown): string => {
      if (typeof val === 'string') return `"${val.replace(/"/g, '\\"')}"`
      if (typeof val === 'number' || typeof val === 'boolean') return `{${val}}`
      return `{${JSON.stringify(val)}}`
    }

    const propLines = Object.entries(currentProps)
      .filter(([k, v]) => k !== 'durationFrames' && v !== undefined && v !== '' && v !== null)
      .map(([k, v]) => `  ${k}=${formatPropValue(v)}`)
      .join('\n')

    return `import React from 'react';
import { ${widgetId} } from '../widgets';

export const CurrentScene: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#08020f] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute w-[${isVertical ? '600px' : '800px'}] h-[${isVertical ? '600px' : '500px'}] rounded-full bg-purple-700/25 blur-[120px] pointer-events-none" />
      <${widgetId}
${propLines}
      />
    </div>
  );
};

(CurrentScene as any).durationInFrames = ${duration};
(CurrentScene as any).isVertical = ${isVertical};
`
  }

  const startQuickRender = async () => {
    if (isRendering) return
    setIsRendering(true)
    setProgress(0)
    setError(null)
    setVideoUrl(null)

    const payload = {
      project_id: 'widget_preview',
      project_path: 'projects/widget_preview',
      target: 'preview',
      target_id: widgetId,
      render_quality: 'medium',
      tsx_code: buildTsx(),
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15_000)
      const response = await fetch(`${API}/api/v1/render/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.detail || 'Не удалось запустить рендер')
      }

      // Рендер асинхронный (через WS): ждём завершения максимум 90 сек
      clearRenderTimeout()
      timeoutRef.current = setTimeout(() => {
        failRender('Превышено время ожидания рендера (90 сек). Проверьте логи бэкенда.')
      }, 90_000)
    } catch (err) {
      setIsRendering(false)
      setError(err instanceof Error && err.name === 'AbortError'
        ? 'Таймаут запуска рендера на сервере'
        : (err instanceof Error ? err.message : 'Ошибка соединения с сервером'))
    }
  }

  const handleDownload = async () => {
    if (!videoUrl) return
    try {
      const res = await fetch(videoUrl)
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${widgetId}_${isVertical ? '9x16' : '16x9'}.mp4`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const closePreview = () => {
    setVideoUrl(null)
    setError(null)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={startQuickRender}
        disabled={isRendering}
        className={`relative w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-full font-medium text-sm tracking-wide shadow-xl backdrop-blur-md transition-all duration-200 active:scale-[0.99] overflow-hidden ${
          isRendering
            ? 'bg-slate-900 border border-cyan-500/40 text-cyan-300'
            : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-indigo-950/40 border border-indigo-400/30'
        }`}
      >
        {isRendering ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Рендеринг ({progress}%)...</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            <span>Скачать MP4 (1 клик)</span>
          </>
        )}
        {isRendering && (
          <div
            className="absolute bottom-0 left-0 h-1 bg-cyan-400 transition-all duration-300"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        )}
      </button>

      {error && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-950/50 border border-red-500/25 text-red-200 text-xs">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="leading-relaxed">{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400/70 hover:text-red-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {videoUrl && !isRendering && (
        <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-slate-950/70 border border-cyan-500/25">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-300">
              <Check className="w-3.5 h-3.5" />
              <span>Видео готово — {widgetName || widgetId}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300">
                {isVertical ? <Smartphone className="w-3 h-3 text-pink-400" /> : <Monitor className="w-3 h-3 text-blue-400" />}
                {isVertical ? '9:16' : '16:9'}
              </span>
              <button
                type="button"
                onClick={handleDownload}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-950/50'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                <span>{copied ? 'Скачано!' : 'Скачать файл'}</span>
              </button>
              <button
                type="button"
                onClick={closePreview}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition"
                title="Скрыть превью"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            className={`relative mx-auto w-full overflow-hidden rounded-xl bg-black/80 border border-slate-800 ${
              isVertical ? 'max-w-[240px] aspect-[9/16]' : 'aspect-video'
            }`}
          >
            <video src={videoUrl} controls autoPlay loop className="w-full h-full object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
