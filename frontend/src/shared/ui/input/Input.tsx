import type { InputHTMLAttributes } from 'react'

export const Input = ({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={`w-full bg-surface-container-lowest border border-white/10 rounded-lg py-2 px-3 text-sm text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all disabled:opacity-50 ${className}`}
    {...props}
  />
)
