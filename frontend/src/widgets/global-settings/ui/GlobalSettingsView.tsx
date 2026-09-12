import { fetchClient, apiErrorMessage, $api } from '@shared/api'
import { useState, useCallback } from 'react'
import { Button, Input, Select, FieldGroup, Slider, Spinner } from '@shared/ui'
import { ArrowLeft, Eye, EyeOff, Cloud, Server, Download, RotateCcw, Plus, Trash2, Video, MicVocal } from 'lucide-react'
import { API } from '@shared/lib'
import { useSettingsStore, useNotificationStore, type GlobalPromptSettings, type PromptCategory } from '@entities/project'
import { useModelCatalog } from '@entities/project'
import { SkillsSettingsView } from '@features/settings'

const PromptVersionEditor = ({ label, categoryKey, rows }: { label: string, categoryKey: keyof GlobalPromptSettings, rows: number }) => {
  const { globalPrompts, setGlobalPrompts } = useSettingsStore()
  const category = globalPrompts[categoryKey]
  const activeVersion = category.versions.find(v => v.id === category.activeId) || category.versions[0]

  const updateCategory = (updates: Partial<PromptCategory>) => setGlobalPrompts({ [categoryKey]: { ...category, ...updates } } as Partial<GlobalPromptSettings>)
  const updateActiveVersion = (content: string) => updateCategory({ versions: category.versions.map(v => v.id === category.activeId ? { ...v, content } : v) })
  const renameActiveVersion = (name: string) => updateCategory({ versions: category.versions.map(v => v.id === category.activeId ? { ...v, name } : v) })

  const addNewVersion = () => {
    const newId = crypto.randomUUID()
    updateCategory({ activeId: newId, versions: [...category.versions, { id: newId, name: `Версия ${category.versions.length + 1}`, content: activeVersion.content }] })
  }

  const deleteActiveVersion = () => {
    if (category.versions.length <= 1) return
    const newVersions = category.versions.filter(v => v.id !== category.activeId)
    updateCategory({ activeId: newVersions[0].id, versions: newVersions })
  }

  return (
    <div className="flex flex-col gap-3 bg-surface-container-lowest/50 p-4 rounded-xl border border-white/5">
      <div className="flex justify-between items-center gap-4">
        <span className="text-sm font-medium text-white flex-1">{label}</span>
        <div className="flex items-center gap-2">
          <Select value={category.activeId} onChange={(e) => updateCategory({ activeId: e.target.value })} className="w-48 text-xs py-1.5 font-medium">
            {category.versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
          <Button variant="ghost" onClick={addNewVersion} className="p-1.5 text-secondary hover:text-white hover:bg-secondary/20" title="Клонировать и создать новую версию"><Plus size={16} /></Button>
          <Button variant="ghost" disabled={category.versions.length <= 1} onClick={deleteActiveVersion} className="p-1.5 text-error hover:text-white hover:bg-error/20" title="Удалить активную версию"><Trash2 size={16} /></Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-on-surface-variant w-24">Имя версии:</span>
        <Input value={activeVersion.name} onChange={(e) => renameActiveVersion(e.target.value)} className="text-xs py-1.5 bg-background" />
      </div>
      <textarea
        className="w-full bg-background border border-white/10 rounded-lg p-3 text-[12px] font-mono text-on-surface resize-y focus:outline-none focus:border-primary/50 custom-scrollbar"
        rows={rows} spellCheck={false} value={activeVersion.content} onChange={e => updateActiveVersion(e.target.value)}
      />
    </div>
  )
}

export const GlobalSettingsView = ({ onBack, onGoToAudio }: { onBack: () => void; onGoToAudio?: () => void }) => {
  const {
    taskModes, setTaskMode, cloudProvider, setCloudProvider, apiKeys, setApiKey,
    cloudEngines, setCloudEngine, localEngines, setLocalEngine,
    resetGlobalPrompts,
    visualPacingThreshold, setVisualPacingThreshold,
    audioSilenceThreshold, setAudioSilenceThreshold,
    audioWpmMin, setAudioWpmMin,
    whisperModel, setWhisperModel,
  } = useSettingsStore()

  const showNotification = useNotificationStore(s => s.showNotification)

  const { localModels: locScenModels, cloudModels: cloudScenModels } = useModelCatalog('ScenarioDrafting')
  const { localModels: locVisModels, cloudModels: cloudVisModels } = useModelCatalog('SceneCodeGeneration')
  const { localModels: locBrollModels, cloudModels: cloudBrollModels } = useModelCatalog('BRollMatching')
  const { localModels: locAudioModels, cloudModels: cloudAudioModels } = useModelCatalog('TtsVoice')

  const [activeTab, setActiveTab] = useState<'ai' | 'prompts' | 'skills' | 'audio' | 'voices'>('ai')
  const [showKey, setShowKey] = useState(false)

  const [pulling, setPulling] = useState<string | null>(null)
  const [hfPullUrl, setHfPullUrl] = useState('')

  // Статус железа и профили дикторов берём из бэкенда (единый источник правды).
  const { data: hardware } = $api.useQuery('get', '/api/v1/system/hardware', {})
  const { data: speakers, refetch: refetchSpeakers } = $api.useQuery('get', '/api/v1/voice/speakers/profiles', {})

  const customVoices = (speakers ?? []).filter(s => s.source_type === 'Cloned' || s.source_type === 'Designed')

  const handleDeleteVoice = async (id: string, name: string) => {
    if (!window.confirm(`Безвозвратно удалить голос "${name}"?`)) return
    try {
      const { error } = await fetchClient.DELETE('/api/v1/voice/speakers/profiles/{id}', {
        params: { path: { id } },
      })
      if (error) throw new Error(apiErrorMessage(error))
      showNotification('Голос удален', 'success')
      void refetchSpeakers()
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const handlePull = useCallback(async (engine: string) => {
    setPulling(engine)
    try {
      const { error } = await fetchClient.POST('/api/v1/system/pull', { body: { engine } })
      if (error) throw new Error(apiErrorMessage(error))
      showNotification(`Команда загрузки ${engine} отправлена`, 'info')
    } catch { showNotification('Ошибка скачивания модели', 'error') }
    setTimeout(() => setPulling(null), 2000)
  }, [showNotification])

  return (
    <div className="flex flex-col h-dvh w-full bg-background animate-in fade-in duration-300">
      <div className="h-16 shrink-0 border-b border-white/10 bg-surface-container/60 backdrop-blur-2xl px-6 flex items-center gap-4 z-20">
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack} className="p-2" />
        <h1 className="font-title-md text-xl font-bold text-white tracking-tight">Глобальные настройки</h1>
      </div>

      <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full">
        <div className="w-64 shrink-0 border-r border-white/10 p-6 flex flex-col gap-2">
          <button onClick={() => setActiveTab('ai')} className={`px-4 py-3 text-sm font-medium rounded-xl text-left transition-all ${activeTab === 'ai' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}>🧠 AI Движки и API</button>
          <button onClick={() => setActiveTab('prompts')} className={`px-4 py-3 text-sm font-medium rounded-xl text-left transition-all ${activeTab === 'prompts' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}>📝 Промпты LLM</button>
          <button onClick={() => setActiveTab('skills')} className={`px-4 py-3 text-sm font-medium rounded-xl text-left transition-all ${activeTab === 'skills' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}>🛠️ Скиллы (Навыки ИИ)</button>
          <button onClick={() => setActiveTab('audio')} className={`px-4 py-3 text-sm font-medium rounded-xl text-left transition-all ${activeTab === 'audio' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}>🎛️ Аудио и Пайплайн</button>
          <button onClick={() => setActiveTab('voices')} className={`px-4 py-3 text-sm font-medium rounded-xl text-left transition-all ${activeTab === 'voices' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}>🎙️ Глобальные голоса</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-3xl flex flex-col gap-8 pb-20">

            {activeTab === 'ai' && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-3 bg-surface-container-lowest/50 rounded-xl p-4 border border-white/5">
                  <div className={`w-3 h-3 rounded-full shadow-lg ${hardware?.vram_gb && hardware.vram_gb >= 8 ? 'bg-success shadow-success/50' : 'bg-warning shadow-warning/50'}`} />
                  <div className="text-sm text-on-surface-variant font-mono">
                    {hardware ? `${hardware.device ?? 'CPU'} · VRAM: ${(hardware.vram_gb ?? 0).toFixed(1)}GB · RAM: ${(hardware.ram_gb ?? 0).toFixed(1)}GB` : 'Проверка оборудования...'}
                  </div>
                </div>

                <div className="flex flex-col gap-6 p-6 bg-surface-container/30 border border-white/5 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-2">Глобальные настройки (API Ключи)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-surface-container-lowest/40 p-5 rounded-xl border border-primary/20 shadow-inner">
                    <FieldGroup label="Провайдер API (Шлюз)">
                      <Select value={cloudProvider} onChange={e => setCloudProvider(e.target.value as 'routerai'|'aitunnel')}>
                        <option value="routerai">RouterAI (По умолчанию)</option>
                        <option value="aitunnel">AITunnel</option>
                      </Select>
                    </FieldGroup>
                    <FieldGroup label={`API Ключ (${cloudProvider === 'routerai' ? 'RouterAI' : 'AITunnel'})`}>
                      <div className="relative">
                        <Input
                          type={showKey ? 'text' : 'password'}
                          value={apiKeys[cloudProvider] || ''}
                          onChange={e => setApiKey(cloudProvider, e.target.value)}
                          placeholder={`sk-${cloudProvider}-...`}
                          className="font-mono text-xs pr-10"
                        />
                        <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white transition-colors">
                          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </FieldGroup>
                  </div>
                  <div className="grid grid-cols-1 gap-6 bg-surface-container-lowest/40 p-5 rounded-xl border border-error/20 shadow-inner mt-4">
                    <FieldGroup label="YouTube Data API v3 Ключ (Для поиска идей)">
                      <div className="relative">
                        <Input
                          type={showKey ? 'text' : 'password'}
                          value={apiKeys.youtube || ''}
                          onChange={e => setApiKey('youtube', e.target.value)}
                          placeholder="AIzaSy..."
                          className="font-mono text-xs pr-10"
                        />
                        <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white transition-colors">
                          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-[10px] text-on-surface-variant mt-1">Необходим для работы агента-аналитика и поиска вирусных видео.</p>
                    </FieldGroup>
                  </div>
                  <div className="grid grid-cols-1 gap-6 bg-surface-container-lowest/40 p-5 rounded-xl border border-secondary/20 shadow-inner mt-4">
                    <FieldGroup label="Pexels API Key (Для Auto B-Roll Matcher)">
                      <div className="relative">
                        <Input
                          type={showKey ? 'text' : 'password'}
                          value={apiKeys.pexels || ''}
                          onChange={e => setApiKey('pexels', e.target.value)}
                          placeholder="563492ad6f91700001000001..."
                          className="font-mono text-xs pr-10"
                        />
                        <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-white transition-colors">
                          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-[10px] text-on-surface-variant mt-1">Бесплатный ключ Pexels (api.pexels.com) для поиска и скачивания стоковых B-Roll футажей.</p>
                    </FieldGroup>
                  </div>
                </div>

                <div className="flex flex-col gap-6 p-6 bg-surface-container/30 border border-white/5 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-2">🧠 Сценарии и Идеи (LLM)</h3>
                  <div className="flex p-1 bg-surface-container-lowest/50 rounded-xl border border-white/10 shrink-0">
                    <button onClick={() => setTaskMode('scenario', 'cloud')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${taskModes.scenario === 'cloud' ? 'bg-primary/20 text-primary shadow-md border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}>
                      <Cloud size={16} className="inline mr-2" /> Облако
                    </button>
                    <button onClick={() => setTaskMode('scenario', 'local')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${taskModes.scenario === 'local' ? 'bg-success/20 text-success shadow-md border border-success/30' : 'text-on-surface-variant hover:text-white'}`}>
                      <Server size={16} className="inline mr-2" /> Локально
                    </button>
                  </div>
                  <FieldGroup label={`Модель для сценариев (${taskModes.scenario === 'cloud' ? 'Облако' : 'Локально'})`}>
                    {taskModes.scenario === 'cloud' ? (
                      <>
                        <Input list="cloud-scen" value={cloudEngines.scenario} onChange={e => setCloudEngine('scenario', e.target.value)} className="font-mono text-sm" />
                        <datalist id="cloud-scen">
                          {cloudScenModels.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} {!m.is_available ? '(требуется ключ)' : '✓'}
                            </option>
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <Select value={localEngines.scenario} onChange={e => setLocalEngine('scenario', e.target.value)} className="font-mono text-sm">
                        <option value="" disabled>Выберите локальную модель...</option>
                        {locScenModels.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </FieldGroup>
                </div>

                <div className="flex flex-col gap-6 p-6 bg-surface-container/30 border border-white/5 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-2">🎬 Визуал и Код (Remotion TSX)</h3>
                  <div className="flex p-1 bg-surface-container-lowest/50 rounded-xl border border-white/10 shrink-0">
                    <button onClick={() => setTaskMode('visual', 'cloud')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${taskModes.visual === 'cloud' ? 'bg-primary/20 text-primary shadow-md border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}>
                      <Cloud size={16} className="inline mr-2" /> Облако
                    </button>
                    <button onClick={() => setTaskMode('visual', 'local')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${taskModes.visual === 'local' ? 'bg-success/20 text-success shadow-md border border-success/30' : 'text-on-surface-variant hover:text-white'}`}>
                      <Server size={16} className="inline mr-2" /> Локально
                    </button>
                  </div>
                  <FieldGroup label={`Модель для генерации кода (${taskModes.visual === 'cloud' ? 'Облако' : 'Локально'})`}>
                    {taskModes.visual === 'cloud' ? (
                      <>
                        <Input list="cloud-vis" value={cloudEngines.visual} onChange={e => setCloudEngine('visual', e.target.value)} className="font-mono text-sm" />
                        <datalist id="cloud-vis">
                          {cloudVisModels.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} {!m.is_available ? '(требуется ключ)' : '✓'}
                            </option>
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <Select value={localEngines.visual} onChange={e => setLocalEngine('visual', e.target.value)} className="font-mono text-sm">
                        <option value="" disabled>Выберите локальную модель...</option>
                        {locVisModels.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </FieldGroup>
                </div>

                <div className="flex flex-col gap-6 p-6 bg-surface-container/30 border border-secondary/20 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Video size={20} className="text-secondary" />
                    <h3 className="text-lg font-bold text-white">🎞️ Подбор B-Roll Футажей (LLM Мозг)</h3>
                  </div>
                  <div className="flex p-1 bg-surface-container-lowest/50 rounded-xl border border-white/10 shrink-0">
                    <button onClick={() => setTaskMode('broll', 'cloud')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${taskModes.broll === 'cloud' ? 'bg-primary/20 text-primary shadow-md border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}>
                      <Cloud size={16} className="inline mr-2" /> Облако
                    </button>
                    <button onClick={() => setTaskMode('broll', 'local')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${taskModes.broll === 'local' ? 'bg-success/20 text-success shadow-md border border-success/30' : 'text-on-surface-variant hover:text-white'}`}>
                      <Server size={16} className="inline mr-2" /> Локально
                    </button>
                  </div>
                  <FieldGroup label={`Модель для парсинга и подбора B-Roll (${taskModes.broll === 'cloud' ? 'Облако' : 'Локально'})`}>
                    {taskModes.broll === 'cloud' ? (
                      <>
                        <Input list="cloud-broll" value={cloudEngines.broll} onChange={e => setCloudEngine('broll', e.target.value)} className="font-mono text-sm" />
                        <datalist id="cloud-broll">
                          {cloudBrollModels.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} {!m.is_available ? '(требуется ключ)' : '✓'}
                            </option>
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <Select value={localEngines.broll} onChange={e => setLocalEngine('broll', e.target.value)} className="font-mono text-sm">
                        <option value="" disabled>Выберите локальную модель...</option>
                        {locBrollModels.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </FieldGroup>
                </div>

                <div className="flex flex-col gap-6 p-6 bg-surface-container/30 border border-white/5 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-2">🎙️ Озвучка (TTS)</h3>
                  <div className="flex p-1 bg-surface-container-lowest/50 rounded-xl border border-white/10 shrink-0">
                    <button onClick={() => setTaskMode('audio', 'cloud')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${taskModes.audio === 'cloud' ? 'bg-primary/20 text-primary shadow-md border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}>
                      <Cloud size={16} className="inline mr-2" /> Облако
                    </button>
                    <button onClick={() => setTaskMode('audio', 'local')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${taskModes.audio === 'local' ? 'bg-success/20 text-success shadow-md border border-success/30' : 'text-on-surface-variant hover:text-white'}`}>
                      <Server size={16} className="inline mr-2" /> Локально
                    </button>
                  </div>
                  <FieldGroup label={`Движок озвучки (${taskModes.audio === 'cloud' ? 'Облако' : 'Локально'})`}>
                    {taskModes.audio === 'cloud' ? (
                      <>
                        <Input list="cloud-aud" value={cloudEngines.audio} onChange={e => setCloudEngine('audio', e.target.value)} className="font-mono text-sm" />
                        <datalist id="cloud-aud">
                          {cloudAudioModels.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} {!m.is_available ? '(требуется ключ)' : '✓'}
                            </option>
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <Select value={localEngines.audio} onChange={e => setLocalEngine('audio', e.target.value)} className="font-mono text-sm">
                        <option value="" disabled>Выберите локальную модель...</option>
                        {locAudioModels.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} {!m.is_available ? '(нет весов)' : '✓'}
                          </option>
                        ))}
                      </Select>
                    )}
                  </FieldGroup>
                </div>

                <div className="bg-surface-container-lowest/40 p-5 rounded-xl border border-white/5 flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Download size={20} className="text-success" />
                    <span className="text-sm font-medium text-white">Скачать модель (Hugging Face / Ollama)</span>
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Например: Qwen/Qwen2.5-Coder-7B" value={hfPullUrl} onChange={(e) => setHfPullUrl(e.target.value)} className="font-mono text-sm flex-1" />
                    <Button variant="primary" onClick={() => handlePull(hfPullUrl)} disabled={!hfPullUrl || pulling !== null} className="bg-success hover:bg-success/80 text-black shrink-0 px-6">
                      {pulling ? <Spinner /> : 'Pull'}
                    </Button>
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'prompts' && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Глобальные Промпты LLM</h3>
                  <Button variant="dashed" onClick={resetGlobalPrompts} className="text-xs text-on-surface-variant hover:text-white">
                    <RotateCcw size={16} className="mr-1" /> Сбросить по умолчанию
                  </Button>
                </div>
                <div className="text-xs text-on-surface-variant bg-surface-container-lowest/50 border border-white/5 p-4 rounded-xl leading-relaxed font-mono">
                  <span className="text-primary font-bold">Доступные переменные:</span><br/>
                  {`{{FORMAT}}, {{WIDTH}}, {{HEIGHT}}, {{DURATION}}, {{DURATION_FRAMES}}, {{FPS}}, {{COLORS}}, {{SCENE_TITLE}}, {{FRAGMENTS}}, {{VISUAL_NOTE}}, {{TEXT}}, {{SCENES_LIST}}, {{CURRENT_PACING}}, {{THRESHOLD}}, {{SCENE_MARKDOWN}}, {{TITLE}}, {{DESCRIPTION}}, {{FORMAT_TEXT}}, {{WORDS_COUNT}}`}
                </div>

                <PromptVersionEditor label="Промпт для генерации Сценария (LLM Агент)" categoryKey="scenario" rows={8} />
                <PromptVersionEditor label="Промпт для генерации Сцены (Remotion TSX)" categoryKey="scene" rows={8} />
                <PromptVersionEditor label="Промпт для генерации Фрагмента (Remotion TSX)" categoryKey="fragment" rows={8} />
                <PromptVersionEditor label="Промпт для генерации всего Проекта (Remotion TSX)" categoryKey="project" rows={8} />
                <PromptVersionEditor label="Промпт для исправления динамики (Pacing Fixer)" categoryKey="fixPacing" rows={8} />
              </div>
            )}

            {activeTab === 'skills' && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Скиллы (Навыки ИИ)</h3>
                </div>
                <p className="text-xs text-on-surface-variant bg-surface-container-lowest/50 border border-white/5 p-4 rounded-xl leading-relaxed font-mono">
                  Скиллы — это инструкции и правила из SQLite БД, которые добавляются к промптам для улучшения качества генерации.
                  Правки сохраняются сразу в базу и применяются ко всем генерациям без перезапуска.
                </p>
                <SkillsSettingsView />
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-surface-container-lowest/50 p-6 rounded-2xl border border-white/5 flex flex-col gap-6">
                  <h3 className="text-lg font-bold text-white mb-2">Настройки синхронизации (WhisperX)</h3>
                  <FieldGroup label="Модель выравнивания слов">
                    <div className="text-xs text-on-surface-variant mb-3 leading-relaxed">
                      Модель автоматически загружается при первом использовании (в папку ai-models). Для русского языка форсирована оптимизация, рекомендуется модель «Small».
                    </div>
                    <Select value={whisperModel} onChange={e => setWhisperModel(e.target.value)} className="font-mono text-sm">
                      <option value="small">Small (244 млн) — Среднее качество, баланс (~2 ГБ VRAM)</option>
                      <option value="base">Base (74 млн) — Низкое качество, быстро (~1 ГБ VRAM)</option>
                      <option value="tiny">Tiny (39 млн) — Очень низкое качество, мгновенно (~1 ГБ VRAM)</option>
                    </Select>
                  </FieldGroup>
                </div>

                <div className="bg-surface-container-lowest/50 p-6 rounded-2xl border border-white/5 flex flex-col gap-6">
                  <h3 className="text-lg font-bold text-white mb-2">Индикаторы удержания зрителя (Pacing)</h3>
                  <FieldGroup label={`Динамика визуала (не реже 1 смены кадра в ${visualPacingThreshold.toFixed(1)}с)`}>
                    <Slider min={1} max={10} step={0.5} value={visualPacingThreshold} onChange={e => setVisualPacingThreshold(Number(e.target.value))} />
                  </FieldGroup>
                  <FieldGroup label={`Допустимая тишина (<= ${audioSilenceThreshold.toFixed(1)}с)`}>
                    <Slider min={0.5} max={5} step={0.5} value={audioSilenceThreshold} onChange={e => setAudioSilenceThreshold(Number(e.target.value))} />
                  </FieldGroup>
                  <FieldGroup label={`Минимальный темп речи (>= ${audioWpmMin} WPM)`}>
                    <Slider min={60} max={160} step={5} value={audioWpmMin} onChange={e => setAudioWpmMin(Number(e.target.value))} />
                  </FieldGroup>
                </div>
              </div>
            )}

            {activeTab === 'voices' && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Глобальные Голоса (Speaker Profiles)</h3>
                    <p className="text-sm text-on-surface-variant mt-1 max-w-xl">
                      Здесь отображаются все созданные вами ИИ-клоны и сгенерированные голоса.
                      Они доступны во всех проектах автоматически.
                    </p>
                  </div>
                  <Button onClick={() => { onBack(); onGoToAudio?.() }} className="shrink-0">
                    <MicVocal size={16} className="mr-2" /> Создать голос в Audio Studio
                  </Button>
                </div>

                <div className="flex flex-col gap-3">
                  {customVoices.map(gv => (
                    <div key={gv.id} className="p-4 rounded-xl border border-white/10 bg-surface-container-lowest flex justify-between items-center shadow-md hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary border border-primary/30 shrink-0">
                          {(gv.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-base font-bold text-white flex items-center gap-2">
                            {gv.name}
                            <span className="px-1.5 py-0.5 text-[9px] uppercase font-mono rounded bg-white/10 text-on-surface-variant">
                              {gv.source_type}
                            </span>
                          </span>
                          <span className="text-xs text-on-surface-variant font-mono truncate">
                            Движок: {gv.engine ?? '—'} • ID: {gv.speaker_id ?? '—'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {gv.preview_audio_path && (
                          <audio
                            src={`${API}/api/v1/render/media?path=${encodeURIComponent(gv.preview_audio_path)}`}
                            controls
                            className="h-8 w-48 opacity-70 hover:opacity-100 transition-opacity"
                          />
                        )}
                        <Button
                          variant="ghost"
                          className="text-error hover:bg-error/10 p-2 ml-2"
                          onClick={() => gv.id && handleDeleteVoice(gv.id, gv.name ?? '')}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {customVoices.length === 0 && (
                    <div className="text-center text-on-surface-variant py-12 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center gap-3">
                      <MicVocal size={32} className="opacity-50" />
                      <span>У вас пока нет кастомных голосов. Перейдите в Audio Studio, чтобы клонировать голос или создать новый тембр через ИИ.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
