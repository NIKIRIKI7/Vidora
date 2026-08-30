import React, { useEffect, useRef } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  Smartphone,
  Monitor,
  Shield,
  Layers,
  Sparkles,
  PlusCircle,
} from 'lucide-react'
import { useWidgetManagementStore } from '../model/useWidgetManagementStore'
import { WidgetQuickRender } from './WidgetQuickRender'

function evaluateSpring(frame: number, delay = 0, fps = 30): number {
  const t = Math.max(0, (frame - delay) / fps)
  if (t <= 0) return 0
  const damping = 14
  const frequency = 12
  const progress = 1 - Math.exp(-damping * t * 0.5) * Math.cos(frequency * t)
  return Math.min(1.15, Math.max(0, progress))
}

export const VirtualMotionCanvas: React.FC = () => {
  const {
    selectedWidgetId,
    widgets,
    liveProps,
    previewFrame,
    isPlaying,
    durationFrames,
    viewportFormat,
    showSafeZones,
    backgroundMode,
    setPreviewFrame,
    setIsPlaying,
    setViewportFormat,
    setShowSafeZones,
    setBackgroundMode,
    openCreateModal,
  } = useWidgetManagementStore()

  const animFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      return
    }

    lastTimeRef.current = performance.now()
    const fpsInterval = 1000 / 30
    const loop = (currentTime: number) => {
      const elapsed = currentTime - lastTimeRef.current
      if (elapsed > fpsInterval) {
        lastTimeRef.current = currentTime - (elapsed % fpsInterval)
        setPreviewFrame((previewFrame + 1) % durationFrames)
      }
      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying, previewFrame, durationFrames, setPreviewFrame])

  const widget = widgets.find((w) => w.id === selectedWidgetId)
  const delay = Number(liveProps.delayFrames || 0)
  const scaleMult = Number(liveProps.scale || 1.0)
  const spr = evaluateSpring(previewFrame, delay)
  const opacity = Math.min(1, Math.max(0, (previewFrame - delay) / 8))
  const scale = (0.8 + spr * 0.2) * scaleMult
  const translateY = (1 - spr) * 40

  const renderWidgetContent = () => {
    if (!widget) {
      return (
        <div className="text-center p-8 space-y-4 max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Sparkles size={24} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white">Библиотека компонентов пуста</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Создайте свой первый компонент или импортируйте готовый JSON-пакет.
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-500/20 inline-flex items-center gap-1.5 transition-all"
          >
            <PlusCircle size={14} /> <span>Создать компонент</span>
          </button>
        </div>
      )
    }

    return (
      <div className="w-full max-w-xl flex flex-col gap-3">
        {/* Живое превью виджета через реальный бэкенд-рендер Remotion */}
        <WidgetQuickRender
          widgetId={widget.id}
          widgetName={widget.name}
          currentProps={liveProps}
        />
        <div className="bg-slate-900/70 border border-slate-800/70 px-4 py-3 rounded-2xl text-left font-mono text-[11px] space-y-1 text-slate-300">
          {Object.entries(liveProps).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <span className="text-slate-500 shrink-0">{k}:</span>
              <span className="text-sky-300 truncate">{JSON.stringify(v)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 border-r border-slate-800/80 overflow-hidden">
      {/* Верхний тулбар */}
      <div className="h-14 border-b border-slate-800/80 px-6 flex items-center justify-between bg-slate-900/40">
        <div className="flex items-center gap-3">
          <div className="bg-slate-800/80 p-1 rounded-xl flex items-center gap-1 border border-white/5">
            <button
              onClick={() => setViewportFormat('16:9')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewportFormat === '16:9' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor size={14} /> 16:9 YouTube
            </button>
            <button
              onClick={() => setViewportFormat('9:16')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewportFormat === '9:16' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone size={14} /> 9:16 Shorts
            </button>
          </div>

          <button
            onClick={() => setShowSafeZones(!showSafeZones)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              showSafeZones ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'bg-slate-800/40 text-slate-400 border-slate-700/50'
            }`}
          >
            <Shield size={14} /> Safe Zones
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Layers size={14} />
          <span>Фон:</span>
          {(['dark_grid', 'slate', 'neon'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setBackgroundMode(mode)}
              className={`px-2.5 py-1 rounded-md capitalize text-[11px] font-medium transition-all ${
                backgroundMode === mode ? 'bg-slate-700 text-white' : 'hover:bg-slate-800 text-slate-400'
              }`}
            >
              {mode.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Холст */}
      <div className="flex-1 p-6 flex items-center justify-center overflow-hidden relative">
        <div
          className={`relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center p-8 transition-all ${
            viewportFormat === '16:9' ? 'w-full max-w-4xl aspect-video' : 'h-full max-h-[580px] aspect-[9/16]'
          } ${
            backgroundMode === 'dark_grid'
              ? 'bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] bg-slate-950'
              : backgroundMode === 'neon'
              ? 'bg-gradient-to-br from-slate-950 via-indigo-950/40 to-slate-950'
              : 'bg-slate-900'
          }`}
        >
          {showSafeZones && viewportFormat === '9:16' && (
            <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-rose-500/40 z-20 flex flex-col justify-between p-4">
              <div className="bg-rose-500/10 text-rose-300 text-[10px] font-mono px-2 py-0.5 rounded self-start">
                Top UI Area
              </div>
              <div className="flex justify-between items-end">
                <div className="bg-rose-500/10 text-rose-300 text-[10px] font-mono px-2 py-0.5 rounded">
                  Title & Caption Zone
                </div>
                <div className="space-y-2 text-right">
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-[10px] text-rose-300">♥</div>
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-[10px] text-rose-300">💬</div>
                </div>
              </div>
            </div>
          )}

          <div
            style={widget ? undefined : {
              opacity,
              transform: `scale(${scale}) translateY(${translateY}px)`,
              transition: isPlaying ? 'none' : 'all 0.05s ease-out',
            }}
            className="w-full flex justify-center items-center z-10"
          >
            {renderWidgetContent()}
          </div>
        </div>
      </div>

      {/* Таймлайн */}
      <div className="h-16 border-t border-slate-800/80 px-6 bg-slate-900/60 flex items-center gap-6">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={!widget}
          className="w-10 h-10 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-30 text-white flex items-center justify-center shadow-lg shadow-sky-500/20 transition-transform active:scale-95"
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>

        <button
          onClick={() => setPreviewFrame(0)}
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <RotateCcw size={16} />
        </button>

        <div className="flex-1 flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={durationFrames}
            value={previewFrame}
            onChange={(e) => {
              setIsPlaying(false)
              setPreviewFrame(Number(e.target.value))
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
          <div className="font-mono text-xs text-slate-400 w-24 text-right">
            <span className="text-white font-bold">{previewFrame}</span> / {durationFrames}f
          </div>
        </div>
      </div>
    </div>
  )
}
