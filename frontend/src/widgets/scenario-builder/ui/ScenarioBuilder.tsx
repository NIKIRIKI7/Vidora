import { fetchClient, apiErrorMessage } from '@shared/api'
import { useState, useRef, useMemo } from 'react'
import { Button, Input, Select, FieldGroup, Spinner, VoiceTagToolbar, useVoiceTagInserter, TextArea, GradientButton, PageHeader, Alert, EmptyState, SegmentedControl, IconButton } from '@shared/ui'
import { Wand2, FileText, Download, FileUp, Clock, Copy, Mic, Sparkles, Settings2, ShieldAlert, AlertTriangle, Info, Check, X } from 'lucide-react'
import { parseMarkdownFull, type ProjectSettings, type VideoFormat, type Resolution, type IdeaFormat, type VideoResult } from '@entities/project'
import { THEME_PRESETS, type ThemePreset, SCENARIO_PARSER_RULES } from '@shared/config'
import { formatTimecode } from '@shared/lib'
import { useSettingsStore, useNotificationStore, getActivePrompt } from '@entities/project'
import { useModelCatalog } from '@entities/project'
import { useSkillsStore } from '@features/settings'
import { scenarioEngineApi, type IssueSeverity, type ScenarioIssue } from '@shared/api'

interface Props {
  idea?: IdeaFormat
  videos?: VideoResult[]
  onBack: () => void
  onCreate: (project: ProjectSettings) => void
}

const SeverityConfig: Record<IssueSeverity, { icon: typeof Info; color: string; bg: string }> = {
  Error: { icon: ShieldAlert, color: 'text-error', bg: 'bg-error/10 border-error/30' },
  Warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
  Info: { icon: Info, color: 'text-primary', bg: 'bg-primary/10 border-primary/30' },
}

