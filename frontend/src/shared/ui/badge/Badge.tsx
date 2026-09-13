import type { ReactNode } from 'react'

type BadgeVariant = 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'neutral'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  size?: BadgeSize
  icon?: ReactNode
  className?: string
}

const variants: Record<BadgeVariant, string> = {
  primary: 'bg-primary/15 text-primary border-primary/30',
  secondary: 'bg-secondary/15 text-secondary border-secondary/30',
  tertiary: 'bg-tertiary/15 text-tertiary border-tertiary/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  error: 'bg-error/15 text-error border-error/30',
  neutral: 'bg-on-surface/5 text-on-surface-variant border-outline-variant/40',
}

const sizes: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-xxs',
  md: 'px-2 py-0.5 text-xs',
}

export const Badge = ({ children, variant = 'neutral', size = 'sm', icon, className = '' }: BadgeProps) => (
  <span className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap ${variants[variant]} ${sizes[size]} ${className}`}>
    {icon}
    {children}
  </span>
)
