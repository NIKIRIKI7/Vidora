import type { CSSProperties } from 'react'

export const Icon = ({ name, className = '', filled = false, style }: { name: string; className?: string; filled?: boolean; style?: CSSProperties }) => (
    <span
    className={`material-symbols-outlined no-underline inline-block select-none ${className}`}
    style={{ fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0", ...style }}
  >
    {name}
  </span>
)
