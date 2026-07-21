import type { InputHTMLAttributes } from 'react'

export const Slider = ({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    type="range"
    className={`w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-secondary disabled:opacity-50 ${className}`}
    {...props}
  />
)
