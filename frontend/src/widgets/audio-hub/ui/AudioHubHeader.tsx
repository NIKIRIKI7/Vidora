import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Cpu, Mic, Play, RefreshCw, Upload, Wand2 } from 'lucide-react'
import { Button, PageHeader, SegmentedControl, type SegmentOption } from '@shared/ui'
import type { AiModelDto } from '@shared/api'
import type { StudioAction } from '../model/useAudioHub'

interface AudioHubHeaderProps {
  onBack: () => void
  activeAction: StudioAction
  onActionChange: (action: StudioAction) => void
  isLocalGpuReady: boolean
  isRefreshing: boolean
  onRefresh: () => void
  localModels: AiModelDto[]
  onUnloadVram: () => void
}

const ACTION_OPTIONS: SegmentOption<StudioAction>[] = [
  { value: 'synthesize', label: 'Озвучка & Тест', icon: Play },
  { value: 'design', label: 'Voice Design', icon: Wand2, accent: 'secondary' },
  { value: 'clone', label: 'Voice Clone', icon: Upload, accent: 'secondary' },
]

export const AudioHubHeader = ({
  onBack,
  activeAction,
  onActionChange,
  isLocalGpuReady,
  isRefreshing,
  onRefresh,
  localModels,
  onUnloadVram,
}: AudioHubHeaderProps) => {
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const statusMenuRef = useRef<HTMLDivElement>(null)

  // Закрытие popover кликом вовне
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setIsStatusOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  return (
    <PageHeader
      title="Voice Studio"
      icon={Mic}
      onBack={onBack}
      centerContent={
        <SegmentedControl
          value={activeAction}
          onChange={onActionChange}
          options={ACTION_OPTIONS}
        />
      }
      rightContent={
        <div className="flex items-center gap-2 relative" ref={statusMenuRef}>
          <Button
            variant="ghost"
            onClick={() => setIsStatusOpen((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono ${
              isLocalGpuReady
                ? 'bg-success/10 border-success/30 text-success hover:bg-success/20'
                : 'bg-warning/10 border-warning/30 text-warning hover:bg-warning/20'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isLocalGpuReady ? 'bg-success shadow-lg shadow-secondary/50' : 'bg-warning'
              }`}
            />
            <span>{isLocalGpuReady ? 'GPU Ready' : 'GPU Offline'}</span>
            <ChevronDown size={14} className="opacity-70" />
          </Button>

          <Button
            variant="ghost"
            onClick={onRefresh}
            className="p-1.5 text-on-surface-variant hover:text-on-surface"
            title="Обновить статусы"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </Button>

          {/* Диагностическое окно */}
          {isStatusOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-surface-container border border-outline-variant/60 rounded-2xl p-4 shadow-2xl z-50 flex flex-col gap-3 text-xs animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
                <span className="font-bold text-on-surface uppercase text-2xs font-mono">
                  Локальные модели
                </span>
                <span className="text-secondary font-mono text-xxs">
                  Готово: {localModels.filter((m) => m.status === 'Ready').length}/{localModels.length}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {localModels.map((m) => {
                  const isReady = m.status === 'Ready'
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-surface-container-lowest border border-outline-variant/20"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-on-surface text-2xs">{m.name.split(' ')[0]}</span>
                        <span className="text-xxs text-on-surface-variant font-mono">
                          {m.category === 'Stt' ? 'Whisper STT' : 'TTS Модель'}
                        </span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-xxs font-mono border ${
                          isReady
                            ? 'bg-success/15 text-success border-success/30'
                            : 'bg-on-surface/5 text-on-surface-variant/60 border-outline-variant/40'
                        }`}
                      >
                        {isReady ? 'Готов' : 'Нет файлов'}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="pt-2 border-t border-outline-variant/40">
                <Button
                  variant="ghost"
                  onClick={onUnloadVram}
                  className="w-full text-xs text-secondary border border-secondary/20 hover:bg-secondary/10 py-1.5"
                >
                  <Cpu size={13} className="mr-1.5" /> Очистить память VRAM
                </Button>
              </div>
            </div>
          )}
        </div>
      }
    />
  )
}
