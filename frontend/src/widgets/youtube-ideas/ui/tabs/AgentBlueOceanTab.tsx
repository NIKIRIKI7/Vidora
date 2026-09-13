import { Button } from '@shared/ui'
import { Compass, Sparkles, Copy, Check } from 'lucide-react'
import type { BlueOceanOpportunity } from '@entities/project'

interface AgentBlueOceanTabProps {
  blueOceanGaps: BlueOceanOpportunity[]
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
  onSynthesizeBlueOceans: () => void
}

export const AgentBlueOceanTab = ({
  blueOceanGaps,
  copiedKey,
  onCopy,
  onSynthesizeBlueOceans,
}: AgentBlueOceanTabProps) => (
  <div className="flex flex-col gap-6">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-secondary font-bold text-xl flex items-center gap-2">
          <Compass size={24} /> Голубые Океаны (Ниши без конкуренции)
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">
          Темы с высоким спросом аудитории, где еще нет доминирующих видео крупных каналов.
        </p>
      </div>
      {blueOceanGaps.length === 0 && (
        <Button variant="primary" onClick={onSynthesizeBlueOceans} className="text-xs">
          <Sparkles size={14} className="mr-1.5" /> Сформировать из найденных сигналов
        </Button>
      )}
    </div>

    {blueOceanGaps.length === 0 ? (
      <div className="w-full py-16 flex flex-col items-center justify-center text-center bg-surface-container-low/40 rounded-2xl border border-dashed border-outline-variant">
        <Compass className="w-12 h-12 text-secondary/40 mb-3" />
        <h4 className="text-base font-bold text-on-surface mb-1">Голубые Океаны еще не выделены</h4>
        <p className="text-xs text-on-surface-variant max-w-md mb-5 leading-relaxed">
          Нажмите кнопку ниже, чтобы ИИ сопоставил ранние сигналы с базой видео и сформировал свободные ниши.
        </p>
        <Button variant="primary" onClick={onSynthesizeBlueOceans} className="text-xs">
          <Sparkles size={14} className="mr-1.5" /> Сформировать Голубые Океаны
        </Button>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {blueOceanGaps.map((gap, i) => (
          <div key={i} className="bg-surface-container-low/90 border border-secondary/20 hover:border-secondary/50 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-lg transition-all">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xxs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary/20 text-secondary border border-secondary/30">
                  Оценка: {gap.opportunity_score}/100
                </span>
                <span className="text-xxs font-mono text-success font-semibold">
                  {gap.status}
                </span>
              </div>
              <h4 className="font-bold text-on-surface text-sm leading-snug">
                {gap.topic}
              </h4>
              <p className="text-xs text-on-surface leading-relaxed bg-surface-container-lowest/30 p-2.5 rounded-xl border border-outline-variant/20">
                💡 {gap.actionable_angle}
              </p>
            </div>
            <div className="pt-3 border-t border-outline-variant flex items-center justify-between text-xs">
              <span className="text-2xs text-on-surface-variant font-mono">
                Источник: <b className="text-on-surface">{gap.demand_source}</b>
              </span>
              <Button
                variant="link"
                onClick={() => onCopy(gap.topic, `ocean_${i}`)}
                className="px-2.5 py-1 bg-secondary/10 hover:bg-secondary text-secondary hover:text-surface-container-lowest rounded-lg font-semibold"
              >
                {copiedKey === `ocean_${i}` ? <><Check size={12} /> Скопировано</> : <><Copy size={12} /> Тема</>}
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)
