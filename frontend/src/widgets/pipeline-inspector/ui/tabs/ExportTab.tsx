import { Button } from '@shared/ui'
import { FileOutput, Clapperboard } from 'lucide-react'
import { DownloadLastRenderButton } from '@features/render-project'

interface ExportTabProps {
  onExportProject: () => void
  onOpenRenderModal: () => void
  isRendering: boolean
}

export const ExportTab = ({ onExportProject, onOpenRenderModal, isRendering }: ExportTabProps) => {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex justify-between items-center bg-success/10 p-2 rounded-lg border border-success/20 gap-2">
        <span className="font-label text-xs uppercase tracking-wide text-success flex items-center gap-1.5 truncate"><FileOutput size={16}/> Экспорт проекта</span>
      </div>

      <p className="text-xs text-on-surface-variant mb-2 leading-relaxed">
        Рендер MP4 выполняется в браузере. Выберите текущую сцену, отмеченные сцены или весь проект.
      </p>

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          onClick={onOpenRenderModal}
          disabled={isRendering}
          className="py-3 h-auto leading-tight shadow-lg shadow-success/20"
        >
          Рендер видео <Clapperboard size={14} className="ml-1" />
        </Button>

        <DownloadLastRenderButton variant="outline" compact className="w-full [&>button:first-child]:flex-1" />

        <Button variant="dashed" onClick={onExportProject} className="py-2.5 h-auto leading-tight">
          Экспорт ZIP <FileOutput size={14} className="ml-1" />
        </Button>
      </div>
    </section>
  )
}