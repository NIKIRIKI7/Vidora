import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ProjectSettings } from '@entities/project'
import { useSettingsStore } from '@entities/project'
import { Button, FieldGroup, Select, Spinner, Switch } from '@shared/ui'
import { Mic, SlidersHorizontal, MicVocal, Upload, Play, Download, Trash2, Volume2, AlignStartVertical, RotateCcw, Cpu, AudioLines } from 'lucide-react'
import { DEFAULT_BACKGROUND_MUSIC } from '@shared/config'
import { API, getProjectPath, isAudioDirty } from '@entities/project'
import { voiceApi, type SpeakerProfileDto } from '@shared/api'

interface AudioTabProps {
  project: ProjectSettings
  voiceModel: string
  useWhisper: boolean
  autoOffloadVram: boolean
  isGeneratingAudio: boolean
  isSyncing: boolean
  onChangeVoiceModel: (m: string) => void
  onChangeUseWhisper: (val: boolean) => void
  onChangeAutoOffloadVram: (val: boolean) => void
  onOpenVoicebox: () => void
  onOpenAiSettings: () => void
  onOpenCustomAudioModal?: (scope: 'fragment' | 'scene' | 'project', fragId?: string) => void
  onRunVoiceGen: () => void
  onResetAllSync: () => void
  onResetAudio: () => void
  onProcessAudio: (action: string, scope: 'scene' | 'project', targetSceneId?: string) => void
  onProcessAdvancedSilence?: (scope: 'scene' | 'project', targetSceneId?: string) => void
  onUnloadVram: () => void
  onRunSync: () => void
  onUpdateActiveGlobalVoice: (voiceId?: string) => void
  onUpdateProjectSettings: (project: ProjectSettings) => void
  onOpenMusicSettings?: () => void
  onOpenMusicLibrary?: () => void
  onShowNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export const AudioTab = ({
  project, voiceModel, useWhisper, autoOffloadVram, isGeneratingAudio, isSyncing,
  onChangeVoiceModel, onChangeUseWhisper, onChangeAutoOffloadVram, onOpenVoicebox, onOpenAiSettings,
  onOpenCustomAudioModal, onRunVoiceGen, onResetAllSync, onResetAudio, onProcessAudio,
  onProcessAdvancedSilence, onUnloadVram, onRunSync, onUpdateActiveGlobalVoice, onUpdateProjectSettings,
  onOpenMusicSettings, onOpenMusicLibrary, onShowNotification,
}: AudioTabProps) => {
  const [processScope, setProcessScope] = useState<'scene' | 'project'>('scene')
  const { globalVoices } = useSettingsStore()
  const anyAudioDirty = project.scenes.some(s => s.fragments.some(isAudioDirty))

  // Динамический список дикторов из бэкенда (SSOT)
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfileDto[]>([])
  const [speakersLoaded, setSpeakersLoaded] = useState(false)
  const loadSpeakerProfiles = useCallback(async () => {
    try {
      setSpeakerProfiles(await voiceApi.getSpeakerProfiles())
    } catch {
      setSpeakerProfiles([])
    } finally {
      setSpeakersLoaded(true)
    }
  }, [])
  useEffect(() => {
    const t = setTimeout(() => { void loadSpeakerProfiles() }, 0)
    return () => clearTimeout(t)
  }, [loadSpeakerProfiles])

  const builtInSpeakers = useMemo(() => speakerProfiles.filter(s => s.source_type === 'BuiltIn'), [speakerProfiles])
  const designedClonedSpeakers = useMemo(
    () => speakerProfiles.filter(s => s.source_type === 'Designed' || s.source_type === 'Cloned'),
    [speakerProfiles]
  )

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center bg-primary/10 p-2 rounded-lg border border-primary/20 gap-2">
          <span className="font-label text-xs uppercase tracking-wide text-primary flex items-center gap-1.5 truncate"><Mic size={16}/> Озвучка (TTS)</span>
          <div className="flex items-center gap-1 shrink-0">
            <button className="text-[11px] text-primary hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1 bg-primary/20 border border-primary/30" onClick={onOpenAiSettings} title="Настройки TTS"><SlidersHorizontal size={14} /></button>
            <button className="text-[11px] text-secondary hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1 bg-secondary/20 border border-secondary/30" onClick={onOpenVoicebox} title="Voicebox (Клонирование)"><MicVocal size={14} /></button>
          </div>
        </div>
        <Button variant="secondary" onClick={() => onOpenCustomAudioModal?.('scene')} className="w-full py-2 text-xs font-semibold">
          <Upload size={14} className="mr-2" /> Загрузить свое аудио (Файл / Озвучка)
        </Button>
        <FieldGroup label="Голосовая модель">
          <div className="flex items-center gap-2">
            <button onClick={() => { const isCustom = project.customVoices?.find(v => v.id === voiceModel) || globalVoices.find(v => v.id === project.activeGlobalVoiceId); const profile = speakerProfiles.find(s => s.speaker_id === voiceModel); const url = isCustom?.refAudioPath ? `${API}/api/v1/render/media?path=${encodeURIComponent(isCustom.refAudioPath)}` : profile?.preview_audio_path ? `${API}/api/v1/render/media?path=${encodeURIComponent(profile.preview_audio_path)}` : `/samples/${voiceModel}.wav`; void new Audio(url).play().catch(() => onShowNotification('Сэмпл не найден', 'error')) }} className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-on-surface-variant hover:text-white shrink-0"><Play size={16} /></button>
            <Select
              value={project.activeGlobalVoiceId ? `global_${project.activeGlobalVoiceId}` : voiceModel}
              onChange={e => {
                const val = e.target.value
                if (val.startsWith('global_')) {
                  onUpdateActiveGlobalVoice(val.replace('global_', ''))
                } else {
                  onUpdateActiveGlobalVoice(undefined)
                  onChangeVoiceModel(val)
                }
              }}
              className="flex-1 min-w-0 font-medium"
            >
              {builtInSpeakers.length > 0 ? (
                <optgroup label="Базовые голоса (Vidora)">
                  {builtInSpeakers.map(s => (
                    <option key={s.speaker_id} value={s.speaker_id} title={s.description || undefined}>{s.name}</option>
                  ))}
                </optgroup>
              ) : speakersLoaded ? (
                <optgroup label="Базовые голоса">
                  <option value="" disabled>Нет доступных дикторов</option>
                </optgroup>
              ) : null}
              {designedClonedSpeakers.length > 0 && (
                <optgroup label="Профили дикторов (Design / Clone)">
                  {designedClonedSpeakers.map(s => (
                    <option key={s.speaker_id} value={s.speaker_id} title={s.description || undefined}>
                      {s.source_type === 'Cloned' ? '🎙️ Cloned - ' : '✨ Designed - '}{s.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {globalVoices.length > 0 && (
                <optgroup label="Глобальные голоса (Audio Hub)">
                  {globalVoices.map(v => <option key={`global_${v.id}`} value={`global_${v.id}`}>🌐 {v.name}</option>)}
                </optgroup>
              )}
              {project.customVoices && project.customVoices.length > 0 && (
                <optgroup label="Локальные клоны проекта">
                  {project.customVoices.map(v => <option key={v.id} value={v.id}>🎙️ Cloned - {v.name}</option>)}
                </optgroup>
              )}
            </Select>
          </div>
        </FieldGroup>
        <div className="flex flex-wrap gap-2">
          <Button variant="dashed" disabled={isGeneratingAudio} onClick={onRunVoiceGen} className={`flex-1 min-w-[140px] ${anyAudioDirty ? 'border-warning/50 text-warning hover:bg-warning/10 hover:border-warning' : ''}`}>
            {isGeneratingAudio ? <Spinner /> : anyAudioDirty ? 'Обновить голос (⚠️)' : 'Сгенерировать голос'}
          </Button>
          <div className="flex gap-1 shrink-0">
            <button className="text-[11px] text-on-surface-variant hover:text-primary flex items-center justify-center transition-colors w-9 h-9 rounded hover:bg-white/5 border border-white/10" onClick={async () => {
              const paths = project.scenes.flatMap(s => s.fragments.map(f => f.audioFileName)).filter(Boolean) as string[]
              if (paths.length === 0) { onShowNotification('Нет аудио', 'error'); return }
              try {
                const outPath = `${getProjectPath(project)}/assets/voice/Project_${project.name}_Full.wav`
                const res = await fetch(`${API}/api/v1/audio/concat`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ audio_paths: paths, output_path: outPath })
                })
                if (res.ok) {
                  const a = document.createElement('a')
                  a.href = `${API}/api/v1/render/media?path=${encodeURIComponent(outPath)}`
                  a.download = `Full_Audio_${project.name}.wav`
                  document.body.appendChild(a)
                  a.click()
                  a.remove()
                } else { onShowNotification('Ошибка склейки', 'error') }
              } catch { onShowNotification('Сбой скачивания', 'error') }
            }} title="Скачать все аудио проекта одним файлом"><Download size={18} /></button>
            <button className="text-[11px] text-on-surface-variant hover:text-error flex items-center justify-center transition-colors w-9 h-9 rounded hover:bg-white/5 border border-white/10" onClick={onResetAudio} title="Сбросить все аудио"><Trash2 size={18} /></button>
          </div>
        </div>
      </section>
      <div className="h-px bg-white/5" />

      {/* Background Music Section */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center bg-accent/10 p-2 rounded-lg border border-accent/20 gap-2">
          <span className="font-label text-xs uppercase tracking-wide text-accent flex items-center gap-1.5 truncate">
            <Volume2 size={16} /> Фоновая музыка & Ducking
          </span>
          <Switch
            checked={Boolean(project.backgroundMusic?.enabled)}
            onChange={(val) => onUpdateProjectSettings({
              ...project,
              backgroundMusic: { ...(project.backgroundMusic || DEFAULT_BACKGROUND_MUSIC), enabled: val },
            })}
          />
        </div>
        <div className="p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-on-surface-variant truncate max-w-[170px]">{project.backgroundMusic?.trackName || 'Не выбран'}</span>
            <button onClick={() => onOpenMusicLibrary?.()} className="text-[11px] text-secondary hover:underline shrink-0">Изменить</button>
          </div>
          <Button variant="secondary" onClick={() => onOpenMusicSettings?.()} className="w-full text-xs py-1.5 font-medium">
            <SlidersHorizontal size={14} className="mr-1.5" /> Настроить Ducking & EQ
          </Button>
        </div>
      </section>
      <div className="h-px bg-white/5" />

      {/* Sync Section */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center bg-secondary/10 p-2 rounded-lg border border-secondary/20 gap-2">
          <span className="font-label text-xs uppercase tracking-wide text-secondary flex items-center gap-1.5 truncate"><AlignStartVertical size={16}/> Синхронизация</span>
          <div className="flex items-center gap-2 shrink-0">
            {project.scenes.some(s => s.fragments.some(f => f.startTime !== undefined)) && (
              <button className="text-[11px] text-error hover:text-white flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded bg-error/10 border border-error/30" onClick={onResetAllSync} title="Сбросить все тайминги"><RotateCcw size={14} /></button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2.5 p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl">
          <label className="flex items-center justify-between gap-2 text-xs text-on-surface-variant cursor-pointer">
            <span className="flex-1 leading-tight">WhisperX ИИ</span>
            <input type="checkbox" checked={useWhisper} onChange={e => onChangeUseWhisper(e.target.checked)} className="accent-primary size-3.5 shrink-0" />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-on-surface-variant cursor-pointer">
            <span className="flex-1 leading-tight">Авто-освобождение VRAM</span>
            <input type="checkbox" checked={autoOffloadVram} onChange={e => onChangeAutoOffloadVram(e.target.checked)} className="accent-primary size-3.5 shrink-0" />
          </label>
          <button onClick={onUnloadVram} className="text-[11px] text-secondary hover:bg-secondary/10 px-2 py-0.5 rounded transition-all flex items-center gap-1 mt-1 self-start font-medium leading-tight h-auto text-left"><Cpu size={14} /> Очистить VRAM вручную</button>
        </div>
        <Button variant="dashed" disabled={isSyncing} onClick={onRunSync} className="h-auto py-2 leading-tight">{isSyncing ? <Spinner /> : 'Синхронизировать тайминги'}</Button>
      </section>
      <div className="h-px bg-white/5" />

      {/* Mastering Section */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center bg-warning/10 p-2 rounded-lg border border-warning/20 gap-2">
          <span className="font-label text-xs uppercase tracking-wide text-warning flex items-center gap-1.5 truncate"><AudioLines size={16}/> Мастеринг аудио</span>
          <div className="flex bg-surface-container-lowest border border-white/5 rounded-md p-0.5 shrink-0">
            <button className={`text-[10px] px-2 py-1 rounded transition-colors ${processScope === 'scene' ? 'bg-warning/20 text-warning' : 'text-on-surface-variant hover:text-white'}`} onClick={() => setProcessScope('scene')}>Сцена</button>
            <button className={`text-[10px] px-2 py-1 rounded transition-colors ${processScope === 'project' ? 'bg-warning/20 text-warning' : 'text-on-surface-variant hover:text-white'}`} onClick={() => setProcessScope('project')}>Проект</button>
          </div>
        </div>
        <Button variant="dashed" onClick={() => onProcessAudio('lavasr', processScope)} disabled={isGeneratingAudio} className="text-xs border-primary/30 hover:border-primary/60 hover:bg-primary/10 hover:text-primary h-auto py-2 leading-tight justify-center md:justify-start text-center md:text-left">
          ✨ LavaSR 48kHz (AI BWE Апскейл)
        </Button>
        <Button variant="dashed" onClick={() => onProcessAudio('mastering', processScope)} disabled={isGeneratingAudio} className="text-xs border-white/10 hover:border-warning/50 hover:bg-warning/10 hover:text-warning h-auto py-2 leading-tight justify-center md:justify-start text-center md:text-left">🎙️ Мастеринг (EQ + Normalize)</Button>
        <Button variant="dashed" onClick={() => onProcessAdvancedSilence?.(processScope)} disabled={isGeneratingAudio} className="text-xs border-white/10 hover:border-accent/50 hover:bg-accent/10 hover:text-accent h-auto py-2 leading-tight justify-center md:justify-start text-center md:text-left">✂️ Умная обрезка пауз (Pydub)</Button>
      </section>
    </>
  )
}
