import { useState, type ReactNode } from 'react'
import { Sparkles, Brain, AlertTriangle, ArrowRight, Check, Zap } from 'lucide-react'
import type { HookAnalysisData, StolenHook } from '@shared/api'
import { analyzeHook } from '@shared/api'
import { WORDS_PER_SECOND } from '@shared/config'
import { TextArea } from '@shared/ui'

interface HookDeconstructionPanelProps {
  initialTranscript?: string
  onApplyHookToScenario?: (hook: StolenHook) => void
}

export const HookDeconstructionPanel = ({
  initialTranscript = '',
  onApplyHookToScenario,
}: HookDeconstructionPanelProps): ReactNode => {
  const [transcript, setTranscript] = useState(initialTranscript)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<HookAnalysisData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null)

  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length
  const estimatedSeconds = (wordCount / WORDS_PER_SECOND).toFixed(1)

  const handleRunAnalysis = async () => {
    if (!transcript.trim()) return
    setIsAnalyzing(true)
    setError(null)
    try {
      const data = await analyzeHook(transcript)
      setAnalysis(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Сбой анализа хука')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleApply = (hook: StolenHook, index: number) => {
    setAppliedIndex(index)
    onApplyHookToScenario?.(hook)
    setTimeout(() => setAppliedIndex(null), 2500)
  }

  return (
    <div className="flex flex-col space-y-4 text-xs">
      <div className="flex flex-col space-y-1.5">
        <div className="flex justify-between items-center text-2xs text-on-surface/60">
          <span>Транскрипт вступительных секунд ролика:</span>
          <span className="font-mono text-secondary">
            {wordCount} слов ≈ {estimatedSeconds} сек начитки
          </span>
        </div>
        <TextArea
          rows={3}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Вставьте первые 2-4 предложения видеоролика..."
          className="w-full p-2.5 text-xs bg-surface-container-lowest border border-outline-variant rounded-xl text-on-surface placeholder-white/30 focus:outline-none focus:border-primary"
        />
        <button
          onClick={handleRunAnalysis}
          disabled={isAnalyzing || !transcript.trim()}
          className="self-end px-4 py-1.5 bg-gradient-to-r from-primary-container to-secondary text-on-primary font-bold rounded-lg shadow-lg hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {isAnalyzing ? 'Деконструкция через LLM...' : 'Анализ и генерация 3 хуков'}
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-error/10 border border-error/30 text-error text-2xs">
          {error}
        </div>
      )}

      {analysis && (
        <div className="space-y-4 pt-2 border-t border-outline-variant">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 bg-surface-container-low border border-primary/20 rounded-xl flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-primary font-bold">
                <Brain className="w-3.5 h-3.5" />
                Психология удержания
              </div>
              <p className="text-on-surface/80 leading-relaxed text-2xs">{analysis.psychology}</p>
            </div>

            <div className="p-3 bg-surface-container-low border border-error/20 rounded-xl flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-error font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                Слабые места оригинала
              </div>
              <p className="text-on-surface/80 leading-relaxed text-2xs">{analysis.flaws_identified}</p>
            </div>
          </div>

          <div>
            <div className="text-2xs font-bold text-on-surface uppercase tracking-wider mb-2 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-warning" />
              Адаптированные вирусные хуки (0-5s / 5-20s):
            </div>

            <div className="space-y-3">
              {analysis.stolen_hooks.map((h, idx) => (
                <div
                  key={idx}
                  className="p-3.5 bg-surface-container border border-outline-variant hover:border-secondary/40 rounded-xl transition-all flex flex-col gap-2 relative overflow-hidden"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-warning font-bold text-xs">Угол {idx + 1}: {h.angle}</span>
                    <button
                      onClick={() => handleApply(h, idx)}
                      className="px-2.5 py-1 bg-secondary/20 hover:bg-secondary text-secondary hover:text-on-secondary font-semibold rounded-md transition-all flex items-center gap-1 text-2xs"
                    >
                      {appliedIndex === idx ? (
                        <>
                          <Check className="w-3 h-3 text-success" /> Внедрено
                        </>
                      ) : (
                        <>
                          Вставить в сценарий <ArrowRight className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-2 rounded bg-surface-container-lowest/40 border-l-2 border-error">
                    <span className="text-xxs text-error uppercase font-mono block">0:00 - 0:05 (Разрыв шаблона):</span>
                    <span className="text-on-surface font-medium">{h.hook_0_5s}</span>
                  </div>

                  <div className="p-2 rounded bg-surface-container-lowest/40 border-l-2 border-secondary">
                    <span className="text-xxs text-secondary uppercase font-mono block">0:05 - 0:20 (Закрепление интриги):</span>
                    <span className="text-on-surface">{h.hook_5_20s}</span>
                  </div>

                  <div className="text-xxs text-on-surface-variant/60 italic">
                    Почему это сработает: {h.why_it_converts}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
