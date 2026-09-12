import type { ReactNode } from 'react'
import { X, Flame, MessageSquare, Sparkles, ExternalLink, Users, Eye, Zap } from 'lucide-react'
import { useVideoInspectorStore } from '@features/inspect-video'
import { RetentionHeatmapChart } from '@shared/ui/retention-chart'
import { DetailedCommentsFeed } from '@features/mine-comments'
import { HookDeconstructionPanel } from '@features/analyze-hook'
import type { StolenHook } from '@shared/api'

interface VideoDeepDiveDrawerProps {
  onApplyHookToScenario?: (hook: StolenHook) => void
}

export const VideoDeepDiveDrawer = ({ onApplyHookToScenario }: VideoDeepDiveDrawerProps): ReactNode => {
  const { isOpen, activeTab, candidate, deepDive, isLoading, error, closeInspector, setActiveTab } = useVideoInspectorStore()

  if (!isOpen || !candidate) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl h-full bg-surface border-l border-outline-variant shadow-2xl flex flex-col overflow-hidden text-white">
        <div className="p-4 border-b border-outline-variant bg-surface-container-low/60 flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {candidate.isRocket && (
                  <span className="px-2 py-0.5 bg-gradient-to-r from-orange-500 to-amber-500 text-black font-extrabold text-[10px] rounded-full flex items-center gap-1 uppercase">
                    <Zap className="w-3 h-3 fill-black" /> Ракета (Rocket)
                  </span>
                )}
                <span className="text-xs text-on-surface-variant/70">{candidate.channelTitle}</span>
              </div>
              <h2 className="text-sm font-bold text-white line-clamp-2 leading-snug">{candidate.title}</h2>
            </div>

            <div className="flex items-center gap-1.5">
              <a
                href={`https://www.youtube.com/watch?v=${candidate.videoId}`}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                title="Открыть видео на YouTube"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={closeInspector}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-white/80 bg-black/30 p-2 rounded-lg border border-outline-variant/30">
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-secondary" />
              {candidate.viewCount.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-primary" />
              {candidate.subscriberCount ? candidate.subscriberCount.toLocaleString() : 'N/A'} сабов
            </span>
            {candidate.ratio && (
              <span className="text-warning font-bold">
                Ratio: {candidate.ratio}x
              </span>
            )}
            {candidate.vph && (
              <span className="text-secondary">
                {candidate.vph} VPH
              </span>
            )}
          </div>

          <div className="flex gap-1.5 mt-1 border-b border-outline-variant/30 pb-1">
            <button
              onClick={() => setActiveTab('retention')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'retention'
                  ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              Удержание (Heatmap)
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'comments'
                  ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Боли (Комментарии)
            </button>
            <button
              onClick={() => setActiveTab('hook')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'hook'
                  ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Анатомия хука
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-xs text-white/50">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Загрузка Heatmap и комментариев через InnerTube...
            </div>
          ) : error ? (
            <div className="p-4 bg-error/10 border border-error/20 text-error text-xs rounded-xl">
              {error}
            </div>
          ) : (
            <>
              {activeTab === 'retention' && (
                <div className="space-y-4">
                  <RetentionHeatmapChart
                    heatmap={deepDive?.heatmap ?? []}
                    chapters={deepDive?.chapters ?? []}
                    totalDurationSeconds={candidate.durationSeconds}
                  />

                  {deepDive?.chapters && deepDive.chapters.length > 0 && (
                    <div className="p-3 bg-surface-container-low border border-outline-variant/30 rounded-xl">
                      <h4 className="text-xs font-bold text-white mb-2">Главы ролика ({deepDive.chapters.length})</h4>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs">
                        {deepDive.chapters.map((ch, idx) => (
                          <div key={idx} className="flex justify-between py-1 border-b border-outline-variant/30 text-white/70">
                            <span className="truncate pr-2">{ch.title}</span>
                            <span className="font-mono text-secondary">
                              {Math.floor(ch.startSeconds / 60)}:{(ch.startSeconds % 60).toString().padStart(2, '0')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'comments' && (
                <DetailedCommentsFeed
                  comments={deepDive?.comments ?? []}
                  videoTitle={candidate.title}
                />
              )}

              {activeTab === 'hook' && (
                <HookDeconstructionPanel
                  initialTranscript={candidate.title}
                  onApplyHookToScenario={onApplyHookToScenario}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
