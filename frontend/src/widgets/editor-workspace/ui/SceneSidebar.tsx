import { useState } from 'react'
import type { ProjectSettings } from '@entities/project'
import { Icon, SceneCard, Input, Button, Spinner } from '@shared/ui'
import { API, getProjectPath, isCodeDirty, isAudioDirty } from '../lib/helpers'

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
  onShowNotification: (msg: string, type?: 'success'|'error'|'info') => void
}

export const SceneSidebar = ({
  project, activeSceneId, audioLoaded, onSelectScene, onAddScene, onDeleteScene,
  onUpdateTitle, onToggleIgnoreTsx, onDragStart, onDrop, onShowNotification,
}: Props) => {
  const [tab, setTab] = useState<'script' | 'stock'>('script')
  const [stockQuery, setStockQuery] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stockResults, setStockResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const handleSearchStock = async () => {
    if (!stockQuery) return
    setIsSearching(true)
    try {
      const res = await fetch(`https://api.pexels.com/videos/search?query=${stockQuery}&per_page=12`, { headers: { Authorization: import.meta.env.VITE_PEXELS_API_KEY || '563492ad6f917000010000011cf8d655f013444ca94b0f4438dd8952' } })
      const data = await res.json()
      setStockResults(data.videos || [])
    } catch (e) { onShowNotification('Ошибка поиска футажей', 'error') } finally { setIsSearching(false) }
  }

  const handleDownloadStock = async (url: string, filename: string) => {
    onShowNotification('Скачивание со стока...', 'info')
    try {
      const res = await fetch(`${API}/api/v1/media/download-stock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: getProjectPath(project), url, filename }),
      })
      const data = await res.json()
      if (data.status === 'ok') onShowNotification(`Футаж скачан! Перетащите ${filename} на фрагмент.`, 'success')
    } catch (e) { onShowNotification('Ошибка скачивания', 'error') }
  }

  return (
    <aside className="w-[320px] border-r border-white/10 bg-surface-container/30 flex flex-col shrink-0">
      <div className="p-2 border-b border-white/5 bg-surface-container-lowest/30 flex gap-2">
        <button onClick={() => setTab('script')} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${tab === 'script' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}>Сценарий</button>
        <button onClick={() => setTab('stock')} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${tab === 'stock' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}>Сток (B-Roll)</button>
      </div>
      {tab === 'script' ? (
        <>
          <div className="px-4 py-2 border-b border-white/5 flex justify-end">
            <button className="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-md transition-all flex items-center gap-1 font-medium active:scale-95" onClick={onAddScene}><Icon name="add" className="text-[16px]" /><span>Добавить сцену</span></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
            {project.scenes.map((scene, idx) => {
              const isSceneActive = activeSceneId === scene.id
              const hasAudio = Boolean(scene.fragments.some(f => f.audioFileName) || (isSceneActive && audioLoaded))
              const hasSync = Boolean(scene.fragments.some(f => f.startTime !== undefined && f.startTime !== null))
              const isIgnored = Boolean(scene.ignoreTsx)
              const hasCode = Boolean(scene.remotionCode && scene.remotionCode.trim().length > 0)

              const codeDirty = isCodeDirty(project, scene)
              const audioDirty = scene.fragments.some(isAudioDirty)

              return (
                <div key={scene.id} draggable onDragStart={onDragStart(idx)} onDragOver={e => e.preventDefault()} onDrop={onDrop(idx)} onClick={() => onSelectScene(scene.id)} className="flex flex-col gap-1 group relative">
                  <Icon name="drag_indicator" className="text-[12px] text-on-surface-variant/30 absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
                  <div className="flex items-center justify-between">
                    <input className="text-xs font-semibold bg-transparent text-primary outline-none focus:border-b border-primary/50 w-full" value={scene.title} onChange={e => onUpdateTitle(scene.id, e.target.value, scene.timecode)} />
                    <div className="flex items-center gap-1">
                      <button className={`text-[11px] p-1 rounded transition-colors ${isIgnored ? 'text-error font-medium' : 'text-on-surface-variant/40 hover:text-white'}`} onClick={e => { e.stopPropagation(); onToggleIgnoreTsx(scene.id) }} title={isIgnored ? 'TSX игнорируется (черный экран)' : 'Нажмите, чтобы игнорировать TSX'}>{isIgnored ? '⬛ Игнор' : '⬛'}</button>
                      <button className="text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity p-1" onClick={e => { e.stopPropagation(); onDeleteScene(scene.id) }} title="Удалить сцену"><Icon name="delete" className="text-[14px]" /></button>
                    </div>
                  </div>
                  <SceneCard scene={`Сцена ${idx + 1}`} time={scene.timecode} description={scene.fragments[0]?.text.substring(0, 50) + '...'} isActive={isSceneActive} />
                  <div className="flex flex-wrap gap-1 pl-1">
                    {audioDirty ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-warning/30 text-warning bg-warning/10 font-medium" title="Аудио устарело">⚠️ Аудио</span>
                    ) : (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${hasAudio ? 'border-secondary/40 text-secondary bg-secondary/10 font-medium' : 'border-white/10 text-on-surface-variant/30 bg-white/5'}`}>🎙️ Аудио</span>
                    )}

                    <span className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${hasSync ? 'border-primary/40 text-primary bg-primary/10 font-medium' : 'border-white/10 text-on-surface-variant/30 bg-white/5'}`}>⏱️ Тайминги</span>

                    {isIgnored ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/20 text-on-surface-variant bg-black font-medium" title="Черный экран при рендере">⬛ Чёрный экран</span>
                    ) : codeDirty ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-warning/30 text-warning bg-warning/10 font-medium" title="Код устарел">⚠️ TSX</span>
                    ) : (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${hasCode ? 'border-accent/40 text-accent bg-accent/10 font-medium' : 'border-white/10 text-on-surface-variant/30 bg-white/5'}`}>💻 TSX</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
          <div className="flex gap-2">
            <Input value={stockQuery} onChange={e => setStockQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearchStock()} placeholder="hacker, code..." />
            <Button variant="secondary" icon="search" onClick={handleSearchStock} disabled={isSearching} />
          </div>
          {isSearching ? <div className="flex justify-center p-6"><Spinner /></div> : (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {stockResults.map(video => (
                <div key={video.id} className="relative group rounded-lg overflow-hidden border border-white/10 aspect-[9/16] bg-black">
                  <video src={video.video_files[0]?.link} loop muted onMouseOver={e => e.currentTarget.play()} onMouseOut={e => e.currentTarget.pause()} className="w-full h-full object-cover" />
                  <button onClick={() => handleDownloadStock(video.video_files[0]?.link, `stock_${video.id}.mp4`)} className="absolute bottom-2 right-2 bg-primary text-black p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="download" className="text-[16px]" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
