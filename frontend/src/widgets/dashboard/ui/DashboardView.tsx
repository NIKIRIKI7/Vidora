import React, { useEffect } from 'react'
import {
  DashboardHeader,
  StudioLaunchpad,
  ProjectsMatrix,
  NewProjectModal,
  useDashboardStore,
} from '@features/dashboard'
import type { StudioModuleId } from '@features/dashboard'

interface Props {
  onOpenTrends: () => void
  onOpenScript: () => void
  onOpenAudio: () => void
  onOpenSettings: () => void
}

export const DashboardView: React.FC<Props> = ({
  onOpenTrends,
  onOpenScript,
  onOpenAudio,
  onOpenSettings,
}) => {
  const fetchDashboardData = useDashboardStore((s) => s.fetchDashboardData)

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  const handleModuleNavigate = (module: StudioModuleId) => {
    if (module === 'trend_agent') onOpenTrends()
    else if (module === 'script_lab') onOpenScript()
    else if (module === 'voice_lab') onOpenAudio()
    else if (module === 'settings') onOpenSettings()
  }

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface flex flex-col select-none">
      <DashboardHeader onOpenSettings={onOpenSettings} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-10">
        <StudioLaunchpad onNavigate={handleModuleNavigate} />
        <ProjectsMatrix />
      </main>

      <NewProjectModal />
    </div>
  )
}
