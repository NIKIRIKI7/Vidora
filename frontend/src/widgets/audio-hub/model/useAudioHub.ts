import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useVoiceTagInserter } from '@shared/ui'
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
} from '@shared/api'

export type StudioAction = 'synthesize' | 'design' | 'clone'
export type SpeakerCategoryFilter = 'all' | 'BuiltIn' | 'custom'

export const RANDOM_PRESETS = [
  'male, middle-aged, low pitch, russian accent',
  'female, young adult, high pitch, russian accent',
  'male, young adult, moderate pitch, russian accent',
  'female, middle-aged, moderate pitch, british accent',
  'female, whisper, low pitch, american accent',
  'male, elderly, low pitch, american accent',
]

export const useAudioHub = () => {
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
  const [categoryFilter, setCategoryFilter] = useState<SpeakerCategoryFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

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
  const loadData = useCallback(
    async (silent = false) => {
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
    },
    [showNotification]
  )

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData()
    }, 0)
    return () => clearTimeout(t)
  }, [loadData])

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

  // Выбор диктора из каталога
  const handleSelectSpeaker = useCallback((speakerId: string) => {
    setSelectedSpeakerId(speakerId)
    setActiveAction('synthesize')
  }, [])

  // Случайный промпт тембра
  const handleRandomPrompt = useCallback(() => {
    setDesignPrompt(RANDOM_PRESETS[Math.floor(Math.random() * RANDOM_PRESETS.length)])
  }, [])

  // Сброс параметров инференса к базовым
  const handleResetParams = useCallback(() => {
    setGuidanceScale(2.0)
    setNumSteps(24)
    setSpeed(1.0)
    setPitch(1.0)
    setEnableDenoise(true)
    setAlignmentEngine('Whisper')
  }, [])

  return {
    // Данные
    isLoading,
    isRefreshing,
    localModels,
    isLocalGpuReady,
    filteredSpeakers,
    activeSpeaker,
    engines,
    availableCloneEngines,
    availableDesignEngines,
    // Верхняя панель
    activeAction,
    setActiveAction,
    loadData,
    handleUnloadVram,
    // Каталог дикторов
    searchQuery,
    setSearchQuery,
    activeEnv,
    setActiveEnv,
    categoryFilter,
    setCategoryFilter,
    handleSelectSpeaker,
    // Синтез
    testText,
    setTestText,
    textEditorRef,
    insertTag,
    toggleCaps,
    hasSelection,
    isSynthesizing,
    handleSynthesize,
    audioResultUrl,
    audioDuration,
    timedWords,
    handleDeleteSpeaker,
    // Voice Design
    designName,
    setDesignName,
    designPrompt,
    setDesignPrompt,
    designEngine,
    setDesignEngine,
    isDesigning,
    handleCreateDesign,
    handleRandomPrompt,
    // Voice Clone
    cloneName,
    setCloneName,
    cloneMode,
    handleCloneModeChange,
    cloneEngine,
    setCloneEngine,
    cloneFile,
    setCloneFile,
    cloneRefText,
    setCloneRefText,
    isCloning,
    handleCreateClone,
    uploadInputRef,
    // Параметры инференса
    guidanceScale,
    setGuidanceScale,
    numSteps,
    setNumSteps,
    speed,
    setSpeed,
    pitch,
    setPitch,
    enableDenoise,
    setEnableDenoise,
    alignmentEngine,
    setAlignmentEngine,
    handleResetParams,
  }
}
