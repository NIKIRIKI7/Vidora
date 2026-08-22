import { useState } from 'react'
import { Modal, Button, FieldGroup, Slider, Switch, Spinner } from '@shared/ui'
import { Play, Sliders, AudioLines, Zap, Check } from 'lucide-react'
import type { ProjectSettings, BackgroundMusicSettings } from '@entities/project'
import { DUCKING_PRESETS, DEFAULT_BACKGROUND_MUSIC, type DuckingPresetKey } from '@shared/config'
import { API } from '@shared/lib'
import { getAudioPathForScene } from '@widgets/editor-workspace/lib/helpers'

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
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null)

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

  const handleTestDrive = async () => {
    const activeScene = project.scenes[0]
    if (!activeScene || !settings.customTrackPath) return
    setIsPreviewing(true)
    setPreviewAudioUrl(null)

    try {
      const res = await fetch(`${API}/api/v1/audio/preview-ducking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voicePath: getAudioPathForScene(project, activeScene),
          musicPath: settings.customTrackPath,
          projectPath: 'vidora_projects',
          previewDuration: 10,
          baseVolume: settings.baseVolume,
          duckedVolume: settings.duckedVolume,
          threshold: settings.threshold,
          attackMs: settings.attackMs,
          releaseMs: settings.releaseMs,
          eq: {
            enableLowCut: settings.eq.enableLowCut,
            lowCutFreqHz: settings.eq.lowCutFreqHz,
            enableMidCarve: settings.eq.enableMidCarve,
            midCarveFreqHz: settings.eq.midCarveFreqHz,
            midCarveGainDb: settings.eq.midCarveGainDb,
          },
        }),
      })
      const data = await res.json()
      if (data.status === 'ok' && data.preview_url) {
        setPreviewAudioUrl(`${API}/api/v1/render/media?path=${encodeURIComponent(data.preview_url)}`)
      }
    } catch {
      // сеть/ffmpeg недоступны — молча
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleSave = () => {
    onUpdateSettings(settings)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🎛️ Настройка Музыки и Auto-Ducking" className="max-w-2xl">
      <div className="flex flex-col gap-5 pb-2">
        <div className="flex items-center justify-between p-4 bg-surface-container-lowest/60 rounded-xl border border-white/5">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white">Включить фоновую музыку</span>
            <span className="text-xs text-on-surface-variant">Автоматическое приглушение (Auto-Ducking) при голосе диктора</span>
          </div>
          <Switch checked={settings.enabled} onChange={(val) => setSettings({ ...settings, enabled: val })} />
        </div>

        <div className="flex items-center justify-between p-3 bg-surface-container-lowest/40 rounded-xl border border-white/5">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-mono uppercase text-secondary">Активный саундтрек</span>
            <span className="text-xs font-semibold text-white truncate max-w-sm">{settings.trackName || 'Не выбран'}</span>
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
                <button
                  key={key}
                  type="button"
                  onClick={() => { setIsProMode(false); applyPreset(key) }}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                    isSelected ? 'bg-primary/20 border-primary text-primary' : 'bg-surface-container-lowest border-white/5 hover:border-white/20 text-on-surface'
                  }`}
                >
                  <span className="text-xs font-bold leading-tight">{p.name.split(' ')[0]}</span>
                  <span className="text-[10px] text-on-surface-variant line-clamp-2">{p.description}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-primary/10 via-secondary/10 to-transparent rounded-xl border border-primary/20 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Zap size={15} className="text-secondary" /> Мгновенный тест-драйв микса (10с)
            </span>
            <Button variant="secondary" onClick={handleTestDrive} disabled={isPreviewing || !settings.enabled || !settings.customTrackPath} className="py-1 px-3 text-xs">
              {isPreviewing ? <Spinner className="w-3.5 h-3.5 mr-1" /> : <Play size={13} className="mr-1" />}
              Сгенерировать тест
            </Button>
          </div>
          {previewAudioUrl && <audio src={previewAudioUrl} autoPlay controls className="w-full h-8 mt-1" />}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => {
              setIsProMode(!isProMode)
              if (!isProMode) setSettings((prev) => ({ ...prev, preset: 'custom' }))
            }}
            className="text-xs text-secondary hover:underline flex items-center gap-1 font-mono"
          >
            <Sliders size={14} /> {isProMode ? 'Скрыть детальные регуляторы' : 'Тонкая настройка (Pro Mode)...'}
          </button>
        </div>

        {isProMode && (
          <div className="flex flex-col gap-5 p-4 bg-surface-container-lowest/40 rounded-xl border border-white/5 animate-in fade-in duration-200">
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
            <div className="pt-3 border-t border-white/5 flex flex-col gap-3">
              <span className="text-[11px] font-mono uppercase text-on-surface-variant flex items-center gap-1">
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

        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={handleSave} className="px-6">
            <Check size={16} className="mr-1.5" /> Сохранить настройки
          </Button>
        </div>
      </div>
    </Modal>
  )
}
