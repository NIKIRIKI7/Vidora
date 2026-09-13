import type { ProjectSettings } from '@entities/project'
import { Button, FieldGroup, SegmentedControl } from '@shared/ui'
import { Film, FileOutput } from 'lucide-react'

interface ExportTabProps {
  project: ProjectSettings
  isRendering: boolean
  renderProgress: number
  onRunProjectRender: () => void
  onRunRender: () => void
  onExportProject: () => void
  onUpdateProjectSettings: (project: ProjectSettings) => void
}

export const ExportTab = ({
  project, isRendering, renderProgress, onRunProjectRender, onRunRender, onExportProject, onUpdateProjectSettings,
}: ExportTabProps) => {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex justify-between items-center bg-success/10 p-2 rounded-lg border border-success/20 gap-2">
        <span className="font-label text-xs uppercase tracking-wide text-success flex items-center gap-1.5 truncate"><Film size={16}/> Сборка (Рендер)</span>
      </div>
      <FieldGroup label="Качество и скорость рендера">
        <SegmentedControl
          fill
          value={project.renderQuality || 'medium'}
          onChange={(v) => onUpdateProjectSettings({ ...project, renderQuality: v })}
          options={[
            { value: 'low', label: '⚡ Низкое', accent: 'warning' },
            { value: 'medium', label: '⚖️ Среднее', accent: 'primary' },
            { value: 'high', label: '💎 Высокое', accent: 'success' },
          ]}
        />
      </FieldGroup>
      <p className="text-xs text-on-surface-variant mb-2 leading-relaxed">
        Полный рендер всех неигнорируемых сцен с использованием локального инстанса Remotion и последующей склейкой аудиодорожек через FFmpeg.
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="primary" disabled={isRendering} onClick={onRunProjectRender} className="py-3 h-auto leading-tight shadow-lg shadow-success/20">
          {isRendering ? `🎬 Рендер... ${renderProgress}%` : '🎬 Рендер всего проекта'}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="dashed" disabled={isRendering} onClick={onRunRender} className="flex-1 min-w-[var(--layout-action)] text-xs py-2 px-2 h-auto leading-tight">
            Текущая сцена
          </Button>
          <Button variant="dashed" disabled={isRendering} onClick={onExportProject} className="flex-1 min-w-[var(--layout-action)] text-xs py-2 px-2 h-auto leading-tight">
            Экспорт ZIP <FileOutput size={14} className="ml-1" />
          </Button>
        </div>
      </div>
    </section>
  )
}
