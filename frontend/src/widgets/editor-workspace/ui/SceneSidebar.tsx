import type { ProjectSettings } from '@entities/project'
import { Icon, SceneCard } from '@shared/ui'

interface Props {
  project: ProjectSettings
  activeSceneId: string | undefined
  audioLoaded: string | null
  onSelectScene: (id: string) => void
  onAddScene: () => void
  onDeleteScene: (id: string) => void
  onUpdateTitle: (sceneId: string, title: string, timecode: string) => void
  onToggleIgnoreTsx: (sceneId: string) => void
  onDragStart: (idx: number) => () => void
  onDrop: (idx: number) => () => void
}

export const SceneSidebar = ({
  project,
  activeSceneId,
  audioLoaded,
  onSelectScene,
  onAddScene,
  onDeleteScene,
  onUpdateTitle,
  onToggleIgnoreTsx,
  onDragStart,
  onDrop,
}: Props) => (
  <aside className="w-[320px] border-r border-white/10 bg-surface-container/30 flex flex-col shrink-0">
    <div className="p-4 border-b border-white/5 flex justify-between items-center bg-surface-container-lowest/30">
      <h2 className="font-title-md text-title-md text-on-surface">Сценарий</h2>
      <button
        className="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-md transition-all flex items-center gap-1 font-medium active:scale-95"
        onClick={onAddScene}
      >
        <Icon name="add" className="text-[16px]" />
        <span>Сцена</span>
      </button>
    </div>
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
      {project.scenes.map((scene, idx) => {
        const isSceneActive = activeSceneId === scene.id
        const hasAudio = Boolean(scene.fragments.some(f => f.audioFileName) || (isSceneActive && audioLoaded))
        const hasSync = Boolean(scene.fragments.some(f => f.startTime !== undefined && f.startTime !== null))
        const isIgnored = Boolean(scene.ignoreTsx)
        const hasCode = Boolean(scene.remotionCode && scene.remotionCode.trim().length > 0)

        return (
          <div
            key={scene.id}
            draggable
            onDragStart={onDragStart(idx)}
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop(idx)}
            onClick={() => onSelectScene(scene.id)}
            className="flex flex-col gap-1 group relative"
          >
            <Icon
              name="drag_indicator"
              className="text-[12px] text-on-surface-variant/30 absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            />
            <div className="flex items-center justify-between">
              <input
                className="text-xs font-semibold bg-transparent text-primary outline-none focus:border-b border-primary/50 w-full"
                value={scene.title}
                onChange={e => onUpdateTitle(scene.id, e.target.value, scene.timecode)}
              />
              <div className="flex items-center gap-1">
                <button
                  className={`text-[11px] p-1 rounded transition-colors ${isIgnored ? 'text-error font-medium' : 'text-on-surface-variant/40 hover:text-white'}`}
                  onClick={e => {
                    e.stopPropagation()
                    onToggleIgnoreTsx(scene.id)
                  }}
                  title={isIgnored ? 'TSX игнорируется (черный экран)' : 'Нажмите, чтобы игнорировать TSX'}
                >
                  {isIgnored ? '⬛ Игнор' : '⬛'}
                </button>
                <button
                  className="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  onClick={e => {
                    e.stopPropagation()
                    onDeleteScene(scene.id)
                  }}
                  title="Удалить сцену"
                >
                  <Icon name="delete" className="text-[14px]" />
                </button>
              </div>
            </div>
            <SceneCard
              scene={`Сцена ${idx + 1}`}
              time={scene.timecode}
              description={scene.fragments[0]?.text.substring(0, 50) + '...'}
              isActive={activeSceneId === scene.id}
            />
            <div className="flex gap-1 pl-1">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${hasAudio ? 'border-secondary/40 text-secondary bg-secondary/10 font-medium' : 'border-white/10 text-on-surface-variant/30 bg-white/5'}`}
              >
                🎙️ Аудио
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${hasSync ? 'border-primary/40 text-primary bg-primary/10 font-medium' : 'border-white/10 text-on-surface-variant/30 bg-white/5'}`}
              >
                ⏱️ Тайминги
              </span>
              {isIgnored ? (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded border border-white/20 text-on-surface-variant bg-black font-medium"
                  title="Черный экран при рендере"
                >
                  ⬛ Чёрный экран
                </span>
              ) : (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${hasCode ? 'border-accent/40 text-accent bg-accent/10 font-medium' : 'border-white/10 text-on-surface-variant/30 bg-white/5'}`}
                >
                  💻 TSX
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  </aside>
)
