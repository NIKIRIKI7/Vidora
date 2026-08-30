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
import { MotionStudioView } from '@widgets/motion-studio'

interface Props {
  onOpenTrends: () => void
  onOpenScript: () => void
  onOpenAudio: () => void
}

export const DashboardView: React.FC<Props> = ({ onOpenTrends, onOpenScript, onOpenAudio }) => {
  const { currentView, fetchDashboardData, setCurrentView } = useDashboardStore()

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  if (currentView === 'motion_studio') {
    return <MotionStudioView onBack={() => setCurrentView('dashboard')} />
  }

  const handleModuleNavigate = (module: StudioModuleId) => {
    if (module === 'trend_agent') onOpenTrends()
    else if (module === 'script_lab') onOpenScript()
    else if (module === 'voice_lab') onOpenAudio()
    else if (module === 'motion_studio') setCurrentView('motion_studio')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
      {/* 1. Умный Header с мониторингом GPU/VRAM */}
      <DashboardHeader />

      {/* Основной контент студии */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-10">
        {/* 2. Студийный Launchpad: Создание проекта + 4 модуля */}
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
