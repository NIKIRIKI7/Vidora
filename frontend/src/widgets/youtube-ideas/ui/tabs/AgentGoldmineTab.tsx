import { Button, Spinner } from '@shared/ui'
import { MessageSquare, MessageCircle, Sparkles, Copy, Check } from 'lucide-react'
import type { CommentGoldmineVideoEntry } from '@entities/project'

interface AgentGoldmineTabProps {
  goldmineReports: CommentGoldmineVideoEntry[]
  copiedKey: string | null
  isAgentRunning: boolean
  onCopy: (text: string, key: string) => void
  onRunAgent: () => void
}

export const AgentGoldmineTab = ({
  goldmineReports,
  copiedKey,
  isAgentRunning,
  onCopy,
  onRunAgent,
}: AgentGoldmineTabProps) => (
  <div className="flex flex-col gap-6">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-warning font-bold text-xl flex items-center gap-2">
          <MessageSquare size={24} /> Золотая Жила Комментариев (Боли &amp; Споры)
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">
          Реальные вопросы, фрустрации и разногласия зрителей, из которых получаются темы с максимальным CTR.
        </p>
      </div>
    </div>

    {goldmineReports.length === 0 ? (
      <div className="w-full py-16 flex flex-col items-center justify-center text-center bg-surface-container-low/40 rounded-2xl border border-dashed border-outline-variant">
        <MessageCircle className="w-12 h-12 text-warning/40 mb-3" />
        <h4 className="text-base font-bold text-on-surface mb-1">Анализ комментариев еще не выполнен</h4>
        <p className="text-xs text-on-surface-variant max-w-md mb-5 leading-relaxed">
          Запустите поиск видео — ИИ извлечет комментарии и выделит боли зрителей.
        </p>
        <Button variant="secondary" onClick={onRunAgent} disabled={isAgentRunning} className="text-xs">
          {isAgentRunning ? <Spinner className="w-4 h-4 mr-2" /> : <Sparkles size={14} className="mr-1.5" />}
          Собрать комментарии и боли
        </Button>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goldmineReports.map((report, i) => (
          <div key={i} className="bg-surface-container-low/90 border border-warning/20 hover:border-warning/50 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-lg transition-all">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xxs font-bold px-2 py-0.5 rounded-full bg-warning/20 text-warning border border-warning/30">
                  {report.confusion_status || 'DISRUPTION_OPPORTUNITY'}
                </span>
                <span className="text-xxs font-mono text-on-surface-variant">
                  {report.views?.toLocaleString('ru')} views • {report.vph} VPH
                </span>
              </div>
              <h4 className="font-bold text-on-surface text-sm leading-snug line-clamp-2">
                {report.video_title}
              </h4>
              {report.actionable_fix && (
                <div className="p-2.5 rounded-xl bg-warning/20 border border-warning/20 text-xs text-warning">
                  <span className="font-bold block mb-1">🛠️ Как снять лучше:</span>
                  {report.actionable_fix}
                </div>
              )}
              {report.top_pains && report.top_pains.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {report.top_pains.map((p, pIdx) => (
                    <span key={pIdx} className="text-2xs px-2 py-1 bg-surface-container-lowest/40 border border-outline-variant/40 rounded-lg text-on-surface flex items-center gap-1">
                      <span className="text-warning">🔥</span> {p.topic} <b className="text-secondary font-mono">({p.count})</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="pt-2 border-t border-outline-variant flex items-center justify-between text-xs text-on-surface-variant">
              <span>Вопросы: <b className="text-on-surface">{report.questions_count || 0}</b> • Споры: <b className="text-on-surface">{report.debates_count || 0}</b></span>
              <Button
                variant="link"
                onClick={() => onCopy(report.actionable_fix || report.video_title, `fix_${i}`)}
                className="text-warning hover:underline"
              >
                {copiedKey === `fix_${i}` ? <><Check size={12} /> Скопировано</> : <><Copy size={12} /> Скопировать инсайт</>}
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)
