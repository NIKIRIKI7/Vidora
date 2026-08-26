import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@shared/ui'
import { API } from '@shared/lib'
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
  ERROR: 'bg-rose-950/20 border-rose-500/30 text-rose-200',
  WARN: 'bg-amber-950/20 border-amber-500/30 text-amber-200',
  SUCCESS: 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200',
  INFO: 'bg-slate-900/50 border-white/5 text-slate-300',
}

export const LogsViewer: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'SUCCESS' | 'INFO'>('ALL')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/v1/system/logs?limit=300`)
      const data = await res.json()
      setLogs(data.logs || [])
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Журнал логов" className="max-w-3xl">
      <div className="flex items-center gap-2 mb-3">
        {(['ALL', 'ERROR', 'WARN', 'SUCCESS', 'INFO'] as const).map(lvl => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
              filter === lvl ? 'bg-primary text-black' : 'bg-white/5 text-on-surface-variant hover:text-white'
            }`}
          >
            {lvl}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={fetchLogs} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-white transition-colors" title="Обновить">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">
        {filtered.length === 0 && <div className="text-center text-on-surface-variant/60 py-8 text-sm">Логов пока нет</div>}
        {filtered.map(log => (
          <div key={log.id} className={`p-3 rounded-xl border flex flex-col gap-1.5 ${LEVEL_COLORS[log.level] || LEVEL_COLORS.INFO}`}>
            <div className="flex items-center justify-between text-[11px] opacity-70">
              <span className="font-mono font-bold">{log.timestamp}</span>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono">{log.module}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono">{log.level}</span>
              </div>
            </div>
            <p className="text-sm font-medium leading-tight m-0">{log.message}</p>
            {log.details && (
              <div className="relative">
                <pre className="mt-1.5 p-2 rounded-lg bg-black/60 text-rose-400 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-40 custom-scrollbar">
                  {log.details}
                </pre>
                <button
                  onClick={() => copy(log.details || '', log.id)}
                  className="absolute top-2 right-2 p-1 rounded bg-black/50 hover:bg-black/80 text-on-surface-variant hover:text-white transition-colors"
                  title="Копировать"
                >
                  {copied === log.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
