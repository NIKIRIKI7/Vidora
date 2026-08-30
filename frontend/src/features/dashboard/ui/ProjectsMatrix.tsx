import React, { useState } from 'react'
import {
  Clock,
  FolderOpen,
  Layers,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Volume2,
} from 'lucide-react'
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight">Мои проекты</h2>
            <span className="text-xs bg-slate-800/80 text-slate-400 font-semibold px-2 py-0.5 rounded-full">
              {filtered.length}
            </span>
          </div>

          <div className="bg-slate-900 p-1 rounded-xl flex items-center gap-1 border border-slate-800">
            {(['all', '16:9', '9:16'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setFormatFilter(fmt)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  formatFilter === fmt
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {fmt === 'all' ? 'Все' : fmt}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 transition-colors shadow-inner"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        <div
          onClick={() => openModal('new_project', formatFilter === '9:16' ? '9:16' : '16:9')}
          className="group cursor-pointer rounded-3xl border border-dashed border-slate-800 hover:border-sky-500/50 bg-slate-950/40 hover:bg-slate-900/40 p-6 flex flex-col items-center justify-center text-center gap-3 transition-all min-h-[220px]"
        >
          <div className="w-11 h-11 rounded-2xl bg-slate-900 group-hover:bg-sky-500/10 border border-slate-800 group-hover:border-sky-500/30 flex items-center justify-center text-slate-400 group-hover:text-sky-400 transition-all">
            <Plus size={20} />
          </div>
          <div className="space-y-0.5">
            <span className="font-bold text-sm text-white group-hover:text-sky-300 transition-colors">
              Новый проект
            </span>
            <p className="text-xs text-slate-500">С чистого листа</p>
          </div>
        </div>

        {filtered.map((proj) => {
          const isMenuOpen = activeMenuId === proj.id
          const isShorts = proj.format === '9:16'

          return (
            <div
              key={proj.id}
              className="group relative rounded-3xl bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 shadow-xl overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1"
            >
              <div
                onClick={() => openProject(proj.id)}
                className="cursor-pointer h-32 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950 p-4 flex flex-col justify-between relative overflow-hidden"
              >
                <div className="flex items-center justify-between z-10">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm ${
                      isShorts
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                    }`}
                  >
                    {proj.format}
                  </span>

                  {proj.has_audio && (
                    <span className="p-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20" title="Озвучка готова">
                      <Volume2 size={12} />
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-slate-400 z-10">
                  <Clock size={12} />
                  <span>{formatDuration(proj.duration_sec)}</span>
                  <span>•</span>
                  <span>{proj.scene_count} сцен</span>
                </div>
              </div>

              <div className="p-4 bg-slate-900/90 border-t border-slate-800/80 flex items-center justify-between">
                <div className="cursor-pointer space-y-0.5 flex-1 pr-2" onClick={() => openProject(proj.id)}>
                  <h3 className="font-bold text-sm text-white group-hover:text-sky-300 transition-colors truncate">
                    {proj.name}
                  </h3>
                  <span className="text-[11px] text-slate-500">{timeAgo(proj.updated_at)}</span>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setActiveMenuId(isMenuOpen ? null : proj.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  >
                    <MoreVertical size={15} />
                  </button>

                  {isMenuOpen && (
                    <div className="absolute right-0 bottom-8 z-30 w-36 rounded-2xl bg-slate-950 border border-slate-800 p-1.5 shadow-2xl space-y-0.5 text-xs font-semibold">
                      <button
                        onClick={() => {
                          setActiveMenuId(null)
                          openProject(proj.id)
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-900 text-slate-300 hover:text-white flex items-center gap-2 text-left"
                      >
                        <FolderOpen size={13} /> <span>Открыть</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveMenuId(null)
                          duplicateProject(proj.id)
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg hover:bg-slate-900 text-slate-300 hover:text-white flex items-center gap-2 text-left"
                      >
                        <Layers size={13} /> <span>Дублировать</span>
                      </button>
                      <button
                        onClick={() => {
                          setActiveMenuId(null)
                          deleteProject(proj.id)
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 flex items-center gap-2 text-left"
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
