import React from 'react'
import { Button } from '@shared/ui'
import { Download, RotateCcw } from 'lucide-react'
import { useLastRenderStore } from '../model/useLastRenderStore'

interface Props {
  variant?: 'primary' | 'secondary' | 'outline'
  compact?: boolean
  className?: string
}

/**
 * Кнопка повторного скачивания последнего рендера.
 * Скрыта, пока в сторе нет blob.
 */
export const DownloadLastRenderButton: React.FC<Props> = ({
  variant = 'secondary',
  compact = false,
  className = '',
}) => {
  const url = useLastRenderStore((s) => s.url)
  const fileName = useLastRenderStore((s) => s.fileName)
  const scopeLabel = useLastRenderStore((s) => s.scopeLabel)
  const createdAt = useLastRenderStore((s) => s.createdAt)
  const clear = useLastRenderStore((s) => s.clear)

  if (!url || !fileName) return null

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const ageLabel = createdAt
    ? new Date(createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Button
        variant={variant}
        icon={Download}
        onClick={handleDownload}
        className={compact ? 'py-1.5 px-3 text-xs' : 'py-2 px-4 text-sm'}
        title={`${scopeLabel} · ${ageLabel}`}
      >
        {compact ? 'Скачать' : `Скачать последний (${scopeLabel})`}
      </Button>
      <Button
        variant="ghost"
        icon={RotateCcw}
        onClick={clear}
        className="p-1.5 text-on-surface-variant hover:text-error"
        title="Забыть последний рендер и освободить память"
      />
    </div>
  )
}
