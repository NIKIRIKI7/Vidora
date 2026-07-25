import type { ProjectSettings, Scene } from '@entities/project'
import { Button, Dropdown, DropdownItem, FieldGroup, Icon, Select, Spinner, Switch } from '@shared/ui'
import { generateFragmentPrompt, generateProjectPrompt, generateRemotionPrompt } from '../lib/generateRemotionPrompt'

interface Props {
  project: ProjectSettings
  activeScene: Scene | undefined
  voiceModel: string
  useWhisper: boolean
  autoOffloadVram: boolean
  isGeneratingAudio: boolean
  isSyncing: boolean
  isGeneratingCode: boolean
  isRendering: boolean
  isMerging: boolean
  onChangeVoiceModel: (v: string) => void
  onChangeUseWhisper: (v: boolean) => void
  onChangeAutoOffloadVram: (v: boolean) => void
  onAddFragment: () => void
  onDeleteFragment: (id: string) => void
  onFragmentTextChange: (id: string, text: string, visualNote?: string) => void
  onFragDragStart: (idx: number) => () => void
  onFragDrop: (idx: number) => () => void
  onOpenVoicebox: () => void
  onRunVoiceGen: () => void
  onResetAllSync: () => void
  onResetAudio: () => void
  onUnloadVram: () => void
  onRunSync: () => void
  onToggleIgnoreTsx: (id: string) => void
  onRunCodeGen: () => void
  onRunProjectRender: () => void
  onMergeAudioAndVideo: (target: 'scene' | 'project') => void
  onShowNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export const PipelineInspector = ({
  project,
  activeScene,
  voiceModel,
  useWhisper,
  autoOffloadVram,
  isGeneratingAudio,
  isSyncing,
  isGeneratingCode,
  isRendering,
  isMerging,
  onChangeVoiceModel,
  onChangeUseWhisper,
  onChangeAutoOffloadVram,
  onAddFragment,
  onDeleteFragment,
  onFragmentTextChange,
  onFragDragStart,
  onFragDrop,
  onOpenVoicebox,
  onRunVoiceGen,
  onResetAllSync,
  onResetAudio,
  onUnloadVram,
  onRunSync,
  onToggleIgnoreTsx,
  onRunCodeGen,
  onRunProjectRender,
  onMergeAudioAndVideo,
  onShowNotification,
}: Props) => (
  <aside className="w-[380px] border-l border-white/10 flex flex-col bg-surface-container/60 backdrop-blur-2xl shrink-0">
    <div className="p-4 border-b border-white/5 flex justify-between items-center">
      <h3 className="font-title-md text-title-md text-on-surface">Инспектор Пайплайна</h3>
    </div>

    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">
      {/* Fragments */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="font-label text-xs uppercase tracking-wider text-primary">Сценарий фрагментов</span>
          <button
            className="text-xs text-secondary hover:bg-secondary/10 px-2 py-1 rounded-md transition-all flex items-center gap-1 font-medium active:scale-95"
            onClick={onAddFragment}
          >
            <Icon name="add" className="text-[16px]" />
            <span>Фрагмент</span>
          </button>
        </div>

        {activeScene?.fragments.map((frag, i) => (
          <div
            key={frag.id}
            draggable
            onDragStart={onFragDragStart(i)}
            onDragOver={e => e.preventDefault()}
            onDrop={onFragDrop(i)}
            className="p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl flex flex-col gap-2 relative group"
          >
            <Icon
              name="drag_indicator"
              className="text-[12px] text-on-surface-variant/30 absolute -left-0.5 top-6 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            />
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono text-secondary font-medium">
                Фрагмент {i + 1} ({frag.startTime?.toFixed(1) || '0'}s - {frag.endTime?.toFixed(1) || '0'}s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-0.5"
                  onClick={() => {
                    if (activeScene) {
                      void navigator.clipboard.writeText(generateFragmentPrompt(project, activeScene, frag))
                      onShowNotification(`Промпт фрагмента ${i + 1} скопирован!`, 'success')
                    }
                  }}
                >
                  <Icon name="content_copy" className="text-[12px]" /> Промпт
                </button>
                <button className="text-on-surface-variant hover:text-error" onClick={() => onDeleteFragment(frag.id)}>
                  <Icon name="delete" className="text-[14px]" />
                </button>
              </div>
            </div>

            <input
              className="text-xs bg-transparent border-b border-white/10 text-on-surface-variant focus:border-primary outline-none py-1"
              value={frag.visualNote}
              onChange={e => onFragmentTextChange(frag.id, frag.text, e.target.value)}
              placeholder="Визуальная ремарка..."
            />
            <textarea
              className="text-xs bg-transparent text-on-surface resize-none outline-none"
              rows={2}
              value={frag.text}
              onChange={e => onFragmentTextChange(frag.id, e.target.value)}
            />
          </div>
        ))}
      </section>

      <div className="h-px bg-white/5" />

      {/* Audio Voice Generation */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="font-label text-xs uppercase tracking-wider text-primary">1. Озвучка (OmniVoice)</span>
          <button
            className="text-xs text-secondary hover:bg-secondary/10 px-2 py-1 rounded-md transition-all flex items-center gap-1 font-medium active:scale-95"
            onClick={onOpenVoicebox}
          >
            <Icon name="record_voice_over" className="text-[16px]" />
            <span>Voicebox</span>
          </button>
        </div>

        <FieldGroup label="Голосовая модель">
          <Select value={voiceModel} onChange={e => onChangeVoiceModel(e.target.value)}>
            <option value="aria">Neural - Aria (Женский, Спокойный)</option>
            <option value="marcus">Neural - Marcus (Мужской, Глубокий)</option>
            <option value="nova">Expressive - Nova (Энергичный)</option>
            {project.customVoices?.map(v => (
              <option key={v.id} value={v.id}>
                🎙️ Cloned - {v.name} {v.tags?.length ? `[${v.tags.join(', ')}]` : ''}
              </option>
            ))}
          </Select>
        </FieldGroup>

        <div className="flex gap-2">
          <Button variant="dashed" disabled={isGeneratingAudio} onClick={onRunVoiceGen} className="flex-1">
            {isGeneratingAudio ? <Spinner /> : 'Сгенерировать голос'}
          </Button>
          <button
            className="text-[11px] text-on-surface-variant hover:text-error flex items-center justify-center transition-colors px-2 py-1 rounded hover:bg-white/5 border border-white/10"
            onClick={onResetAudio}
            title="Сбросить все аудио"
          >
            <Icon name="delete" className="text-[16px]" />
          </button>
        </div>
      </section>

      <div className="h-px bg-white/5" />

      {/* Sync */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="font-label text-xs uppercase tracking-wider text-primary">2. Синхронизация (Whisper)</span>
          <div className="flex items-center gap-2">
            {project.scenes.some(s => s.fragments.some(f => f.startTime !== undefined)) && (
              <button
                className="text-[11px] text-on-surface-variant hover:text-error flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-white/5"
                onClick={onResetAllSync}
                title="Сбросить все тайминги"
              >
                <Icon name="restart_alt" className="text-[14px]" /> Сбросить
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl">
          <label className="flex items-center justify-between text-xs text-on-surface-variant cursor-pointer">
            Использовать WhisperX ИИ
            <input
              type="checkbox"
              checked={useWhisper}
              onChange={e => onChangeUseWhisper(e.target.checked)}
              className="accent-primary size-3.5"
            />
          </label>

          <label className="flex items-center justify-between text-xs text-on-surface-variant cursor-pointer">
            Авто-освобождение VRAM
            <input
              type="checkbox"
              checked={autoOffloadVram}
              onChange={e => onChangeAutoOffloadVram(e.target.checked)}
              className="accent-primary size-3.5"
            />
          </label>

          <button
            onClick={onUnloadVram}
            className="text-[11px] text-secondary hover:bg-secondary/10 px-2 py-0.5 rounded transition-all flex items-center gap-1 mt-1 self-start font-medium"
          >
            <Icon name="memory" className="text-[14px]" /> Очистить VRAM вручную
          </button>
        </div>

        <Button variant="dashed" disabled={isSyncing} onClick={onRunSync}>
          {isSyncing ? <Spinner /> : 'Синхронизировать тайминги'}
        </Button>
      </section>

      <div className="h-px bg-white/5" />

      {/* LLM Code Generation */}
      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="font-label text-xs uppercase tracking-wider text-primary">3. Код Remotion (TSX)</span>
          <div className="flex gap-1">
            <button
              className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10"
              onClick={() => {
                if (activeScene) {
                  void navigator.clipboard.writeText(generateRemotionPrompt(project, activeScene))
                  onShowNotification('Промпт сцены с таймкодами скопирован!', 'success')
                }
              }}
            >
              <Icon name="content_copy" className="text-[12px]" /> Сцену
            </button>
            <button
              className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10"
              onClick={() => {
                void navigator.clipboard.writeText(generateProjectPrompt(project))
                onShowNotification('Промпт проекта скопирован!', 'success')
              }}
            >
              <Icon name="content_copy" className="text-[12px]" /> Проект
            </button>
          </div>
        </div>

        {activeScene && (
          <div className="p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl">
            <Switch
              checked={Boolean(activeScene.ignoreTsx)}
              onChange={() => onToggleIgnoreTsx(activeScene.id)}
              label="Игнорировать TSX (черный экран)"
            />
          </div>
        )}

        <Button
          variant="dashed"
          disabled={isGeneratingCode || Boolean(activeScene?.ignoreTsx)}
          onClick={onRunCodeGen}
        >
          {isGeneratingCode ? <Spinner /> : 'Сгенерировать код через Ollama'}
        </Button>
      </section>

      <div className="h-px bg-white/5" />

      {/* Render Output */}
      <section className="flex flex-col gap-3">
        <span className="font-label text-xs uppercase tracking-wider text-primary">4. Сборка и Экспорт</span>
        <Button variant="primary" disabled={isRendering} onClick={onRunProjectRender}>
          {isRendering ? <Spinner /> : '🎬 Собрать весь MP4 проект'}
        </Button>
        <Dropdown
          align="left"
          direction="up"
          containerClassName="w-full"
          className="w-full"
          trigger={
            <div className={isMerging || isRendering ? 'pointer-events-none' : ''}>
              <Button variant="dashed" disabled={isMerging || isRendering} className="w-full">
                {isMerging ? <Spinner /> : '🎵 Объединить аудио и видео ("Запечь")'}
              </Button>
            </div>
          }
        >
          <DropdownItem onClick={() => onMergeAudioAndVideo('scene')}>
            Только текущая сцена
          </DropdownItem>
          <DropdownItem onClick={() => onMergeAudioAndVideo('project')}>
            Весь проект
          </DropdownItem>
        </Dropdown>
      </section>
    </div>
  </aside>
)
