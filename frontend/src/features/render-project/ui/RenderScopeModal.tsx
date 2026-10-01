import React, { useState } from 'react'
import { Modal, Button, OptionCard } from '@shared/ui'
import { Monitor, ListChecks, Film, AlertTriangle } from 'lucide-react'
import type { ProjectSettings, Scene } from '@entities/project'
import { collectRenderableScenes, type RenderScope } from '../model/useRenderProject'

interface Props {
  isOpen: boolean
  onClose: () => void
  project: ProjectSettings
  activeScene?: Scene
  isRendering: boolean
  onRender: (scope: RenderScope, selectedSceneIds: string[]) => void
}

export const RenderScopeModal: React.FC<Props> = ({
  isOpen,
  onClose,
  project,
  activeScene,
  isRendering,
  onRender,
}) => {
  const [scope, setScope] = useState<RenderScope>('current')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Сброс формы при каждом открытии. Регулируемое состояние правится прямо в
  // рендер-фазе (документированный приём React), а не в эффекте: эффект с
  // setState вызывал бы каскадный лишний рендер и запрещён eslint-правилом.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setScope(activeScene?.remotionCode?.trim() && !activeScene.ignoreTsx ? 'current' : 'project')
      setSelectedIds(new Set())
    }
  }

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRender = () => {
    onRender(scope, Array.from(selectedIds))
    onClose()
  }

  const renderable = collectRenderableScenes(project)
  const renderableIds = new Set(renderable.map((s) => s.id))
  const missingCodeCount = project.scenes.filter(
    (s) => !s.ignoreTsx && !s.remotionCode?.trim()
  ).length

  const canRender =
    scope === 'current'
      ? Boolean(activeScene?.remotionCode?.trim()) && !activeScene?.ignoreTsx
      : scope === 'selected'
        ? Array.from(selectedIds).some((id) => renderableIds.has(id))
        : renderable.length > 0

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🎬 Рендер проекта" className="max-w-2xl">
      <div className="flex flex-col gap-5">
        <div className="text-xs text-on-surface-variant bg-surface-container-lowest/50 border border-outline-variant/30 rounded-xl p-3 leading-relaxed">
          Рендер выполняется прямо в браузере (WebCodecs) и не требует сервера. Для 5+ сцен это
          может занять несколько минут — не закрывайте вкладку.
        </div>

        {missingCodeCount > 0 && (
          <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-xl p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              {missingCodeCount} сцен без TSX-кода будут пропущены. Сгенерируйте их заранее или
              выберите только готовые.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <OptionCard
            title="Текущая сцена"
            subtitle={activeScene?.title || 'Нет активной'}
            icon={Monitor}
            isActive={scope === 'current'}
            accent="primary"
            onClick={() => setScope('current')}
          />
          <OptionCard
            title="Выбранные"
            subtitle={`Отмечено: ${selectedIds.size}`}
            icon={ListChecks}
            isActive={scope === 'selected'}
            accent="primary"
            onClick={() => setScope('selected')}
          />
          <OptionCard
            title="Весь проект"
            subtitle={`${renderable.length} сцен`}
            icon={Film}
            isActive={scope === 'project'}
            accent="primary"
            onClick={() => setScope('project')}
          />
        </div>

        {scope === 'selected' && (
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto custom-scrollbar border border-outline-variant/30 rounded-xl p-2 bg-surface-container-lowest/40">
            {project.scenes.map((scene, idx) => {
              const hasCode = Boolean(scene.remotionCode?.trim())
              const disabled = !hasCode || scene.ignoreTsx
              const checked = selectedIds.has(scene.id)
              return (
                <label
                  key={scene.id}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : checked
                        ? 'bg-primary/10 cursor-pointer'
                        : 'hover:bg-on-surface/5 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(scene.id)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-xxs font-mono text-on-surface-variant w-6 shrink-0">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-xs text-on-surface truncate">{scene.title}</span>
                  {!hasCode && <span className="text-xxs text-warning shrink-0">нет TSX</span>}
                  {scene.ignoreTsx && <span className="text-xxs text-outline shrink-0">игнор</span>}
                </label>
              )
            })}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-outline-variant/40">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleRender} disabled={!canRender || isRendering}>
            {isRendering ? 'Рендер уже идёт...' : 'Начать рендер'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
