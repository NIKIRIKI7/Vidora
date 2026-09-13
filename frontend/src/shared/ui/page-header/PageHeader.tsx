import type { ElementType, ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../button/Button'

interface PageHeaderProps {
  title: string
  icon?: ElementType
  showBackBtn?: boolean
  onBack?: () => void
  centerContent?: ReactNode
  rightContent?: ReactNode
  className?: string
}

export const PageHeader = ({
  title,
  icon: Icon,
  showBackBtn = true,
  onBack,
  centerContent,
  rightContent,
  className = '',
}: PageHeaderProps) => (
  <header
    className={`sticky top-0 z-40 flex items-center justify-between w-full h-16 shrink-0 px-6 bg-surface/95 backdrop-blur-2xl border-b border-outline-variant/40 ${className}`}
  >
    {/* Левая зона: навигация + заголовок */}
    <div className="flex items-center gap-4 min-w-max">
      {showBackBtn && (
        <Button variant="icon" icon={ArrowLeft} onClick={onBack} aria-label="Назад" title="Назад" />
      )}
      <div className="flex items-center gap-2.5">
        {Icon && <Icon size={20} strokeWidth={2} className="text-primary" />}
        <h1 className="text-lg font-semibold text-on-surface tracking-wide">{title}</h1>
      </div>
    </div>

    {/* Центральная зона: табы/тулбары */}
    {centerContent && <div className="flex-1 flex justify-center px-4 min-w-0">{centerContent}</div>}

    {/* Правая зона: действия/статусы */}
    <div className="flex items-center gap-3 min-w-max justify-end">{rightContent}</div>
  </header>
)
