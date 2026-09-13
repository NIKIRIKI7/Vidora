import React from 'react'
import {
  ArrowRight,
  FileText,
  Mic,
  Monitor,
  Settings,
  Smartphone,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDashboardStore } from '../model/useDashboardStore'

export type StudioModuleId = 'trend_agent' | 'script_lab' | 'voice_lab' | 'settings'

interface Props {
  onNavigate?: (module: StudioModuleId) => void
}

export const StudioLaunchpad: React.FC<Props> = ({ onNavigate }) => {
  const { openModal } = useDashboardStore()

  const MODULES: {
    id: StudioModuleId
    name: string
    badge: string
    description: string
    icon: LucideIcon
    iconColor: string
    bgGlow: string
    tagColor: string
    onClick: () => void
  }[] = [
    {
      id: 'trend_agent',
      name: 'YouTube Trend Agent',
      badge: 'Анализ ниши',
      description: 'Поиск вирусных аномалий, детекция Голубого океана и разбор болей аудитории.',
      icon: TrendingUp,
      iconColor: 'text-success',
      bgGlow: 'hover:border-success/40 hover:shadow-success/10',
      tagColor: 'bg-success/10 text-success border-success/20',
      onClick: () => onNavigate?.('trend_agent'),
    },
    {
      id: 'script_lab',
      name: 'Сценарий & Хуки',
      badge: 'Режиссура',
      description: 'Генерация структуры ролика, психология удержания первых 5 секунд и таймкоды.',
      icon: FileText,
      iconColor: 'text-primary',
      bgGlow: 'hover:border-primary/40 hover:shadow-primary/10',
      tagColor: 'bg-primary/10 text-primary border-primary/20',
      onClick: () => onNavigate?.('script_lab'),
    },
    {
      id: 'voice_lab',
      name: 'Audio Studio',
      badge: 'Озвучка',
      description: 'Локальная и облачная генерация дикторов, клонирование голоса и авто-даккинг.',
      icon: Mic,
      iconColor: 'text-warning',
      bgGlow: 'hover:border-warning/40 hover:shadow-warning/10',
      tagColor: 'bg-warning/10 text-warning border-warning/20',
      onClick: () => onNavigate?.('voice_lab'),
    },
    {
      id: 'settings',
      name: 'Глобальные настройки',
      badge: 'AI & Система',
      description: 'API-ключи, выбор моделей LLM/TTS (облако/локально), промпты и каталог скиллов.',
      icon: Settings,
      iconColor: 'text-secondary',
      bgGlow: 'hover:border-secondary/40 hover:shadow-secondary/10',
      tagColor: 'bg-secondary/10 text-secondary border-secondary/20',
      onClick: () => onNavigate?.('settings'),
    },
  ]

  return (
    <section className="space-y-6">
      <div className="relative rounded-3xl bg-gradient-to-r from-surface-container-low via-surface-container-low/90 to-surface-container-low border border-outline-variant/80 p-8 shadow-2xl overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <h1 className="text-3xl font-black text-on-surface tracking-tight">
              Создайте вирусное видео с AI
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
              От поиска тренда до генерации сценария, озвучки и моушн-рендера в Remotion.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <button
              onClick={() => openModal('new_project', '16:9')}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-secondary hover:bg-secondary text-on-surface font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-secondary/20 transition-all active:scale-95 group"
            >
              <Monitor size={15} />
              <span>16:9 YouTube проект</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform opacity-80" />
            </button>

            <button
              onClick={() => openModal('new_project', '9:16')}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest/80 border border-outline-variant text-on-surface font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 group"
            >
              <Smartphone size={15} className="text-error" />
              <span>9:16 Shorts ролик</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform text-on-surface-variant" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MODULES.map((mod) => {
          const Icon = mod.icon
          return (
            <div
              key={mod.id}
              onClick={mod.onClick}
              className={`cursor-pointer group p-5 rounded-3xl bg-surface-container-low/60 hover:bg-surface-container-low/90 border border-outline-variant/80 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 shadow-lg ${mod.bgGlow} flex flex-col justify-between`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-2xl bg-surface-container-lowest border border-outline-variant/20 flex items-center justify-center shadow-inner">
                    <Icon size={20} className={mod.iconColor} />
                  </div>
                  <span className={`text-xxs font-bold px-2 py-0.5 rounded-full border ${mod.tagColor}`}>
                    {mod.badge}
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-on-surface group-hover:text-secondary transition-colors">
                    {mod.name}
                  </h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">
                    {mod.description}
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-2 border-t border-outline-variant/50 flex items-center justify-between text-xs font-semibold text-on-surface-variant group-hover:text-on-surface transition-colors">
                <span>Открыть модуль</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform text-outline group-hover:text-on-surface" />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