export const ScenarioBuilder = ({ idea, videos, onBack, onCreate }: Props) => {
  const apiKeys = useSettingsStore((s) => s.apiKeys)
  const cloudEngines = useSettingsStore((s) => s.cloudEngines)
  const localEngines = useSettingsStore((s) => s.localEngines)
  const cloudProvider = useSettingsStore((s) => s.cloudProvider)
  const taskModes = useSettingsStore((s) => s.taskModes)
  const setTaskMode = useSettingsStore((s) => s.setTaskMode)
  const setCloudEngine = useSettingsStore((s) => s.setCloudEngine)
  const setLocalEngine = useSettingsStore((s) => s.setLocalEngine)
  const showNotification = useNotificationStore(s => s.showNotification)
  const { localModels, cloudModels } = useModelCatalog('ScenarioDrafting')

  const activeApiKeys = {
    ...apiKeys,
    routerai: cloudProvider === 'routerai' ? apiKeys.routerai : undefined,
    aitunnel: cloudProvider === 'aitunnel' ? apiKeys.aitunnel : undefined,
  }

  // Общие настройки проекта
  const [name, setName] = useState(idea?.titles?.[0] || idea?.title || '')
  const [format, setFormat] = useState<VideoFormat>('16:9')
  const [resolution, setResolution] = useState<Resolution>('1080p')
  const [theme, setTheme] = useState<ThemePreset>(THEME_PRESETS[0])
  const [markdown, setMarkdown] = useState(idea ? '' : '---\ntitle: "Новый проект"\nfps: 30\n---\n\n[Интро] (00:00:00)\n*(B-roll: Ваш футаж)*\nВаш текст здесь...')

  // Настройки ИИ генератора
  const [isGenerating, setIsGenerating] = useState(false)
  const [genDuration, setGenDuration] = useState('3')

  // --- Состояния Режиссёрского линтера (Правый блок, stateless /lint-draft) ---
  const [showLinter, setShowLinter] = useState(false)
  const [isLinting, setIsLinting] = useState(false)
  const [linterIssues, setLinterIssues] = useState<ScenarioIssue[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const markdownRef = useRef<HTMLTextAreaElement>(null)
  const { insertTag, toggleCaps, hasSelection } = useVoiceTagInserter(markdownRef)

  const agentEngine = taskModes.scenario === 'cloud' ? cloudEngines.scenario : localEngines.scenario

  const estimatedDuration = useMemo(() => {
    if (!markdown) return 0
    let cleanText = markdown.replace(/^---\n[\s\S]+?\n---/, '')
    cleanText = cleanText.replace(/\[.*?\]\s*\(.*?\)/g, '')
    cleanText = cleanText.replace(/\*\([\s\S]*?\)\*/g, '')
    const words = cleanText.split(/\s+/).filter(w => w.trim().length > 0)
    return words.length / 2.5
  }, [markdown])

  const getScenarioPrompt = () => {
    const globalPrompts = useSettingsStore.getState().globalPrompts;
    const desc = idea ? idea.description : '';
    const formatText = format === '9:16' ? 'Вертикальный Shorts/Reels (сверхбыстрый темп, без воды)' : 'Горизонтальное длинное видео';
    const wordsCount = Math.round(Number(genDuration) * 150);

    const voiceRules = `- Эмоция сцены: \`[emotion: happy]\` (sad, angry, fearful, disgusted, surprised, calm). Ставится в начале фрагмента.\n- Паузы: \`<#1.0#>\` (секунды от 0.1 до 3.0).\n- Междометия: \`(breath)\`, \`(sighs)\`, \`(laughs)\`.`;
    const injectedRules = SCENARIO_PARSER_RULES.replace('{{VOICE_RULES}}', voiceRules);

    const template = getActivePrompt(globalPrompts.scenario) || `Действуй как профессиональный сценарист YouTube для Tech/IT канала (Faceless).\nНапиши подробный сценарий на тему: "{{TITLE}}".\n\nФормат видео: {{FORMAT_TEXT}}.\nОриентировочный хронометраж: {{DURATION}} мин. (около {{WORDS_COUNT}} слов).\n\n{{SCENARIO_RULES}}\n\nВерни ТОЛЬКО валидный Markdown код сценария.`;

    return template
      .replace(/\{\{TITLE\}\}/g, name)
      .replace(/\{\{DESCRIPTION\}\}/g, desc)
      .replace(/\{\{FORMAT_TEXT\}\}/g, formatText)
      .replace(/\{\{DURATION\}\}/g, genDuration)
      .replace(/\{\{WORDS_COUNT\}\}/g, wordsCount.toString())
      .replace(/\{\{SCENARIO_RULES\}\}/g, injectedRules)
      + useSkillsStore.getState().buildPromptContextForStage('script_drafting');
  }

  const copyText = async (text: string): Promise<boolean> => {
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // API недоступен — пробуем фолбэк через textarea ниже
      }
    }
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.opacity = "0";
      document.body.prepend(textArea);
      textArea.focus();
      textArea.select();
      const ok = document.execCommand('copy');
      textArea.remove();
      return ok;
    } catch {
      return false;
    }
  }

  const handleCopyPrompt = async () => {
    if (!name.trim()) { showNotification('Укажите название проекта (тему) для генерации', 'error'); return; }

    const prompt = getScenarioPrompt();
    const ok = await copyText(prompt);

    if (ok) {
      showNotification('Промпт скопирован в буфер обмена!', 'success');
    } else {
      showNotification('Ошибка копирования. Скопируйте текст вручную.', 'error');
    }
  }

  const handleGenerateAI = async () => {
    const desc = idea ? idea.description : '';
    if (!name.trim()) { showNotification('Укажите название проекта (тему) для генерации', 'error'); return; }

    setIsGenerating(true)
    try {
      const customPrompt = getScenarioPrompt();
      const audioEngine = (taskModes.audio === 'cloud' ? cloudEngines.audio : localEngines.audio) || '';

      const { data, error } = await fetchClient.POST('/api/v1/youtube/agent/draft-script', {
        body: {
          title: name, idea_description: desc,
          channel_context: '', engine: agentEngine, api_keys: activeApiKeys,
          video_type: format === '9:16' ? 'short' : 'long',
          target_duration: genDuration, custom_prompt: customPrompt,
          audio_engine: audioEngine
        } as never
      })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status === 'ok' && data.markdown) {
        setMarkdown(data.markdown)
        showNotification('Сценарий сгенерирован!', 'success')
      } else throw new Error()
    } catch {
      showNotification('Ошибка генерации сценария', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyOriginal = async (video: VideoResult) => {
    setIsGenerating(true)
    try {
      const { data, error } = await fetchClient.POST('/api/v1/youtube/download-meta', {
        body: { url: video.url, project_path: 'vidora_projects/Drafts' }
      })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      const transcript = data.data?.transcript_full
      if (data.status === 'ok' && transcript) {
        setName(`Оригинал: ${video.title.substring(0, 30)}...`)
        setMarkdown(`---\ntitle: "${video.title.replace(/"/g, "'")}"\nfps: 30\n---\n\n[Сцена 1] (00:00:00)\n*(B-roll: ${video.title})*\n${transcript}`)
        showNotification('Транскрипт скопирован!', 'success')
      } else {
        showNotification('У видео нет субтитров', 'info')
      }
    } catch {
      showNotification('Ошибка скачивания субтитров', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  // --- Запуск Линтера (stateless: /engine/lint-draft, черновик не сохраняется в БД) ---
  const handleRunLinter = async () => {
    if (!showLinter) setShowLinter(true)
    setIsLinting(true)
    try {
      const data = await scenarioEngineApi.lintDraft(markdown)
      setLinterIssues(data.issues || [])
    } catch {
      showNotification('Не удалось запустить проверку', 'error')
    } finally {
      setIsLinting(false)
    }
  }

  const handleCreate = () => {
    if (!name || !markdown) {
      showNotification('Укажите название и напишите сценарий', 'error')
      return
    }
    const parsed = parseMarkdownFull(markdown)
    onCreate({
      name, format, resolution,
      metadata: parsed.metadata ?? { title: name, description: idea?.thumbnail_concept || '', tags: [] },
      montage: parsed.montage ?? { fps: '30', animationStyle: 'screencast', transitions: [], colors: theme.colors, typography: { heading: 'Inter', body: 'Geist' } },
      scenes: parsed.scenes ?? [],
      rawMarkdown: markdown,
      audioMode: 'scene',
      audioProcessing: { silenceThresholdDb: -45.0, minSilenceMs: 200, maxSilenceMs: 100, removeEdges: false },
    })
  }

  return (
    <div className="flex flex-col h-dvh w-full bg-background overflow-hidden animate-in fade-in duration-300">
      <PageHeader title="Создание проекта" icon={Wand2} onBack={onBack} />

      <div className="flex flex-1 overflow-hidden">
      {/* Левый сайдбар настроек */}
      <div className="w-[var(--layout-sidebar-lg)] shrink-0 bg-surface-container/40 border-r border-outline-variant/40 flex flex-col shadow-2xl z-10 relative">

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6 custom-scrollbar pb-6">

          {/* Блок 1: Базовые настройки */}
          <div className="flex flex-col gap-4">
            <FieldGroup label="Название проекта (оно же тема для ИИ)">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Например: Обзор RTX 5090"
                className="bg-surface-container-lowest font-medium border-primary/30 focus:border-primary/50 text-on-surface"
              />
            </FieldGroup>

            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Формат">
                <Select value={format} onChange={e => {
                  setFormat(e.target.value as VideoFormat);
                  if (e.target.value === '9:16') setGenDuration('1');
                }} className="text-xs bg-surface-container-lowest">
                  <option value="16:9">YouTube (16:9)</option>
                  <option value="9:16">Shorts (9:16)</option>
                </Select>
              </FieldGroup>
              <FieldGroup label="Разрешение">
                <Select value={resolution} onChange={e => setResolution(e.target.value as Resolution)} className="text-xs bg-surface-container-lowest">
                  <option value="1080p">Full HD 1080p</option>
                  <option value="1440p">2K 1440p</option>
                  <option value="2160p">4K 2160p</option>
                </Select>
              </FieldGroup>
            </div>

            <FieldGroup label="Цветовая тема (Автоматически)">
              <div className="flex gap-3 overflow-x-auto py-2 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {THEME_PRESETS.map((tpl: ThemePreset) => (
                  <Button
                    key={tpl.name}
                    variant="ghost"
                    onClick={() => setTheme(tpl)}
                    className="flex-col items-center gap-1.5 shrink-0 p-0 group"
                  >
                    <div className={`w-10 h-10 rounded-full border-2 flex overflow-hidden shadow-sm transition-all ${theme.name === tpl.name ? 'border-primary scale-110 shadow-primary/20' : 'border-transparent group-hover:border-outline-variant/100'}`}>
                      <div className="flex-1" style={{backgroundColor: tpl.colors.primary}} />
                      <div className="flex-1" style={{backgroundColor: tpl.colors.background}} />
                    </div>
                  </Button>
                ))}
              </div>
            </FieldGroup>
          </div>

          {/* Блок 2: Генерация ИИ */}
          <div className="bg-gradient-to-b from-primary/10 to-transparent border border-primary/20 p-4 rounded-xl flex flex-col gap-4 relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 to-secondary/50"></div>

            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-2xs uppercase font-bold text-primary tracking-wider">AI-Ассистент</span>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <FieldGroup label="Хронометраж (мин)">
                  <Input type="number" min={0.5} max={60} step={0.5} value={genDuration} onChange={e => setGenDuration(e.target.value)} className="text-xs bg-surface-container-lowest/40 border-primary/20 focus:border-primary/50" />
                </FieldGroup>
              </div>
              <div className="pb-2">
                <span className="text-2xs text-on-surface-variant font-mono leading-tight">≈ {Math.round(Number(genDuration) * 150)} слов</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-label text-xs font-medium text-on-surface-variant flex items-center gap-1">
                <Settings2 size={13} /> Движок генерации
              </label>

              <div className="bg-surface-container-lowest/40 border border-primary/20 rounded-xl p-1.5 flex flex-col gap-2">
                <SegmentedControl
                  fill
                  options={[
                    { value: 'cloud', label: 'Облако', accent: 'primary' },
                    { value: 'local', label: 'Локально', accent: 'success' },
                  ]}
                  value={taskModes.scenario}
                  onChange={(mode) => setTaskMode('scenario', mode)}
                />

                {taskModes.scenario === 'cloud' ? (
                  <>
                    <Input list="cloud-agent-models" value={cloudEngines.scenario} onChange={e => setCloudEngine('scenario', e.target.value)} className="text-xs font-mono bg-transparent border-none px-2 shadow-none focus:ring-0" placeholder="LLM Движок (Облако)" />
                    <datalist id="cloud-agent-models">
                      {cloudModels.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} {!m.is_available ? '(требуется ключ)' : '✓'}
                        </option>
                      ))}
                    </datalist>
                  </>
                ) : (
                  <Select value={localEngines.scenario} onChange={e => setLocalEngine('scenario', e.target.value)} className="text-xs font-mono bg-transparent border-none px-2 shadow-none focus:ring-0">
                    <option value="" disabled>Выберите локальную модель...</option>
                    {localModels.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="primary" onClick={handleGenerateAI} disabled={isGenerating || !name.trim()} className="flex-1 text-xs py-2 shadow-lg shadow-primary/20">
                {isGenerating ? <Spinner className="w-4 h-4" /> : <><Wand2 size={14} className="mr-1.5" /> Написать Сценарий</>}
              </Button>
              <Button variant="dashed" onClick={handleCopyPrompt} disabled={isGenerating || !name.trim()} className="text-xs text-primary border-primary/30 hover:bg-primary/20 px-3 shrink-0 bg-primary/5" title="Скопировать промпт для ChatGPT / Claude">
                <Copy size={14} />
              </Button>
            </div>
          </div>

          {/* Блок 3: Скачивание оригинала (если пришли из Идей) */}
          {videos && videos.length > 0 && (
            <div className="bg-secondary/10 border border-secondary/20 p-4 rounded-xl flex flex-col gap-3">
              <span className="text-xxs uppercase font-bold text-secondary tracking-wider">Скопировать транскрипт оригинала</span>
              <div className="flex flex-col gap-2">
                {videos.slice(0,3).map((v, i) => (
                  <Button key={i} variant="dashed" onClick={() => handleCopyOriginal(v)} disabled={isGenerating} className="text-xs text-left h-auto py-2 px-3 justify-start border-secondary/30 text-secondary hover:bg-secondary/20 bg-secondary/5">
                    <Download size={14} className="shrink-0 mr-1.5" /> <span className="truncate">{v.title}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="h-px bg-on-surface/5" />

          {/* Блок 4: Ручной импорт файла */}
          <FieldGroup label="Или загрузите готовый .md файл">
            <input type="file" accept=".md" className="hidden" ref={fileInputRef} onChange={async (e) => {
              if (e.target.files?.[0]) setMarkdown(await e.target.files[0].text())
            }} />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="w-full text-xs py-2 bg-on-surface/5 border-outline-variant/40 hover:bg-on-surface/10 text-on-surface">
              <FileUp size={16} className="mr-1.5" /> Выбрать файл
            </Button>
          </FieldGroup>

        </div>

        {/* Подвал сайдбара с кнопкой создания */}
        <div className="p-5 bg-surface-container/95 border-t border-outline-variant/20 backdrop-blur-md shrink-0 z-20 shadow-2xl">
          <div className="flex items-center justify-between mb-3 text-sm font-medium text-on-surface bg-surface-container-lowest/40 p-2.5 rounded-lg border border-outline-variant/40 shadow-inner">
            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant"><Clock size={15} className="text-secondary" /> Хронометраж:</span>
            <span className="text-secondary font-mono tracking-widest">{formatTimecode(estimatedDuration)}</span>
          </div>
          <Button variant="primary" onClick={handleCreate} disabled={isGenerating || !name || !markdown} className="w-full py-3 text-sm shadow-lg shadow-primary/20">
            <FileText size={16} className="mr-1.5" /> Создать проект
          </Button>
        </div>
      </div>

      {/* Правая часть: Редактор (Markdown) + Режиссёрский линтер */}
      <div className="flex-1 flex flex-col bg-surface-container-lowest/60 relative">
        <div className="px-6 pt-4 pb-2 shrink-0 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <VoiceTagToolbar
              onInsertTag={insertTag}
              onToggleCaps={toggleCaps}
              hasSelection={hasSelection}
              className="shrink-0 bg-surface-container/50 border-outline-variant/40 shadow-sm"
            />
            <GradientButton
              onClick={handleRunLinter}
              disabled={isLinting}
              className="shrink-0 text-xs py-1.5 px-4"
              icon={isLinting ? <Spinner className="w-3.5 h-3.5" /> : <Sparkles size={14} />}
            >
              Проверить сценарий (Линтер)
            </GradientButton>
          </div>

          <Alert variant="info" icon={<Mic size={16} />} className="font-mono text-2xs py-2.5">
            <span className="font-bold">Шпаргалка (OmniVoice/MiniMax):</span> Эмоция: <code className="bg-surface-container-lowest/40 px-1.5 py-0.5 rounded text-on-surface">[emotion: happy]</code> • Паузы: <code className="bg-surface-container-lowest/40 px-1.5 py-0.5 rounded text-on-surface">&lt;#1.5#&gt;</code> • Звуки: <code className="bg-surface-container-lowest/40 px-1.5 py-0.5 rounded text-on-surface">(sighs)</code>
          </Alert>
        </div>

        <div className="flex-1 flex overflow-hidden p-6 pt-3 gap-4 min-h-0">
          <TextArea
            ref={markdownRef}
            className="flex-1 bg-surface-container/40 border border-outline-variant/40 rounded-2xl p-8 font-mono text-sm leading-relaxed text-on-surface resize-none outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 custom-scrollbar shadow-2xl transition-all"
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            spellCheck={false}
            placeholder="Напишите ваш сценарий в Markdown..."
          />

          {/* Боковая панель линтера (выезжает по кнопке) */}
          {showLinter && (
            <div className="w-[var(--layout-sidebar)] shrink-0 bg-surface-container border border-outline-variant/40 rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-8 duration-300 shadow-2xl">
              <div className="p-4 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between">
                <h3 className="font-bold text-on-surface text-xs tracking-wide uppercase flex items-center gap-2">
                  <Sparkles className="text-secondary" size={14} /> Режиссёрский линтер
                </h3>
                <IconButton
                  icon={X}
                  size="sm"
                  accent="neutral"
                  onClick={() => setShowLinter(false)}
                  title="Закрыть"
                />
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3">
                {isLinting ? (
                  <div className="flex flex-col items-center justify-center mt-10 text-on-surface-variant/50 text-xs gap-3">
                    <Spinner className="w-6 h-6 text-primary" />
                    Анализ драматургии и структуры...
                  </div>
                ) : linterIssues.length === 0 ? (
                  <EmptyState icon={Check} title="Сценарий чист" description="Нарушений динамики и структуры не найдено." className="mt-6" />
                ) : (
                  linterIssues.map((issue, idx) => {
                    const config = SeverityConfig[issue.severity] || SeverityConfig.Info
                    const Icon = config.icon
                    return (
                      <div key={`${issue.code}-${idx}`} className={`p-3 rounded-xl border flex flex-col gap-2 ${config.bg}`}>
                        <div className="flex items-start gap-2">
                          <Icon size={14} className={`mt-0.5 shrink-0 ${config.color}`} />
                          <span className="text-xs text-on-surface leading-tight font-medium">{issue.message}</span>
                        </div>
                        {issue.code && (
                          <span className="text-xxs font-mono uppercase tracking-wide text-on-surface-variant/70">{issue.code}</span>
                        )}
                      </div>
                    )
                  })
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
