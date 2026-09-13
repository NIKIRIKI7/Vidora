import type { ElementType, ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ElementType
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export const EmptyState = ({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) => (
  <div className={`flex flex-col items-center justify-center text-center py-10 px-4 gap-3 ${className}`}>
    {Icon && <Icon size={28} strokeWidth={1.75} className="text-on-surface-variant/50" />}
    <div className="text-sm font-medium text-on-surface">{title}</div>
    {description && <div className="text-xs text-on-surface-variant max-w-sm leading-relaxed">{description}</div>}
    {action && <div className="mt-1">{action}</div>}
  </div>
)
