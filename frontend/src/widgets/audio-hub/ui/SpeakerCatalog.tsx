import { Cloud, Play, Server } from 'lucide-react'
import { IconButton, Input, SegmentedControl, Spinner, type SegmentOption } from '@shared/ui'
import { API } from '@shared/lib'
import type { SpeakerProfileDto, VoiceMode } from '@shared/api'
import type { SpeakerCategoryFilter } from '../model/useAudioHub'

interface SpeakerCatalogProps {
  isLoading: boolean
  speakers: SpeakerProfileDto[]
  activeSpeakerId: string | null
  searchQuery: string
  onSearchChange: (value: string) => void
  activeEnv: VoiceMode
  onEnvChange: (env: VoiceMode) => void
  categoryFilter: SpeakerCategoryFilter
  onCategoryFilterChange: (filter: SpeakerCategoryFilter) => void
  onSelectSpeaker: (speakerId: string) => void
}

const ENV_OPTIONS: SegmentOption<VoiceMode>[] = [
  { value: 'local', label: 'Локальные', icon: Server, accent: 'success' },
  { value: 'cloud', label: 'Облачные', icon: Cloud, accent: 'secondary' },
]

const CATEGORY_OPTIONS: SegmentOption<SpeakerCategoryFilter>[] = [
  { value: 'all', label: 'Все' },
  { value: 'BuiltIn', label: 'Заготовки', accent: 'secondary' },
  { value: 'custom', label: 'Мои профили', accent: 'secondary' },
]

export const SpeakerCatalog = ({
  isLoading,
  speakers,
  activeSpeakerId,
  searchQuery,
  onSearchChange,
  activeEnv,
  onEnvChange,
  categoryFilter,
  onCategoryFilterChange,
  onSelectSpeaker,
}: SpeakerCatalogProps) => (
  <aside className="w-[var(--layout-sidebar-sm)] shrink-0 border-r border-outline-variant/40 bg-surface-container-lowest/40 flex flex-col">
    {/* Разграничение: Локально vs Облако */}
    <div className="p-3 border-b border-outline-variant/20 flex flex-col gap-2.5">
      <Input
        placeholder="Поиск диктора..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="text-xs py-1.5"
      />

      {/* Главные вкладки среды */}
      <SegmentedControl
        fill
        value={activeEnv}
        onChange={onEnvChange}
        options={ENV_OPTIONS}
      />

      {/* Под-фильтр категорий */}
      <SegmentedControl
        fill
        value={categoryFilter}
        onChange={onCategoryFilterChange}
        options={CATEGORY_OPTIONS}
      />
    </div>

    {/* Список дикторов */}
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
      {isLoading ? (
        <div className="flex justify-center p-8 text-xs text-on-surface-variant">
          <Spinner className="w-5 h-5" />
        </div>
      ) : speakers.length === 0 ? (
        <div className="text-center text-xs text-on-surface-variant/60 py-10">
          Дикторы не найдены
        </div>
      ) : (
        speakers.map((spk) => {
          const isSelected = activeSpeakerId === spk.speaker_id
          const isLocal = spk.mode === 'local'

          return (
            <div
              key={spk.id}
              onClick={() => onSelectSpeaker(spk.speaker_id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 group ${
                isSelected
                  ? 'bg-primary/15 border-primary shadow-lg shadow-primary/12'
                  : 'bg-surface-container/40 border-outline-variant/20 hover:border-outline-variant/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      isLocal ? 'bg-success/20 text-success' : 'bg-secondary/20 text-secondary'
                    }`}
                  >
                    {spk.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-xs text-on-surface truncate group-hover:text-primary transition-colors">
                      {spk.name}
                    </span>
                    <span className="text-xxs font-mono text-on-surface-variant/70 truncate">
                      {spk.speaker_id}
                    </span>
                  </div>
                </div>

                {/* Быстрое прослушивание сэмпла */}
                {spk.preview_audio_path && (
                  <IconButton
                    icon={Play}
                    size="xs"
                    accent="primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      const streamUrl = `${API}/api/v1/render/media?path=${encodeURIComponent(
                        spk.preview_audio_path!
                      )}`
                      const audio = new Audio(streamUrl)
                      audio.play().catch(() => {})
                    }}
                    className="bg-on-surface/5"
                    title="Прослушать сэмпл"
                  />
                )}
              </div>

              <div className="flex items-center justify-between text-xxs font-mono pt-1 border-t border-outline-variant/20 text-on-surface-variant/60">
                <span className={isLocal ? 'text-success/80' : 'text-secondary/80'}>
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
)
