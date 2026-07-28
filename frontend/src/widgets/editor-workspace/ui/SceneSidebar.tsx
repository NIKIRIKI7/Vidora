import { useState } from 'react'
import type { ProjectSettings } from '@entities/project'
import { useSettingsStore } from '@entities/project'
import { Icon, SceneCard, Input, Button, Spinner } from '@shared/ui'
import { API, getProjectPath, isCodeDirty, isAudioDirty } from '@widgets/editor-workspace/lib/helpers'

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
  onExportScene: (id: string) => void
  onReplaceScene: (id: string) => void
  onFixAudioPacing?: (id: string) => void
  onCopyFixPacingPrompt?: (id: string, currentPacing: number, threshold: number) => void
}

export const SceneSidebar = ({
  project, activeSceneId, audioLoaded, onSelectScene, onAddScene, onDeleteScene,
  onUpdateTitle, onToggleIgnoreTsx, onDragStart, onDrop, onShowNotification,
  onExportScene, onReplaceScene, onFixAudioPacing, onCopyFixPacingPrompt,
}: Props) => {
  const [tab, setTab] = useState<'script' | 'stock'>('script')
  const [stockQuery, setStockQuery] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stockResults, setStockResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const { visualPacingThreshold, audioSilenceThreshold, audioWpmMin } = useSettingsStore()

  const handleSearchStock = async () => {
    if (!stockQuery) return
    setIsSearching(true)
    try {
      const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(stockQuery)}&per_page=15&orientation=portrait`, { headers: { Authorization: 'wU4uRTYq9l3kF48H7mF3uCq6y3mE8B7k6s4F3l1T8w2mE4H1sR9q0bO3' } })
      const data = await res.json()
      setStockResults(data.videos || [])
    } catch { onShowNotification('Ошибка поиска футажей', 'error') } finally { setIsSearching(false) }
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
    } catch { onShowNotification('Ошибка скачивания', 'error') }
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

              const wordCount = scene.fragments.reduce((acc, f) => acc + f.text.trim().split(/\s+/).filter(Boolean).length, 0)
              const sceneDuration = scene.fragments[scene.fragments.length - 1]?.endTime
                ? scene.fragments[scene.fragments.length - 1].endTime! - (scene.fragments[0].startTime || 0)
                : Math.max(wordCount / 2.5, 1.0)
              const pacing = sceneDuration / Math.max(1, scene.fragments.length)
              const isVisualBoring = pacing > visualPacingThreshold

              let maxSilence = 0
              let speechTime = 0
              for (let i = 0; i < scene.fragments.length; i++) {
                const f = scene.fragments[i]
                if (f.startTime != null && f.endTime != null) {
                  speechTime += (f.endTime - f.startTime)
                  if (i > 0 && scene.fragments[i - 1].endTime != null) {
                    maxSilence = Math.max(maxSilence, f.startTime - scene.fragments[i - 1].endTime!)
                  }
                }
              }
              const wpm = speechTime > 0 ? (wordCount / (speechTime / 60)) : (wordCount / (sceneDuration / 60))
              const isAudioBoring = hasSync && (maxSilence > audioSilenceThreshold || (wpm < audioWpmMin && wpm > 0))

              return (
                <div key={scene.id} draggable onDragStart={onDragStart(idx)} onDragOver={e => e.preventDefault()} onDrop={onDrop(idx)} onClick={() => onSelectScene(scene.id)} className="flex flex-col gap-1 group relative">
                  <Icon name="drag_indicator" className="text-[12px] text-on-surface-variant/30 absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
                  <div className="flex items-center justify-between">
                    <input className="text-xs font-semibold bg-transparent text-primary outline-none focus:border-b border-primary/50 w-full" value={scene.title} onChange={e => onUpdateTitle(scene.id, e.target.value, scene.timecode)} />
                    <div className="flex items-center gap-1">
                      <button className={`text-[11px] p-1 rounded transition-colors ${isIgnored ? 'text-error font-medium' : 'text-on-surface-variant/40 hover:text-white'}`} onClick={e => { e.stopPropagation(); onToggleIgnoreTsx(scene.id) }} title={isIgnored ? 'TSX игнорируется (черный экран)' : 'Нажмите, чтобы игнорировать TSX'}>{isIgnored ? '⬛ Игнор' : '⬛'}</button>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                        <button className="text-on-surface-variant hover:text-primary transition-colors p-1" onClick={e => { e.stopPropagation(); onExportScene(scene.id) }} title="Экспорт сцены (Markdown)"><Icon name="content_copy" className="text-[14px]" /></button>
                        <button className="text-on-surface-variant hover:text-primary transition-colors p-1" onClick={e => { e.stopPropagation(); onReplaceScene(scene.id) }} title="Заменить сцену из буфера (Markdown)"><Icon name="content_paste" className="text-[14px]" /></button>
                        <button className="text-on-surface-variant hover:text-error transition-colors p-1" onClick={e => { e.stopPropagation(); onDeleteScene(scene.id) }} title="Удалить сцену"><Icon name="delete" className="text-[14px]" /></button>
                      </div>
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
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors font-medium ${isVisualBoring ? 'border-error/40 text-error bg-error/10' : 'border-secondary/40 text-secondary bg-secondary/10'}`} title={`Визуал: 1 смена кадра в ${pacing.toFixed(1)}с (Порог: ${visualPacingThreshold}с). ${isVisualBoring ? 'Разбейте текст на больше фрагментов.' : 'Отличный темп!'}`}>
                      {isVisualBoring ? '🐌 Визуал' : '🔥 Визуал'}
                    </span>
                    {isVisualBoring && (
                      <button onClick={(e) => { e.stopPropagation(); onCopyFixPacingPrompt?.(scene.id, pacing, visualPacingThreshold) }} className="text-[10px] px-1.5 py-0.5 rounded border border-primary/40 text-primary bg-primary/10 hover:bg-primary/20 transition-colors flex items-center gap-1 font-medium" title="Скопировать промпт для ИИ, чтобы он автоматически добавил динамики">
                        ✨ ИИ
                      </button>
                    )}
                    {hasSync && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors font-medium ${isAudioBoring ? 'border-warning/40 text-warning bg-warning/10' : 'border-secondary/40 text-secondary bg-secondary/10'}`} title={`Тишина: ${maxSilence.toFixed(1)}с (Порог: ${audioSilenceThreshold}с). Темп: ${Math.round(wpm)} WPM (Мин: ${audioWpmMin}).`}>
                        {isAudioBoring ? '🐌 Аудио' : '🔥 Аудио'}
                      </span>
                    )}
                    {isAudioBoring && (
                      <button onClick={(e) => { e.stopPropagation(); onFixAudioPacing?.(scene.id) }} className="text-[10px] px-1.5 py-0.5 rounded border border-accent/40 text-accent bg-accent/10 hover:bg-accent/20 transition-colors flex items-center gap-1 font-medium" title="Автоматически вырезать тишину и пересинхронизировать тайминги">
                        ✂️ Исправить
                      </button>
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
