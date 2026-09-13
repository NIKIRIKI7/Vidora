import { useState } from 'react'
import type { ProjectSettings, Scene } from '@entities/project'
import { Button, Switch, Spinner } from '@shared/ui'
import { Code, Copy, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { ARCHETYPE_MARKER, detectArchetype, stripArchetypeMarker, type VisualArchetype } from '@shared/config'
import { ArchetypeSelector } from '@features/select-archetype'
import { generateProjectPrompt, generateRemotionPrompt, isCodeDirty } from '@features/editor-utils'

interface VisualTabProps {
  project: ProjectSettings
  activeScene?: Scene
  isGeneratingCode: boolean
  onRunCodeGen: () => void
  onToggleIgnoreTsx: (sceneId: string) => void
  onUpdateProjectSettings: (project: ProjectSettings) => void
  onShowNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export const VisualTab = ({
  project, activeScene, isGeneratingCode, onRunCodeGen, onToggleIgnoreTsx, onUpdateProjectSettings, onShowNotification,
}: VisualTabProps) => {
  const [showRawCode, setShowRawCode] = useState(false)
  const codeDirty = activeScene ? isCodeDirty(project, activeScene) : false
  const currentArchetype: VisualArchetype | undefined = activeScene
    ? detectArchetype(activeScene.fragments[0]?.visualNote || '')
    : undefined

  const applyArchetype = (archetype: VisualArchetype) => {
    if (!activeScene) return
    const updatedScenes = project.scenes.map(s => {
      if (s.id !== activeScene.id) return s
      return {
        ...s,
        fragments: s.fragments.map(f => {
          const clean = stripArchetypeMarker(f.visualNote || '')
          const prefix = `${ARCHETYPE_MARKER} ${archetype}`
          return { ...f, visualNote: clean ? `${prefix} — ${clean}` : prefix }
        }),
      }
    })
    onUpdateProjectSettings({ ...project, scenes: updatedScenes })
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex justify-between items-center bg-secondary/10 p-2 rounded-lg border border-secondary/20 gap-2">
        <span className="font-label text-xs uppercase tracking-wide text-secondary flex items-center gap-1.5 truncate"><Code size={16}/> Код (TSX)</span>
        <div className="flex flex-wrap gap-1 shrink-0 justify-end">
          <Button variant="outline" icon={Copy} className="px-2 py-0.5 text-2xs" onClick={() => { if (activeScene) { void navigator.clipboard.writeText(generateRemotionPrompt(project, activeScene)); onShowNotification('Промпт сцены с таймкодами скопирован!', 'success') } }}>Сцену</Button>
          <Button variant="outline" icon={Copy} className="px-2 py-0.5 text-2xs" onClick={() => { void navigator.clipboard.writeText(generateProjectPrompt(project)); onShowNotification('Промпт проекта скопирован!', 'success') }}>Проект</Button>
        </div>
      </div>
      {activeScene && (
        <div className="flex flex-col gap-2 p-3 bg-surface-container-lowest/40 border border-outline-variant/20 rounded-xl">
          <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
            <Sparkles size={14} className="text-secondary" /> Визуальный архетип сцены
          </span>
          <p className="text-2xs text-on-surface-variant leading-relaxed">
            Задаёт кинематику кадра для LLM-генератора Remotion — без ручного написания TSX.
          </p>
          <ArchetypeSelector currentArchetype={currentArchetype ?? null} onSelect={applyArchetype} />
        </div>
      )}
      {activeScene && (
        <div className="p-3 bg-surface-container-lowest/40 border border-outline-variant/20 rounded-xl">
          <Switch checked={Boolean(activeScene.ignoreTsx)} onChange={() => onToggleIgnoreTsx(activeScene.id)} label="Игнорировать TSX (черный экран)" />
        </div>
      )}
      <Button variant="dashed" disabled={isGeneratingCode || Boolean(activeScene?.ignoreTsx)} onClick={onRunCodeGen} className={`h-auto py-2 leading-tight ${codeDirty ? 'border-warning/50 text-warning hover:bg-warning/10 hover:border-warning' : ''}`}>
        {isGeneratingCode ? <Spinner /> : codeDirty ? 'Обновить код TSX (⚠️)' : 'Сгенерировать код через Ollama'}
      </Button>
      {activeScene && (
        <div className="border border-outline-variant/40 rounded-xl overflow-hidden bg-surface-container-lowest/40">
          <Button
            variant="ghost"
            onClick={() => setShowRawCode(v => !v)}
            className="w-full justify-between font-mono text-2xs rounded-none"
          >
            <span className="flex items-center gap-2">
              <Code size={13} className="text-secondary" /> Исходный код Remotion TSX
            </span>
            {showRawCode ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </Button>
          {showRawCode && (
            <pre className="p-3 border-t border-outline-variant/40 bg-surface-container-lowest font-mono text-2xs max-h-64 overflow-y-auto custom-scrollbar text-secondary whitespace-pre-wrap">
              {activeScene.remotionCode || '// Код для этой сцены ещё не сгенерирован.'}
            </pre>
          )}
        </div>
      )}
    </section>
  )
}
