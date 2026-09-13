import { SlidersHorizontal } from 'lucide-react'
import { Button, Select, Slider, Switch } from '@shared/ui'
import type { AlignmentEngineType } from '@shared/api'

interface AudioHubSettingsProps {
  guidanceScale: number
  onGuidanceScaleChange: (value: number) => void
  numSteps: number
  onNumStepsChange: (value: number) => void
  speed: number
  onSpeedChange: (value: number) => void
  pitch: number
  onPitchChange: (value: number) => void
  enableDenoise: boolean
  onEnableDenoiseChange: (value: boolean) => void
  alignmentEngine: AlignmentEngineType
  onAlignmentEngineChange: (value: AlignmentEngineType) => void
  onReset: () => void
}

export const AudioHubSettings = ({
  guidanceScale,
  onGuidanceScaleChange,
  numSteps,
  onNumStepsChange,
  speed,
  onSpeedChange,
  pitch,
  onPitchChange,
  enableDenoise,
  onEnableDenoiseChange,
  alignmentEngine,
  onAlignmentEngineChange,
  onReset,
}: AudioHubSettingsProps) => (
  <aside className="w-[var(--layout-sidebar-xs)] shrink-0 border-l border-outline-variant/40 bg-surface-container-lowest/40 flex flex-col p-4 gap-5 overflow-y-auto custom-scrollbar">
    <div className="border-b border-outline-variant/40 pb-2 flex items-center justify-between">
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface flex items-center gap-1.5">
        <SlidersHorizontal size={14} className="text-secondary" /> Параметры инференса
      </span>
    </div>

    {/* Параметры диффузии (Scale & Steps) */}
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-on-surface font-medium">Guidance Scale (CFG)</span>
          <span className="font-mono text-secondary font-bold">{guidanceScale.toFixed(1)}</span>
        </div>
        <Slider
          min={1.0}
          max={5.0}
          step={0.1}
          value={guidanceScale}
          onChange={(e) => onGuidanceScaleChange(Number(e.target.value))}
        />
        <span className="text-xxs text-on-surface-variant/60 leading-tight">
          Сила следования заданному тембру
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-on-surface font-medium">Шаги диффузии (Steps)</span>
          <span className="font-mono text-primary font-bold">{numSteps}</span>
        </div>
        <Slider
          min={16}
          max={64}
          step={2}
          value={numSteps}
          onChange={(e) => onNumStepsChange(Number(e.target.value))}
        />
        <span className="text-xxs text-on-surface-variant/60 leading-tight">
          Детализация звуковой волны (16 — быстро, 32 — оптимум)
        </span>
      </div>

      {/* Скорость */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-on-surface font-medium">Скорость речи</span>
          <span className="font-mono text-on-surface font-bold">{speed.toFixed(2)}x</span>
        </div>
        <Slider
          min={0.5}
          max={2.0}
          step={0.05}
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
        />
      </div>

      {/* Высота тона */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-on-surface font-medium">Высота тона (Pitch)</span>
          <span className="font-mono text-on-surface font-bold">{pitch.toFixed(2)}x</span>
        </div>
        <Slider
          min={0.7}
          max={1.4}
          step={0.05}
          value={pitch}
          onChange={(e) => onPitchChange(Number(e.target.value))}
        />
      </div>
    </div>

    <div className="h-px bg-on-surface/10" />

    {/* Фильтры и DSP */}
    <div className="flex flex-col gap-3">
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
        Фильтры и Мастеринг
      </span>

      <Switch
        label="Шумоподавление (Denoise)"
        checked={enableDenoise}
        onChange={onEnableDenoiseChange}
      />

      <div className="flex flex-col gap-1.5 pt-1">
        <label className="text-xs text-on-surface-variant">Forced Alignment (Слова)</label>
        <Select
          value={alignmentEngine}
          onChange={(e) => onAlignmentEngineChange(e.target.value as AlignmentEngineType)}
          className="text-xs py-1.5"
        >
          <option value="Whisper">Whisper (Пословные таймкоды)</option>
          <option value="NativeTts">NativeTts (Оценка)</option>
          <option value="Passthrough">Без выравнивания</option>
        </Select>
      </div>
    </div>

    {/* Кнопка сброса */}
    <div className="mt-auto pt-3 border-t border-outline-variant/40">
      <Button variant="link" onClick={onReset} className="w-full py-1 justify-center">
        Сбросить параметры к базовым
      </Button>
    </div>
  </aside>
)
