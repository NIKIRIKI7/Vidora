import { Button } from '@shared/ui'
import { FileOutput } from 'lucide-react'

interface ExportTabProps {
  onExportProject: () => void
}

export const ExportTab = ({ onExportProject }: ExportTabProps) => {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex justify-between items-center bg-success/10 p-2 rounded-lg border border-success/20 gap-2">
        <span className="font-label text-xs uppercase tracking-wide text-success flex items-center gap-1.5 truncate"><FileOutput size={16}/> Экспорт проекта</span>
      </div>

      <p className="text-xs text-on-surface-variant mb-2 leading-relaxed">
        Скачайте проект в виде ZIP-архива для дальнейшей работы. Рендер видео удалён из приложения.
      </p>

      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={onExportProject} className="py-3 h-auto leading-tight shadow-lg shadow-success/20">
          Экспорт ZIP <FileOutput size={14} className="ml-1" />
        </Button>
      </div>
    </section>
  )
}