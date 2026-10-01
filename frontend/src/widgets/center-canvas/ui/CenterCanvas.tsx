import { fetchClient, apiErrorMessage } from '@shared/api'
import React, { Component, type ReactNode } from 'react'
import type { ProjectSettings, Scene } from '@entities/project'
import { useScenarioEngineStore } from '@entities/project'
import { Button, SegmentedControl, Spinner, TextArea } from '@shared/ui'
import { Ban, ChevronLeft, ChevronRight } from 'lucide-react'
import { CodeHistorySelector } from './CodeHistorySelector'
import { DefaultStandardLayout, Root } from '@web-react-player/ui'
import { RemotionProvider } from '@web-react-player/remotion'
import { remotionSuite, assetResolver } from '@shared/lib'

class PlayerErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      const err = this.state.error
      return (
        <div className="absolute inset-0 bg-surface-container-lowest flex flex-col items-center justify-center p-6 text-center z-50 rounded-2xl border border-error/20">
          <h3 className="text-error font-bold text-lg mb-2">Ошибка компиляции ИИ-кода</h3>
          <p className="text-on-surface-variant text-sm mb-4 font-mono max-h-32 overflow-auto custom-scrollbar whitespace-pre-wrap">
            {err.message || String(err)}
          </p>
          {'suggestion' in err && (err as Error & { suggestion?: string }).suggestion && (
            <p className="text-warning text-xs mb-4 bg-warning/10 p-3 rounded-lg border border-warning/20">
              💡 {(err as Error & { suggestion?: string }).suggestion}
            </p>
          )}
          <Button variant="primary" onClick={() => { this.setState({ error: null }); this.props.onReset() }}>
            Повторить сборку
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

interface Props {
  centerView: 'player' | 'code' | 'markdown'
  onChangeView: (view: 'player' | 'code' | 'markdown') => void
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

  const engineRawMarkdown = useScenarioEngineStore(s => s.rawMarkdown)
  const engineIsSyncing = useScenarioEngineStore(s => s.isSyncing)
  const engineUpdateMarkdown = useScenarioEngineStore(s => s.updateMarkdown)

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

  const renderPlayer = () => {
    if (!activeScene?.remotionCode) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-on-surface-variant">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <Ban size={40} className="text-primary/40" />
          </div>
          <p className="text-sm">Сначала сгенерируйте TSX код для предпросмотра</p>
        </div>
      )
    }

    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 relative">
        <div
          className="w-full relative shadow-2xl rounded-2xl overflow-hidden bg-black ring-1 ring-outline-variant/40"
          style={{
            aspectRatio: project.format === '16:9' ? '16/9' : '9/16',
            maxHeight: '100%',
            maxWidth: project.format === '9:16' ? '45vh' : '100%',
          }}
        >
          <Root style={{ width: '100%', height: '100%' }}>
            <PlayerErrorBoundary onReset={() => {}}>
              <RemotionProvider
                source={{
                  type: 'code',
                  code: activeScene.remotionCode,
                  assetResolver,
                }}
                pluginManager={remotionSuite.pluginManager}
                compiler={remotionSuite.compiler}
              />
              <DefaultStandardLayout debug={false} />
            </PlayerErrorBoundary>
          </Root>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-hidden">
      <div className="h-12 border-b border-outline-variant/20 flex items-center px-4 justify-between bg-surface-container-lowest/50 shrink-0">
        <SegmentedControl
          options={[
            { value: 'player', label: '▶️ Превью' },
            { value: 'code', label: '💻 Код TSX' },
            { value: 'markdown', label: '📝 Raw Script' },
          ]}
          value={centerView}
          onChange={(val) => onChangeView(val as 'player' | 'code' | 'markdown')}
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
        ) : centerView === 'player' ? (
          renderPlayer()
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
