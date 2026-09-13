import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'low' | 'outline'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export const Card = ({ variant = 'default', padding = 'md', className = '', children, ...props }: CardProps) => {
  const variants = {
    default: 'bg-surface-container/60 border border-outline-variant/30',
    low: 'bg-surface-container-lowest/50 border border-outline-variant/30',
    outline: 'bg-transparent border border-outline-variant/40',
  }
  const paddings = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' }

  return (
    <div className={`rounded-2xl ${variants[variant]} ${paddings[padding]} ${className}`} {...props}>
      {children}
    </div>
  )
}
