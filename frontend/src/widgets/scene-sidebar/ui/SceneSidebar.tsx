import { fetchClient, apiErrorMessage } from '@shared/api'
import React, { useState } from 'react'
import type { ProjectSettings } from '@entities/project'
import { useSettingsStore } from '@entities/project'
import { SceneCard, Input, Button, Spinner, Tabs, IconButton, SearchInput } from '@shared/ui'
import { Plus, GripVertical, Copy, ClipboardPaste, Download, Upload, Trash2, Search } from 'lucide-react'
import { API, getProjectPath, isAudioDirty } from '@entities/project'
import { isCodeDirty } from '@features/editor-utils'
import { SceneStatusBadges } from '@features/inspect-pacing'

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
  onReplaceSceneAudio?: (sceneId: string, file: File) => void
}

export const SceneSidebar = React.memo(({
  project, activeSceneId, audioLoaded, onSelectScene, onAddScene, onDeleteScene,
  onUpdateTitle, onToggleIgnoreTsx, onDragStart, onDrop, onShowNotification,
  onExportScene, onReplaceScene, onFixAudioPacing, onCopyFixPacingPrompt, onReplaceSceneAudio
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
      const { data, error } = await fetchClient.GET('/api/v1/media/search-stock', {
        params: { query: { query: stockQuery } }
      })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status === 'error') {
        onShowNotification((data as { detail?: string | null }).detail || 'Ошибка поиска футажей', 'error')
        setStockResults([])
      } else {
        setStockResults(data.videos || [])
      }
    } catch {
      onShowNotification('Ошибка соединения при поиске', 'error')
      setStockResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleDownloadStock = async (url: string, filename: string) => {
    onShowNotification('Скачивание со стока...', 'info')
    try {
      const { data, error } = await fetchClient.POST('/api/v1/media/download-stock', {
        body: { project_path: getProjectPath(project), url, filename }
      })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status === 'ok') onShowNotification(`Футаж скачан! Перетащите ${filename} на фрагмент.`, 'success')
    } catch { onShowNotification('Ошибка скачивания', 'error') }
  }

  return (
    <aside className="w-full h-full border-r border-outline-variant/40 bg-surface-container/30 flex flex-col shrink-0">
      <div className="p-2 border-b border-outline-variant/20 bg-surface-container-lowest/30">
        <Tabs
          fill
          variant="pill"
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
          items={[
            { id: 'script', label: 'Сценарий' },
            { id: 'stock', label: 'Сток (B-Roll)' },
          ]}
          className="w-full"
        />
      </div>

      {tab === 'script' ? (
        <>
          <div className="px-4 py-2 border-b border-outline-variant/20 flex justify-end">
            <Button variant="link" icon={Plus} onClick={onAddScene}>Добавить сцену</Button>
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
                  <GripVertical size={12} className="text-on-surface-variant/30 absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
                  <div className="flex items-center justify-between gap-2">
                    <Input className="text-xs font-semibold bg-transparent border-transparent text-primary focus:border-primary/50 px-1 py-0 flex-1 min-w-0 rounded-none" value={scene.title} onChange={e => onUpdateTitle(scene.id, e.target.value, scene.timecode)} />
                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      <button className={`text-2xs p-1 rounded transition-colors ${isIgnored ? 'text-error font-medium' : 'text-on-surface-variant/40 hover:text-on-surface'}`} onClick={e => { e.stopPropagation(); onToggleIgnoreTsx(scene.id) }} title={isIgnored ? 'TSX игнорируется (черный экран)' : 'Нажмите, чтобы игнорировать TSX'}>{isIgnored ? '⬛ Игнор' : '⬛'}</button>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                        <IconButton icon={Copy} accent="primary" onClick={e => { e.stopPropagation(); onExportScene(scene.id) }} title="Экспорт сцены (Markdown)" />
                        <IconButton icon={ClipboardPaste} accent="primary" onClick={e => { e.stopPropagation(); onReplaceScene(scene.id) }} title="Заменить сцену из буфера (Markdown)" />

                        {hasAudio && (
                          <IconButton icon={Download} accent="primary" onClick={e => {
                            e.stopPropagation();
                            const audioPath = scene.fragments.find(f => f.audioFileName)?.audioFileName;
                            if (audioPath) {
                              const a = document.createElement('a');
                              a.href = `${API}/api/v1/render/media?path=${encodeURIComponent(audioPath)}`;
                              a.download = `Audio_${scene.title}.wav`;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                            } else {
                              onShowNotification('Аудио не найдено', 'error');
                            }
                          }} title="Скачать аудио сцены" />
                        )}
                        <label className="text-on-surface-variant hover:text-primary transition-colors p-1 cursor-pointer" title="Загрузить/Заменить аудио сцены" onClick={e => e.stopPropagation()}>
                          <Upload size={14} />
                          <input type="file" className="hidden" accept="audio/*" onChange={e => {
                            if (e.target.files && e.target.files.length > 0) {
                              onReplaceSceneAudio?.(scene.id, e.target.files[0]);
                              e.target.value = '';
                            }
                          }} />
                        </label>

                        <IconButton icon={Trash2} accent="error" onClick={e => { e.stopPropagation(); onDeleteScene(scene.id) }} title="Удалить сцену" />
                      </div>
                    </div>
                  </div>
                  <SceneCard scene={`Сцена ${idx + 1}`} time={scene.timecode} description={scene.fragments[0]?.text.substring(0, 50) + '...'} isActive={isSceneActive} />
                  <SceneStatusBadges
                    audioDirty={audioDirty}
                    hasAudio={hasAudio}
                    hasSync={hasSync}
                    codeDirty={codeDirty}
                    hasCode={hasCode}
                    isIgnored={isIgnored}
                    isVisualBoring={isVisualBoring}
                    isAudioBoring={isAudioBoring}
                    wpm={wpm}
                    pacingSeconds={pacing}
                    visualPacingThreshold={visualPacingThreshold}
                    audioSilenceThreshold={audioSilenceThreshold}
                    audioWpmMin={audioWpmMin}
                    maxSilence={maxSilence}
                    onCopyFixPacingPrompt={() => onCopyFixPacingPrompt?.(scene.id, pacing, visualPacingThreshold)}
                    onFixAudioPacing={() => onFixAudioPacing?.(scene.id)}
                  />
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
          <div className="flex gap-2">
            <SearchInput value={stockQuery} onChange={e => setStockQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearchStock()} placeholder="hacker, code..." onClear={() => setStockQuery('')} />
            <Button variant="secondary" icon={Search} onClick={handleSearchStock} disabled={isSearching} />
          </div>
          {isSearching ? <div className="flex justify-center p-6"><Spinner /></div> : (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {stockResults.map(video => (
                <div key={video.id} className="relative group rounded-lg overflow-hidden border border-outline-variant/40 aspect-[9/16] bg-surface-container-lowest">
                  <video src={video.video_files[0]?.link} loop muted onMouseOver={e => e.currentTarget.play()} onMouseOut={e => e.currentTarget.pause()} className="w-full h-full object-cover" />
                  <IconButton icon={Download} size="md" accent="neutral" onClick={() => handleDownloadStock(video.video_files[0]?.link, `stock_${video.id}.mp4`)} className="absolute bottom-2 right-2 bg-primary text-surface-container-lowest rounded-full opacity-0 group-hover:opacity-100" title="Скачать футаж" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )
})
