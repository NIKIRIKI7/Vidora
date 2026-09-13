import React from 'react'
import { Cpu, Settings, Sparkles } from 'lucide-react'
import { $api } from '@shared/api'
import { IconButton } from '@shared/ui'
import { useDashboardStore } from '../model/useDashboardStore'

interface Props {
  onOpenSettings?: () => void
}

export const DashboardHeader: React.FC<Props> = ({ onOpenSettings }) => {
  const setCurrentView = useDashboardStore((s) => s.setCurrentView)

  // Данные о железе берём напрямую из бэкенда (реактивно + кэш React Query).
  const { data: hardware, isLoading } = $api.useQuery('get', '/api/v1/system/hardware', {})

  const isCuda = hardware?.gpu_type === 'cuda'
  const deviceShortName = hardware?.device
    ? hardware.device.replace(/^NVIDIA\s+GeForce\s+/i, '').replace(/^NVIDIA\s+/i, '')
    : 'CPU Mode'
  const vramDisplay = isLoading
    ? 'Загрузка...'
    : hardware && isCuda
      ? `${(hardware.vram_gb ?? 0).toFixed(1)} GB VRAM`
      : 'RAM Engine'

  return (
    <header className="h-16 border-b border-outline-variant/80 bg-surface-container-lowest/80 backdrop-blur-2xl px-8 flex items-center justify-between sticky top-0 z-30 select-none">
      <div
        className="flex items-center gap-3 cursor-pointer group"
        onClick={() => setCurrentView('dashboard')}
      >
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-secondary to-primary flex items-center justify-center shadow-lg shadow-secondary/20 group-hover:scale-105 transition-transform">
          <Sparkles size={16} className="text-on-surface" />
        </div>
        <span className="font-black text-xl tracking-tight text-on-surface group-hover:text-secondary transition-colors">
          Vidora
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-low/80 border border-outline-variant text-xs font-medium text-on-surface shadow-sm">
          <Cpu size={14} className={isCuda ? 'text-success' : 'text-on-surface-variant'} />
          <span className="font-semibold text-on-surface">{isLoading ? 'Инициализация...' : deviceShortName}</span>
          <span className="text-outline">•</span>
          <span className="font-mono text-on-surface-variant text-2xs">{vramDisplay}</span>
        </div>

        <IconButton
          icon={Settings}
          size="md"
          accent="neutral"
          onClick={onOpenSettings}
          title="Глобальные настройки (AI, API, Промпты)"
          className="bg-surface-container-low/80 hover:bg-surface-container-high border border-outline-variant shadow-sm"
        />
      </div>
    </header>
  )
}
