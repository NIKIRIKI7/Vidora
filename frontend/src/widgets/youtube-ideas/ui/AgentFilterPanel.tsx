import {
  Input,
  Button,
  Slider,
  FieldGroup,
  Spinner,
  Select,
  TextArea,
  SegmentedControl,
} from '@shared/ui'
import { X, Plus, Sparkles, CirclePlay } from 'lucide-react'
import type { ModelCatalogEntry } from '@entities/project'
import { NICHE_PRESETS, isYoutubeUrl } from '../model/constants'

interface AgentFilterPanelProps {
  searchEngine: 'auto' | 'ytscrape' | 'api'
  setSearchEngine: (v: 'auto' | 'ytscrape' | 'api') => void
  searchMode: 'trending' | 'competitors'
  setSearchMode: (v: 'trending' | 'competitors') => void
  minRatio: number
  setMinRatio: (v: number) => void
  minSubs: number
  setMinSubs: (v: number) => void
  maxSubs: number
  setMaxSubs: (v: number) => void
  competitorChannels: string[]
  newChannelInput: string
  setNewChannelInput: (v: string) => void
  isSuggestingCompetitors: boolean
  onAddChannel: () => void
  onRemoveChannel: (ch: string) => void
  onSuggestCompetitors: () => void
  nichePreset: string
  setNichePreset: (v: string) => void
  customQuery: string
  setCustomQuery: (v: string) => void
  language: string
  setLanguage: (v: string) => void
  videoType: 'all' | 'long' | 'short'
  setVideoType: (v: 'all' | 'long' | 'short') => void
  daysBack: number
  setDaysBack: (v: number) => void
  ideasCount: number
  setIdeasCount: (v: number) => void
  channelContext: string
  setChannelContext: (v: string) => void
  isAnalyzingChannel: boolean
  onAnalyzeChannel: () => void
  enginePreference: 'auto' | 'cloud' | 'local'
  setEnginePreference: (v: 'auto' | 'cloud' | 'local') => void
  taskModes: { scenario: 'cloud' | 'local' }
  setTaskMode: (task: 'scenario', mode: 'cloud' | 'local') => void
  cloudEngines: { scenario: string }
  setCloudEngine: (task: 'scenario', model: string) => void
  localEngines: { scenario: string }
  setLocalEngine: (task: 'scenario', model: string) => void
  cloudModels: ModelCatalogEntry[]
  localModels: ModelCatalogEntry[]
  isAgentRunning: boolean
  onRunAgent: () => void
}

