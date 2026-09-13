import type { ButtonHTMLAttributes, ElementType } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'glass' | 'icon' | 'dashed' | 'danger' | 'outline' | 'link'
  icon?: ElementType
  filledIcon?: boolean
  size?: 'sm' | 'md'
}

export const Button = ({ variant = 'primary', icon: IconComp, filledIcon, size = 'md', children, className = '', ...props }: ButtonProps) => {
  const base = 'transition-all active:scale-95 flex items-center justify-center text-center cursor-pointer disabled:opacity-50 disabled:pointer-events-none'
  const variants = {
    primary:
      'bg-gradient-to-r from-primary-container to-inverse-primary hover:from-primary hover:to-primary-container text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 py-2 px-6 rounded-lg font-medium text-sm gap-2',
    secondary:
      'bg-secondary/10 border border-secondary/30 text-secondary hover:bg-secondary/20 py-1.5 px-4 rounded-full text-xs font-medium gap-2',
    ghost:
      'bg-transparent hover:bg-on-surface/10 text-on-surface-variant hover:text-on-surface rounded py-2 px-4 text-xs font-medium border border-transparent hover:border-outline-variant/40 gap-2',
    glass:
      'bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 shadow-lg shadow-primary/15 rounded-xl flex-col gap-1 w-16 h-16 text-xxs font-medium leading-none shrink-0',
    icon: `hover:bg-primary/10 text-on-surface-variant hover:text-primary rounded-full shrink-0 ${size === 'sm' ? 'w-7 h-7' : 'w-10 h-10'}`,
    dashed:
      'border border-dashed border-outline-variant/50 rounded-lg text-on-surface-variant hover:text-primary hover:border-primary/50 hover:bg-on-surface/5 py-2 px-4 font-label text-xs font-medium gap-2',
    danger:
      'bg-error/10 border border-error/30 text-error hover:bg-error/20 py-2 px-4 rounded-lg text-sm font-medium gap-2',
    outline:
      'bg-transparent border border-outline-variant/50 text-on-surface hover:border-primary/40 hover:text-primary hover:bg-primary/5 rounded-lg py-2 px-4 text-xs font-medium gap-2',
    link:
      'bg-transparent text-secondary hover:text-on-surface rounded px-1 py-0.5 text-xs font-medium gap-1',
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {IconComp && (
        <IconComp
          size={variant === 'glass' ? 24 : size === 'sm' ? 16 : 20}
          fill={filledIcon ? 'currentColor' : 'none'}
          strokeWidth={2}
        />
      )}
      {children}
    </button>
  )
}
