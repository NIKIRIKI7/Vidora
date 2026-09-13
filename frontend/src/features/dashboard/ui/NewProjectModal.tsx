import React, { useState } from 'react'
import { Monitor, Smartphone, Sparkles, X } from 'lucide-react'
import { THEME_PRESETS, type ThemePreset } from '@shared/config'
import { Button, Input, Select, OptionCard } from '@shared/ui'
import { useDashboardStore } from '../model/useDashboardStore'

export const NewProjectModal: React.FC = () => {
  const activeModal = useDashboardStore((s) => s.activeModal)
  const selectedFormatForNew = useDashboardStore((s) => s.selectedFormatForNew)
  const closeModal = useDashboardStore((s) => s.closeModal)
  const createProject = useDashboardStore((s) => s.createProject)

  const [name, setName] = useState('')
  const [format, setFormat] = useState<'16:9' | '9:16'>(selectedFormatForNew || '16:9')
  const [fps, setFps] = useState(30)
  const [animationStyle, setAnimationStyle] = useState('cinematic_smooth')
  const [selectedPalette, setSelectedPalette] = useState<ThemePreset>(THEME_PRESETS[0])

  if (activeModal !== 'new_project') return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createProject({
      name: name.trim(),
      format,
      fps,
      animationStyle,
      colors: selectedPalette.colors,
    })
  }

  return (
    <div key={selectedFormatForNew} className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-surface-container-low border border-outline-variant rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-on-surface text-lg">
            <Sparkles className="text-secondary" size={20} />
            <span>Создание нового видео-проекта</span>
          </div>
          <Button variant="icon" icon={X} onClick={closeModal} />
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-on-surface">Название проекта *</label>
            <Input
              type="text"
              placeholder="Например: Обзор DeepSeek V3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-on-surface">Формат холста</label>
            <div className="grid grid-cols-2 gap-3">
              <OptionCard
                icon={Monitor}
                title="16:9 Landscape"
                subtitle="YouTube, Desktop"
                isActive={format === '16:9'}
                accent="secondary"
                onClick={() => setFormat('16:9')}
              />
              <OptionCard
                icon={Smartphone}
                title="9:16 Shorts"
                subtitle="TikTok, Reels"
                isActive={format === '9:16'}
                accent="error"
                onClick={() => setFormat('9:16')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-on-surface">Частота кадров</label>
              <Select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="text-xs"
              >
                <option value={24}>24 FPS (Кино)</option>
                <option value={30}>30 FPS (YouTube)</option>
                <option value={60}>60 FPS (Плавно)</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-on-surface">Стиль анимации</label>
              <Select
                value={animationStyle}
                onChange={(e) => setAnimationStyle(e.target.value)}
                className="text-xs"
              >
                <option value="cinematic_smooth">Плавный (Spring Damped)</option>
                <option value="dynamic_pop">Динамичный (Bounce Pop)</option>
                <option value="minimal_clean">Минималистичный (Fade)</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-on-surface">Палитра бренда</label>
            <div className="flex gap-2">
              {THEME_PRESETS.map((p) => (
                <OptionCard
                  key={p.id}
                  showIcon={false}
                  isActive={selectedPalette.id === p.id}
                  accent="secondary"
                  onClick={() => setSelectedPalette(p)}
                  title={p.name}
                  className="flex-1 p-2.5"
                >
                  <div className="flex gap-1 mb-1.5">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.colors.primary }} />
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.colors.accent }} />
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.colors.surface }} />
                  </div>
                </OptionCard>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3 border-t border-outline-variant/80">
            <Button type="button" variant="ghost" onClick={closeModal}>
              Отмена
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Создать проект
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}