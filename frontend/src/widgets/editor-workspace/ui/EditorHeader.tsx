import type { ProjectSettings } from '@entities/project'
import { Button, Dropdown, DropdownItem, Icon } from '@shared/ui'

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
  onFullAutoPipeline,
}: Props) => (
  <header className="h-16 shrink-0 border-b border-white/10 bg-surface-container/60 backdrop-blur-2xl px-6 flex justify-between items-center z-20">
    <div className="flex items-center gap-4">
      <span className="font-display text-2xl font-bold text-primary tracking-tight">Vidora</span>
      <div className="h-4 w-px bg-white/20" />
      <Dropdown
        trigger={
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 font-medium text-sm">
            <Icon name="folder" className="text-secondary text-lg" />
            {project.name}
            <Icon name="expand_more" className="text-on-surface-variant text-lg" />
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
          <Icon name="add" className="inline text-base mr-1" /> Новый проект
        </DropdownItem>
        <DropdownItem onClick={onOpenSettings}>
          <Icon name="settings" className="inline text-base mr-1" /> Настройки
        </DropdownItem>
      </Dropdown>

      {/* Меню Вид */}
      <Dropdown
        trigger={
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 font-medium text-sm text-on-surface-variant hover:text-white transition-colors">
            <Icon name="grid_view" className="text-lg" />
            Вид
          </button>
        }
      >
        <DropdownItem onClick={() => onToggleUi('showSceneSidebar')}>
          <span className="flex items-center gap-2 text-on-surface">
            <Icon name={uiPreferences.showSceneSidebar ? 'check_box' : 'check_box_outline_blank'} className="text-base text-primary" />
            Сайдбар сцен
          </span>
        </DropdownItem>
        <DropdownItem onClick={() => onToggleUi('showTimeline')}>
          <span className="flex items-center gap-2 text-on-surface">
            <Icon name={uiPreferences.showTimeline ? 'check_box' : 'check_box_outline_blank'} className="text-base text-primary" />
            Таймлайн
          </span>
        </DropdownItem>
        <DropdownItem onClick={() => onToggleUi('showInspector')}>
          <span className="flex items-center gap-2 text-on-surface">
            <Icon name={uiPreferences.showInspector ? 'check_box' : 'check_box_outline_blank'} className="text-base text-primary" />
            Инспектор пайплайна
          </span>
        </DropdownItem>
      </Dropdown>
    </div>

    <div className="flex items-center gap-3">
      <Button
        variant="primary"
        disabled={isAutoPipelineRunning || isRendering}
        onClick={onFullAutoPipeline}
        icon="bolt"
        filledIcon
        className="bg-gradient-to-r from-secondary to-primary text-black font-semibold shadow-[0_0_20px_rgba(79,219,200,0.3)]"
      >
        {isAutoPipelineRunning ? pipelineStep : 'Сгенерировать всё'}
      </Button>
    </div>
  </header>
)
