import React, { useState } from 'react'
import {
  Clock,
  FolderOpen,
  Layers,
  MoreVertical,
  Plus,
  Trash2,
  Volume2,
} from 'lucide-react'
import { SearchInput } from '@shared/ui'
import { useDashboardStore } from '../model/useDashboardStore'

const timeAgo = (iso: string) => {
  const diffHours = Math.round((Date.now() - new Date(iso).getTime()) / 3600000)
  if (diffHours < 1) return 'Только что'
  if (diffHours < 24) return `${diffHours} ч. назад`
  return `${Math.round(diffHours / 24)} дн. назад`
}

export const ProjectsMatrix: React.FC = () => {
  const {
    projects,
    searchQuery,
    formatFilter,
    setSearchQuery,
    setFormatFilter,
    openModal,
    openProject,
    deleteProject,
    duplicateProject,
  } = useDashboardStore()

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  const filtered = projects.filter((p) => {
    const matchesFormat = formatFilter === 'all' || p.format === formatFilter
    const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFormat && matchesSearch
  })

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60)
    const s = sec % 60
    return `${mins}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <section className="space-y-5 pt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/80">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-on-surface tracking-tight">Мои проекты</h2>
            <span className="text-xs bg-surface-container-high/80 text-on-surface-variant font-semibold px-2 py-0.5 rounded-full">
              {filtered.length}
            </span>
          </div>

          <div className="bg-surface-container-low p-1 rounded-xl flex items-center gap-1 border border-outline-variant">
            {(['all', '16:9', '9:16'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setFormatFilter(fmt)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  formatFilter === fmt
                    ? 'bg-secondary text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {fmt === 'all' ? 'Все' : fmt}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full sm:w-64">
          <SearchInput
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            className="text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        <div
          onClick={() => openModal('new_project', formatFilter === '9:16' ? '9:16' : '16:9')}
          className="group cursor-pointer rounded-3xl border border-dashed border-outline-variant hover:border-secondary/50 bg-surface-container-lowest/40 hover:bg-surface-container-low/40 p-6 flex flex-col items-center justify-center text-center gap-3 transition-all min-h-[var(--layout-card)]"
        >
          <div className="w-11 h-11 rounded-2xl bg-surface-container-low group-hover:bg-secondary/10 border border-outline-variant group-hover:border-secondary/30 flex items-center justify-center text-on-surface-variant group-hover:text-secondary transition-all">
            <Plus size={20} />
          </div>
          <div className="space-y-0.5">
            <span className="font-bold text-sm text-on-surface group-hover:text-secondary transition-colors">
              Новый проект
            </span>
            <p className="text-xs text-outline">С чистого листа</p>
          </div>
        </div>

        {filtered.map((proj) => {
          const isMenuOpen = activeMenuId === proj.id
          const isShorts = proj.format === '9:16'

          return (
            <div
              key={proj.id}
              className="group relative rounded-3xl bg-surface-container-low/70 hover:bg-surface-container-low border border-outline-variant/80 hover:border-outline-variant shadow-xl overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1"
            >
              <div
                onClick={() => openProject(proj.id)}
                className="cursor-pointer h-32 bg-gradient-to-tr from-surface-container-lowest via-surface-container-low to-surface-container-lowest p-4 flex flex-col justify-between relative overflow-hidden"
              >
                <div className="flex items-center justify-between z-10">
                  <span
                    className={`text-xxs font-bold px-2 py-0.5 rounded-full border shadow-sm ${
                      isShorts
                        ? 'bg-error/10 text-error border-error/30'
                        : 'bg-secondary/10 text-secondary border-secondary/30'
                    }`}
                  >
                    {proj.format}
                  </span>

                  {proj.has_audio && (
                    <span className="p-1 rounded-md bg-warning/10 text-warning border border-warning/20" title="Озвучка готова">
                      <Volume2 size={12} />
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-on-surface-variant z-10">
                  <Clock size={12} />
                  <span>{formatDuration(proj.duration_sec)}</span>
                  <span>•</span>
                  <span>{proj.scene_count} сцен</span>
                </div>
              </div>

              <div className="p-4 bg-surface-container-low/90 border-t border-outline-variant/80 flex items-center justify-between">
                <div className="cursor-pointer space-y-0.5 flex-1 pr-2" onClick={() => openProject(proj.id)}>
                  <h3 className="font-bold text-sm text-on-surface group-hover:text-secondary transition-colors truncate">
                    {proj.name}
                  </h3>
                  <span className="text-2xs text-outline">{timeAgo(proj.updated_at)}</span>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setActiveMenuId(isMenuOpen ? null : proj.id)}
                    className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <MoreVertical size={15} />
                  </button>

                  {isMenuOpen && (
                    <div className="absolute right-0 bottom-8 z-30 w-36 rounded-2xl bg-surface-container-lowest border border-outline-variant p-1.5 shadow-2xl space-y-0.5 text-xs font-semibold">
                      <button
                        onClick={() => {
                          setActiveMenuId(null)
                          openProject(proj.id)
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg hover:bg-surface-container-low text-on-surface hover:text-on-surface flex items-center gap-2 text-left"
                      >
                        <FolderOpen size={13} /> <span>Открыть</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveMenuId(null)
                          duplicateProject(proj.id)
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg hover:bg-surface-container-low text-on-surface hover:text-on-surface flex items-center gap-2 text-left"
                      >
                        <Layers size={13} /> <span>Дублировать</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveMenuId(null)
                          deleteProject(proj.id)
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg hover:bg-error/20 text-error flex items-center gap-2 text-left"
                      >
                        <Trash2 size={13} /> <span>Удалить</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
