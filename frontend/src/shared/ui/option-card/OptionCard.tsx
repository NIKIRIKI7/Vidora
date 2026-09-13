import type { ElementType, ReactNode } from 'react'

type OptionAccent = 'primary' | 'secondary' | 'success' | 'warning' | 'error'

interface OptionCardProps {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ElementType
  isActive?: boolean
  onClick?: () => void
  accent?: OptionAccent
  showIcon?: boolean
  className?: string
  children?: ReactNode
}

const activeClasses: Record<OptionAccent, string> = {
  primary: 'border-primary/50 bg-primary/10',
  secondary: 'border-secondary/50 bg-secondary/10',
  success: 'border-success/50 bg-success/10',
  warning: 'border-warning/50 bg-warning/10',
  error: 'border-error/50 bg-error/10',
}

const iconClasses: Record<OptionAccent, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
}

export const OptionCard = ({
  title,
  subtitle,
  icon: Icon,
  isActive = false,
  onClick,
  accent = 'primary',
  showIcon = true,
  className = '',
  children,
}: OptionCardProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left rounded-2xl border p-3 flex flex-col gap-1.5 transition-all cursor-pointer ${
      isActive
        ? `${activeClasses[accent]} text-on-surface`
        : 'border-outline-variant/40 bg-surface-container-lowest hover:border-outline-variant text-on-surface-variant hover:text-on-surface'
    } ${className}`}
  >
    {Icon && showIcon && <Icon size={18} strokeWidth={2} className={isActive ? iconClasses[accent] : ''} />}
    {children}
    <div className="text-xs font-bold text-on-surface">{title}</div>
    {subtitle && <div className="text-xxs text-outline">{subtitle}</div>}
  </button>
)
