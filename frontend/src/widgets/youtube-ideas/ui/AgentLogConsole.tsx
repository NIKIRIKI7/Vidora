import type { RefObject } from 'react'
import { Spinner } from '@shared/ui'
import type { AgentLog } from '../model/constants'

interface AgentLogConsoleProps {
  logs: AgentLog[]
  isRunning: boolean
  endRef: RefObject<HTMLDivElement | null>
}

export const AgentLogConsole = ({ logs, isRunning, endRef }: AgentLogConsoleProps) => (
  <div className="h-[var(--layout-chart-sm)] shrink-0 bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-4 font-mono text-xs overflow-y-auto custom-scrollbar shadow-inner">
    {logs.length === 0 && !isRunning && <div className="text-on-surface-variant/50 m-auto text-center mt-6">Здесь будут отображаться этапы анализа...</div>}
    {logs.map((log, i) => (
      <div key={i} className={`flex items-start gap-2 ${log.status === 'error' ? 'text-error font-bold' : log.status === 'success' ? 'text-success' : log.status === 'warning' ? 'text-warning' : 'text-primary'}`}>
        <span className="opacity-50">[{new Date().toLocaleTimeString()}]</span>
        <span>{log.message}</span>
      </div>
    ))}
    {isRunning && <div className="text-primary animate-pulse flex items-center gap-2 mt-2"><Spinner className="text-xs" /></div>}
    <div ref={endRef} />
  </div>
)
