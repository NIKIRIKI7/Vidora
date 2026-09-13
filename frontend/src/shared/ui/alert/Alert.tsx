import type { ReactNode } from 'react'
import { Info, TriangleAlert, CircleCheckBig, X } from 'lucide-react'

type AlertVariant = 'info' | 'success' | 'warning' | 'error'

interface AlertProps {
  children: ReactNode
  variant?: AlertVariant
  title?: string
  icon?: ReactNode
  onClose?: () => void
  className?: string
}

const config: Record<AlertVariant, { cls: string; Icon: typeof Info }> = {
  info: { cls: 'bg-primary/10 border-primary/30 text-primary', Icon: Info },
  success: { cls: 'bg-success/10 border-success/30 text-success', Icon: CircleCheckBig },
  warning: { cls: 'bg-warning/10 border-warning/30 text-warning', Icon: TriangleAlert },
  error: { cls: 'bg-error/10 border-error/30 text-error', Icon: TriangleAlert },
}

export const Alert = ({ children, variant = 'info', title, icon, onClose, className = '' }: AlertProps) => {
  const { cls, Icon } = config[variant]
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${cls} ${className}`} role="alert">
      <span className="shrink-0 mt-0.5">{icon ?? <Icon size={16} />}</span>
      <div className="flex-1 min-w-0">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity cursor-pointer" aria-label="Закрыть">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
