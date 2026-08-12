import { Loader2 } from 'lucide-react'

export const Spinner = ({ className = '' }: { className?: string }) => (
  <Loader2 className={`animate-spin text-secondary ${className}`} style={{ animationDuration: '3s' }} />
)