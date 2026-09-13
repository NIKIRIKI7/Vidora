import type { ElementType, ReactNode } from 'react'

export interface TabItem {
  id: string
  label: ReactNode
  icon?: ElementType
  badge?: ReactNode
}

interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  variant?: 'pill' | 'underline'
  fill?: boolean
  className?: string
}

export const Tabs = ({ items, value, onChange, variant = 'pill', fill = false, className = '' }: TabsProps) => (
  <div className={`flex items-center gap-1 ${className}`}>
    {items.map((item) => {
      const isActive = item.id === value
      const Icon = item.icon
      const base = `flex items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors cursor-pointer ${fill ? 'flex-1 justify-center' : ''}`
      const styles = variant === 'pill'
        ? `px-4 py-2 rounded-xl ${isActive ? 'bg-primary/15 text-primary' : 'text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface'}`
        : `px-4 py-3 border-b-2 ${isActive ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`

      return (
        <button key={item.id} type="button" onClick={() => onChange(item.id)} className={`${base} ${styles}`}>
          {Icon && <Icon size={20} strokeWidth={2} />}
          {item.label}
          {item.badge}
        </button>
      )
    })}
  </div>
)
