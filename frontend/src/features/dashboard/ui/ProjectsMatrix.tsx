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
import { SearchInput, Button, IconButton, SegmentedControl } from '@shared/ui'
import { useDashboardStore } from '../model/useDashboardStore'

const timeAgo = (iso: string) => {
  const diffHours = Math.round((Date.now() - new Date(iso).getTime()) / 3600000)
  if (diffHours < 1) return 'Только что'
  if (diffHours < 24) return `${diffHours} ч. назад`
  return `${Math.round(diffHours / 24)} дн. назад`
}

export const ProjectsMatrix: React.FC = () => {
  const projects = useDashboardStore((s) => s.projects)
  const searchQuery = useDashboardStore((s) => s.searchQuery)
  const formatFilter = useDashboardStore((s) => s.formatFilter)
  const setSearchQuery = useDashboardStore((s) => s.setSearchQuery)
  const setFormatFilter = useDashboardStore((s) => s.setFormatFilter)
  const openModal = useDashboardStore((s) => s.openModal)
  const openProject = useDashboardStore((s) => s.openProject)
  const deleteProject = useDashboardStore((s) => s.deleteProject)
  const duplicateProject = useDashboardStore((s) => s.duplicateProject)

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

          <SegmentedControl
            options={[
              { value: 'all', label: 'Все' },
              { value: '16:9', label: '16:9' },
              { value: '9:16', label: '9:16' },
            ]}
            value={formatFilter}
            onChange={setFormatFilter}
          />
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
                  <IconButton
                    icon={MoreVertical}
                    size="sm"
                    accent="neutral"
                    onClick={() => setActiveMenuId(isMenuOpen ? null : proj.id)}
                    className="hover:bg-surface-container-high"
                  />

                  {isMenuOpen && (
                    <div className="absolute right-0 bottom-8 z-30 w-36 rounded-2xl bg-surface-container-lowest border border-outline-variant p-1.5 shadow-2xl space-y-0.5 text-xs font-semibold">
                      <Button
                        variant="ghost"
                        icon={FolderOpen}
                        onClick={() => {
                          setActiveMenuId(null)
                          openProject(proj.id)
                        }}
                        className="w-full justify-start px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        Открыть
                      </Button>
                      <Button
                        variant="ghost"
                        icon={Layers}
                        onClick={() => {
                          setActiveMenuId(null)
                          duplicateProject(proj.id)
                        }}
                        className="w-full justify-start px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        Дублировать
                      </Button>
                      <Button
                        variant="danger"
                        icon={Trash2}
                        onClick={() => {
                          setActiveMenuId(null)
                          deleteProject(proj.id)
                        }}
                        className="w-full justify-start px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        Удалить
                      </Button>
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
