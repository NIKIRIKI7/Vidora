import React from 'react'
import { Cpu, Settings, Sparkles } from 'lucide-react'
import { useDashboardStore } from '../model/useDashboardStore'

export const DashboardHeader: React.FC = () => {
  const { hardware, openModal, setCurrentView } = useDashboardStore()

  const isCuda = hardware?.gpu_type === 'cuda'
  const deviceShortName = hardware?.device
    ? hardware.device.replace(/^NVIDIA\s+GeForce\s+/i, '').replace(/^NVIDIA\s+/i, '')
    : 'CPU Mode'
  const vramDisplay = hardware && isCuda ? `${hardware.vram_gb} GB VRAM` : 'RAM Engine'

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-2xl px-8 flex items-center justify-between sticky top-0 z-30 select-none">
      <div
        className="flex items-center gap-3 cursor-pointer group"
        onClick={() => setCurrentView('dashboard')}
      >
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform">
          <Sparkles size={16} className="text-white" />
        </div>
        <span className="font-black text-xl tracking-tight text-white group-hover:text-sky-300 transition-colors">
          Vidora
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-medium text-slate-300 shadow-sm">
          <Cpu size={14} className={isCuda ? 'text-emerald-400' : 'text-slate-400'} />
          <span className="font-semibold text-white">{deviceShortName}</span>
          <span className="text-slate-600">•</span>
          <span className="font-mono text-slate-400 text-[11px]">{vramDisplay}</span>
        </div>

        <button
          onClick={() => openModal('settings')}
          className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all shadow-sm active:scale-95 flex items-center gap-1.5 text-xs font-semibold"
          title="Глобальные настройки"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  )
}
