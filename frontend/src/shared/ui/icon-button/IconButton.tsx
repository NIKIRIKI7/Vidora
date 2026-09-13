import type { ButtonHTMLAttributes, ElementType } from 'react'

type IconButtonAccent = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'neutral'
type IconButtonSize = 'xs' | 'sm' | 'md'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ElementType
  size?: IconButtonSize
  accent?: IconButtonAccent
  active?: boolean
}

const sizes: Record<IconButtonSize, { btn: string; icon: number }> = {
  xs: { btn: 'w-6 h-6', icon: 13 },
  sm: { btn: 'w-7 h-7', icon: 14 },
  md: { btn: 'w-9 h-9', icon: 18 },
}

const idleClasses: Record<IconButtonAccent, string> = {
  primary: 'text-on-surface-variant hover:text-primary hover:bg-primary/10',
  secondary: 'text-on-surface-variant hover:text-secondary hover:bg-secondary/10',
  success: 'text-on-surface-variant hover:text-success hover:bg-success/10',
  warning: 'text-on-surface-variant hover:text-warning hover:bg-warning/10',
  error: 'text-on-surface-variant hover:text-error hover:bg-error/10',
  neutral: 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/10',
}

const activeClasses: Record<IconButtonAccent, string> = {
  primary: 'bg-primary/15 text-primary',
  secondary: 'bg-secondary/15 text-secondary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  error: 'bg-error/15 text-error',
  neutral: 'bg-on-surface/10 text-on-surface',
}

export const IconButton = ({ icon: Icon, size = 'sm', accent = 'neutral', active = false, className = '', ...props }: IconButtonProps) => {
  const s = sizes[size]
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none ${s.btn} ${active ? activeClasses[accent] : idleClasses[accent]} ${className}`}
      {...props}
    >
      <Icon size={s.icon} strokeWidth={2} />
    </button>
  )
}
