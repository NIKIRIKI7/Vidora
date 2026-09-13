import { fetchClient, apiErrorMessage } from '@shared/api'
import React, { useState, useRef, type DragEvent } from 'react'
import type { ProjectSettings, Scene, SceneFragment } from '@entities/project'
import { Button, IconButton, Input, SegmentedControl, VoiceTagToolbar, useVoiceTagInserter, TextArea } from '@shared/ui'
import { Logs, Plus, GripVertical, Minus, Mic, Download, Upload, Trash2, Copy, FileAudio, Sparkles, Video } from 'lucide-react'
import { FragmentBrollControl } from '@features/manage-broll'
import { getProjectPath, API, isAudioDirty, extractCleanVoiceText, getSceneTeleprompterScript, getProjectTeleprompterScript } from '@entities/project'

interface FragmentCardProps {
  frag: SceneFragment
  project: ProjectSettings
  copyEmotionTags: boolean
  onFragDragStart: () => void
  onFragmentTextChange: (id: string, text: string, visualNote?: string) => void
  onNudgeTiming: (fragId: string, type: 'start' | 'end', delta: number) => void
  onDeleteFragment: (id: string) => void
  onFragDrop: () => void
  onOpenCustomAudioModal?: (scope: 'fragment' | 'scene' | 'project', fragId?: string) => void
  onOpenBRollModal?: (scope: 'fragment' | 'scene' | 'project', fragId?: string) => void
  onAutoMatchBRoll?: (scope: 'fragment' | 'scene' | 'project', targetFragId?: string) => void
  onRunVoiceGenFragment: (fragId: string) => void
  onUpdateFragmentBRoll: (fragId: string, filename: string) => void
  onUnlinkFragmentBRoll: (fragId: string) => void
  onReplaceFragmentAudio: (fragId: string, path: string) => void
  onShowNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
}