export const AgentFilterPanel = ({
  searchEngine,
  setSearchEngine,
  searchMode,
  setSearchMode,
  minRatio,
  setMinRatio,
  minSubs,
  setMinSubs,
  maxSubs,
  setMaxSubs,
  competitorChannels,
  newChannelInput,
  setNewChannelInput,
  isSuggestingCompetitors,
  onAddChannel,
  onRemoveChannel,
  onSuggestCompetitors,
  nichePreset,
  setNichePreset,
  customQuery,
  setCustomQuery,
  language,
  setLanguage,
  videoType,
  setVideoType,
  daysBack,
  setDaysBack,
  ideasCount,
  setIdeasCount,
  channelContext,
  setChannelContext,
  isAnalyzingChannel,
  onAnalyzeChannel,
  enginePreference,
  setEnginePreference,
  taskModes,
  setTaskMode,
  cloudEngines,
  setCloudEngine,
  localEngines,
  setLocalEngine,
  cloudModels,
  localModels,
  isAgentRunning,
  onRunAgent,
}: AgentFilterPanelProps) => (
  <div className="w-[var(--layout-sidebar)] xl:w-[var(--layout-sidebar-lg)] flex flex-col gap-4 bg-surface-container-lowest/30 border-r border-outline-variant/40 p-5 shrink-0 overflow-y-auto custom-scrollbar">
    <div className="grid grid-cols-2 gap-3">
      <FieldGroup label="Источник поиска">
        <Select value={searchEngine} onChange={e => setSearchEngine(e.target.value as 'auto' | 'ytscrape' | 'api')} className="text-xs">
          <option value="auto">Авто (ytscrape + API)</option>
          <option value="ytscrape">ytscrape (Scraper)</option>
          <option value="api">YouTube API v3</option>
        </Select>
      </FieldGroup>
      <FieldGroup label="Режим поиска">
        <Select value={searchMode} onChange={e => setSearchMode(e.target.value as 'trending' | 'competitors')} className="text-xs">
          <option value="trending">Тренды + ИИ</option>
          <option value="competitors">Конкуренты</option>
        </Select>
      </FieldGroup>
    </div>

    <div className="mt-2">
      <FieldGroup label={`Множитель просмотров (>${minRatio.toFixed(1)}x)`}>
        <Slider min={0.5} max={10.0} step={0.5} value={minRatio} onChange={e => setMinRatio(Number(e.target.value))} />
      </FieldGroup>
    </div>

    {searchMode === 'competitors' ? (
      <div className="flex flex-col gap-2 bg-surface-container-lowest/50 border border-outline-variant/20 p-3 rounded-xl">
        <span className="text-xs font-label uppercase text-on-surface-variant">Каналы конкурентов</span>
        <div className="flex flex-wrap gap-2">
          {competitorChannels.map((ch, i) => (
            <span key={i} className="bg-primary/10 border border-primary/20 text-primary px-2 py-1 rounded text-xs flex items-center gap-1">
              {ch} <span className="cursor-pointer hover:text-on-surface" onClick={() => onRemoveChannel(ch)}><X size={14} /></span>
            </span>
          ))}
        </div>
        <div className="flex gap-2 mt-1">
          <Input value={newChannelInput} onChange={e => setNewChannelInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAddChannel()} placeholder="Название или URL..." className="text-xs flex-1" />
          <Button variant="secondary" onClick={onAddChannel} className="shrink-0 px-2 py-1 h-auto"><Plus size={16} /></Button>
        </div>
        <Button variant="dashed" onClick={onSuggestCompetitors} disabled={isSuggestingCompetitors} className="mt-2 text-xs border-secondary/30 text-secondary hover:bg-secondary/10 py-1.5 h-auto">
          {isSuggestingCompetitors ? <Spinner className="text-sm" /> : <><Sparkles size={14} className="mr-1" /> Подобрать ИИ</>}
        </Button>
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-3 mt-2">
        <FieldGroup label="Мин. сабов">
          <Input type="number" value={minSubs} onChange={e => setMinSubs(Number(e.target.value))} className="text-xs" />
        </FieldGroup>
        <FieldGroup label="Макс. сабов">
          <Input type="number" value={maxSubs} onChange={e => setMaxSubs(Number(e.target.value))} className="text-xs" />
        </FieldGroup>
      </div>
    )}

    <FieldGroup label="Тематика ниши">
      <Select value={nichePreset} onChange={e => setNichePreset(e.target.value)}>
        {(NICHE_PRESETS[language] || NICHE_PRESETS.en).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </Select>
    </FieldGroup>

    {nichePreset === 'custom' && (
      <FieldGroup label="Свой запрос">
        <Input value={customQuery} onChange={e => setCustomQuery(e.target.value)} placeholder="Например: Обзор React 19" />
      </FieldGroup>
    )}

    <div className="grid grid-cols-2 gap-3 mt-2">
      <FieldGroup label="Язык">
        <Select value={language} onChange={e => setLanguage(e.target.value)} className="text-xs">
          <option value="en">English (US)</option>
          <option value="ru">Русский (RU)</option>
          <option value="es">Español (ES)</option>
        </Select>
      </FieldGroup>
      <FieldGroup label="Формат">
        <Select value={videoType} onChange={e => setVideoType(e.target.value as 'all' | 'long' | 'short')} className="text-xs">
          <option value="all">Все</option>
          <option value="long">Длинные</option>
          <option value="short">Shorts</option>
        </Select>
      </FieldGroup>
    </div>

    <div className="grid grid-cols-2 gap-3 mt-2">
      <FieldGroup label="Дней назад">
        <Input type="number" min={1} max={365} value={daysBack} onChange={e => setDaysBack(Number(e.target.value))} className="text-xs" />
      </FieldGroup>
      <FieldGroup label="Кол-во идей">
        <Select value={ideasCount} onChange={e => setIdeasCount(Number(e.target.value))} className="text-xs">
          <option value="3">3 шт.</option>
          <option value="5">5 шт.</option>
          <option value="10">10 шт.</option>
        </Select>
      </FieldGroup>
    </div>

    <FieldGroup label="О чем ваш канал? (Контекст)">
      <div className="relative">
        <TextArea
          className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg py-2 px-3 pb-8 text-sm text-on-surface resize-none focus:border-primary/50"
          rows={3}
          value={channelContext}
          onChange={e => setChannelContext(e.target.value)}
          placeholder="Вставьте ссылку на канал или опишите его"
        />
        {isYoutubeUrl(channelContext.trim()) && (
          <div className="absolute bottom-2 right-2">
            <Button variant="secondary" onClick={onAnalyzeChannel} disabled={isAnalyzingChannel} className="text-xxs py-1 px-2 h-auto">
              {isAnalyzingChannel ? <Spinner className="w-3 h-3 mr-1" /> : <Sparkles size={12} className="mr-1" />}
              Анализ
            </Button>
          </div>
        )}
      </div>
    </FieldGroup>

    <div className="bg-primary/10 border border-primary/20 p-3 rounded-xl flex flex-col gap-2">
      <FieldGroup label="AI-движок">
        <Select value={enginePreference} onChange={e => setEnginePreference(e.target.value as 'auto' | 'cloud' | 'local')} className="text-xs">
          <option value="auto">Авто (облако / локально)</option>
          <option value="cloud">Облако (Claude / GPT-4o)</option>
          <option value="local">Локально (Ollama / GGUF)</option>
        </Select>
      </FieldGroup>
      <SegmentedControl
        fill
        value={taskModes.scenario}
        onChange={(v) => setTaskMode('scenario', v)}
        options={[
          { value: 'cloud', label: 'Облако' },
          { value: 'local', label: 'Локально', accent: 'success' },
        ]}
      />
      <FieldGroup label="Модель">
        {taskModes.scenario === 'cloud' ? (
          <>
            <Input list="cloud-scen-models" value={cloudEngines.scenario} onChange={e => setCloudEngine('scenario', e.target.value)} className="text-xs font-mono" placeholder="Облачная модель" />
            <datalist id="cloud-scen-models">
              {cloudModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} {!m.is_available ? '(требуется ключ)' : '✓'}
                </option>
              ))}
            </datalist>
          </>
        ) : (
          <Select value={localEngines.scenario} onChange={e => setLocalEngine('scenario', e.target.value)} className="text-xs font-mono">
            <option value="" disabled>Выберите локальную модель...</option>
            {localModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        )}
      </FieldGroup>
    </div>

    <Button variant="primary" onClick={onRunAgent} disabled={isAgentRunning} className="mt-auto py-3 text-base shadow-lg shadow-primary/20">
      {isAgentRunning ? <><Spinner className="text-xl" /> Идет поиск...</> : <><CirclePlay size={20} /> Запустить поиск</>}
    </Button>
  </div>
)
