import { fetchClient, apiErrorMessage } from '@shared/api'
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ProjectSettings } from '@entities/project'
import { Button, IconButton, FieldGroup, SegmentedControl, Select, Spinner, Switch } from '@shared/ui'
import { SlidersHorizontal, MicVocal, Upload, Play, Download, Trash2, Volume2, AlignStartVertical, RotateCcw, Cpu, AudioLines } from 'lucide-react'
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
  onUpdateProjectSettings: (project: ProjectSettings) => void
  onOpenMusicSettings?: () => void
  onOpenMusicLibrary?: () => void
  onShowNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export const AudioTab = ({
  project, voiceModel, useWhisper, autoOffloadVram, isGeneratingAudio, isSyncing,
  onChangeVoiceModel, onChangeUseWhisper, onChangeAutoOffloadVram, onOpenVoicebox, onOpenAiSettings,
  onOpenCustomAudioModal, onRunVoiceGen, onResetAllSync, onResetAudio, onProcessAudio,
  onProcessAdvancedSilence, onUnloadVram, onRunSync, onUpdateProjectSettings,
  onOpenMusicSettings, onOpenMusicLibrary, onShowNotification,
}: AudioTabProps) => {
  const [processScope, setProcessScope] = useState<'scene' | 'project'>('scene')
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

  // Единый источник правды — бэкенд. Если сохранённый голос отсутствует в каталоге,
  // автоматически выбираем первый доступный (предпочитая локальный движок).
  useEffect(() => {
    if (!speakersLoaded || speakerProfiles.length === 0) return
    const isKnown =
      speakerProfiles.some(s => s.speaker_id === voiceModel) ||
      (project.customVoices ?? []).some(v => v.id === voiceModel)
    if (isKnown) return
    const preferred = speakerProfiles.find(s => s.mode === 'local') ?? speakerProfiles[0]
    onChangeVoiceModel(preferred.speaker_id)
  }, [speakersLoaded, speakerProfiles, voiceModel, project.customVoices, onChangeVoiceModel])

  // Прослушивание сэмпла: только реальные данные с бэкенда (превью профиля или локальный клон проекта).
  const playVoiceSample = useCallback(() => {
    const custom = project.customVoices?.find(v => v.id === voiceModel)
    const profile = speakerProfiles.find(s => s.speaker_id === voiceModel)
    const path = custom?.refAudioPath ?? profile?.preview_audio_path
    if (!path) {
      onShowNotification('Для этого голоса нет превью-сэмпла', 'info')
      return
    }
    const url = `${API}/api/v1/render/media?path=${encodeURIComponent(path)}`
    void new Audio(url).play().catch(() => onShowNotification('Сэмпл не найден', 'error'))
  }, [project.customVoices, voiceModel, speakerProfiles, onShowNotification])

  return (
    <>
      <section className="flex flex-col gap-3">
        <Button variant="secondary" onClick={() => onOpenCustomAudioModal?.('scene')} className="w-full py-2 text-xs font-semibold">
          <Upload size={14} className="mr-2" /> Загрузить свое аудио (Файл / Озвучка)
        </Button>
        <FieldGroup label="Голосовая модель">
          <div className="flex items-center gap-2">
            <IconButton icon={Play} size="md" accent="neutral" onClick={playVoiceSample} title="Прослушать сэмпл" className="border border-outline-variant/40" />
            <IconButton icon={SlidersHorizontal} size="md" accent="primary" onClick={onOpenAiSettings} title="Настройки TTS" className="border border-primary/30 bg-primary/10" />
            <IconButton icon={MicVocal} size="md" accent="secondary" onClick={onOpenVoicebox} title="Voicebox (Клонирование)" className="border border-secondary/30 bg-secondary/10" />
            <Select
              value={voiceModel}
              onChange={e => onChangeVoiceModel(e.target.value)}
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
              {project.customVoices && project.customVoices.length > 0 && (
                <optgroup label="Локальные клоны проекта">
                  {project.customVoices.map(v => <option key={v.id} value={v.id}>🎙️ Cloned - {v.name}</option>)}
                </optgroup>
              )}
            </Select>
          </div>
        </FieldGroup>
        <div className="flex flex-wrap gap-2">
          <Button variant="dashed" disabled={isGeneratingAudio} onClick={onRunVoiceGen} className={`flex-1 min-w-[var(--layout-action-sm)] ${anyAudioDirty ? 'border-warning/50 text-warning hover:bg-warning/10 hover:border-warning' : ''}`}>
            {isGeneratingAudio ? <Spinner /> : anyAudioDirty ? 'Обновить голос (⚠️)' : 'Сгенерировать голос'}
          </Button>
          <div className="flex gap-1 shrink-0">
            <IconButton icon={Download} size="md" accent="primary" className="border border-outline-variant/40" onClick={async () => {
              const paths = project.scenes.flatMap(s => s.fragments.map(f => f.audioFileName)).filter(Boolean) as string[]
              if (paths.length === 0) { onShowNotification('Нет аудио', 'error'); return }
              try {
                const outPath = `${getProjectPath(project)}/assets/voice/Project_${project.name}_Full.wav`
                const { error } = await fetchClient.POST('/api/v1/audio/concat', { body: { audio_paths: paths, output_path: outPath } })
                if (error) throw new Error(apiErrorMessage(error))
                const a = document.createElement('a')
                a.href = `${API}/api/v1/render/media?path=${encodeURIComponent(outPath)}`
                a.download = `Full_Audio_${project.name}.wav`
                document.body.appendChild(a)
                a.click()
                a.remove()
              } catch { onShowNotification('Сбой скачивания', 'error') }
            }} title="Скачать все аудио проекта одним файлом" />
            <IconButton icon={Trash2} size="md" accent="error" className="border border-outline-variant/40" onClick={onResetAudio} title="Сбросить все аудио" />
          </div>
        </div>
      </section>
      <div className="h-px bg-on-surface/5" />

      {/* Background Music Section */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center bg-secondary/10 p-2 rounded-lg border border-secondary/20 gap-2">
          <span className="font-label text-xs uppercase tracking-wide text-secondary flex items-center gap-1.5 truncate">
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
        <div className="p-3 bg-surface-container-lowest/40 border border-outline-variant/20 rounded-xl flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-on-surface-variant truncate max-w-[var(--layout-label)]">{project.backgroundMusic?.trackName || 'Не выбран'}</span>
            <Button variant="link" onClick={() => onOpenMusicLibrary?.()} className="shrink-0">Изменить</Button>
          </div>
          <Button variant="secondary" onClick={() => onOpenMusicSettings?.()} className="w-full text-xs py-1.5 font-medium">
            <SlidersHorizontal size={14} className="mr-1.5" /> Настроить Ducking & EQ
          </Button>
        </div>
      </section>
      <div className="h-px bg-on-surface/5" />

      {/* Sync Section */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center bg-secondary/10 p-2 rounded-lg border border-secondary/20 gap-2">
          <span className="font-label text-xs uppercase tracking-wide text-secondary flex items-center gap-1.5 truncate"><AlignStartVertical size={16}/> Синхронизация</span>
          <div className="flex items-center gap-2 shrink-0">
            {project.scenes.some(s => s.fragments.some(f => f.startTime !== undefined)) && (
              <IconButton icon={RotateCcw} accent="error" className="bg-error/10 border border-error/30" onClick={onResetAllSync} title="Сбросить все тайминги" />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2.5 p-3 bg-surface-container-lowest/40 border border-outline-variant/20 rounded-xl">
          <div className="flex items-center justify-between gap-2 text-xs text-on-surface-variant">
            <span className="flex-1 leading-tight">WhisperX ИИ</span>
            <Switch checked={useWhisper} onChange={onChangeUseWhisper} />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-on-surface-variant">
            <span className="flex-1 leading-tight">Авто-освобождение VRAM</span>
            <Switch checked={autoOffloadVram} onChange={onChangeAutoOffloadVram} />
          </div>
          <Button variant="link" icon={Cpu} onClick={onUnloadVram} className="mt-1 self-start">Очистить VRAM вручную</Button>
        </div>
        <Button variant="dashed" disabled={isSyncing} onClick={onRunSync} className="h-auto py-2 leading-tight">{isSyncing ? <Spinner /> : 'Синхронизировать тайминги'}</Button>
      </section>
      <div className="h-px bg-on-surface/5" />

      {/* Mastering Section */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center bg-warning/10 p-2 rounded-lg border border-warning/20 gap-2">
          <span className="font-label text-xs uppercase tracking-wide text-warning flex items-center gap-1.5 truncate"><AudioLines size={16}/> Мастеринг аудио</span>
          <SegmentedControl
            value={processScope}
            onChange={setProcessScope}
            options={[
              { value: 'scene', label: 'Сцена', accent: 'warning' },
              { value: 'project', label: 'Проект', accent: 'warning' },
            ]}
            className="shrink-0"
          />
        </div>
        <Button variant="dashed" onClick={() => onProcessAudio('lavasr', processScope)} disabled={isGeneratingAudio} className="text-xs border-primary/30 hover:border-primary/60 hover:bg-primary/10 hover:text-primary h-auto py-2 leading-tight justify-center md:justify-start text-center md:text-left">
          ✨ LavaSR 48kHz (AI BWE Апскейл)
        </Button>
        <Button variant="dashed" onClick={() => onProcessAudio('mastering', processScope)} disabled={isGeneratingAudio} className="text-xs border-outline-variant/40 hover:border-warning/50 hover:bg-warning/10 hover:text-warning h-auto py-2 leading-tight justify-center md:justify-start text-center md:text-left">🎙️ Мастеринг (EQ + Normalize)</Button>
        <Button variant="dashed" onClick={() => onProcessAdvancedSilence?.(processScope)} disabled={isGeneratingAudio} className="text-xs border-outline-variant/40 hover:border-secondary/50 hover:bg-secondary/10 hover:text-secondary h-auto py-2 leading-tight justify-center md:justify-start text-center md:text-left">✂️ Умная обрезка пауз (Pydub)</Button>
      </section>
    </>
  )
}