const FragmentCard = React.memo(({
  frag, project, copyEmotionTags, onFragDragStart, onFragmentTextChange, onNudgeTiming, onDeleteFragment,
  onFragDrop, onOpenCustomAudioModal, onOpenBRollModal, onAutoMatchBRoll, onRunVoiceGenFragment, onUpdateFragmentBRoll,
  onUnlinkFragmentBRoll, onReplaceFragmentAudio, onShowNotification
}: FragmentCardProps) => {
  const dirtyAudio = isAudioDirty(frag)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const { insertTag, toggleCaps, hasSelection } = useVoiceTagInserter(textRef)
  // Громоздкий VoiceTagToolbar показывается как компактная плашка при фокусе на тексте.
  const [tagsOpen, setTagsOpen] = useState(false)

  const uploadBRoll = async (file: File) => {
    onShowNotification('Загрузка футажа...', 'info')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('project_path', getProjectPath(project))
    try {
      const { data, error } = await fetchClient.POST('/api/v1/media/upload', { body: fd as never })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status === 'ok' || data.id) {
        onUpdateFragmentBRoll(frag.id, data.filename ?? data.path ?? '')
        onShowNotification('B-Roll привязан!', 'success')
      } else {
        onShowNotification((data as { detail?: string | null }).detail || 'Ошибка загрузки медиа', 'error')
      }
    } catch {
      onShowNotification('Ошибка загрузки медиа', 'error')
    }
  }

  return (
    <div
      draggable
      onDragStart={onFragDragStart}
      onDragOver={e => e.preventDefault()}
      onDrop={async (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (!file || (!file.type.startsWith('video/') && !file.type.startsWith('image/'))) {
          onFragDrop()
          return
        }
        await uploadBRoll(file)
      }}
      className={`p-3 bg-surface-container-lowest/40 border transition-colors rounded-xl flex flex-col gap-2 relative group ${
        dirtyAudio ? 'border-warning/30 hover:border-warning' : 'border-outline-variant/20 hover:border-secondary/30'
      }`}
    >
      <GripVertical size={12} className="text-on-surface-variant/30 absolute -left-0.5 top-6 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <IconButton icon={Minus} size="xs" accent="primary" onClick={() => onNudgeTiming(frag.id, 'start', -0.1)} title="Сдвинуть начало" />
          <span className="text-xxs font-mono text-secondary font-medium">{frag.startTime?.toFixed(1) || '0'}s - {frag.endTime?.toFixed(1) || '0'}s</span>
          <IconButton icon={Plus} size="xs" accent="primary" onClick={() => onNudgeTiming(frag.id, 'end', 0.1)} title="Сдвинуть конец" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <IconButton icon={Copy} accent="primary" onClick={() => {
            const text = extractCleanVoiceText(frag.text, { keepEmotionTags: copyEmotionTags, keepPauseSoundTags: copyEmotionTags })
            void navigator.clipboard.writeText(text)
            onShowNotification(
              copyEmotionTags ? 'Текст фрагмента скопирован с [emotion]!' : 'Чистый текст фрагмента скопирован!',
              'success'
            )
          }} title={copyEmotionTags ? 'Скопировать текст фрагмента с тегами [emotion]' : 'Скопировать чистый текст фрагмента без тегов'} />
          <IconButton icon={FileAudio} accent="primary" onClick={() => onOpenCustomAudioModal?.('fragment', frag.id)} title="Загрузить свое аудио для этого фрагмента (с авто-выравниванием)" />
          <FragmentBrollControl
            brollFilename={frag.bRollFileName}
            onOpenStockModal={() => onOpenBRollModal?.('fragment', frag.id)}
            onAutoMatchAi={() => onAutoMatchBRoll?.('fragment', frag.id)}
            onUploadFile={uploadBRoll}
            onUnlink={() => onUnlinkFragmentBRoll(frag.id)}
          />
          <IconButton icon={Mic} accent={dirtyAudio ? 'warning' : 'primary'} onClick={() => onRunVoiceGenFragment(frag.id)} title={dirtyAudio ? 'Аудио устарело. Нажмите для переозвучки' : 'Переозвучить'} />
          {frag.audioFileName && (
            <IconButton icon={Download} accent="primary" onClick={() => {
              const a = document.createElement('a')
              a.href = `${API}/api/v1/render/media?path=${encodeURIComponent(frag.audioFileName!)}`
              a.download = `Audio_Frag_${frag.id.slice(0,6)}.wav`
              document.body.appendChild(a)
              a.click()
              a.remove()
            }} title="Скачать аудио" />
          )}
          <label className="text-2xs text-on-surface-variant hover:text-primary flex items-center gap-0.5 cursor-pointer" title="Заменить аудио">
            <Upload size={14} />
            <input type="file" className="hidden" accept="audio/*" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const fd = new FormData()
              fd.append('file', file)
              fd.append('project_path', getProjectPath(project))
              fd.append('target_id', frag.id)
              try {
                const { data, error } = await fetchClient.POST('/api/v1/media/upload-audio', { body: fd as never })
                if (error || data === undefined) throw new Error(apiErrorMessage(error))
                if (data.status === 'ok') { onReplaceFragmentAudio(frag.id, data.path ?? ''); onShowNotification('Аудио заменено!', 'success') }
              } catch { onShowNotification('Ошибка загрузки', 'error') }
              e.target.value = ''
            }} />
          </label>
          <IconButton icon={Trash2} accent="error" onClick={() => onDeleteFragment(frag.id)} title="Удалить фрагмент" />
        </div>
      </div>

      <Input
        className="rounded-md px-2 py-1 text-xs text-secondary focus:border-secondary/50 font-mono"
        value={frag.visualNote}
        onChange={e => onFragmentTextChange(frag.id, frag.text, e.target.value)}
        placeholder="*(Визуальная ремарка)*"
      />

      <div className="relative">
        {tagsOpen && (
          <div className="absolute right-0 bottom-full mb-1 z-40">
            <VoiceTagToolbar onInsertTag={insertTag} onToggleCaps={toggleCaps} hasSelection={hasSelection} />
          </div>
        )}
        <TextArea
          ref={textRef}
          className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-md p-2 text-xs text-on-surface resize-none outline-none focus:border-primary/50 custom-scrollbar"
          rows={2}
          value={frag.text}
          onChange={e => onFragmentTextChange(frag.id, e.target.value)}
          onFocus={() => setTagsOpen(true)}
          onBlur={() => window.setTimeout(() => setTagsOpen(false), 150)}
          placeholder="Текст для озвучки..."
        />
      </div>
    </div>
  )
})

interface ContentTabProps {
  project: ProjectSettings
  activeScene?: Scene
  copyEmotionTags: boolean
  onToggleCopyEmotionTags: (val: boolean) => void
  onAddFragment: () => void
  onDeleteFragment: (id: string) => void
  onFragmentTextChange: (id: string, text: string, visualNote?: string) => void
  onFragDragStart: (idx: number) => () => void
  onFragDrop: (idx: number) => () => void
  onOpenCustomAudioModal?: (scope: 'fragment' | 'scene' | 'project', fragId?: string) => void
  onOpenBRollModal?: (scope: 'fragment' | 'scene' | 'project', fragId?: string) => void
  onAutoMatchBRoll?: (scope: 'fragment' | 'scene' | 'project', targetFragId?: string) => void
  onRunVoiceGenFragment: (sceneId: string, fragId: string) => void
  onUpdateFragmentBRoll: (fragId: string, filename: string) => void
  onUnlinkFragmentBRoll: (fragId: string) => void
  onReplaceFragmentAudio: (fragId: string, path: string) => void
  onShowNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
  onNudgeTiming: (fragId: string, type: 'start' | 'end', delta: number) => void
}

