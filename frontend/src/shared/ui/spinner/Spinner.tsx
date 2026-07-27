import { Icon } from '@shared/ui'

export const Spinner = ({ className = '' }: { className?: string }) => (
  <Icon name="sync" className={`animate-spin text-secondary ${className}`} style={{ animationDuration: '3s' }} />
)
