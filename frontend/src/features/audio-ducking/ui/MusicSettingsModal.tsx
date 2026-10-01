import { useState } from 'react'
import { Modal, Button, OptionCard, FieldGroup, Slider, Switch } from '@shared/ui'
import { SlidersHorizontal, AudioLines, Check } from 'lucide-react'
import type { ProjectSettings, BackgroundMusicSettings } from '@entities/project'
import { DUCKING_PRESETS, DEFAULT_BACKGROUND_MUSIC, type DuckingPresetKey } from '@shared/config'

interface Props {
  isOpen: boolean
  onClose: () => void
  project: ProjectSettings
  onUpdateSettings: (settings: BackgroundMusicSettings) => void
  onOpenLibrary: () => void
}

export const MusicSettingsModal = ({ isOpen, onClose, project, onUpdateSettings, onOpenLibrary }: Props) => {
  const [settings, setSettings] = useState<BackgroundMusicSettings>(project.backgroundMusic || DEFAULT_BACKGROUND_MUSIC)
  const [isProMode, setIsProMode] = useState(settings.preset === 'custom')

  const applyPreset = (presetKey: DuckingPresetKey) => {
    const p = DUCKING_PRESETS[presetKey]
    setSettings((prev) => ({
      ...prev,
      preset: presetKey,
      baseVolume: p.baseVolume,
      duckedVolume: p.duckedVolume,
      threshold: p.threshold,
      attackMs: p.attackMs,
      releaseMs: p.releaseMs,
      holdMs: p.holdMs,
      fadeInSec: p.fadeInSec,
      fadeOutSec: p.fadeOutSec,
      eq: { ...p.eq },
    }))
  }

  const handleSave = () => {
    onUpdateSettings(settings)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🎛️ Настройка Музыки и Auto-Ducking" className="max-w-2xl">
      <div className="flex flex-col gap-5 pb-2">
        <div className="flex items-center justify-between p-4 bg-surface-container-lowest/60 rounded-xl border border-outline-variant/20">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-on-surface">Включить фоновую музыку</span>
            <span className="text-xs text-on-surface-variant">Автоматическое приглушение (Auto-Ducking) в браузере (Remotion)</span>
          </div>
          <Switch checked={settings.enabled} onChange={(val) => setSettings({ ...settings, enabled: val })} />
        </div>

        <div className="flex items-center justify-between p-3 bg-surface-container-lowest/40 rounded-xl border border-outline-variant/20">
          <div className="flex flex-col min-w-0">
            <span className="text-xxs font-mono uppercase text-secondary">Активный саундтрек</span>
            <span className="text-xs font-semibold text-on-surface truncate max-w-sm">{settings.trackName || 'Не выбран'}</span>
          </div>
          <Button variant="secondary" onClick={onOpenLibrary} className="text-xs py-1 px-3 shrink-0">
            Выбрать трек
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono uppercase text-on-surface-variant">Сценарные пресеты сведения</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(DUCKING_PRESETS) as DuckingPresetKey[]).map((key) => {
              const p = DUCKING_PRESETS[key]
              const isSelected = !isProMode && settings.preset === key
              return (
                <OptionCard
                  key={key}
                  title={p.name.split(' ')[0]}
                  subtitle={p.description}
                  isActive={isSelected}
                  accent="primary"
                  showIcon={false}
                  onClick={() => { setIsProMode(false); applyPreset(key) }}
                />
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20">
          <Button
            variant="link"
            icon={SlidersHorizontal}
            onClick={() => {
              setIsProMode(!isProMode)
              if (!isProMode) setSettings((prev) => ({ ...prev, preset: 'custom' }))
            }}
            className="font-mono"
          >
            {isProMode ? 'Скрыть детальные регуляторы' : 'Тонкая настройка (Pro Mode)...'}
          </Button>
        </div>

        {isProMode && (
          <div className="flex flex-col gap-5 p-4 bg-surface-container-lowest/40 rounded-xl border border-outline-variant/20 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldGroup label={`Громкость в паузах: ${Math.round(settings.baseVolume * 100)}%`}>
                <Slider min={0.05} max={1.0} step={0.01} value={settings.baseVolume} onChange={(e) => setSettings({ ...settings, baseVolume: Number(e.target.value) })} />
              </FieldGroup>
              <FieldGroup label={`Громкость в речи: ${Math.round(settings.duckedVolume * 100)}%`}>
                <Slider min={0.01} max={0.35} step={0.01} value={settings.duckedVolume} onChange={(e) => setSettings({ ...settings, duckedVolume: Number(e.target.value) })} />
              </FieldGroup>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldGroup label={`Затухание (Attack): ${settings.attackMs} ms`}>
                <Slider min={20} max={500} step={10} value={settings.attackMs} onChange={(e) => setSettings({ ...settings, attackMs: Number(e.target.value) })} />
              </FieldGroup>
              <FieldGroup label={`Нарастание (Release): ${settings.releaseMs} ms`}>
                <Slider min={150} max={2000} step={50} value={settings.releaseMs} onChange={(e) => setSettings({ ...settings, releaseMs: Number(e.target.value) })} />
              </FieldGroup>
            </div>

            <div className="pt-3 border-t border-outline-variant/20 flex flex-col gap-3">
              <span className="text-2xs font-mono uppercase text-on-surface-variant flex items-center gap-1">
                <AudioLines size={13} className="text-primary" /> Частотная изоляция речи (Speech Pocket EQ)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Switch
                  label={`Срез саб-баса (< ${settings.eq.lowCutFreqHz} Hz)`}
                  checked={settings.eq.enableLowCut}
                  onChange={(val) => setSettings({ ...settings, eq: { ...settings.eq, enableLowCut: val } })}
                />
                <Switch
                  label={`Вырез частот речи (${settings.eq.midCarveGainDb} dB)`}
                  checked={settings.eq.enableMidCarve}
                  onChange={(val) => setSettings({ ...settings, eq: { ...settings.eq, enableMidCarve: val } })}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/40">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={handleSave} className="px-6">
            <Check size={16} className="mr-1.5" /> Сохранить настройки
          </Button>
        </div>
      </div>
    </Modal>
  )
}
