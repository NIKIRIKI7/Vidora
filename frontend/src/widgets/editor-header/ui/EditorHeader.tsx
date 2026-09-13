import type { ProjectSettings } from '@entities/project'
import { GradientButton, Dropdown, DropdownItem, PageHeader } from '@shared/ui'
import { Folder, ChevronDown, Plus, LayoutGrid, SquareCheckBig, Square, Zap, Terminal, Clapperboard } from 'lucide-react'

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
  onBack: () => void
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
  onBack,
  onOpenSettings,
  onOpenGlobalSettings,
  onOpenLogs,
  onFullAutoPipeline,
}: Props) => (
  <PageHeader
    title="Vidora"
    icon={Clapperboard}
    onBack={onBack}
    centerContent={
      <div className="flex items-center gap-2">
        <Dropdown
          trigger={
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-on-surface/5 font-medium text-sm">
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
          <div className="h-px bg-on-surface/10 my-1" />
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
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-on-surface/5 font-medium text-sm text-on-surface-variant hover:text-on-surface transition-colors">
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
    }
    rightContent={
      <>
        <button
          onClick={onOpenLogs}
          title="Журнал логов"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-on-surface/5 font-medium text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Terminal size={18} />
          <span className="hidden xl:inline">Журнал</span>
        </button>
        <GradientButton
          disabled={isAutoPipelineRunning || isRendering}
          onClick={onFullAutoPipeline}
          icon={<Zap size={16} fill="currentColor" />}
        >
          {isAutoPipelineRunning ? pipelineStep : 'Сгенерировать всё'}
        </GradientButton>
      </>
    }
  />
)
