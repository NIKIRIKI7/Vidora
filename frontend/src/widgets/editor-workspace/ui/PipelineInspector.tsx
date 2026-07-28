import { useState } from 'react'
import type { ProjectSettings, Scene } from '@entities/project'
import { Button, FieldGroup, Icon, Select, Spinner, Switch } from '@shared/ui'
import { generateFragmentPrompt, generateProjectPrompt, generateRemotionPrompt } from '@widgets/editor-workspace/lib/generateRemotionPrompt'
import { getProjectPath, API, isAudioDirty, isCodeDirty } from '@widgets/editor-workspace/lib/helpers'

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
  onChangeVoiceModel: (v: string) => void
  onChangeUseWhisper: (v: boolean) => void
  onChangeAutoOffloadVram: (v: boolean) => void
  onAddFragment: () => void
  onDeleteFragment: (id: string) => void
  onFragmentTextChange: (id: string, text: string, visualNote?: string) => void
  onFragDragStart: (idx: number) => () => void
  onFragDrop: (idx: number) => () => void
  onOpenVoicebox: () => void
  onOpenAiSettings: () => void
  onRunVoiceGen: () => void
  onRunVoiceGenFragment: (sceneId: string, fragId: string) => void
  onResetAllSync: () => void
  onResetAudio: () => void
  onProcessAudio: (action: string, scope: 'scene' | 'project') => void
  onProcessAdvancedSilence?: (scope: 'scene' | 'project') => void
  onUnloadVram: () => void
  onRunSync: () => void
  onToggleIgnoreTsx: (id: string) => void
  onRunCodeGen: () => void
  onRunProjectRender: () => void
  onShowNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
  onUpdateFragmentBRoll: (fragId: string, filename: string) => void
  onUnlinkFragmentBRoll: (fragId: string) => void
  onNudgeTiming: (fragId: string, type: 'start' | 'end', delta: number) => void
}

