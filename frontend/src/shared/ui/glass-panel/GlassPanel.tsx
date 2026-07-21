import type { HTMLAttributes } from 'react'

export const GlassPanel = ({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`rounded-lg p-3 bg-surface-container/20 border border-white/5 hover:border-primary/30 transition-colors cursor-pointer ${className}`}
    {...props}
  />
)
