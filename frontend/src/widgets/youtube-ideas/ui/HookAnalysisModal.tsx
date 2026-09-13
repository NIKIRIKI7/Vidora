import { Modal, Spinner, Button, RetentionHeatmapChart } from '@shared/ui'
import { BrainCircuit, TriangleAlert, Sparkles, Check, Copy } from 'lucide-react'
import type { HookAnalysisData, VideoResult } from '@entities/project'

interface HookAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  video: VideoResult | null
  hookData: HookAnalysisData | null
  isAnalyzing: boolean
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
}

export const HookAnalysisModal = ({
  isOpen,
  onClose,
  video,
  hookData,
  isAnalyzing,
  copiedKey,
  onCopy,
}: HookAnalysisModalProps) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="🪝 Инспектор Хука & Тепловая Карта Удержания"
    className="max-w-3xl"
  >
    {video && (
      <div className="flex flex-col gap-5 text-on-surface pb-2">
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-surface-container-low border border-outline-variant">
          <div className="flex-1 min-w-0">
            <span className="text-2xs text-on-surface-variant font-mono block mb-1">
              {video.channel} • {video.views.toLocaleString('ru')} просмотров
            </span>
            <h4 className="text-sm font-bold text-on-surface line-clamp-2">
              {video.title}
            </h4>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-lg bg-error/20 text-error font-bold font-mono text-xs border border-error/30">
              {video.vph} VPH 🔥
            </span>
            <span className="px-2 py-1 rounded-lg bg-secondary/15 text-secondary font-mono text-xs border border-secondary/30">
              x{video.ratio} ratio
            </span>
          </div>
        </div>

        {/* Реальный транскрипт первых секунд */}
        {hookData?.transcript_snippet && hookData.transcript_snippet.length > 20 && (
          <div className="p-3 rounded-xl bg-surface-container-lowest border border-outline-variant text-xs">
            <span className="text-on-surface-variant font-mono text-xxs uppercase font-bold block mb-1">Оригинальный транскрипт (0:00 - 0:30):</span>
            <p className="text-on-surface italic leading-relaxed font-mono">«{hookData.transcript_snippet}»</p>
          </div>
        )}

        {/* Динамический Heatmap: строит график по реальным таймкодам и сам считает пик */}
        <RetentionHeatmapChart
          heatmap={hookData?.heatmap ?? []}
          totalDurationSeconds={video.duration_sec ?? 0}
          className="bg-surface-container-lowest border-outline-variant shadow-none"
        />

        {isAnalyzing ? (
          <div className="py-10 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
            <Spinner className="text-3xl text-secondary" />
            <span className="text-xs font-medium">LLM деконструирует психологию хука и генерирует вирусные формулы...</span>
          </div>
        ) : hookData ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-surface-container-low border border-primary/20 rounded-xl flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-primary font-bold text-xs">
                  <BrainCircuit size={14} />
                  Психология удержания
                </div>
                <p className="text-on-surface leading-relaxed text-xs">{hookData.psychology}</p>
              </div>
              <div className="p-3 bg-surface-container-low border border-error/20 rounded-xl flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-error font-bold text-xs">
                  <TriangleAlert size={14} />
                  Слабые места оригинала
                </div>
                <p className="text-on-surface leading-relaxed text-xs">{hookData.flaws_identified}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-secondary" />
                Адаптированные формулы хуков для вашего видео:
              </span>
              <div className="space-y-3">
                {(hookData.stolen_hooks || []).map((h, idx) => {
                  const hook = typeof h === 'string' ? { angle: h, hook_0_5s: '', hook_5_20s: '', why_it_converts: '' } : h
                  return (
                  <div key={idx} className="p-3.5 bg-surface-container-low border border-outline-variant hover:border-secondary/40 rounded-xl transition-all flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-secondary font-bold text-xs">Угол {idx + 1}: {hook.angle}</span>
                      <Button
                        variant="link"
                        onClick={() => onCopy(`${hook.hook_0_5s} ${hook.hook_5_20s}`, `hook_${idx}`)}
                        className="px-2.5 py-1 bg-secondary/15 hover:bg-secondary text-secondary hover:text-surface-container-lowest font-semibold rounded-lg text-2xs"
                      >
                        {copiedKey === `hook_${idx}` ? <><Check size={12} /> Скопировано</> : <><Copy size={12} /> Скопировать формулу</>}
                      </Button>
                    </div>
                    <div className="p-2 rounded bg-surface-container-lowest/50 border-l-2 border-error text-xs">
                      <span className="text-xxs text-error uppercase font-mono block font-bold">0:00 - 0:05 (Разрыв шаблона):</span>
                      <span className="text-on-surface font-medium">{hook.hook_0_5s}</span>
                    </div>
                    <div className="p-2 rounded bg-surface-container-lowest/50 border-l-2 border-secondary text-xs">
                      <span className="text-xxs text-secondary uppercase font-mono block font-bold">0:05 - 0:20 (Закрепление интриги):</span>
                      <span className="text-on-surface">{hook.hook_5_20s}</span>
                    </div>
                    <div className="text-xxs text-on-surface-variant italic">
                      Почему это сработает: {hook.why_it_converts}
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )}
  </Modal>
)