export const PipelineInspector = ({
  project, activeScene, voiceModel, useWhisper, autoOffloadVram, isGeneratingAudio, isSyncing, isGeneratingCode, isRendering,
  onChangeVoiceModel, onChangeUseWhisper, onChangeAutoOffloadVram, onAddFragment, onDeleteFragment, onFragmentTextChange,
  onFragDragStart, onFragDrop, onOpenVoicebox, onOpenAiSettings, onRunVoiceGen, onRunVoiceGenFragment, onResetAllSync,
  onResetAudio, onProcessAudio, onProcessAdvancedSilence, onUnloadVram, onRunSync, onToggleIgnoreTsx, onRunCodeGen, onRunProjectRender, onShowNotification,
  onUpdateFragmentBRoll, onUnlinkFragmentBRoll, onNudgeTiming,
}: Props) => {
  const [processScope, setProcessScope] = useState<'scene' | 'project'>('project')

  const anyAudioDirty = activeScene?.fragments.some(isAudioDirty) ?? false
  const codeDirty = activeScene ? isCodeDirty(project, activeScene) : false

  return (
    <aside className="w-[380px] border-l border-white/10 flex flex-col bg-surface-container/60 backdrop-blur-2xl shrink-0">
      <div className="p-4 border-b border-white/5 flex justify-between items-center">
        <h3 className="font-title-md text-title-md text-on-surface">Инспектор Пайплайна</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">

        {/* 0. Сценарий */}
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="font-label text-xs uppercase tracking-wider text-primary">Сценарий фрагментов</span>
            <button className="text-xs text-secondary hover:bg-secondary/10 px-2 py-1 rounded-md transition-all flex items-center gap-1 font-medium active:scale-95" onClick={onAddFragment}>
              <Icon name="add" className="text-[16px]" /> Фрагмент
            </button>
          </div>

          {activeScene?.fragments.map((frag, i) => {
            const dirtyAudio = isAudioDirty(frag)

            return (
              <div key={frag.id} draggable onDragStart={onFragDragStart(i)} onDragOver={e => e.preventDefault()} onDrop={async (e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (!file || (!file.type.startsWith('video/') && !file.type.startsWith('image/'))) { onFragDrop(i)(); return; }
                onShowNotification('Загрузка футажа...', 'info');
                const fd = new FormData(); fd.append('file', file); fd.append('project_path', getProjectPath(project));
                try {
                  const res = await fetch(`${API}/api/v1/media/upload`, { method: 'POST', body: fd });
                  const data = await res.json();
                  if(res.ok) { onUpdateFragmentBRoll(frag.id, data.filename); onShowNotification('B-Roll привязан!', 'success'); }
                } catch { onShowNotification('Ошибка загрузки медиа', 'error'); }
              }} className={`p-3 bg-surface-container-lowest/40 border transition-colors rounded-xl flex flex-col gap-2 relative group ${dirtyAudio ? 'border-warning/30 hover:border-warning' : 'border-white/5 hover:border-secondary/30'}`}>
                <Icon name="drag_indicator" className="text-[12px] text-on-surface-variant/30 absolute -left-0.5 top-6 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <button onClick={() => onNudgeTiming(frag.id, 'start', -0.1)} className="text-on-surface-variant hover:text-primary"><Icon name="remove" className="text-[12px]"/></button>
                    <span className="text-[10px] font-mono text-secondary font-medium">{frag.startTime?.toFixed(1) || '0'}s - {frag.endTime?.toFixed(1) || '0'}s</span>
                    <button onClick={() => onNudgeTiming(frag.id, 'end', 0.1)} className="text-on-surface-variant hover:text-primary"><Icon name="add" className="text-[12px]"/></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className={`text-[11px] flex items-center gap-0.5 ${dirtyAudio ? 'text-warning hover:text-warning/80' : 'text-on-surface-variant hover:text-primary'}`} onClick={() => onRunVoiceGenFragment(activeScene.id, frag.id)} title={dirtyAudio ? 'Аудио устарело. Нажмите для переозвучки' : 'Переозвучить'}>
                      <Icon name="mic" className="text-[14px]" />
                    </button>
                    <button className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-0.5" onClick={() => { if (activeScene) { void navigator.clipboard.writeText(generateFragmentPrompt(project, activeScene, frag)); onShowNotification(`Промпт скопирован!`, 'success') } }}>
                      <Icon name="content_copy" className="text-[12px]" /> Промпт
                    </button>
                    <button className="text-on-surface-variant hover:text-error" onClick={() => onDeleteFragment(frag.id)}><Icon name="delete" className="text-[14px]" /></button>
                  </div>
                </div>

                {frag.bRollFileName && (
                  <button onClick={() => onUnlinkFragmentBRoll(frag.id)} className="text-[10px] bg-secondary/10 text-secondary border border-secondary/20 hover:border-error hover:bg-error/10 hover:text-error px-2 py-0.5 rounded-full inline-flex self-start gap-1 items-center transition-colors group/broll" title="Отвязать футаж">
                    <Icon name="movie" className="text-[12px] group-hover/broll:hidden" /><Icon name="close" className="text-[12px] hidden group-hover/broll:block" /><span className="group-hover/broll:line-through">{frag.bRollFileName.split('/').pop()}</span>
                  </button>
                )}

                <input className="text-xs bg-transparent border-b border-white/10 text-on-surface-variant focus:border-primary outline-none py-1" value={frag.visualNote} onChange={e => onFragmentTextChange(frag.id, frag.text, e.target.value)} placeholder="Визуальная ремарка..." />
                <textarea className="text-xs bg-transparent text-on-surface resize-none outline-none custom-scrollbar" rows={2} value={frag.text} onChange={e => onFragmentTextChange(frag.id, e.target.value)} />
              </div>
            )
          })}
        </section>

        <div className="h-px bg-white/5" />

        {/* 1. Озвучка */}
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="font-label text-xs uppercase tracking-wider text-primary">1. Озвучка (OmniVoice)</span>
            <div className="flex items-center gap-1">
              <button className="text-[11px] text-on-surface-variant hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1 bg-white/5 border border-white/10" onClick={onOpenAiSettings}><Icon name="tune" className="text-[14px]" /> Параметры</button>
              <button className="text-xs text-secondary hover:bg-secondary/10 px-2 py-1 rounded-md transition-all flex items-center gap-1 font-medium active:scale-95" onClick={onOpenVoicebox}><Icon name="record_voice_over" className="text-[16px]" /> Voicebox</button>
            </div>
          </div>

          <FieldGroup label="Голосовая модель">
            <div className="flex items-center gap-2">
              <button onClick={() => { const isCustom = project.customVoices?.find(v => v.id === voiceModel); const url = isCustom ? `${API}/api/v1/render/media?path=${encodeURIComponent(isCustom.refAudioPath)}` : `/samples/${voiceModel}.wav`; new Audio(url).play().catch(() => onShowNotification('Сэмпл не найден', 'error')) }} className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-on-surface-variant hover:text-white"><Icon name="play_arrow" className="text-[16px]" /></button>
          {project.activeGlobalVoiceId ? (
            <div className="flex-1 bg-primary/10 border border-primary/30 rounded-lg py-2 px-3 text-sm text-primary flex justify-between items-center shadow-inner">
              <span className="truncate pr-2">🌐 {project.globalVoices?.find(v => v.id === project.activeGlobalVoiceId)?.name}</span>
              <button className="text-primary hover:text-white" title="Игнорируется, так как активен глобальный голос"><Icon name="lock" className="text-sm" /></button>
            </div>
          ) : (
            <Select value={voiceModel} onChange={e => onChangeVoiceModel(e.target.value)} className="flex-1">
              <option value="aria">Neural - Aria (Женский)</option>
              <option value="marcus">Neural - Marcus (Мужской)</option>
              <option value="nova">Expressive - Nova (Энергичный)</option>
              {project.customVoices?.map(v => <option key={v.id} value={v.id}>🎙️ Cloned - {v.name}</option>)}
            </Select>
          )}
            </div>
          </FieldGroup>

          <div className="flex gap-2">
            <Button variant="dashed" disabled={isGeneratingAudio} onClick={onRunVoiceGen} className={`flex-1 ${anyAudioDirty ? 'border-warning/50 text-warning hover:bg-warning/10 hover:border-warning' : ''}`}>
              {isGeneratingAudio ? <Spinner /> : anyAudioDirty ? 'Обновить голос (⚠️)' : 'Сгенерировать голос'}
            </Button>
            <button className="text-[11px] text-on-surface-variant hover:text-error flex items-center justify-center transition-colors px-2 py-1 rounded hover:bg-white/5 border border-white/10" onClick={onResetAudio} title="Сбросить все аудио"><Icon name="delete" className="text-[16px]" /></button>
          </div>

          <div className="flex flex-col gap-2 mt-2 border-t border-white/5 pt-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-on-surface-variant uppercase">Постобработка аудио</span>
              <div className="flex bg-surface-container-lowest border border-white/5 rounded-md p-0.5">
                <button className={`text-[10px] px-2 py-1 rounded transition-colors ${processScope === 'scene' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`} onClick={() => setProcessScope('scene')}>Сцена</button>
                <button className={`text-[10px] px-2 py-1 rounded transition-colors ${processScope === 'project' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`} onClick={() => setProcessScope('project')}>Проект</button>
              </div>
            </div>
            <Button variant="dashed" onClick={() => onProcessAudio('mastering', processScope)} disabled={isGeneratingAudio} className="text-xs border-white/10 hover:border-secondary/50 hover:bg-secondary/10 hover:text-secondary">🎙️ Мастеринг (EQ + Normalize)</Button>
            <Button variant="dashed" onClick={() => onProcessAdvancedSilence?.(processScope)} disabled={isGeneratingAudio} className="text-xs border-white/10 hover:border-accent/50 hover:bg-accent/10 hover:text-accent">✂️ Умная обрезка пауз (Pydub)</Button>
          </div>
        </section>

        <div className="h-px bg-white/5" />

        {/* 2. Синхронизация */}
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="font-label text-xs uppercase tracking-wider text-primary">2. Синхронизация (Whisper)</span>
            <div className="flex items-center gap-2">
              {project.scenes.some(s => s.fragments.some(f => f.startTime !== undefined)) && (
                <button className="text-[11px] text-on-surface-variant hover:text-error flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-white/5" onClick={onResetAllSync}><Icon name="restart_alt" className="text-[14px]" /> Сбросить</button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl">
            <label className="flex items-center justify-between text-xs text-on-surface-variant cursor-pointer">WhisperX ИИ <input type="checkbox" checked={useWhisper} onChange={e => onChangeUseWhisper(e.target.checked)} className="accent-primary size-3.5" /></label>
            <label className="flex items-center justify-between text-xs text-on-surface-variant cursor-pointer">Авто-освобождение VRAM <input type="checkbox" checked={autoOffloadVram} onChange={e => onChangeAutoOffloadVram(e.target.checked)} className="accent-primary size-3.5" /></label>
            <button onClick={onUnloadVram} className="text-[11px] text-secondary hover:bg-secondary/10 px-2 py-0.5 rounded transition-all flex items-center gap-1 mt-1 self-start font-medium"><Icon name="memory" className="text-[14px]" /> Очистить VRAM вручную</button>
          </div>

          <Button variant="dashed" disabled={isSyncing} onClick={onRunSync}>{isSyncing ? <Spinner /> : 'Синхронизировать тайминги'}</Button>
        </section>

        <div className="h-px bg-white/5" />

        {/* 3. Код Remotion */}
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="font-label text-xs uppercase tracking-wider text-primary">3. Код Remotion (TSX)</span>
            <div className="flex gap-1">
              <button className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10" onClick={() => { if (activeScene) { void navigator.clipboard.writeText(generateRemotionPrompt(project, activeScene)); onShowNotification('Промпт сцены с таймкодами скопирован!', 'success') } }}><Icon name="content_copy" className="text-[12px]" /> Сцену</button>
              <button className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10" onClick={() => { void navigator.clipboard.writeText(generateProjectPrompt(project)); onShowNotification('Промпт проекта скопирован!', 'success') }}><Icon name="content_copy" className="text-[12px]" /> Проект</button>
            </div>
          </div>

          {activeScene && (
            <div className="p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl">
              <Switch checked={Boolean(activeScene.ignoreTsx)} onChange={() => onToggleIgnoreTsx(activeScene.id)} label="Игнорировать TSX (черный экран)" />
            </div>
          )}

          <Button variant="dashed" disabled={isGeneratingCode || Boolean(activeScene?.ignoreTsx)} onClick={onRunCodeGen} className={codeDirty ? 'border-warning/50 text-warning hover:bg-warning/10 hover:border-warning' : ''}>
            {isGeneratingCode ? <Spinner /> : codeDirty ? 'Обновить код TSX (⚠️)' : 'Сгенерировать код через Ollama'}
          </Button>
        </section>

        <div className="h-px bg-white/5" />

        {/* 4. Сборка и Экспорт */}
        <section className="flex flex-col gap-3">
          <span className="font-label text-xs uppercase tracking-wider text-primary">4. Сборка и Экспорт</span>
          <Button variant="primary" disabled={isRendering} onClick={onRunProjectRender}>
            {isRendering ? <Spinner /> : '🎬 Собрать весь MP4 проект'}
          </Button>
        </section>

      </div>
    </aside>
  )
}
