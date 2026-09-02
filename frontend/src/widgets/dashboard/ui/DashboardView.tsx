import React, { useEffect } from 'react'
import {
  DashboardHeader,
  StudioLaunchpad,
  ProjectsMatrix,
  NewProjectModal,
  GlobalSettingsModal,
  useDashboardStore,
} from '@features/dashboard'
import type { StudioModuleId } from '@features/dashboard'

interface Props {
  onOpenTrends: () => void
  onOpenScript: () => void
  onOpenAudio: () => void
}

export const DashboardView: React.FC<Props> = ({ onOpenTrends, onOpenScript, onOpenAudio }) => {
  const { fetchDashboardData } = useDashboardStore()

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  const handleModuleNavigate = (module: StudioModuleId) => {
    if (module === 'trend_agent') onOpenTrends()
    else if (module === 'script_lab') onOpenScript()
    else if (module === 'voice_lab') onOpenAudio()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
      {/* 1. Умный Header с мониторингом GPU/VRAM */}
      <DashboardHeader />

      {/* Основной контент студии */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-10">
        {/* 2. Студийный Launchpad: Создание проекта + 3 модуля */}
        <StudioLaunchpad onNavigate={handleModuleNavigate} />

        {/* 3. Центр проектов: фильтры, поиск, карточки */}
        <ProjectsMatrix />
      </main>

      {/* Модальные окна */}
      <NewProjectModal />
      <GlobalSettingsModal />
    </div>
  )
}
