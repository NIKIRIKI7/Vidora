import type { HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'neutral' | 'mono'
}

export const Badge = ({ variant = 'neutral', className = '', ...props }: BadgeProps) => {
  const base = 'inline-flex items-center justify-center px-2 py-0.5 rounded'

  const variants = {
    primary: 'font-label text-xs font-medium text-primary uppercase tracking-wider bg-primary/10 border border-primary/20',
    neutral: 'font-label text-xs font-medium text-on-surface-variant uppercase tracking-wider bg-surface-container border border-white/5',
    mono: 'font-mono text-[13px] text-on-surface-variant bg-surface-container border border-white/5',
  }

  return <span className={`${base} ${variants[variant]} ${className}`} {...props} />
}
