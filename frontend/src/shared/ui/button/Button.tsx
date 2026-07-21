import type { ButtonHTMLAttributes } from 'react'
import { Icon } from '../icon/Icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'glass' | 'icon' | 'dashed'
  icon?: string
  filledIcon?: boolean
}

export const Button = ({ variant = 'primary', icon, filledIcon, children, className = '', ...props }: ButtonProps) => {
  const base = 'transition-all active:scale-95 flex items-center justify-center shrink-0'
  const variants = {
    primary:
      'bg-gradient-to-r from-primary-container to-inverse-primary hover:from-primary hover:to-primary-container text-white shadow-[0_0_20px_rgba(221,183,255,0.2)] hover:shadow-[0_0_30px_rgba(221,183,255,0.4)] py-2 px-6 rounded-lg font-medium text-sm gap-2',
    secondary:
      'bg-secondary/10 border border-secondary/30 text-secondary hover:bg-secondary/20 py-1.5 px-4 rounded-full text-xs font-medium gap-2',
    ghost:
      'bg-transparent hover:bg-white/10 text-on-surface-variant hover:text-white rounded py-2 px-4 text-xs font-medium border border-transparent hover:border-white/20 gap-2',
    glass:
      'bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 shadow-[0_0_15px_rgba(221,183,255,0.15)] rounded-xl flex-col gap-1 w-16 h-16 text-[10px] font-medium leading-none',
    icon: 'hover:bg-primary/10 text-on-surface-variant hover:text-primary rounded-full w-10 h-10',
    dashed:
      'border border-dashed border-white/20 rounded-lg text-on-surface-variant hover:text-primary hover:border-primary/50 hover:bg-white/5 py-2 px-4 font-label text-xs font-medium gap-2',
  }

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {icon && (
        <Icon name={icon} filled={filledIcon} className={variant === 'glass' ? 'text-[24px]' : 'text-[20px]'} />
      )}
      {children}
    </button>
  )
}