export const ContentTab = ({
  project, activeScene, copyEmotionTags, onToggleCopyEmotionTags, onAddFragment, onDeleteFragment,
  onFragmentTextChange, onFragDragStart, onFragDrop, onOpenCustomAudioModal, onOpenBRollModal, onAutoMatchBRoll,
  onRunVoiceGenFragment, onUpdateFragmentBRoll, onUnlinkFragmentBRoll, onReplaceFragmentAudio, onShowNotification, onNudgeTiming,
}: ContentTabProps) => {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex justify-between items-center mb-2 gap-2">
        <span className="font-label text-sm font-semibold text-on-surface flex items-center gap-2 truncate">
          <Logs size={18} className="text-primary"/> Фрагменты сцены
        </span>
        <Button variant="secondary" icon={Plus} onClick={onAddFragment} className="shrink-0 py-1 px-3">Добавить</Button>
      </div>

      {/* Auto B-Roll Card */}
      <div className="flex flex-col gap-2 p-3 bg-surface-container-lowest/50 rounded-xl border border-secondary/20 shadow-inner">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
            <Video size={15} className="text-secondary" /> B-Roll Управление
          </span>
          <Button variant="secondary" onClick={() => onOpenBRollModal?.('scene')} className="text-xs py-1 px-3">
            + Добавить B-Roll
          </Button>
        </div>
        <Button
          variant="dashed"
          onClick={() => onAutoMatchBRoll?.('scene')}
          className="w-full py-1.5 text-xs font-medium border-secondary/30 text-secondary hover:bg-secondary/10"
        >
          <Sparkles size={14} className="mr-1.5" /> Автоподбор через AI (Pexels)
        </Button>
      </div>

      {/* Teleprompter copy block */}
      <div className="flex flex-col gap-2 bg-surface-container-lowest/40 p-2.5 rounded-xl border border-outline-variant/20 shadow-inner">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-xxs font-mono text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
            <Copy size={12} className="text-secondary" /> Режим копирования:
          </span>
          <SegmentedControl
            value={copyEmotionTags ? 'tags' : 'clean'}
            onChange={(v) => onToggleCopyEmotionTags(v === 'tags')}
            options={[
              { value: 'clean', label: 'Чистый текст' },
              { value: 'tags', label: '+ [emotion]', accent: 'secondary' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <Button
            variant="outline"
            icon={Copy}
            className="justify-center"
            onClick={() => {
              if (!activeScene) return
              const text = getSceneTeleprompterScript(activeScene, { keepEmotionTags: copyEmotionTags, keepPauseSoundTags: copyEmotionTags })
              void navigator.clipboard.writeText(text)
              onShowNotification(
                copyEmotionTags ? 'Суфлер сцены скопирован с тегами [emotion]!' : 'Чистый суфлер сцены скопирован!',
                'success'
              )
            }}
          >
            Суфлер сцены
          </Button>
          <Button
            variant="outline"
            icon={Copy}
            className="justify-center"
            onClick={() => {
              const text = getProjectTeleprompterScript(project, { keepEmotionTags: copyEmotionTags, keepPauseSoundTags: copyEmotionTags })
              void navigator.clipboard.writeText(text)
              onShowNotification(
                copyEmotionTags ? 'Суфлер проекта скопирован с тегами [emotion]!' : 'Чистый суфлер проекта скопирован!',
                'success'
              )
            }}
          >
            Суфлер проекта
          </Button>
        </div>
      </div>

      {activeScene?.fragments.map((frag, i) => (
        <FragmentCard
          key={frag.id}
          frag={frag}
          project={project}
          copyEmotionTags={copyEmotionTags}
          onFragDragStart={onFragDragStart(i)}
          onFragDrop={onFragDrop(i)}
          onFragmentTextChange={onFragmentTextChange}
          onNudgeTiming={onNudgeTiming}
          onDeleteFragment={onDeleteFragment}
          onOpenCustomAudioModal={onOpenCustomAudioModal}
          onOpenBRollModal={onOpenBRollModal}
          onAutoMatchBRoll={onAutoMatchBRoll}
          onRunVoiceGenFragment={fragId => onRunVoiceGenFragment(activeScene.id, fragId)}
          onUpdateFragmentBRoll={onUpdateFragmentBRoll}
          onUnlinkFragmentBRoll={onUnlinkFragmentBRoll}
          onReplaceFragmentAudio={onReplaceFragmentAudio}
          onShowNotification={onShowNotification}
        />
      ))}
    </section>
  )
}
