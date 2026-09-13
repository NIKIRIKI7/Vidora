import type { ElementType, ReactNode } from 'react'

type Accent = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'tertiary'

export interface SegmentOption<T extends string = string> {
  value: T
  label: ReactNode
  icon?: ElementType
  accent?: Accent
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  fill?: boolean
  className?: string
}

const activeClasses: Record<Accent, string> = {
  primary: 'bg-primary/15 text-primary',
  secondary: 'bg-secondary/15 text-secondary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  error: 'bg-error/15 text-error',
  tertiary: 'bg-tertiary/15 text-tertiary',
}

export function SegmentedControl<T extends string = string>({ options, value, onChange, fill = false, className = '' }: SegmentedControlProps<T>) {
  return (
    <div className={`${fill ? 'flex w-full' : 'inline-flex'} items-center gap-1 p-1 rounded-xl bg-surface-container-lowest border border-outline-variant/40 ${className}`}>
      {options.map((option) => {
        const isActive = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${fill ? 'flex-1 justify-center' : ''} ${isActive ? activeClasses[option.accent ?? 'primary'] : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5'}`}
          >
            {Icon && <Icon size={16} strokeWidth={2} />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
