import { Button } from '@shared/ui'
import { Lightbulb, FileText, Folder, Trash2, Settings } from 'lucide-react'
import type { ProjectSettings } from '@entities/project'

interface Props {
  onGoIdeas: () => void
  onGoScenario: () => void
  onGoSettings: () => void
  projects: ProjectSettings[]
  onOpenProject: (id: string) => void
  onDeleteProject: (id: string) => void
}

export const ProjectCreator = ({ onGoIdeas, onGoScenario, onGoSettings, projects, onOpenProject, onDeleteProject }: Props) => {
  return (
    <div className="flex flex-col items-center min-h-dvh p-8 pb-20 bg-background overflow-y-auto custom-scrollbar relative">

      <Button variant="ghost" icon={Settings} onClick={onGoSettings} className="absolute top-6 right-6 text-on-surface-variant hover:text-primary">
        Настройки
      </Button>

      <div className="w-full max-w-4xl flex flex-col gap-10 mt-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center">
          <h1 className="text-5xl font-black text-primary tracking-tight mb-4 drop-shadow-2xl">Vidora</h1>
          <p className="text-on-surface-variant text-lg">AI-пайплайн для создания видео</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-secondary/10 to-surface-container border border-secondary/30 p-8 rounded-3xl flex flex-col items-start gap-4 hover:border-secondary/60 transition-all group">
            <div className="w-14 h-14 bg-secondary/20 rounded-2xl flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
              <Lightbulb size={32} />
            </div>
            <h3 className="text-2xl font-bold text-white">Найти идею на YouTube</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-4">
              ИИ-агент проанализирует тренды, найдет аномалии конкурентов, украдет лучшие хуки и предложит готовую упаковку.
            </p>
            <Button variant="secondary" onClick={onGoIdeas} className="mt-auto px-6 py-2.5 text-sm font-semibold">
              Запустить Агента
            </Button>
          </div>

          <div className="bg-gradient-to-br from-primary/10 to-surface-container border border-primary/30 p-8 rounded-3xl flex flex-col items-start gap-4 hover:border-primary/60 transition-all group">
            <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <FileText size={32} />
            </div>
            <h3 className="text-2xl font-bold text-white">Создать из Markdown</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-4">
              У вас уже есть готовый сценарий? Вставьте текст, настройте формат, цвета и сразу переходите к генерации видео.
            </p>
            <Button variant="primary" onClick={onGoScenario} className="mt-auto px-6 py-2.5 text-sm font-semibold">
              Написать сценарий
            </Button>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="mt-8 flex flex-col gap-4">
            <h4 className="text-sm font-label uppercase text-on-surface-variant tracking-widest pl-2">Недавние проекты</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(p => (
                <div key={p.name} className="bg-surface-container/50 border border-white/5 p-4 rounded-2xl flex flex-col gap-3 hover:border-white/20 transition-colors group cursor-pointer" onClick={() => onOpenProject(p.name)}>
                  <div className="flex items-center gap-3">
                    <Folder size={20} className="text-primary" />
                    <span className="font-semibold text-on-surface truncate flex-1">{p.name}</span>
                    <button className="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity p-1" onClick={(e) => { e.stopPropagation(); onDeleteProject(p.name) }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-on-surface-variant">{p.format}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-on-surface-variant">{p.scenes.length} сцен</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
