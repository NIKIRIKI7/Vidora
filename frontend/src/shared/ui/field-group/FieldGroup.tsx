import type { ReactNode } from 'react'

interface FieldGroupProps {
  label: string
  value?: string | number
  children: ReactNode
  className?: string
}

export const FieldGroup = ({ label, value, children, className = '' }: FieldGroupProps) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    <div className="flex justify-between items-end mb-1">
      <label className="font-label text-xs font-medium text-on-surface-variant">{label}</label>
      {value !== undefined && <span className="font-mono text-[13px] text-on-surface-variant leading-none">{value}</span>}
    </div>
    {children}
  </div>
)
