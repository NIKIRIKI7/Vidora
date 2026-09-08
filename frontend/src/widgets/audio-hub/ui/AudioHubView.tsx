import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  Button,
  Input,
  Slider,
  Switch,
  Select,
  Spinner,
  VoiceTagToolbar,
  useVoiceTagInserter,
} from '@shared/ui'
import {
  ArrowLeft,
  Mic,
  Play,
  RefreshCw,
  Cpu,
  Sparkles,
  Wand2,
  Upload,
  SlidersHorizontal,
  Trash2,
  Dices,
  ChevronDown,
  FileAudio,
  Cloud,
  Server,
} from 'lucide-react'
import { useNotificationStore } from '@entities/project'
import { API } from '@shared/lib'
import {
  voiceApi,
  type SpeakerProfileDto,
  type AiModelDto,
  type VoiceMode,
  type AlignmentEngineType,
  type TimedWord,
  type VoiceEngineInfoDto,
} from '@shared/api/voice'

type StudioAction = 'synthesize' | 'design' | 'clone'

const RANDOM_PRESETS = [
  'male, middle-aged, low pitch, russian accent',
  'female, young adult, high pitch, russian accent',
  'male, young adult, moderate pitch, russian accent',
  'female, middle-aged, moderate pitch, british accent',
  'female, whisper, low pitch, american accent',
  'male, elderly, low pitch, american accent',
]

