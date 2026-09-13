import type { ComponentPropsWithRef } from 'react'

export const TextArea = ({ className = '', ...props }: ComponentPropsWithRef<'textarea'>) => (
  <textarea
    className={`w-full bg-surface-container-lowest border border-outline-variant/50 rounded-lg py-2 px-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all disabled:opacity-50 custom-scrollbar resize-y ${className}`}
    {...props}
  />
)
