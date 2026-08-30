import React, { useState } from 'react'
import { Monitor, Smartphone, Sparkles, X } from 'lucide-react'
import { useDashboardStore } from '../model/useDashboardStore'

const COLOR_PRESETS = [
  { id: 'cyber', name: 'Cyber Neon', primary: '#38bdf8', secondary: '#818cf8', background: '#020617', surface: '#0f172a', accent: '#f43f5e', text: '#f8fafc' },
  { id: 'emerald', name: 'Tech Mint', primary: '#10b981', secondary: '#059669', background: '#022c22', surface: '#064e3b', accent: '#34d399', text: '#ecfdf5' },
  { id: 'purple', name: 'Deep Violet', primary: '#a855f7', secondary: '#7c3aed', background: '#0f0728', surface: '#1e1145', accent: '#ec4899', text: '#faf5ff' },
]

export const NewProjectModal: React.FC = () => {
  const { activeModal, selectedFormatForNew, closeModal, createProject } = useDashboardStore()

  const [name, setName] = useState('')
  const [format, setFormat] = useState<'16:9' | '9:16'>(selectedFormatForNew || '16:9')
  const [fps, setFps] = useState(30)
  const [animationStyle, setAnimationStyle] = useState('cinematic_smooth')
  const [selectedPalette, setSelectedPalette] = useState(COLOR_PRESETS[0])

  if (activeModal !== 'new_project') return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createProject({
      name: name.trim(),
      format,
      fps,
      animationStyle,
      colors: selectedPalette,
    })
  }

  return (
    <div key={selectedFormatForNew} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-white text-lg">
            <Sparkles className="text-sky-400" size={20} />
            <span>Создание нового видео-проекта</span>
          </div>
          <button onClick={closeModal} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Название проекта *</label>
            <input
              type="text"
              placeholder="Например: Обзор DeepSeek V3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Формат холста</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat('16:9')}
                className={`p-3 rounded-2xl border flex items-center gap-3 transition-all ${
                  format === '16:9'
                    ? 'bg-sky-500/15 border-sky-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Monitor size={18} className={format === '16:9' ? 'text-sky-400' : ''} />
                <div className="text-left">
                  <div className="text-xs font-bold">16:9 Landscape</div>
                  <div className="text-[10px] text-slate-500">YouTube, Desktop</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('9:16')}
                className={`p-3 rounded-2xl border flex items-center gap-3 transition-all ${
                  format === '9:16'
                    ? 'bg-rose-500/15 border-rose-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone size={18} className={format === '9:16' ? 'text-rose-400' : ''} />
                <div className="text-left">
                  <div className="text-xs font-bold">9:16 Shorts</div>
                  <div className="text-[10px] text-slate-500">TikTok, Reels</div>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Частота кадров</label>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value={24}>24 FPS (Кино)</option>
                <option value={30}>30 FPS (YouTube)</option>
                <option value={60}>60 FPS (Плавно)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Стиль анимации</label>
              <select
                value={animationStyle}
                onChange={(e) => setAnimationStyle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="cinematic_smooth">Плавный (Spring Damped)</option>
                <option value="dynamic_pop">Динамичный (Bounce Pop)</option>
                <option value="minimal_clean">Минималистичный (Fade)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">Палитра бренда</label>
            <div className="flex gap-2">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPalette(p)}
                  className={`flex-1 p-2.5 rounded-xl border text-left transition-all ${
                    selectedPalette.id === p.id
                      ? 'bg-slate-950 border-sky-500 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex gap-1 mb-1.5">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.primary }} />
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.accent }} />
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.surface }} />
                  </div>
                  <span className="text-[11px] font-bold text-white block truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={closeModal}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-6 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-sky-500/20"
            >
              Создать проект
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
