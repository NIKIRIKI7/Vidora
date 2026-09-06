import type { ReactNode } from 'react'
import { HelpCircle, AlertCircle, MessageSquare, Lightbulb } from 'lucide-react'

export type FrictionCategory = 'question' | 'problem' | 'debate' | 'mechanism' | 'general'

interface FrictionBadgeProps {
  category: FrictionCategory
  text?: string
  className?: string
}

const categoryConfig: Record<FrictionCategory, { icon: typeof HelpCircle; label: string; colors: string }> = {
  question: {
    icon: HelpCircle,
    label: 'Вопрос новичка',
    colors: 'bg-secondary/10 text-secondary border-secondary/20',
  },
  problem: {
    icon: AlertCircle,
    label: 'Ошибка / Баг',
    colors: 'bg-error/10 text-error border-error/20',
  },
  debate: {
    icon: MessageSquare,
    label: 'Спор / Альтернатива',
    colors: 'bg-primary/10 text-primary border-primary/20',
  },
  mechanism: {
    icon: Lightbulb,
    label: 'Скрытый механизм',
    colors: 'bg-warning/10 text-warning border-warning/20',
  },
  general: {
    icon: HelpCircle,
    label: 'Инсайт',
    colors: 'bg-white/10 text-on-surface/70 border-outline-variant',
  },
}

export const FrictionBadge = ({ category, text, className = '' }: FrictionBadgeProps): ReactNode => {
  const config = categoryConfig[category] ?? categoryConfig.general
  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${config.colors} ${className}`}>
      <Icon className="w-3 h-3" />
      {text ?? config.label}
    </span>
  )
}

export const detectFrictionCategory = (commentText: string): FrictionCategory => {
  const lower = commentText.toLowerCase()
  if (/как (правильно|сделать|настроить)|how to|how do i|\?/i.test(lower)) return 'question'
  if (/не работает|ошибка|баг|сломалось|doesn't work|bug|failed|error/i.test(lower)) return 'problem'
  if (/на самом деле|не согласен|вранье|лучше бы|instead of|disagree|wrong/i.test(lower)) return 'debate'
  if (/почему|в чем причина|зачем|why does|nobody explains/i.test(lower)) return 'mechanism'
  return 'general'
}
