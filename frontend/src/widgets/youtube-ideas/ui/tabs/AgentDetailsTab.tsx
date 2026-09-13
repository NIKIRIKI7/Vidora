import { Button, Badge, Spinner, SegmentedControl } from '@shared/ui'
import { TrendingUp, Flame, List, LayoutGrid, FishingHook } from 'lucide-react'
import type { EarlySignalItem, VideoResult } from '@entities/project'
import { fmtDuration } from '../../model/constants'

interface AgentDetailsTabProps {
  earlySignals: EarlySignalItem[]
  agentResults: VideoResult[]
  isGridView: boolean
  onGridViewChange: (v: boolean) => void
  isAgentRunning: boolean
  onAnalyzeHook: (video: VideoResult) => void
  onLoadMoreVideos: () => void
}

export const AgentDetailsTab = ({
  earlySignals,
  agentResults,
  isGridView,
  onGridViewChange,
  isAgentRunning,
  onAnalyzeHook,
  onLoadMoreVideos,
}: AgentDetailsTabProps) => (
  <>
    {earlySignals.length > 0 && (
      <div>
        <h3 className="text-primary font-bold text-xl mb-4 flex items-center gap-2">
          <TrendingUp size={24} className="text-primary" /> Ранние сигналы соцсетей и спроса
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {earlySignals.map((s) => (
            <div key={s.id} className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <Badge variant={s.vps_score >= 80 ? 'error' : 'primary'} size="md">
                  VPS: {s.vps_score}/100 {s.breakout ? '🔥 Breakout' : ''}
                </Badge>
                <span className="text-xxs text-on-surface-variant font-medium">{s.growth_pct}</span>
              </div>
              <a href={s.source_url || `https://www.google.com/search?q=${encodeURIComponent(s.title)}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-on-surface hover:text-secondary line-clamp-2 leading-snug">
                {s.title}
              </a>
            </div>
          ))}
        </div>
      </div>
    )}

    {agentResults.length > 0 && (
      <div>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-on-surface font-bold text-xl flex items-center gap-2">
            <Flame size={24} className="text-error" /> Найденные вирусные видео (по критериям)
          </h3>
          <SegmentedControl
            value={isGridView ? 'grid' : 'list'}
            onChange={(v) => onGridViewChange(v === 'grid')}
            options={[
              { value: 'list', label: 'Список', icon: List },
              { value: 'grid', label: 'Сетка', icon: LayoutGrid },
            ]}
          />
        </div>

        <div className={isGridView ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" : "flex flex-col gap-3"}>
          {!isGridView ? (
            agentResults.map((v, i) => (
              <div key={i} className="bg-surface-container-lowest/40 border border-outline-variant/40 p-3 rounded-xl flex items-center justify-between gap-4 hover:border-primary/40 transition-colors shadow-sm group">
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="relative w-44 shrink-0 aspect-video rounded-lg overflow-hidden bg-surface-container-low block">
                  <img src={v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute top-1 right-1 bg-error text-on-surface px-1.5 py-0.5 rounded text-xxs font-black font-mono">
                    {v.vph} VPH
                  </div>
                </a>
                <div className="flex-1 min-w-0">
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="font-bold text-sm text-on-surface hover:text-primary transition-colors line-clamp-1">
                    {v.title}
                  </a>
                  <div className="text-xs text-on-surface-variant mt-0.5">
                    {v.channel} • {v.subs > 0 ? `${v.subs.toLocaleString('ru')} сабов` : ''} • {v.views.toLocaleString('ru')} views
                  </div>
                  <div className="flex gap-2 mt-2">
                    <span className="bg-warning/20 text-warning px-1.5 py-0.5 rounded text-xxs font-bold border border-warning/30">x{v.ratio} ratio</span>
                    <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-xxs font-bold border border-primary/30">{fmtDuration(v)}</span>
                  </div>
                </div>
                <Button variant="dashed" className="shrink-0 text-xs py-2 px-4 border-secondary/40 text-secondary hover:bg-secondary/10 flex items-center gap-1.5" onClick={() => onAnalyzeHook(v)}>
                  <FishingHook size={15} /> Украсть Хук
                </Button>
              </div>
            ))
          ) : (
            agentResults.map((v, i) => (
              <div key={i} className="bg-surface-container-lowest/40 border border-outline-variant/40 p-3 rounded-2xl flex flex-col gap-3 group hover:border-primary/30 transition-colors shadow-md relative">
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="relative rounded-xl overflow-hidden aspect-video block group/thumb bg-surface-container-low">
                  <img src={v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`} alt={v.title} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300" />
                  <div className="absolute top-2 right-2 bg-error text-on-surface px-2 py-1 rounded-lg text-xs font-black shadow-lg border border-error/50">
                    {v.vph} VPH 🔥
                  </div>
                </a>
                <div className="flex-1">
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="font-bold text-sm line-clamp-2 leading-snug mb-1 text-on-surface hover:text-primary transition-colors">
                    {v.title}
                  </a>
                  <div className="text-2xs text-on-surface-variant mb-2">{v.channel} • {v.subs > 0 ? `${v.subs.toLocaleString('ru')} сабов` : ''} • {v.views.toLocaleString('ru')} views</div>
                  <div className="flex gap-2 flex-wrap">
                    <span className="bg-warning/20 text-warning px-1.5 py-0.5 rounded text-xxs font-bold border border-warning/30">x{v.ratio} ratio</span>
                    <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-xxs font-bold border border-primary/30">{fmtDuration(v)}</span>
                  </div>
                </div>
                <div className="mt-auto pt-2 flex items-center gap-2">
                  <Button variant="dashed" className="flex-1 text-xs py-1.5 border-secondary/30 text-secondary hover:bg-secondary/10 flex items-center justify-center gap-1.5 font-semibold" onClick={() => onAnalyzeHook(v)}>
                    <FishingHook size={14} className="mr-1" /> Украсть Хук
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-center mt-6">
          <Button
            variant="outline"
            onClick={onLoadMoreVideos}
            disabled={isAgentRunning}
            className="gap-2 px-6 py-2.5 rounded-xl shadow-lg font-semibold"
          >
            {isAgentRunning ? (
              <>
                <Spinner className="w-4 h-4" />
                <span>ИИ ищет новые ролики по Google Trends...</span>
              </>
            ) : (
              <>
                <span className="text-base">↻</span>
                <span>Найти еще видео (новые ключевые слова)</span>
              </>
            )}
          </Button>
        </div>
      </div>
    )}
  </>
)
