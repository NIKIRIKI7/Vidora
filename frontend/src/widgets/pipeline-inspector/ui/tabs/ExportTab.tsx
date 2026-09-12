import type { ProjectSettings } from '@entities/project'
import { Button, FieldGroup } from '@shared/ui'
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
        <div className="flex bg-surface-container-lowest border border-white/10 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => onUpdateProjectSettings({ ...project, renderQuality: 'low' })}
            className={`flex-1 py-1 text-xs font-medium rounded-md transition-all ${(project.renderQuality || 'medium') === 'low' ? 'bg-warning/20 text-warning border border-warning/30 font-bold' : 'text-on-surface-variant hover:text-white'}`}
            title="Масштаб 0.5x, пресет ultrafast (в 4 раза быстрее)"
          >
            ⚡ Низкое
          </button>
          <button
            type="button"
            onClick={() => onUpdateProjectSettings({ ...project, renderQuality: 'medium' })}
            className={`flex-1 py-1 text-xs font-medium rounded-md transition-all ${(project.renderQuality || 'medium') === 'medium' ? 'bg-primary/20 text-primary border border-primary/30 font-bold' : 'text-on-surface-variant hover:text-white'}`}
            title="Честный 1080p, пресет veryfast (баланс)"
          >
            ⚖️ Среднее
          </button>
          <button
            type="button"
            onClick={() => onUpdateProjectSettings({ ...project, renderQuality: 'high' })}
            className={`flex-1 py-1 text-xs font-medium rounded-md transition-all ${(project.renderQuality || 'medium') === 'high' ? 'bg-success/20 text-success border border-success/30 font-bold' : 'text-on-surface-variant hover:text-white'}`}
            title="Максимальный битрейт (CRF 16, высокое качество)"
          >
            💎 Высокое
          </button>
        </div>
      </FieldGroup>
      <p className="text-xs text-on-surface-variant mb-2 leading-relaxed">
        Полный рендер всех неигнорируемых сцен с использованием локального инстанса Remotion и последующей склейкой аудиодорожек через FFmpeg.
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="primary" disabled={isRendering} onClick={onRunProjectRender} className="py-3 h-auto leading-tight shadow-[0_0_15px_rgba(74,222,128,0.2)]">
          {isRendering ? `🎬 Рендер... ${renderProgress}%` : '🎬 Рендер всего проекта'}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="dashed" disabled={isRendering} onClick={onRunRender} className="flex-1 min-w-[120px] text-xs py-2 px-2 h-auto leading-tight">
            Текущая сцена
          </Button>
          <Button variant="dashed" disabled={isRendering} onClick={onExportProject} className="flex-1 min-w-[120px] text-xs py-2 px-2 h-auto leading-tight">
            Экспорт ZIP <FileOutput size={14} className="ml-1" />
          </Button>
        </div>
      </div>
    </section>
  )
}
