import { Button } from '@shared/ui'
import { Eye, Sparkles, Check } from 'lucide-react'
import type { VideoResult } from '@entities/project'

interface AgentThumbnailsTabProps {
  agentResults: VideoResult[]
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
}

export const AgentThumbnailsTab = ({ agentResults, copiedKey, onCopy }: AgentThumbnailsTabProps) => (
  <div className="flex flex-col gap-6">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-primary font-bold text-xl flex items-center gap-2">
          <Eye size={24} /> Анализ Вирусных Обложек (Thumbnails)
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">
          Визуальные паттерны, компоновки и заголовки, обеспечившие максимальный CTR в вашей нише.
        </p>
      </div>
    </div>

    {agentResults.length === 0 ? (
      <div className="w-full py-16 flex flex-col items-center justify-center text-center bg-surface-container-low/40 rounded-2xl border border-dashed border-outline-variant">
        <Eye className="w-12 h-12 text-primary/40 mb-3" />
        <h4 className="text-base font-bold text-on-surface mb-1">Нет роликов для визуального анализа</h4>
        <p className="text-xs text-on-surface-variant max-w-md mb-5 leading-relaxed">
          Запустите поиск, чтобы собрать ролики с наивысшим VPH и изучить их обложки.
        </p>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {agentResults.map((v, i) => (
          <div key={i} className="bg-surface-container-low/80 border border-outline-variant hover:border-primary/40 rounded-2xl p-3 flex flex-col justify-between gap-3 shadow-lg group transition-all">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-surface-container-lowest">
              <img
                src={v.thumbnail_url || `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`}
                alt={v.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute top-2 right-2 bg-primary/90 text-on-surface font-mono text-xxs font-bold px-2 py-0.5 rounded-md shadow">
                {v.vph} VPH
              </div>
              <span className="absolute bottom-2 left-2 bg-surface-container-lowest/80 text-secondary font-mono text-xxs px-1.5 py-0.5 rounded">
                x{v.ratio} Ratio
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-bold text-on-surface line-clamp-2 leading-snug">
                {v.title}
              </h4>
              <span className="text-2xs text-on-surface-variant truncate">{v.channel}</span>
            </div>
            <div className="pt-2 border-t border-outline-variant flex items-center justify-between">
              <Button
                variant="link"
                onClick={() => onCopy(`Промпт для обложки на тему: "${v.title}". Стиль: YouTube High CTR thumbnail, эмоциональный акцент, контрастный неоновый свет, минималистичный текст до 3 слов.`, `thumb_${i}`)}
                className="w-full py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg font-semibold"
              >
                {copiedKey === `thumb_${i}` ? <><Check size={12} /> Скопировано</> : <><Sparkles size={12} /> Промпт для обложки</>}
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)
