import type { ReactNode } from 'react'

interface TooltipProps {
  text: string
  children: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export const Tooltip = ({ text, children, position = 'top' }: TooltipProps) => {
  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  return (
    <div className="relative group inline-flex">
      {children}
      <div className={`absolute whitespace-nowrap z-50 px-2 py-1 bg-surface-container-highest border border-white/10 rounded text-on-surface font-label text-[10px] uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${positions[position]}`}>
        {text}
      </div>
    </div>
  )
}
