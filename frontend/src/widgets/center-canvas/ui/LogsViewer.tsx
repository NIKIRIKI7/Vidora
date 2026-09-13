import { fetchClient, apiErrorMessage } from '@shared/api'
import { useCallback, useEffect, useState } from 'react'
import { Modal, SegmentedControl, IconButton, EmptyState, VirtualList } from '@shared/ui'
import { RefreshCw, Copy, Check } from 'lucide-react'

interface LogEntry {
  id: string
  timestamp: string
  level: string
  module: string
  message: string
  details?: string | null
}

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'bg-error/20 border-error/30 text-error',
  WARN: 'bg-warning/20 border-warning/30 text-warning',
  SUCCESS: 'bg-success/20 border-success/30 text-success',
  INFO: 'bg-surface-container-low/50 border-outline-variant/20 text-on-surface',
}

type LogFilter = 'ALL' | 'ERROR' | 'WARN' | 'SUCCESS' | 'INFO'

export const LogsViewer: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LogFilter>('ALL')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await fetchClient.GET('/api/v1/system/logs', {
        params: { query: { limit: 300 } }
      })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      setLogs((data as unknown as { logs?: LogEntry[] }).logs || [])
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => { void fetchLogs() }, 0)
    return () => clearTimeout(t)
  }, [isOpen, fetchLogs])

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 1200)
  }

  const filtered = filter === 'ALL' ? logs : logs.filter(l => l.level === filter)

  const filterOptions = [
    { value: 'ALL' as const, label: 'ALL' },
    { value: 'ERROR' as const, label: 'ERROR' },
    { value: 'WARN' as const, label: 'WARN' },
    { value: 'SUCCESS' as const, label: 'SUCCESS' },
    { value: 'INFO' as const, label: 'INFO' },
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Журнал логов" className="max-w-3xl">
      <div className="flex items-center gap-2 mb-3">
        <div className="overflow-x-auto">
          <SegmentedControl value={filter} onChange={setFilter} options={filterOptions} className="font-mono" />
        </div>
        <div className="flex-1" />
        <IconButton icon={RefreshCw} accent="neutral" onClick={fetchLogs} title="Обновить" className={loading ? 'animate-spin' : ''} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Логов пока нет" />
      ) : (
        <VirtualList
          items={filtered}
          estimateSize={90}
          gap={8}
          className="max-h-[55vh]"
          getKey={(log) => log.id}
          renderItem={(log) => (
            <div className={`p-3 rounded-xl border flex flex-col gap-1.5 ${LEVEL_COLORS[log.level] || LEVEL_COLORS.INFO}`}>
              <div className="flex items-center justify-between text-2xs opacity-70">
                <span className="font-mono font-bold">{log.timestamp}</span>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest/40 text-xxs font-mono">{log.module}</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest/40 text-xxs font-mono">{log.level}</span>
                </div>
              </div>
              <p className="text-sm font-medium leading-tight m-0">{log.message}</p>
              {log.details && (
                <div className="relative">
                  <pre className="mt-1.5 p-2 rounded-lg bg-surface-container-lowest/60 text-error font-mono text-2xs leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-40 custom-scrollbar">
                    {log.details}
                  </pre>
                  <IconButton
                    icon={copied === log.id ? Check : Copy}
                    size="xs"
                    accent={copied === log.id ? 'success' : 'neutral'}
                    onClick={() => copy(log.details || '', log.id)}
                    title="Копировать"
                    className="absolute top-2 right-2 bg-surface-container-lowest/50 hover:bg-surface-container-lowest/80"
                  />
                </div>
              )}
            </div>
          )}
        />
      )}
    </Modal>
  )
}
