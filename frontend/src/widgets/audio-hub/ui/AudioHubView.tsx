import { useState, useRef } from 'react'
import { Button, Input, Select, FieldGroup, Slider, Spinner } from '@shared/ui'
import { ArrowLeft, Mic, Plus, Trash2, Upload, Play, AudioLines, BrainCircuit, Wand2, Save, Dices, Sparkles, Wand } from 'lucide-react'
import { useSettingsStore, useNotificationStore, type GlobalVoice } from '@entities/project'
import { API } from '@widgets/editor-workspace/lib/helpers'

const RANDOM_DESIGN_PROMPTS = [
  'Глубокий мужской голос, спокойный, с легкой хрипотцой, рассказывает документальный фильм, русский язык',
  'Энергичный женский голос, радостный, говорит быстро, интонация блогера, русский язык',
  'Низкий мужской голос, уставший, говорит медленно, русский язык',
  'Звонкий женский голос, очень эмоциональный, русский язык',
  'Спокойный женский голос, ASMR, говорит тихо с придыханием, русский язык',
  'Молодой парень, гик, увлеченно рассказывает про программирование, русский язык',
]

export const AudioHubView = ({ onBack }: { onBack: () => void }) => {
  const { globalVoices, setGlobalVoices, taskModes, cloudEngines, localEngines, apiKeys, cloudProvider } = useSettingsStore()
  const showNotification = useNotificationStore(s => s.showNotification)
  const activeApiKeys = {
    ...apiKeys,
    routerai: cloudProvider === 'routerai' ? apiKeys.routerai : undefined,
    aitunnel: cloudProvider === 'aitunnel' ? apiKeys.aitunnel : undefined,
  }

  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(globalVoices[0]?.id || null)
  const activeVoice = globalVoices.find(v => v.id === activeVoiceId)

  const [search, setSearch] = useState('')

  const [isTesting, setIsTesting] = useState(false)
  const [testText, setTestText] = useState('Всем привет, сегодня мы проверим этот голос в деле.')
  const [testAudioPath, setTestAudioPath] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const isCosyVoice = activeVoice?.ttsEngine.toLowerCase().includes('cosyvoice')

  const [isSwapping, setIsSwapping] = useState(false)
  const [swapOriginalAudio, setSwapOriginalAudio] = useState<string | null>(null)
  const [swapNewAudio, setSwapNewAudio] = useState<string | null>(null)
  const swapInputRef = useRef<HTMLInputElement>(null)

  const handleAddVoice = () => {
    const newId = crypto.randomUUID()
    const newVoice: GlobalVoice = {
      id: newId,
      name: 'Новый голос',
      ttsEngine: taskModes.audio === 'cloud' ? cloudEngines.audio : localEngines.audio,
      voiceModel: 'aria',
      settings: { speed: 1.0, guidanceScale: 3.0, numSteps: 32 }
    }
    setGlobalVoices([...globalVoices, newVoice])
    setActiveVoiceId(newId)
  }

  const updateActiveVoice = (updates: Partial<GlobalVoice>) => {
    if (!activeVoiceId) return
    setGlobalVoices(globalVoices.map(v => v.id === activeVoiceId ? { ...v, ...updates } : v))
  }

  const handleRandomDesignPrompt = () => {
    if (!activeVoice) return
    const prompt = RANDOM_DESIGN_PROMPTS[Math.floor(Math.random() * RANDOM_DESIGN_PROMPTS.length)]
    updateActiveVoice({ designPrompt: prompt })
  }

  const handleUploadRef = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('project_path', 'vidora_projects')
    fd.append('folder', 'refs')
    try {
      const res = await fetch(`${API}/api/v1/media/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.status === 'ok') {
        updateActiveVoice({ refAudioPath: data.path, voiceModel: 'clone' })
        showNotification('Референс загружен!', 'success')
      }
    } catch {
      showNotification('Ошибка загрузки', 'error')
    }
    e.target.value = ''
  }

  const handleDenoiseRef = async () => {
    if (!activeVoice?.refAudioPath) return
    setIsProcessing(true)
    try {
      const res = await fetch(`${API}/api/v1/audio/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_id: 'global_voice',
          audio_path: activeVoice.refAudioPath,
          action: 'enhance',
          project_path: 'vidora_projects'
        })
      })
      const data = await res.json()
      if (data.status === 'ok') {
        showNotification('Шум подавлен!', 'success')
        updateActiveVoice({ refAudioPath: data.processed_audio_path })
      }
    } catch {
      showNotification('Ошибка обработки', 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSaveVoice = async () => {
    if (!activeVoice) return
    if (!activeVoice.name.trim()) {
      showNotification('Укажите имя голоса перед сохранением', 'error'); return
    }

    if (activeVoice.voiceModel === 'clone') {
      if (!activeVoice.refAudioPath) {
        showNotification('Для клонирования необходимо загрузить аудио-референс', 'error'); return
      }
      if (!activeVoice.refText || !activeVoice.refText.trim()) {
        showNotification('Текст референса пуст. Запускаю авто-транскрибацию (Whisper)...', 'info')
        setIsProcessing(true)
        try {
          const res = await fetch(`${API}/api/v1/audio/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_path: activeVoice.refAudioPath, whisper_model: 'small' })
          })
          const data = await res.json()
          if (data.status === 'ok') {
            updateActiveVoice({ refText: data.text })
            showNotification('Голос успешно сохранен и транскрибирован!', 'success')
          } else {
            showNotification('Ошибка транскрибации: ' + data.detail, 'error')
          }
        } catch {
          showNotification('Ошибка сети при транскрибации', 'error')
        } finally {
          setIsProcessing(false)
        }
        return
      }
    } else if (activeVoice.voiceModel === 'design') {
      if (!activeVoice.designPrompt || !activeVoice.designPrompt.trim()) {
        showNotification('Введите промпт для дизайна голоса', 'error'); return
      }
    }
    showNotification('Голос успешно сохранен и готов к работе в проектах!', 'success')
  }

  const handleTestVoice = async () => {
    if (!activeVoice) return
    setIsTesting(true)
    setTestAudioPath(null)
    try {
      const payload = {
        fragment_id: `test_${activeVoice.id}`,
        text: testText,
        voice_model: activeVoice.voiceModel,
        ref_audio_path: activeVoice.refAudioPath ? activeVoice.refAudioPath.split('?')[0] : null,
        ref_text: activeVoice.refText || null,
        design_prompt: activeVoice.designPrompt || null,
        speed: activeVoice.settings.speed,
        guidance_scale: activeVoice.settings.guidanceScale,
        num_steps: activeVoice.settings.numSteps,
        duration: 0.0,
        denoise: true,
        preprocess_prompt: true,
        postprocess_output: true,
        project_path: 'vidora_projects',
        auto_offload_vram: true,
        engine: activeVoice.ttsEngine,
        api_keys: activeApiKeys,
      }

      const res = await fetch(`${API}/api/v1/audio/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok && data.status === 'ok') {
        setTestAudioPath(`${API}/api/v1/render/media?path=${encodeURIComponent('vidora_projects/assets/voice/' + data.audio_url)}`)
      } else {
        showNotification('Ошибка генерации. Проверьте консоль бэкенда.', 'error')
      }
    } catch {
      showNotification('Ошибка связи с API', 'error')
    } finally {
      setIsTesting(false)
    }
  }

  const handleVoiceSwapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('project_path', 'vidora_projects')
    fd.append('folder', 'swaps')
    try {
      const res = await fetch(`${API}/api/v1/media/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (data.status === 'ok') {
        setSwapOriginalAudio(data.path)
        setSwapNewAudio(null)
        showNotification('Аудио для замены загружено', 'success')
      }
    } catch {
      showNotification('Ошибка загрузки', 'error')
    }
    e.target.value = ''
  }

  const handleExecuteVoiceSwap = async () => {
    if (!swapOriginalAudio || !activeVoice) return
    setIsSwapping(true)
    try {
      showNotification('Распознавание оригинального аудио...', 'info')
      const resTrans = await fetch(`${API}/api/v1/audio/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_path: swapOriginalAudio, whisper_model: 'small' })
      })
      const dataTrans = await resTrans.json()
      if (dataTrans.status !== 'ok') throw new Error(dataTrans.detail)

      showNotification('Генерация новым голосом...', 'info')
      const payload = {
        fragment_id: `swap_${activeVoice.id}`,
        text: dataTrans.text,
        voice_model: activeVoice.voiceModel,
        ref_audio_path: activeVoice.refAudioPath ? activeVoice.refAudioPath.split('?')[0] : null,
        ref_text: activeVoice.refText || null,
        design_prompt: activeVoice.designPrompt || null,
        speed: activeVoice.settings.speed,
        guidance_scale: activeVoice.settings.guidanceScale,
        num_steps: activeVoice.settings.numSteps,
        duration: 0.0,
        denoise: true,
        preprocess_prompt: true,
        postprocess_output: true,
        project_path: 'vidora_projects',
        auto_offload_vram: true,
        engine: activeVoice.ttsEngine,
        api_keys: activeApiKeys,
      }
      const resGen = await fetch(`${API}/api/v1/audio/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const dataGen = await resGen.json()
      if (dataGen.status === 'ok') {
        setSwapNewAudio(`${API}/api/v1/render/media?path=${encodeURIComponent('vidora_projects/assets/voice/' + dataGen.audio_url)}`)
        showNotification('Голос успешно заменен!', 'success')
      } else throw new Error(dataGen.detail)
    } catch {
      showNotification('Ошибка замены голоса', 'error')
    } finally {
      setIsSwapping(false)
    }
  }

  const filteredVoices = globalVoices.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-dvh w-full bg-background animate-in fade-in duration-300">
      <div className="w-[320px] shrink-0 border-r border-white/10 bg-surface-container/40 flex flex-col">
        <div className="h-16 border-b border-white/5 flex items-center px-4 gap-3 shrink-0 bg-surface-container-lowest/30">
          <Button variant="icon" icon={ArrowLeft} onClick={onBack} className="p-2" />
          <h1 className="font-title-md text-lg font-bold text-white flex items-center gap-2">
            <Mic size={20} className="text-accent" /> Vidora Audio
          </h1>
        </div>
        <div className="p-4 border-b border-white/5 flex flex-col gap-3">
          <Input placeholder="Поиск голоса..." value={search} onChange={e => setSearch(e.target.value)} className="text-xs" />
          <Button variant="dashed" onClick={handleAddVoice} className="w-full text-xs text-primary border-primary/30 hover:bg-primary/10">
            <Plus size={16} /> Создать новый голос
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 custom-scrollbar">
          {filteredVoices.map(v => (
            <div
              key={v.id}
              onClick={() => setActiveVoiceId(v.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${activeVoiceId === v.id ? 'bg-primary/10 border-primary text-primary shadow-[0_0_15px_rgba(221,183,255,0.1)]' : 'bg-surface-container border-white/5 hover:border-white/20 text-on-surface'}`}
            >
              <span className="font-bold text-sm truncate">{v.name}</span>
              <span className="text-[10px] opacity-60 font-mono truncate">{v.voiceModel === 'clone' ? 'Клонированный' : v.voiceModel} • {v.ttsEngine.split('/').pop()}</span>
            </div>
          ))}
          {filteredVoices.length === 0 && <span className="text-xs text-on-surface-variant text-center mt-4">Голоса не найдены</span>}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-surface-container-lowest/50 overflow-hidden">
        {activeVoice ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
            <div className="max-w-4xl mx-auto flex flex-col gap-8 pb-10">

              <div className="flex justify-between items-center bg-surface-container p-6 rounded-2xl border border-white/5 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-accent" />
                <div className="flex flex-col gap-2 flex-1 pl-4">
                  <input
                    className="bg-transparent font-title-md text-3xl font-black text-white outline-none placeholder-white/30"
                    value={activeVoice.name}
                    onChange={e => updateActiveVoice({ name: e.target.value })}
                    placeholder="Имя голоса"
                  />
                  <div className="flex gap-4 items-center">
                    <span className="text-xs font-mono text-on-surface-variant bg-black/50 px-2 py-1 rounded">ID: {activeVoice.id.slice(0,8)}</span>
                    <button className="text-xs text-error hover:underline flex items-center gap-1" onClick={() => {
                      setGlobalVoices(globalVoices.filter(v => v.id !== activeVoice.id))
                      setActiveVoiceId(null)
                    }}>
                      <Trash2 size={14} /> Удалить голос
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-surface-container/40 p-6 rounded-2xl border border-white/5 flex flex-col gap-5">
                  <h3 className="text-sm font-label uppercase text-primary tracking-wider flex items-center gap-2">
                    <BrainCircuit size={18} /> Движок и Модель
                  </h3>
                  <FieldGroup label="TTS Engine">
                    <Input
                      value={activeVoice.ttsEngine}
                      onChange={e => updateActiveVoice({ ttsEngine: e.target.value })}
                      className="text-xs font-mono"
                      list="tts-engines"
                    />
                    <datalist id="tts-engines">
                      <option value="k2-fsa/OmniVoice" />
                      <option value="fishaudio/s2-pro" />
                      <option value="FunAudioLLM/Fun-CosyVoice3-0.5B" />
                      <option value="qwen-tts/voice-design" />
                      <option value="qwen-tts/clone" />
                      <option value="qwen-tts/custom-voice" />
                      <option value="moss-tts/local" />
                      <option value="minimax/speech-2.8-hd" />
                      <option value="openai/tts-1-hd" />
                    </datalist>
                  </FieldGroup>
                  <FieldGroup label="Voice Model">
                    <Select value={activeVoice.voiceModel} onChange={e => updateActiveVoice({ voiceModel: e.target.value })} className="text-xs font-mono">
                      <optgroup label="Базовые голоса">
                        <option value="aria">aria (OmniVoice)</option>
                        <option value="marcus">marcus (OmniVoice)</option>
                        <option value="nova">nova (OmniVoice/OpenAI)</option>
                        <option value="Russian_ReliableMan">Russian_ReliableMan (MiniMax)</option>
                      </optgroup>
                      <optgroup label="Генерация и Копирование">
                        <option value="clone">Клонирование по аудио (Voice Cloning)</option>
                        <option value="design">Дизайн голоса по промпту (Voice Design)</option>
                      </optgroup>
                    </Select>
                  </FieldGroup>
                </div>

                <div className="bg-surface-container/40 p-6 rounded-2xl border border-white/5 flex flex-col gap-5">
                  <h3 className="text-sm font-label uppercase text-secondary tracking-wider flex items-center gap-2">
                    <AudioLines size={18} /> Настройки инференса
                  </h3>
                  <FieldGroup label={`Скорость (Speed): ${activeVoice.settings.speed.toFixed(2)}x`}>
                    <Slider min={0.5} max={2.0} step={0.05} value={activeVoice.settings.speed} onChange={e => updateActiveVoice({ settings: { ...activeVoice.settings, speed: Number(e.target.value) } })} />
                  </FieldGroup>
                  <FieldGroup label={`Guidance Scale: ${activeVoice.settings.guidanceScale.toFixed(1)}`}>
                    <Slider min={0} max={10} step={0.1} value={activeVoice.settings.guidanceScale} onChange={e => updateActiveVoice({ settings: { ...activeVoice.settings, guidanceScale: Number(e.target.value) } })} />
                  </FieldGroup>
                  <FieldGroup label={`Шаги (Num Steps): ${activeVoice.settings.numSteps}`}>
                    <Slider min={8} max={64} step={1} value={activeVoice.settings.numSteps} onChange={e => updateActiveVoice({ settings: { ...activeVoice.settings, numSteps: Number(e.target.value) } })} />
                  </FieldGroup>
                  {isCosyVoice && (
                    <div className="p-3 bg-black/20 border border-white/5 rounded-lg text-xs text-on-surface-variant font-mono">
                      CosyVoice3 — LLM-движок: Guidance Scale и Steps применяются к diffusion-части (flow-декодер), а стиль/эмоция задаются инструкцией в режиме «Дизайн голоса». Параметры передаются в worker.
                    </div>
                  )}
                </div>
              </div>

              {activeVoice.voiceModel === 'clone' && (
                <div className="bg-surface-container/40 p-6 rounded-2xl border border-warning/30 flex flex-col gap-5 shadow-[0_0_20px_rgba(250,204,21,0.05)]">
                  <h3 className="text-sm font-label uppercase text-warning tracking-wider flex items-center gap-2">
                    <Wand2 size={18} /> Данные для клонирования
                  </h3>
                  <FieldGroup label="Аудио-референс (.wav / .mp3)">
                    <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleUploadRef} />
                    <div className="flex gap-2">
                      <Button variant="secondary" className="text-xs" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> {activeVoice.refAudioPath ? 'Заменить референс' : 'Загрузить файл'}</Button>
                      {activeVoice.refAudioPath && (
                        <Button variant="dashed" className="text-xs text-warning border-warning/50 hover:bg-warning/10" disabled={isProcessing} onClick={handleDenoiseRef}>
                          {isProcessing ? <Spinner /> : 'Удалить шум (AI)'}
                        </Button>
                      )}
                    </div>
                    {activeVoice.refAudioPath && (
                      <div className="mt-3 flex items-center gap-2 bg-black/40 p-2 rounded-lg">
                        <audio src={`${API}/api/v1/render/media?path=${encodeURIComponent(activeVoice.refAudioPath)}`} controls className="h-8 flex-1" />
                      </div>
                    )}
                  </FieldGroup>
                  <FieldGroup label="Текст референса (Опционально)">
                    <textarea
                      className="w-full bg-surface-container-lowest border border-white/10 rounded-lg py-2 px-3 text-sm text-on-surface resize-none focus:border-warning/50"
                      rows={2}
                      value={activeVoice.refText || ''}
                      onChange={e => updateActiveVoice({ refText: e.target.value })}
                      placeholder="Напишите, что именно говорится в аудиофайле (помогает ИИ лучше клонировать интонацию)..."
                    />
                  </FieldGroup>
                  {isCosyVoice && (
                    <FieldGroup label="Инструкция стиля клона (Instruct Text)">
                      <Input
                        value={activeVoice.designPrompt || ''}
                        onChange={e => updateActiveVoice({ designPrompt: e.target.value })}
                        placeholder="Например: Please speak in a happy tone."
                        className="text-xs border-warning/30"
                      />
                    </FieldGroup>
                  )}
                </div>
              )}

              {activeVoice.voiceModel === 'design' && (
                <div className="bg-surface-container/40 p-6 rounded-2xl border border-secondary/30 flex flex-col gap-5 shadow-[0_0_20px_rgba(79,219,200,0.05)]">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-label uppercase text-secondary tracking-wider flex items-center gap-2">
                      <Wand2 size={18} /> Дизайн голоса
                    </h3>
                    <Button variant="dashed" onClick={handleRandomDesignPrompt} className="text-xs text-secondary border-secondary/30 hover:bg-secondary/10 py-1 px-2 h-auto">
                      <Dices size={14} className="mr-1" /> Случайный промпт
                    </Button>
                  </div>
                  <FieldGroup label="Описание голоса (Промпт)">
                    <textarea
                      className="w-full bg-surface-container-lowest border border-white/10 rounded-lg py-2 px-3 text-sm text-on-surface resize-none focus:border-secondary/50"
                      rows={3}
                      value={activeVoice.designPrompt || ''}
                      onChange={e => updateActiveVoice({ designPrompt: e.target.value })}
                      placeholder={isCosyVoice
                        ? "You are a helpful assistant. Please speak with a calm and warm tone."
                        : "Например: Глубокий мужской голос, спокойный, с легкой хрипотцой, подходит для документалок..."}
                    />
                    <p className="text-[10px] text-on-surface-variant mt-2">
                      {isCosyVoice
                        ? "CosyVoice: инструкция на естественном языке (эмоция, скорость, диалект). Токен <|endofprompt|> добавится автоматически."
                        : "OmniVoice: атрибуты через запятую — пол (male/female), возраст, высота (low/high pitch), акцент (british)."}
                    </p>
                  </FieldGroup>
                  <div className="text-[10px] text-on-surface-variant/80 bg-black/20 p-3 rounded-lg border border-white/5 leading-relaxed">
                    💡 <b>Совет для Qwen/Moss 1.7b:</b> модели чувствительны к описанию. Добавляйте «русский язык, четкая дикция» в конец описания, чтобы избежать случайного акцента.
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4 mt-6">
                <Button variant="primary" onClick={handleSaveVoice} className="flex-1 shadow-lg py-3 text-sm" disabled={isProcessing}>
                  <Save size={18} className="mr-1" /> Сохранить и проверить голос
                </Button>
              </div>

              <div className="bg-primary/10 p-6 rounded-2xl border border-primary/20 flex flex-col gap-4 mt-6">
                <h3 className="text-sm font-label uppercase text-primary tracking-wider flex items-center gap-2">
                  <Play size={18} /> Тест-Драйв и Шпаргалка Суфлера
                </h3>
                <div className="text-xs font-mono text-primary/80 bg-black/20 p-3 rounded-lg border border-primary/20 leading-relaxed">
                  <span className="font-bold text-primary">Для MiniMax и OmniVoice:</span><br/>
                  • Эмоция: <code className="bg-black/40 px-1 rounded">[emotion: happy|sad|angry|fearful|disgusted|surprised|calm]</code> в начале.<br/>
                  • Паузы: <code className="bg-black/40 px-1 rounded">&lt;#1.5#&gt;</code> (от 0.1 до 3.0 сек) между словами.<br/>
                  • Звуки: <code className="bg-black/40 px-1 rounded">(breath)</code>, <code className="bg-black/40 px-1 rounded">(sighs)</code>, <code className="bg-black/40 px-1 rounded">(chuckle)</code>, <code className="bg-black/40 px-1 rounded">(laughs)</code>.
                </div>
                <textarea
                  className="w-full bg-surface-container-lowest border border-white/10 rounded-lg py-3 px-4 text-sm text-on-surface resize-none focus:border-primary/50 shadow-inner"
                  rows={2}
                  value={testText}
                  onChange={e => setTestText(e.target.value)}
                  placeholder="Введите текст для проверки голоса..."
                />
                <div className="flex items-center gap-4">
                  <Button variant="primary" onClick={handleTestVoice} disabled={isTesting || !testText.trim()} className="px-8 shadow-lg">
                    {isTesting ? <Spinner /> : 'Озвучить'}
                  </Button>
                  {testAudioPath && (
                    <audio src={testAudioPath} autoPlay controls className="h-10 flex-1" />
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-secondary/5 to-surface-container-lowest p-6 rounded-2xl border border-secondary/20 flex flex-col gap-4 mt-2">
                <h3 className="text-sm font-label uppercase text-secondary tracking-wider flex items-center gap-2">
                  <Sparkles size={18} /> Замена голоса в аудиофайле (Voice Swap)
                </h3>
                <p className="text-xs text-on-surface-variant mb-2">
                  Загрузите аудио с чужим голосом — ИИ распознает текст и переозвучит его текущим активным голосом.
                </p>
                <div className="flex gap-4 items-center">
                  <input type="file" ref={swapInputRef} className="hidden" accept="audio/*" onChange={handleVoiceSwapUpload} />
                  <Button variant="secondary" onClick={() => swapInputRef.current?.click()}>
                    <Upload size={14} className="mr-1" /> Загрузить исходник
                  </Button>
                  {swapOriginalAudio && (
                    <audio src={`${API}/api/v1/render/media?path=${encodeURIComponent(swapOriginalAudio)}`} controls className="h-8 flex-1" />
                  )}
                </div>

                {swapOriginalAudio && (
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
                    <Button variant="dashed" onClick={handleExecuteVoiceSwap} disabled={isSwapping} className="border-secondary/50 text-secondary hover:bg-secondary/10 px-6 py-2">
                      {isSwapping ? <Spinner /> : <><Wand size={16} className="mr-2" /> Конвертировать голос</>}
                    </Button>
                    {swapNewAudio && (
                      <audio src={swapNewAudio} controls className="h-10 flex-1" />
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-on-surface-variant">
            Выберите голос слева или создайте новый
          </div>
        )}
      </div>
    </div>
  )
}
