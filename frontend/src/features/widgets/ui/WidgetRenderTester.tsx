import { useState, useEffect } from 'react'
import { Play, Loader2, Video, CheckCircle2, AlertCircle, RefreshCw, Download, Sparkles, X } from 'lucide-react'

type RenderQuality = 'low' | 'medium' | 'high'

interface WidgetRenderTesterProps {
  widgetId: string
  widgetName?: string
  currentProps?: Record<string, unknown>
  defaultQuality?: RenderQuality
}

const QUALITY_PRESETS: Record<RenderQuality, { label: string; desc: string; badge: string }> = {
  low: {
    label: 'Low',
    desc: '540p • Черновик (2–4 сек)',
    badge: 'Быстрый',
  },
  medium: {
    label: 'Medium',
    desc: '1080p • Стандарт (Veryfast)',
    badge: 'Оптимально',
  },
  high: {
    label: 'High',
    desc: '1080p • Финал (CRF 14 Slow)',
    badge: 'Качество',
  },
}

const clientId = `client_${Math.random().toString(36).substring(2, 9)}`

export const WidgetRenderTester: React.FC<WidgetRenderTesterProps> = ({
  widgetId,
  currentProps = {},
  defaultQuality = 'medium',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [quality, setQuality] = useState<RenderQuality>(defaultQuality)
  const [isRendering, setIsRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const wsUrl = `ws://127.0.0.1:8355/ws/events/${clientId}`
    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'RENDER_PROGRESS') {
          const payload = data.payload
          setProgress(payload.progress || 0)

          if (payload.status === 'done' && payload.output_path) {
            setIsRendering(false)
            const mediaUrl = `http://127.0.0.1:8355/api/v1/render/media?path=${encodeURIComponent(payload.output_path)}`
            setVideoUrl(mediaUrl)
          } else if (payload.status === 'error') {
            setIsRendering(false)
            setError(payload.error || 'Сбой рендера Remotion')
          }
        }
      } catch (err) {
        console.error('WS Error:', err)
      }
    }

    return () => {
      ws.close()
    }
  }, [isOpen])

  const startTestRender = async () => {
    setIsRendering(true)
    setProgress(0)
    setError(null)
    setVideoUrl(null)

    const isVertical = widgetId.includes('9x16') || widgetId.includes('Vertical')
    const duration = Number(currentProps.durationFrames) || 300

    const formatPropValue = (val: unknown): string => {
      if (typeof val === 'string') return `"${val.replace(/"/g, '\\"')}"`
      if (typeof val === 'number' || typeof val === 'boolean') return `{${val}}`
      return `{${JSON.stringify(val)}}`
    }

    const formattedProps = Object.entries(currentProps)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(([_, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${formatPropValue(v)}`)
      .join(' ')

    const tsxCode = `import React from 'react';
import { ${widgetId} } from '../widgets';

export const CurrentScene: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#08020f] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute w-[${isVertical ? '600px' : '800px'}] h-[${isVertical ? '600px' : '500px'}] rounded-full bg-purple-700/25 blur-[120px] pointer-events-none" />
      <${widgetId} ${formattedProps} />
    </div>
  );
};

(CurrentScene as any).durationInFrames = ${duration};
(CurrentScene as any).isVertical = ${isVertical};
`

    const payload = {
      project_id: 'widget_preview',
      project_path: 'projects/widget_preview',
      target: 'preview',
      target_id: widgetId,
      render_quality: quality,
      tsx_code: tsxCode,
    }

    try {
      const response = await fetch('http://127.0.0.1:8355/api/v1/render/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.detail || 'Не удалось запустить рендер')
      }
    } catch (err: unknown) {
      setIsRendering(false)
      setError(err instanceof Error ? err.message : 'Ошибка соединения с сервером')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true)
          setVideoUrl(null)
          setError(null)
        }}
        className="group relative w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-full bg-gradient-to-r from-purple-950/60 via-purple-900/40 to-indigo-950/60 hover:from-purple-900/80 hover:via-purple-800/60 hover:to-indigo-900/80 border border-purple-500/30 hover:border-purple-400/60 text-purple-200 hover:text-white font-medium text-sm tracking-wide shadow-lg shadow-purple-950/50 backdrop-blur-md transition-all duration-200 active:scale-[0.99]"
      >
        <Play className="w-4 h-4 text-purple-400 group-hover:text-purple-300 transition-colors fill-purple-400/30 group-hover:fill-purple-300" />
        <span>Тест рендера видео</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-[#0e081c]/95 border border-purple-500/30 rounded-3xl shadow-2xl p-6 flex flex-col gap-5 text-white backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-950/80 border border-purple-500/30 text-purple-400 shadow-inner">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Тест рендера Remotion</h3>
                  <p className="text-xs text-purple-300/70 font-mono">{widgetId}</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-purple-300/80">
                Качество видео:
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(Object.keys(QUALITY_PRESETS) as RenderQuality[]).map((qKey) => {
                  const item = QUALITY_PRESETS[qKey]
                  const isSelected = quality === qKey
                  return (
                    <button
                      key={qKey}
                      type="button"
                      disabled={isRendering}
                      onClick={() => setQuality(qKey)}
                      className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? 'bg-purple-900/40 border-purple-400/80 shadow-md shadow-purple-900/30 text-white'
                          : 'bg-[#150b28]/60 border-purple-500/20 hover:border-purple-500/40 text-purple-200/70 hover:text-purple-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">{item.label}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                          isSelected ? 'bg-purple-500 text-white' : 'bg-purple-950 text-purple-400'
                        }`}>
                          {item.badge}
                        </span>
                      </div>
                      <span className="text-[10px] text-purple-300/50 leading-tight">{item.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {isRendering && (
              <div className="flex flex-col gap-2 p-4 rounded-2xl bg-purple-950/40 border border-purple-500/20">
                <div className="flex items-center justify-between text-xs font-medium text-purple-200">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    <span>Рендеринг сцены через Remotion...</span>
                  </div>
                  <span className="font-mono">{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/30 text-red-200 text-xs">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="line-clamp-2 leading-relaxed">{error}</p>
              </div>
            )}

            {videoUrl && !isRendering && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Видео успешно создано</span>
                  </div>
                  <a
                    href={videoUrl}
                    download={`${widgetId}_test.mp4`}
                    className="flex items-center gap-1 text-xs text-purple-300 hover:text-white transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Скачать MP4</span>
                  </a>
                </div>

                <div className="relative w-full h-[240px] bg-black/80 rounded-2xl overflow-hidden border border-purple-500/30 flex items-center justify-center shadow-inner">
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-purple-500/10">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={startTestRender}
                disabled={isRendering}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs rounded-full transition-all shadow-md shadow-purple-950/60 active:scale-[0.98]"
              >
                {isRendering ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Сборка ({progress}%)...</span>
                  </>
                ) : videoUrl ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Рендерить повторно</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Начать рендер</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
