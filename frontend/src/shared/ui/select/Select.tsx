import type { SelectHTMLAttributes } from 'react'
import { Icon } from '../icon'

export const Select = ({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="relative">
    <select
      className={`w-full bg-surface-container-lowest border border-white/10 rounded-lg py-2 pl-3 pr-8 text-sm text-on-surface appearance-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 cursor-pointer disabled:opacity-50 ${className}`}
      {...props}
    />
    <Icon
      name="expand_more"
      className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[20px]"
    />
  </div>
)