export const AudioHubView = ({ onBack }: { onBack: () => void }) => {
  const showNotification = useNotificationStore((s) => s.showNotification)

  // 1. Данные дикторов и моделей
  const [speakers, setSpeakers] = useState<SpeakerProfileDto[]>([])
  const [aiModels, setAiModels] = useState<AiModelDto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 1b. Список движков и выбранные движки для clone/design
  const [engines, setEngines] = useState<VoiceEngineInfoDto[]>([])
  const [cloneEngine, setCloneEngine] = useState<string>('')
  const [designEngine, setDesignEngine] = useState<string>('')

  // 2. Текущее действие студии
  const [activeAction, setActiveAction] = useState<StudioAction>('synthesize')

  // 3. Выбор диктора и фильтрация среды
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null)
  const [activeEnv, setActiveEnv] = useState<VoiceMode>('local')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'BuiltIn' | 'custom'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Диагностическое выпадающее меню в шапке
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const statusMenuRef = useRef<HTMLDivElement>(null)

  // 4. Параметры инференса (Инспектор справа)
  const [guidanceScale, setGuidanceScale] = useState(3.0)
  const [numSteps, setNumSteps] = useState(32)
  const [speed, setSpeed] = useState(1.0)
  const [pitch, setPitch] = useState(1.0)
  const [enableDenoise, setEnableDenoise] = useState(true)
  const [alignmentEngine, setAlignmentEngine] = useState<AlignmentEngineType>('Whisper')

  // 5. Синтез речи (Playground)
  const [testText, setTestText] = useState(
    'Добро пожаловать в Vidora Voice Studio! Это тест звукового движка.'
  )
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [audioResultUrl, setAudioResultUrl] = useState<string | null>(null)
  const [audioDuration, setAudioDuration] = useState<number | null>(null)
  const [timedWords, setTimedWords] = useState<TimedWord[]>([])
  const textEditorRef = useRef<HTMLTextAreaElement>(null)
  const { insertTag, toggleCaps, hasSelection } = useVoiceTagInserter(textEditorRef)

  // 6. Форма Voice Design (Конструктор)
  const [designName, setDesignName] = useState('')
  const [designPrompt, setDesignPrompt] = useState(RANDOM_PRESETS[0])
  const [isDesigning, setIsDesigning] = useState(false)

  // 7. Форма Voice Clone (Клонирование)
  const [cloneName, setCloneName] = useState('')
  const [cloneMode, setCloneMode] = useState<VoiceMode>('local')
  const [cloneFile, setCloneFile] = useState<File | null>(null)
  const [cloneRefText, setCloneRefText] = useState('')
  const [isCloning, setIsCloning] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  // Загрузка данных
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    else setIsRefreshing(true)

    try {
      const [models, profiles, fetchedEngines] = await Promise.all([
        voiceApi.getAiModels(),
        voiceApi.getSpeakerProfiles(),
        voiceApi.getEngines(),
      ])
      setAiModels(models)
      setSpeakers(profiles)
      setEngines(fetchedEngines)

      const localClone =
        fetchedEngines.find((e) => e.mode === 'local' && e.supports_clone && e.is_available) ||
        fetchedEngines.find((e) => e.mode === 'local' && e.supports_clone)
      if (localClone) setCloneEngine(localClone.id)
      const design =
        fetchedEngines.find((e) => e.supports_design && e.is_available) ||
        fetchedEngines.find((e) => e.supports_design)
      if (design) setDesignEngine(design.id)

      setSelectedSpeakerId((prev) => {
        if (prev && profiles.some((p) => p.speaker_id === prev)) return prev
        if (profiles.length === 0) return null
        const firstLocal = profiles.find((p) => p.mode === 'local')
        return firstLocal ? firstLocal.speaker_id : profiles[0].speaker_id
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showNotification(`Ошибка связи с бэкендом: ${msg}`, 'error')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [showNotification])

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData()
    }, 0)
    return () => clearTimeout(t)
  }, [loadData])

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

  // Активный диктор
  const activeSpeaker = useMemo(() => {
    return (
      speakers.find((s) => s.speaker_id === selectedSpeakerId) ||
      speakers.find((s) => s.mode === activeEnv) ||
      speakers[0] ||
      null
    )
  }, [speakers, selectedSpeakerId, activeEnv])

  // Фильтрация дикторов каталога
  const filteredSpeakers = useMemo(() => {
    return speakers.filter((s) => {
      const matchesEnv = s.mode === activeEnv
      const matchesCategory =
        categoryFilter === 'all'
          ? true
          : categoryFilter === 'BuiltIn'
          ? s.source_type === 'BuiltIn'
          : s.source_type !== 'BuiltIn'

      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.speaker_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.description || '').toLowerCase().includes(searchQuery.toLowerCase())

      return matchesEnv && matchesCategory && matchesSearch
    })
  }, [speakers, activeEnv, categoryFilter, searchQuery])

  // Локальные модели и статус готовности
  const localModels = useMemo(
    () => aiModels.filter((m) => m.category === 'Tts' || m.category === 'Stt'),
    [aiModels]
  )
  const isLocalGpuReady = useMemo(
    () =>
      aiModels.some((m) => m.id.includes('omnivoice') && m.status === 'Ready') ||
      engines.some((e) => e.mode === 'local' && e.is_available),
    [aiModels, engines]
  )

  // Динамическая фильтрация движков по среде и возможностям (из бэкенда)
  const availableCloneEngines = useMemo(
    () => engines.filter((e) => e.mode === cloneMode && e.supports_clone),
    [engines, cloneMode]
  )
  const availableDesignEngines = useMemo(
    () => engines.filter((e) => e.supports_design),
    [engines]
  )

  // Запуск синтеза
  const handleSynthesize = async () => {
    if (!activeSpeaker || !testText.trim()) return
    setIsSynthesizing(true)
    setAudioResultUrl(null)
    setAudioDuration(null)
    setTimedWords([])

    try {
      const result = await voiceApi.synthesize({
        text: testText.trim(),
        mode: activeSpeaker.mode,
        speaker_id: activeSpeaker.speaker_id,
        speed,
        pitch,
        guidance_scale: guidanceScale,
        num_steps: numSteps,
        alignment_engine: alignmentEngine,
        backend_engine: activeSpeaker.backend_engine,
      })

      if (result.audio_path) {
        const streamUrl = `${API}/api/v1/render/media?path=${encodeURIComponent(result.audio_path)}`
        setAudioResultUrl(streamUrl)
        setAudioDuration(result.duration_seconds || null)
        setTimedWords(result.words || [])
        showNotification(
          `Синтез завершен (${result.duration_seconds?.toFixed(2)} с, слов: ${result.words?.length || 0})`,
          'success'
        )
      } else {
        throw new Error('Файл аудиозаписи не сформирован')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showNotification(`Ошибка синтеза: ${msg}`, 'error')
    } finally {
      setIsSynthesizing(false)
    }
  }

  // Очистка VRAM
  const handleUnloadVram = async () => {
    try {
      await voiceApi.unloadVram()
      showNotification('VRAM память видеокарты очищена', 'success')
      await loadData(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showNotification(`Ошибка очистки VRAM: ${msg}`, 'error')
    }
  }

  // Смена среды клонирования с переключением движка (сначала готовые к работе)
  const handleCloneModeChange = (mode: VoiceMode) => {
    setCloneMode(mode)
    const availableForMode = engines.filter((e) => e.mode === mode && e.supports_clone)
    if (availableForMode.length > 0) {
      const ready = availableForMode.find((e) => e.is_available) || availableForMode[0]
      setCloneEngine(ready.id)
    } else {
      setCloneEngine('')
    }
  }

  // Создание дизайна голоса
  const handleCreateDesign = async () => {
    if (!designName.trim()) {
      showNotification('Укажите имя нового голоса', 'error')
      return
    }
    if (!designPrompt.trim()) {
      showNotification('Опишите тембр голоса (prompt)', 'error')
      return
    }
    setIsDesigning(true)
    try {
      const profile = await voiceApi.designSpeaker({
        name: designName.trim(),
        engine: 'LocalTts',
        prompt: designPrompt.trim(),
        local_engine_id: designEngine || undefined,
      })
      showNotification(`Голос "${profile.name}" успешно задизайнен!`, 'success')
      setDesignName('')
      setActiveEnv('local')
      setActiveAction('synthesize')
      await loadData(true)
      setSelectedSpeakerId(profile.speaker_id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showNotification(`Ошибка создания дизайна: ${msg}`, 'error')
    } finally {
      setIsDesigning(false)
    }
  }

  // Клонирование голоса
  const handleCreateClone = async () => {
    if (!cloneName.trim()) {
      showNotification('Укажите название клонированного голоса', 'error')
      return
    }
    if (!cloneFile) {
      showNotification('Выберите аудиофайл референса (WAV/MP3)', 'error')
      return
    }
    setIsCloning(true)
    try {
      const profile = await voiceApi.cloneSpeaker(
        cloneName.trim(),
        cloneMode,
        cloneFile,
        cloneRefText.trim() || undefined,
        'ru-RU',
        cloneEngine
      )
      showNotification(`Голос "${profile.name}" успешно клонирован!`, 'success')
      setCloneName('')
      setCloneFile(null)
      setCloneRefText('')
      setActiveEnv(cloneMode)
      setActiveAction('synthesize')
      await loadData(true)
      setSelectedSpeakerId(profile.speaker_id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showNotification(`Ошибка клонирования: ${msg}`, 'error')
    } finally {
      setIsCloning(false)
    }
  }

  // Удаление диктора
  const handleDeleteSpeaker = async (id: string, name: string) => {
    if (!window.confirm(`Удалить диктора "${name}"?`)) return
    try {
      await voiceApi.deleteSpeaker(id)
      showNotification(`Диктор "${name}" удален`, 'info')
      await loadData(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showNotification(`Ошибка удаления: ${msg}`, 'error')
    }
  }

  return (
    <div className="flex flex-col h-dvh w-full bg-surface text-on-surface overflow-hidden select-none">
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 1. Минималистичная верхняя панель (Хедер) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <header className="h-14 shrink-0 border-b border-white/10 bg-surface-container-lowest/80 backdrop-blur-xl px-6 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <Button variant="icon" icon={ArrowLeft} onClick={onBack} className="p-1.5" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
              <Mic size={15} className="text-primary" />
            </div>
            <span className="font-bold text-sm text-white tracking-tight">Voice Studio</span>
          </div>
        </div>

        {/* Четкий переключатель главных действий */}
        <div className="flex bg-surface-container-lowest border border-white/10 p-1 rounded-xl shadow-inner">
          <button
            type="button"
            onClick={() => setActiveAction('synthesize')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeAction === 'synthesize'
                ? 'bg-primary/20 text-primary border border-primary/30 shadow-sm'
                : 'text-on-surface-variant hover:text-white'
            }`}
          >
            <Play size={13} className="fill-current" /> Озвучка &amp; Тест
          </button>
          <button
            type="button"
            onClick={() => setActiveAction('design')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeAction === 'design'
                ? 'bg-secondary/20 text-secondary border border-secondary/30 shadow-sm'
                : 'text-on-surface-variant hover:text-white'
            }`}
          >
            <Wand2 size={13} /> Voice Design
          </button>
          <button
            type="button"
            onClick={() => setActiveAction('clone')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeAction === 'clone'
                ? 'bg-accent/20 text-accent border border-accent/30 shadow-sm'
                : 'text-on-surface-variant hover:text-white'
            }`}
          >
            <Upload size={13} /> Voice Clone
          </button>
        </div>

        {/* Правый блок: компактный индикатор нейросетей */}
        <div className="flex items-center gap-2 relative" ref={statusMenuRef}>
          <button
            type="button"
            onClick={() => setIsStatusOpen(!isStatusOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${
              isLocalGpuReady
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isLocalGpuReady ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'
              }`}
            />
            <span>{isLocalGpuReady ? 'GPU Ready' : 'GPU Offline'}</span>
            <ChevronDown size={14} className="opacity-70" />
          </button>

          <Button
            variant="ghost"
            onClick={() => loadData(true)}
            className="p-1.5 text-on-surface-variant hover:text-white"
            title="Обновить статусы"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </Button>

          {/* Диагностическое окно */}
          {isStatusOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-surface-container border border-white/15 rounded-2xl p-4 shadow-2xl z-50 flex flex-col gap-3 text-xs animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-bold text-white uppercase text-[11px] font-mono">
                  Локальные модели
                </span>
                <span className="text-secondary font-mono text-[10px]">
                  Готово: {localModels.filter((m) => m.status === 'Ready').length}/{localModels.length}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {localModels.map((m) => {
                  const isReady = m.status === 'Ready'
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-surface-container-lowest border border-white/5"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-[11px]">{m.name.split(' ')[0]}</span>
                        <span className="text-[10px] text-on-surface-variant font-mono">
                          {m.category === 'Stt' ? 'Whisper STT' : 'TTS Модель'}
                        </span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                          isReady
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-white/5 text-on-surface-variant/60 border-white/10'
                        }`}
                      >
                        {isReady ? 'Готов' : 'Нет файлов'}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="pt-2 border-t border-white/10">
                <Button
                  variant="ghost"
                  onClick={handleUnloadVram}
                  className="w-full text-xs text-secondary border border-secondary/20 hover:bg-secondary/10 py-1.5"
                >
                  <Cpu size={13} className="mr-1.5" /> Очистить память VRAM
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 2. Рабочая область (3 колонки) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ЛЕВАЯ КОЛОНКА: Каталог дикторов (310px) */}
        <aside className="w-[310px] shrink-0 border-r border-white/10 bg-surface-container-lowest/40 flex flex-col">
          {/* Разграничение: Локально vs Облако */}
          <div className="p-3 border-b border-white/5 flex flex-col gap-2.5">
            <Input
              placeholder="Поиск диктора..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs py-1.5"
            />

            {/* Главные вкладки среды */}
            <div className="flex bg-surface-container-lowest border border-white/10 p-0.5 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setActiveEnv('local')}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  activeEnv === 'local'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                    : 'text-on-surface-variant hover:text-white'
                }`}
              >
                <Server size={13} /> Локальные
              </button>
              <button
                type="button"
                onClick={() => setActiveEnv('cloud')}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  activeEnv === 'cloud'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm'
                    : 'text-on-surface-variant hover:text-white'
                }`}
              >
                <Cloud size={13} /> Облачные
              </button>
            </div>

            {/* Под-фильтр категорий */}
            <div className="flex gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  categoryFilter === 'all'
                    ? 'bg-white/10 text-white font-bold'
                    : 'text-on-surface-variant hover:text-white'
                }`}
              >
                Все
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('BuiltIn')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  categoryFilter === 'BuiltIn'
                    ? 'bg-secondary/20 text-secondary font-bold'
                    : 'text-on-surface-variant hover:text-white'
                }`}
              >
                Заготовки
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('custom')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  categoryFilter === 'custom'
                    ? 'bg-accent/20 text-accent font-bold'
                    : 'text-on-surface-variant hover:text-white'
                }`}
              >
                Мои профили
              </button>
            </div>
          </div>

          {/* Список дикторов */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
            {isLoading ? (
              <div className="flex justify-center p-8 text-xs text-on-surface-variant">
                <Spinner className="w-5 h-5" />
              </div>
            ) : filteredSpeakers.length === 0 ? (
              <div className="text-center text-xs text-on-surface-variant/60 py-10">
                Дикторы не найдены
              </div>
            ) : (
              filteredSpeakers.map((spk) => {
                const isSelected = activeSpeaker?.speaker_id === spk.speaker_id
                const isLocal = spk.mode === 'local'

                return (
                  <div
                    key={spk.id}
                    onClick={() => {
                      setSelectedSpeakerId(spk.speaker_id)
                      setActiveAction('synthesize')
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 group ${
                      isSelected
                        ? 'bg-primary/15 border-primary shadow-[0_0_15px_rgba(221,183,255,0.12)]'
                        : 'bg-surface-container/40 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                            isLocal
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-sky-500/20 text-sky-300'
                          }`}
                        >
                          {spk.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-xs text-white truncate group-hover:text-primary transition-colors">
                            {spk.name}
                          </span>
                          <span className="text-[10px] font-mono text-on-surface-variant/70 truncate">
                            {spk.speaker_id}
                          </span>
                        </div>
                      </div>

                      {/* Быстрое прослушивание сэмпла */}
                      {spk.preview_audio_path && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const streamUrl = `${API}/api/v1/render/media?path=${encodeURIComponent(
                              spk.preview_audio_path!
                            )}`
                            const audio = new Audio(streamUrl)
                            audio.play().catch(() => {})
                          }}
                          className="p-1 rounded bg-white/5 hover:bg-primary text-on-surface-variant hover:text-black transition-colors shrink-0"
                          title="Прослушать сэмпл"
                        >
                          <Play size={11} className="fill-current" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-white/5 text-on-surface-variant/60">
                      <span className={isLocal ? 'text-emerald-300/80' : 'text-sky-300/80'}>
                        {isLocal ? 'Локально (GPU)' : 'Облако (API)'}
                      </span>
                      <span>
                        {spk.language} • {spk.gender || 'Universal'}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* ЦЕНТРАЛЬНАЯ КОЛОНКА: Рабочая студия */}
        <main className="flex-1 flex flex-col bg-surface-container-lowest/30 overflow-y-auto custom-scrollbar p-6">
          <div className="max-w-3xl mx-auto w-full flex flex-col gap-6">
            {/* РЕЖИМ 1: ОЗВУЧКА & СИНТЕЗ (PLAYGROUND) */}
            {activeAction === 'synthesize' && activeSpeaker && (
              <>
                {/* Карточка активного диктора */}
                <div className="p-5 bg-surface-container/60 rounded-2xl border border-white/10 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-primary/30 to-secondary/30 border border-white/10 flex items-center justify-center text-lg font-bold text-white shrink-0">
                      {activeSpeaker.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-white">{activeSpeaker.name}</h2>
                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                            activeSpeaker.mode === 'local'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                          }`}
                        >
                          {activeSpeaker.mode === 'local' ? 'Локальный GPU' : 'Облако API'}
                        </span>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-on-surface-variant border border-white/10">
                          {activeSpeaker.source_type}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {activeSpeaker.description || 'Базовый диктор платформы Vidora.'}
                      </p>
                    </div>
                  </div>

                  {!activeSpeaker.is_default && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSpeaker(activeSpeaker.id, activeSpeaker.name)}
                      className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                      title="Удалить диктора"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {/* Редактор текста с интонационными тегами */}
                <div className="bg-surface-container/40 border border-primary/20 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                      <Mic size={14} className="text-primary" /> Текст для синтеза
                    </span>
                    <span className="text-[11px] font-mono text-secondary">
                      Диктор: <b className="text-white">{activeSpeaker.speaker_id}</b>
                    </span>
                  </div>

                  <VoiceTagToolbar
                    onInsertTag={insertTag}
                    onToggleCaps={toggleCaps}
                    hasSelection={hasSelection}
                    className="w-full"
                  />

                  <textarea
                    ref={textEditorRef}
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    rows={3}
                    className="w-full bg-surface-container-lowest border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-primary/50 font-sans leading-relaxed resize-none shadow-inner"
                    placeholder="Введите текст для озвучки диктором..."
                  />

                  {/* Кнопка запуска синтеза */}
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <Button
                      variant="primary"
                      onClick={handleSynthesize}
                      disabled={isSynthesizing || !testText.trim()}
                      className="py-2.5 px-6 text-xs font-bold flex items-center gap-2 shadow-lg shadow-primary/20"
                    >
                      {isSynthesizing ? (
                        <>
                          <Spinner className="w-3.5 h-3.5" /> Синтез речи...
                        </>
                      ) : (
                        <>
                          <Play size={14} className="fill-current" /> Озвучить
                        </>
                      )}
                    </Button>

                    {audioResultUrl && (
                      <div className="flex-1 flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-xl border border-secondary/30 animate-in fade-in">
                        <audio src={audioResultUrl} autoPlay controls className="w-full h-7" />
                        {audioDuration && (
                          <span className="text-xs font-mono text-secondary whitespace-nowrap">
                            {audioDuration.toFixed(2)} с
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Пословные таймкоды (Whisper) */}
                  {timedWords.length > 0 && (
                    <div className="pt-3 border-t border-white/5 flex flex-col gap-2">
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider">
                        Пословные таймкоды (Whisper Alignment):
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar">
                        {timedWords.map((w, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-surface-container-lowest border border-white/10 text-[11px] font-mono text-slate-300 hover:border-primary/50 hover:text-primary transition-colors cursor-default"
                            title={`${(w.start_ms / 1000).toFixed(2)}s - ${(w.end_ms / 1000).toFixed(2)}s (Уверенность: ${Math.round(w.confidence * 100)}%)`}
                          >
                            {w.word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* РЕЖИМ 2: VOICE DESIGN (КОНСТРУКТОР ТЕМБРА) */}
            {activeAction === 'design' && (
              <div className="bg-surface-container/40 border border-secondary/20 rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
                <div className="border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Wand2 size={16} className="text-secondary" />
                    <h3 className="font-bold text-sm text-white uppercase tracking-wider">
                      Конструктор тембра (Voice Design — Локально)
                    </h3>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Сгенерируйте уникальный голос по текстовому описанию без аудиозаписи. Нейросеть
                    OmniVoice создаст акустический вектор прямо на видеокарте.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Динамический выбор движка дизайна с бэкенда */}
                  <div className="space-y-1.5 bg-surface-container-lowest/60 p-3.5 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-semibold text-slate-300">Движок генерации тембра</label>
                      <span className="text-[10px] font-mono text-secondary">
                        {availableDesignEngines.length > 0
                          ? `${availableDesignEngines.length} доступно`
                          : 'Нет движков'}
                      </span>
                    </div>
                    <Select
                      value={designEngine}
                      onChange={(e) => setDesignEngine(e.target.value)}
                      className="text-xs py-2 bg-surface-container-lowest"
                    >
                      {availableDesignEngines.map((eng) => (
                        <option key={eng.id} value={eng.id} disabled={!eng.is_available}>
                          {eng.name}{' '}
                          {!eng.is_available
                            ? `(Недоступен: ${eng.status_message || 'нет весов'})`
                            : '✓ Готов'}
                        </option>
                      ))}
                    </Select>
                    {engines.find((e) => e.id === designEngine)?.description && (
                      <p className="text-[11px] text-on-surface-variant/70 leading-relaxed">
                        {engines.find((e) => e.id === designEngine)?.description}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Имя нового голоса</label>
                    <Input
                      value={designName}
                      onChange={(e) => setDesignName(e.target.value)}
                      placeholder="Например: Дип-нарратор"
                      className="text-xs py-2"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-slate-300">
                        Промпт тембра и характера (свободный текст)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDesignPrompt(
                            RANDOM_PRESETS[Math.floor(Math.random() * RANDOM_PRESETS.length)]
                          )
                        }
                        className="text-[11px] text-secondary hover:underline flex items-center gap-1"
                      >
                        <Dices size={13} /> Случайный пресет
                      </button>
                    </div>
                    <textarea
                      value={designPrompt}
                      onChange={(e) => setDesignPrompt(e.target.value)}
                      rows={3}
                      className="w-full bg-surface-container-lowest border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-secondary font-mono leading-relaxed"
                      placeholder="Например: male, low pitch, russian accent"
                    />
                    <div className="text-[10px] text-on-surface-variant/60 leading-relaxed bg-black/20 p-2 rounded-lg border border-white/5 mt-1">
                      <b>Допустимые теги (через запятую):</b><br/>
                      <b>Пол/Возраст:</b> male, female, child, teenager, young adult, middle-aged, elderly<br/>
                      <b>Голос:</b> whisper, very low pitch, low pitch, moderate pitch, high pitch, very high pitch<br/>
                      <b>Акцент:</b> russian accent, american accent, british accent и др.
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 flex justify-end">
                  <Button
                    variant="primary"
                    onClick={handleCreateDesign}
                    disabled={isDesigning || !designPrompt.trim()}
                    className="px-6 py-2 text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-secondary to-primary text-black"
                  >
                    {isDesigning ? <Spinner className="w-3.5 h-3.5" /> : <Sparkles size={14} />}
                    Сгенерировать профиль
                  </Button>
                </div>
              </div>
            )}

            {/* РЕЖИМ 3: VOICE CLONE (КЛОНИРОВАНИЕ) */}
            {activeAction === 'clone' && (
              <div className="bg-surface-container/40 border border-accent/20 rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
                <div className="border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Upload size={16} className="text-accent" />
                    <h3 className="font-bold text-sm text-white uppercase tracking-wider">
                      Клонирование голоса по аудио (Voice Clone)
                    </h3>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Создание цифрового клона голоса по короткому аудио-сэмплу (5–15 секунд чистой речи).
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Название голоса</label>
                    <Input
                      value={cloneName}
                      onChange={(e) => setCloneName(e.target.value)}
                      placeholder="Например: Мой студийный микрофон"
                      className="text-xs py-2"
                    />
                  </div>

                  {/* Четкий выбор: Локально или Облако */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs text-on-surface-variant">Среда клонирования</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleCloneModeChange('local')}
                          className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                            cloneMode === 'local'
                              ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-sm'
                              : 'bg-surface-container-lowest border-white/10 text-on-surface-variant'
                          }`}
                        >
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            <Server size={13} className="text-emerald-400" /> Локально (GPU)
                          </span>
                          <span className="text-[10px] opacity-70">Бесплатно на вашей видеокарте</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloneModeChange('cloud')}
                          className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                            cloneMode === 'cloud'
                              ? 'bg-sky-500/20 border-sky-500 text-white shadow-sm'
                              : 'bg-surface-container-lowest border-white/10 text-on-surface-variant'
                          }`}
                        >
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            <Cloud size={13} className="text-sky-400" /> В облаке (API)
                          </span>
                          <span className="text-[10px] opacity-70">Высокоточный облачный клон</span>
                        </button>
                      </div>
                    </div>

                    {/* Динамический выбор движка, полученного с бэкенда */}
                    <div className="space-y-1.5 bg-surface-container-lowest/60 p-3 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-semibold text-slate-300">Движок клонирования</label>
                        <span className="text-[10px] font-mono text-secondary">
                          {availableCloneEngines.length > 0
                            ? `${availableCloneEngines.length} доступно`
                            : 'Нет движков'}
                        </span>
                      </div>
                      <Select
                        value={cloneEngine}
                        onChange={(e) => setCloneEngine(e.target.value)}
                        className="text-xs py-2 bg-surface-container-lowest"
                      >
                        {availableCloneEngines.map((eng) => (
                          <option key={eng.id} value={eng.id} disabled={!eng.is_available}>
                            {eng.name}{' '}
                            {!eng.is_available
                              ? `(Недоступен: ${eng.status_message || 'настройте модель'})`
                              : '✓ Готов к работе'}
                          </option>
                        ))}
                      </Select>
                      {engines.find((e) => e.id === cloneEngine)?.description && (
                        <p className="text-[11px] text-on-surface-variant/70 leading-relaxed">
                          {engines.find((e) => e.id === cloneEngine)?.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Выбор файла */}
                  <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">
                      Аудиофайл образца (.wav / .mp3)
                    </label>
                    <input
                      type="file"
                      ref={uploadInputRef}
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && setCloneFile(e.target.files[0])}
                    />
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      className="w-full p-4 rounded-xl border border-dashed border-accent/40 hover:bg-accent/10 text-accent transition-all flex items-center justify-center gap-2 text-xs font-semibold"
                    >
                      <FileAudio size={16} />
                      {cloneFile ? cloneFile.name : 'Выбрать аудиофайл (5–15 сек)'}
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-on-surface-variant">
                      Текст из аудиофайла (опционально)
                    </label>
                    <textarea
                      value={cloneRefText}
                      onChange={(e) => setCloneRefText(e.target.value)}
                      rows={2}
                      placeholder="Оставьте пустым или укажите текст, который звучит в файле..."
                      className="w-full bg-surface-container-lowest border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 flex justify-end">
                  <Button
                    variant="primary"
                    onClick={handleCreateClone}
                    disabled={isCloning || !cloneName.trim() || !cloneFile}
                    className="px-6 py-2 text-xs font-bold"
                  >
                    {isCloning ? <Spinner className="w-3.5 h-3.5 mr-1" /> : null}
                    Клонировать голос
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ПРАВАЯ КОЛОНКА: Инспектор параметров инференса (280px) */}
        <aside className="w-[280px] shrink-0 border-l border-white/10 bg-surface-container-lowest/40 flex flex-col p-4 gap-5 overflow-y-auto custom-scrollbar">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
              <SlidersHorizontal size={14} className="text-secondary" /> Параметры инференса
            </span>
          </div>

          {/* Параметры диффузии (Scale & Steps) */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Guidance Scale (CFG)</span>
                <span className="font-mono text-secondary font-bold">{guidanceScale.toFixed(1)}</span>
              </div>
              <Slider
                min={1.0}
                max={5.0}
                step={0.1}
                value={guidanceScale}
                onChange={(e) => setGuidanceScale(Number(e.target.value))}
              />
              <span className="text-[10px] text-on-surface-variant/60 leading-tight">
                Сила следования заданному тембру
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Шаги диффузии (Steps)</span>
                <span className="font-mono text-primary font-bold">{numSteps}</span>
              </div>
              <Slider
                min={16}
                max={64}
                step={2}
                value={numSteps}
                onChange={(e) => setNumSteps(Number(e.target.value))}
              />
              <span className="text-[10px] text-on-surface-variant/60 leading-tight">
                Детализация звуковой волны (16 — быстро, 32 — оптимум)
              </span>
            </div>

            {/* Скорость */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Скорость речи</span>
                <span className="font-mono text-white font-bold">{speed.toFixed(2)}x</span>
              </div>
              <Slider
                min={0.5}
                max={2.0}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </div>

            {/* Высота тона */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Высота тона (Pitch)</span>
                <span className="font-mono text-white font-bold">{pitch.toFixed(2)}x</span>
              </div>
              <Slider
                min={0.7}
                max={1.4}
                step={0.05}
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="h-px bg-white/10" />

          {/* Фильтры и DSP */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Фильтры и Мастеринг
            </span>

            <Switch
              label="Шумоподавление (Denoise)"
              checked={enableDenoise}
              onChange={setEnableDenoise}
            />

            <div className="flex flex-col gap-1.5 pt-1">
              <label className="text-xs text-on-surface-variant">Forced Alignment (Слова)</label>
              <Select
                value={alignmentEngine}
                onChange={(e) => setAlignmentEngine(e.target.value as AlignmentEngineType)}
                className="text-xs py-1.5"
              >
                <option value="Whisper">Whisper (Пословные таймкоды)</option>
                <option value="NativeTts">NativeTts (Оценка)</option>
                <option value="Passthrough">Без выравнивания</option>
              </Select>
            </div>
          </div>

          {/* Кнопка сброса */}
          <div className="mt-auto pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                setGuidanceScale(2.0)
                setNumSteps(24)
                setSpeed(1.0)
                setPitch(1.0)
                setEnableDenoise(true)
                setAlignmentEngine('Whisper')
              }}
              className="text-xs text-on-surface-variant hover:text-white transition-colors text-center w-full py-1"
            >
              Сбросить параметры к базовым
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}