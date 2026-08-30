import React from 'react'
import { Search, Plus, Download, Upload, Box, Sparkles, ArrowLeft } from 'lucide-react'
import { useWidgetManagementStore } from '../model/useWidgetManagementStore'
import type { WidgetCategory } from '../api/widgetsApi'

const CATEGORIES: { id: WidgetCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'custom', label: 'Мои' },
  { id: 'social', label: 'Social' },
  { id: 'tech', label: 'Tech' },
  { id: 'metrics', label: 'Цифры' },
  { id: 'narrative', label: 'Хуки' },
]

export const WidgetCatalogSidebar: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const {
    widgets,
    selectedWidgetId,
    activeCategory,
    searchQuery,
    selectWidget,
    setActiveCategory,
    setSearchQuery,
    openCreateModal,
    openImportExportModal,
  } = useWidgetManagementStore()

  const filteredWidgets = widgets.filter((w) => {
    const matchesCategory =
      !activeCategory ||
      activeCategory === 'all' ||
      (activeCategory === 'custom' ? w.is_custom : w.category === activeCategory)

    const matchesSearch =
      !searchQuery ||
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchesCategory && matchesSearch
  })

  return (
    <div className="w-72 bg-slate-950 border-r border-slate-800/80 flex flex-col h-full overflow-hidden">
      {/* Шапка каталога */}
      <div className="p-4 border-b border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
                title="На главную"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="flex items-center gap-2 font-black text-white text-base">
              <Sparkles className="text-sky-400" size={18} />
              <span>Motion Studio</span>
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="p-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white shadow-md transition-all active:scale-95"
            title="Создать свой виджет"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Поиск */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
          <input
            type="text"
            placeholder="Поиск компонента..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Категории */}
      <div className="p-3 border-b border-slate-800/80 flex gap-1 overflow-x-auto">
        {CATEGORIES.map((c) => {
          const isActive = (activeCategory || 'all') === c.id
          return (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.id === 'all' ? null : c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                  : 'bg-slate-900/60 border border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Список компонентов */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {filteredWidgets.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-3">
            <Box size={28} className="mx-auto text-slate-600" />
            <p className="text-xs text-slate-500">Компоненты не найдены</p>
            <button
              onClick={openCreateModal}
              className="text-xs text-sky-400 font-bold hover:text-sky-300"
            >
              + Создать виджет
            </button>
          </div>
        ) : (
          filteredWidgets.map((w) => {
            const isSelected = w.id === selectedWidgetId
            return (
              <button
                key={w.id}
                onClick={() => selectWidget(w.id)}
                className={`w-full text-left p-3 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-slate-900 border-sky-500/60 shadow-lg shadow-sky-500/5'
                    : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-white tracking-tight">{w.name}</span>
                  <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">
                    Custom
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-1">{w.description}</p>
              </button>
            )
          })
        )}
      </div>

      {/* Кнопки импорта и экспорта */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/40 flex gap-2">
        <button
          onClick={() => openImportExportModal('import')}
          className="flex-1 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Upload size={13} /> <span>Импорт</span>
        </button>
        <button
          onClick={() => openImportExportModal('export')}
          className="flex-1 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Download size={13} /> <span>Экспорт</span>
        </button>
      </div>
    </div>
  )
}
