import type { ReactNode } from 'react'
import { HelpCircle, AlertCircle, MessageSquare, Lightbulb } from 'lucide-react'
import type { FrictionCategory } from './detectFrictionCategory'

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
    colors: 'bg-on-surface/10 text-on-surface/70 border-outline-variant',
  },
}

export const FrictionBadge = ({ category, text, className = '' }: FrictionBadgeProps): ReactNode => {
  const config = categoryConfig[category] ?? categoryConfig.general
  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-full border ${config.colors} ${className}`}>
      <Icon className="w-3 h-3" />
      {text ?? config.label}
    </span>
  )
}
