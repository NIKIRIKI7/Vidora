import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface GradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
}

/** Единый CTA-стиль: градиент secondary → primary. */
export const GradientButton = ({ children, icon, className = '', ...props }: GradientButtonProps) => (
  <button
    className={`flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-white font-medium text-sm bg-gradient-to-r from-secondary to-primary hover:opacity-90 transition-opacity shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${className}`}
    {...props}
  >
    {icon}
    {children}
  </button>
)
