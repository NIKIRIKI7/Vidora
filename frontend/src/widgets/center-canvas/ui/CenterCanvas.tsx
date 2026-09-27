import { fetchClient, apiErrorMessage } from '@shared/api'
import React from 'react'
import type { ProjectSettings, Scene } from '@entities/project'
import { useScenarioEngineStore } from '@entities/project'
import { Button, SegmentedControl, Spinner, TextArea } from '@shared/ui'
import { Ban, ChevronLeft, ChevronRight } from 'lucide-react'
import { CodeHistorySelector } from './CodeHistorySelector'

interface Props {
  centerView: 'code' | 'markdown'
  onChangeView: (view: 'code' | 'markdown') => void
  activeScene: Scene | undefined
  project: ProjectSettings
  onUpdateCode: (code: string) => void
  onCodeHistory: (step: number) => void
  isAutoPipelineRunning: boolean
  pipelineStep: string
  onCancelAll: () => void
  showTimeline: boolean
  timeline?: React.ReactNode
}

export const CenterCanvas = ({
  centerView, onChangeView,
  activeScene, project, onUpdateCode,
  onCodeHistory, isAutoPipelineRunning, pipelineStep, onCancelAll,
  showTimeline, timeline,
}: Props) => {
  const isBusy = isAutoPipelineRunning

  // Тонкий клиент: Markdown-редактор связан со Шлюзом (AST-синк на бэкенде), а не с локальным парсером.
  const engineRawMarkdown = useScenarioEngineStore(s => s.rawMarkdown)
  const engineIsSyncing = useScenarioEngineStore(s => s.isSyncing)
  const engineUpdateMarkdown = useScenarioEngineStore(s => s.updateMarkdown)

  // Ручные правки кода тоже уходят в историю версий на бэкенде
  const saveCodeRevision = () => {
    if (!activeScene?.remotionCode?.trim()) return
    fetchClient.POST('/api/v1/system/history', { body: { project_id: project.name, scene_id: activeScene.id, tsx_code: activeScene.remotionCode, prompt: 'Ручная правка' } }).then(({ data, error }) => {
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      return data
    }).catch((err) => {
      console.error('CenterCanvas.saveCodeRevision:', err)
    })
  }

  const renderCode = () => (
    <div className="w-full h-full flex flex-col gap-2">
      {activeScene?.ignoreTsx ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container-lowest border border-outline-variant/40 rounded-xl text-on-surface-variant/60 font-mono text-sm gap-2">
          <Ban size={36} className="text-error" />
          <span>Игнорировать TSX включено</span>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center bg-surface-container-lowest border border-outline-variant/40 rounded-lg p-2 shrink-0">
            <span className="text-xs text-on-surface-variant ml-2">Версия: {(activeScene?.historyIndex ?? 0) + 1} / {Math.max(1, (activeScene?.remotionCodeHistory?.length || 0))}</span>
            <div className="flex items-center gap-1">
              {activeScene && <CodeHistorySelector projectId={project.name} sceneId={activeScene.id} onRestoreCode={onUpdateCode} />}
              <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => onCodeHistory(-1)} disabled={(activeScene?.historyIndex ?? 0) <= 0}><ChevronLeft size={16} /> Пред</Button>
              <Button variant="ghost" className="py-1 px-2 text-xs" onClick={() => onCodeHistory(1)} disabled={(activeScene?.historyIndex ?? 0) >= (activeScene?.remotionCodeHistory?.length || 1) - 1}>След <ChevronRight size={16} /></Button>
            </div>
          </div>
          <TextArea
            className="w-full h-full font-mono text-xs bg-surface-container-lowest/60 border border-outline-variant/40 p-4 rounded-xl text-on-surface resize-none outline-none focus:border-primary/50 custom-scrollbar"
            value={activeScene?.remotionCode || ''} onChange={e => onUpdateCode(e.target.value)} onBlur={saveCodeRevision} spellCheck={false}
          />
        </>
      )}
    </div>
  )

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-hidden">
      <div className="h-12 border-b border-outline-variant/20 flex items-center px-4 justify-between bg-surface-container-lowest/50 shrink-0">
        <SegmentedControl
          options={[
            { value: 'code', label: '💻 Код TSX' },
            { value: 'markdown', label: '📝 Raw Script' },
          ]}
          value={centerView}
          onChange={(val) => onChangeView(val as 'code' | 'markdown')}
        />
      </div>

      <div className="flex-1 flex flex-col justify-center items-center overflow-hidden">
        {isBusy ? (
          <div className="w-full max-w-4xl aspect-video bg-surface-container-lowest rounded-xl border border-outline-variant/40 shadow-2xl flex flex-col items-center justify-center gap-6 p-8 relative overflow-hidden m-6">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-50"></div>
            <Spinner className="text-6xl" />
            <div className="text-center z-10 flex flex-col items-center">
              <h2 className="text-2xl font-semibold text-on-surface mb-2">{pipelineStep || 'Сборка проекта...'}</h2>
              <p className="text-on-surface-variant text-sm mb-6">Пожалуйста, подождите. ИИ может исправлять ошибки в фоне.</p>
              <Button variant="dashed" className="border-error/50 text-error hover:bg-error/10" onClick={onCancelAll}>Отменить процесс</Button>
            </div>
          </div>
        ) : centerView === 'markdown' ? (
          <div className="relative w-full h-full p-6 flex justify-center overflow-y-auto custom-scrollbar">
            {engineIsSyncing && (
              <div className="absolute top-3 right-6 z-10 text-xxs text-secondary font-mono flex items-center gap-1.5 bg-surface-container-lowest/40 border border-outline-variant/40 rounded-full px-3 py-1 animate-pulse">
                <Spinner className="w-3 h-3" /> Синхронизация AST…
              </div>
            )}
            <TextArea
              className="w-full h-full max-w-5xl p-6 font-mono text-sm leading-relaxed bg-surface-container-lowest/60 text-on-surface border border-outline-variant/40 rounded-xl resize-none outline-none focus:border-primary/50 custom-scrollbar"
              value={engineRawMarkdown}
              onChange={e => engineUpdateMarkdown(e.target.value)}
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="p-6 w-full h-full flex justify-center overflow-y-auto custom-scrollbar">
            <div className="w-full h-full max-w-5xl flex flex-col gap-2">{renderCode()}</div>
          </div>
        )}
      </div>

      {showTimeline && !isBusy && timeline && (
        <div className="w-full h-[var(--layout-card)] shrink-0 border-t border-outline-variant/40 bg-background z-20">
          {timeline}
        </div>
      )}
    </div>
  )
}
