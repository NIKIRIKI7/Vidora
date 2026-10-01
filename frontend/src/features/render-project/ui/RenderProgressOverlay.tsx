import React from 'react'
import { Film, X, Check } from 'lucide-react'
import { Button } from '@shared/ui'
import type { RenderProjectState } from '../model/useRenderProject'
import { useLastRenderStore } from '../model/useLastRenderStore'
import { DownloadLastRenderButton } from './DownloadLastRenderButton'

interface Props extends RenderProjectState {
  onCancel: () => void
}

const STAGE_LABELS: Record<RenderProjectState['stage'], string> = {
  idle: 'Готово',
  compiling: 'Компиляция сцен',
  rendering: 'Кодирование MP4',
  finalizing: 'Финализация',
}

export const RenderProgressOverlay: React.FC<Props> = ({
  isRendering,
  stage,
  progress,
  currentSceneIndex,
  totalScenes,
  currentSceneTitle,
  onCancel,
}) => {
  const lastUrl = useLastRenderStore((s) => s.url)
  const lastFileName = useLastRenderStore((s) => s.fileName)
  const lastScopeLabel = useLastRenderStore((s) => s.scopeLabel)

  // После завершения не исчезаем, а предлагаем скачать результат повторно.
  if (!isRendering) {
    if (!lastUrl || !lastFileName) return null
    return (
      <div className="fixed bottom-6 right-6 z-[300] w-[380px] max-w-[90vw] rounded-2xl bg-surface-container-lowest/95 border border-secondary/40 shadow-2xl backdrop-blur-xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Check size={16} className="text-secondary shrink-0" />
            <span className="text-sm font-bold text-on-surface">Рендер готов</span>
          </div>
        </div>
        <div className="text-2xs text-on-surface-variant truncate">
          {lastScopeLabel} · {lastFileName}
        </div>
        <DownloadLastRenderButton variant="primary" className="w-full" />
      </div>
    )
  }

  const pct = Math.min(100, Math.round(progress * 100))
  const canCancel = stage === 'compiling'

  return (
    <div className="fixed bottom-6 right-6 z-[300] w-[380px] max-w-[90vw] rounded-2xl bg-surface-container-lowest/95 border border-primary/40 shadow-2xl backdrop-blur-xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Film size={16} className="text-primary shrink-0" />
          <span className="text-sm font-bold text-on-surface">Рендер проекта</span>
        </div>
        <Button
          variant="ghost"
          icon={X}
          onClick={onCancel}
          disabled={!canCancel}
          className="p-1 rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error disabled:opacity-30"
          title={canCancel ? 'Отменить компиляцию' : 'Отмена недоступна во время кодирования MP4'}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-2xs font-mono text-on-surface-variant">
          <span>{STAGE_LABELS[stage]}</span>
          <span className="text-primary font-bold">{pct}%</span>
        </div>
        <div className="text-xxs text-on-surface-variant truncate">
          {totalScenes > 1
            ? `Сцена ${currentSceneIndex + 1} / ${totalScenes}: ${currentSceneTitle}`
            : currentSceneTitle}
        </div>
      </div>

      <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
