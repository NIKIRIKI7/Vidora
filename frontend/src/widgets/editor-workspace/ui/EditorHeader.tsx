import type { ProjectSettings } from '@entities/project'
import { Button, Dropdown, DropdownItem } from '@shared/ui'
import { Folder, ChevronDown, Plus, LayoutGrid, SquareCheckBig, Square, Zap, Terminal } from 'lucide-react'

interface Props {
  project: ProjectSettings
  projects: ProjectSettings[]
  isAutoPipelineRunning: boolean
  isRendering: boolean
  pipelineStep: string
  uiPreferences: { showSceneSidebar: boolean; showInspector: boolean; showTimeline: boolean }
  onToggleUi: (key: 'showSceneSidebar' | 'showInspector' | 'showTimeline') => void
  onSwitchProject: (id: string) => void
  onNewProject: () => void
  onOpenSettings: () => void
  onOpenGlobalSettings: () => void
  onOpenLogs: () => void
  onFullAutoPipeline: () => void
}

export const EditorHeader = ({
  project,
  projects,
  isAutoPipelineRunning,
  isRendering,
  pipelineStep,
  uiPreferences,
  onToggleUi,
  onSwitchProject,
  onNewProject,
  onOpenSettings,
  onOpenGlobalSettings,
  onOpenLogs,
  onFullAutoPipeline,
}: Props) => (
  <header className="h-16 shrink-0 border-b border-white/10 bg-surface-container/60 backdrop-blur-2xl px-6 flex justify-between items-center z-20">
    <div className="flex items-center gap-4">
      <span className="font-display text-2xl font-bold text-primary tracking-tight">Vidora</span>
      <div className="h-4 w-px bg-white/20" />
      <Dropdown
        trigger={
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 font-medium text-sm">
            <Folder size={18} className="text-secondary" />
            {project.name}
            <ChevronDown size={18} className="text-on-surface-variant" />
          </button>
        }
      >
        {projects.map(p => (
          <DropdownItem key={p.name} onClick={() => onSwitchProject(p.name)}>
            {p.name}
          </DropdownItem>
        ))}
        <div className="h-px bg-white/10 my-1" />
        <DropdownItem onClick={onNewProject} className="text-primary">
          <Plus size={16} className="inline mr-1" /> Новый проект
        </DropdownItem>
        <DropdownItem onClick={onOpenSettings}>
          ⚙️ Настройки проекта
        </DropdownItem>
        <DropdownItem onClick={onOpenGlobalSettings}>
          🌍 Глобальные настройки
        </DropdownItem>
      </Dropdown>

      {/* Меню Вид */}
      <Dropdown
        trigger={
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 font-medium text-sm text-on-surface-variant hover:text-white transition-colors">
            <LayoutGrid size={18} className="text-on-surface-variant" />
            Вид
          </button>
        }
      >
        <DropdownItem onClick={() => onToggleUi('showSceneSidebar')}>
          <span className="flex items-center gap-2 text-on-surface">
            {uiPreferences.showSceneSidebar ? <SquareCheckBig size={16} className="text-primary" /> : <Square size={16} className="text-primary" />}
            Сайдбар сцен
          </span>
        </DropdownItem>
        <DropdownItem onClick={() => onToggleUi('showTimeline')}>
          <span className="flex items-center gap-2 text-on-surface">
            {uiPreferences.showTimeline ? <SquareCheckBig size={16} className="text-primary" /> : <Square size={16} className="text-primary" />}
            Таймлайн
          </span>
        </DropdownItem>
        <DropdownItem onClick={() => onToggleUi('showInspector')}>
          <span className="flex items-center gap-2 text-on-surface">
            {uiPreferences.showInspector ? <SquareCheckBig size={16} className="text-primary" /> : <Square size={16} className="text-primary" />}
            Инспектор пайплайна
          </span>
        </DropdownItem>
      </Dropdown>
    </div>

    <div className="flex items-center gap-3">
      <button
        onClick={onOpenLogs}
        title="Журнал логов"
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 font-medium text-sm text-on-surface-variant hover:text-white transition-colors"
      >
        <Terminal size={18} />
        <span className="hidden xl:inline">Журнал</span>
      </button>
      <Button
        variant="primary"
        disabled={isAutoPipelineRunning || isRendering}
        onClick={onFullAutoPipeline}
        icon={Zap}
        filledIcon
        className="bg-gradient-to-r from-secondary to-primary text-black font-semibold shadow-[0_0_20px_rgba(79,219,200,0.3)]"
      >
        {isAutoPipelineRunning ? pipelineStep : 'Сгенерировать всё'}
      </Button>
    </div>
  </header>
)
