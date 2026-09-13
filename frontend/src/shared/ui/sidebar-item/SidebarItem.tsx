import type { ElementType } from 'react'

interface SidebarItemProps {
  icon?: ElementType
  label: string
  isActive?: boolean
  onClick?: () => void
  className?: string
}

export const SidebarItem = ({ icon: Icon, label, isActive = false, onClick, className = '' }: SidebarItemProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center w-full gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium transition-colors cursor-pointer
      ${isActive ? 'bg-primary/15 text-primary' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'} ${className}`}
  >
    {Icon && <Icon size={20} strokeWidth={2} className={isActive ? 'text-primary' : 'text-on-surface-variant'} />}
    <span className="truncate">{label}</span>
  </button>
)
