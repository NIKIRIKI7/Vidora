import React from 'react'
import {
  ArrowRight,
  FileText,
  Mic,
  Monitor,
  Smartphone,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDashboardStore } from '../model/useDashboardStore'

export type StudioModuleId = 'trend_agent' | 'script_lab' | 'voice_lab' | 'motion_studio'

interface Props {
  onNavigate?: (module: StudioModuleId) => void
}

export const StudioLaunchpad: React.FC<Props> = ({ onNavigate }) => {
  const { openModal, setCurrentView } = useDashboardStore()

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
      iconColor: 'text-emerald-400',
      bgGlow: 'hover:border-emerald-500/40 hover:shadow-emerald-500/10',
      tagColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
      onClick: () => (onNavigate ? onNavigate('trend_agent') : openModal('trend_agent')),
    },
    {
      id: 'script_lab',
      name: 'Сценарий & Хуки',
      badge: 'Режиссура',
      description: 'Генерация структуры ролика, психология удержания первых 5 секунд и таймкоды.',
      icon: FileText,
      iconColor: 'text-indigo-400',
      bgGlow: 'hover:border-indigo-500/40 hover:shadow-indigo-500/10',
      tagColor: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
      onClick: () => (onNavigate ? onNavigate('script_lab') : openModal('script_lab')),
    },
    {
      id: 'voice_lab',
      name: 'Audio Studio',
      badge: 'Озвучка',
      description: 'Локальная и облачная генерация дикторов, клонирование голоса и авто-даккинг.',
      icon: Mic,
      iconColor: 'text-amber-400',
      bgGlow: 'hover:border-amber-500/40 hover:shadow-amber-500/10',
      tagColor: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
      onClick: () => (onNavigate ? onNavigate('voice_lab') : openModal('voice_lab')),
    },
    {
      id: 'motion_studio',
      name: 'Motion Studio',
      badge: 'Виджеты',
      description: 'Интерактивная песочница Remotion-компонентов, настройка пропсов и экспорт/импорт.',
      icon: Sparkles,
      iconColor: 'text-sky-400',
      bgGlow: 'hover:border-sky-500/40 hover:shadow-sky-500/10',
      tagColor: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
      onClick: () => setCurrentView('motion_studio'),
    },
  ]

  return (
    <section className="space-y-6">
      <div className="relative rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-900 border border-slate-800/80 p-8 shadow-2xl overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <h1 className="text-3xl font-black text-white tracking-tight">
              Создайте вирусное видео с AI
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              От поиска тренда до генерации сценария, озвучки и моушн-рендера в Remotion.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <button
              onClick={() => openModal('new_project', '16:9')}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 transition-all active:scale-95 group"
            >
              <Monitor size={15} />
              <span>16:9 YouTube проект</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform opacity-80" />
            </button>

            <button
              onClick={() => openModal('new_project', '9:16')}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 group"
            >
              <Smartphone size={15} className="text-rose-400" />
              <span>9:16 Shorts ролик</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform text-slate-400" />
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
              className={`cursor-pointer group p-5 rounded-3xl bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800/80 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 shadow-lg ${mod.bgGlow} flex flex-col justify-between`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-white/5 flex items-center justify-center shadow-inner">
                    <Icon size={20} className={mod.iconColor} />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${mod.tagColor}`}>
                    {mod.badge}
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white group-hover:text-sky-300 transition-colors">
                    {mod.name}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                    {mod.description}
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-2 border-t border-slate-800/50 flex items-center justify-between text-xs font-semibold text-slate-400 group-hover:text-white transition-colors">
                <span>Открыть модуль</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform text-slate-500 group-hover:text-white" />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
