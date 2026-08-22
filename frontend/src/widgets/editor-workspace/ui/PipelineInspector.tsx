import { useState, useEffect, useRef, type DragEvent } from 'react'
import type { ProjectSettings, Scene, SceneFragment } from '@entities/project'
import { useSettingsStore } from '@entities/project'
import { Button, FieldGroup, Select, Spinner, Switch, VoiceTagToolbar, useVoiceTagInserter } from '@shared/ui'
import { Logs, Plus, GripVertical, Minus, Mic, Download, Upload, Trash2, SlidersHorizontal, MicVocal, Play, AlignStartVertical, RotateCcw, Cpu, AudioLines, Code, Copy, Film, FileOutput, FileAudio, Sparkles, Video, Volume2 } from 'lucide-react'
import { DEFAULT_BACKGROUND_MUSIC } from '@shared/config'
import { generateProjectPrompt, generateRemotionPrompt } from '@widgets/editor-workspace/lib/generateRemotionPrompt'
import { getProjectPath, API, isAudioDirty, isCodeDirty, extractCleanVoiceText, getSceneTeleprompterScript, getProjectTeleprompterScript } from '@widgets/editor-workspace/lib/helpers'

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
  onAutoMatchBRoll?: (scope: 'fragment' | 'scene' | 'project', targetFragId?: string) => void
  onRunVoiceGenFragment: (fragId: string) => void
  onUpdateFragmentBRoll: (fragId: string, filename: string) => void
  onUnlinkFragmentBRoll: (fragId: string) => void
  onReplaceFragmentAudio: (fragId: string, path: string) => void
  onShowNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
}

const FragmentCard = ({
  frag, project, copyEmotionTags, onFragDragStart, onFragmentTextChange, onNudgeTiming, onDeleteFragment,
  onFragDrop, onOpenCustomAudioModal, onAutoMatchBRoll, onRunVoiceGenFragment, onUpdateFragmentBRoll,
  onUnlinkFragmentBRoll, onReplaceFragmentAudio, onShowNotification
}: FragmentCardProps) => {
  const dirtyAudio = isAudioDirty(frag)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const { insertTag, toggleCaps, hasSelection } = useVoiceTagInserter(textRef)

  return (
    <div draggable onDragStart={onFragDragStart} onDragOver={e => e.preventDefault()} onDrop={async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || (!file.type.startsWith('video/') && !file.type.startsWith('image/'))) { onFragDrop(); return; }
      onShowNotification('Загрузка футажа...', 'info');
      const fd = new FormData(); fd.append('file', file); fd.append('project_path', getProjectPath(project));
      try {
        const res = await fetch(`${API}/api/v1/media/upload`, { method: 'POST', body: fd });
        const data = await res.json();
        if (res.ok) { onUpdateFragmentBRoll(frag.id, data.filename); onShowNotification('B-Roll привязан!', 'success'); }
      } catch { onShowNotification('Ошибка загрузки медиа', 'error'); }
    }} className={`p-3 bg-surface-container-lowest/40 border transition-colors rounded-xl flex flex-col gap-2 relative group ${dirtyAudio ? 'border-warning/30 hover:border-warning' : 'border-white/5 hover:border-secondary/30'}`}>
      <GripVertical size={12} className="text-on-surface-variant/30 absolute -left-0.5 top-6 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => onNudgeTiming(frag.id, 'start', -0.1)} className="text-on-surface-variant hover:text-primary"><Minus size={12}/></button>
          <span className="text-[10px] font-mono text-secondary font-medium">{frag.startTime?.toFixed(1) || '0'}s - {frag.endTime?.toFixed(1) || '0'}s</span>
          <button onClick={() => onNudgeTiming(frag.id, 'end', 0.1)} className="text-on-surface-variant hover:text-primary"><Plus size={12}/></button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button className="text-[11px] text-on-surface-variant hover:text-primary p-1 rounded hover:bg-white/5 transition-colors flex items-center" onClick={() => {
            const text = extractCleanVoiceText(frag.text, { keepEmotionTags: copyEmotionTags, keepPauseSoundTags: copyEmotionTags })
            navigator.clipboard.writeText(text)
            onShowNotification(
              copyEmotionTags ? 'Текст фрагмента скопирован с [emotion]!' : 'Чистый текст фрагмента скопирован!',
              'success'
            )
          }} title={copyEmotionTags ? 'Скопировать текст фрагмента с тегами [emotion]' : 'Скопировать чистый текст фрагмента без тегов'}>
            <Copy size={13} />
          </button>

          <button className="text-[11px] text-on-surface-variant hover:text-primary p-1 rounded hover:bg-white/5 transition-colors flex items-center" onClick={() => onOpenCustomAudioModal?.('fragment', frag.id)} title="Загрузить свое аудио для этого фрагмента (с авто-выравниванием)">
            <FileAudio size={13} />
          </button>

          <button className="text-[11px] text-on-surface-variant hover:text-secondary p-1 rounded hover:bg-white/5 transition-colors flex items-center" onClick={() => onAutoMatchBRoll?.('fragment', frag.id)} title="Подобрать и обрезать B-Roll для этого фрагмента через ИИ">
            <Sparkles size={13} />
          </button>

          <button className={`text-[11px] flex items-center gap-0.5 ${dirtyAudio ? 'text-warning hover:text-warning/80' : 'text-on-surface-variant hover:text-primary'}`} onClick={() => onRunVoiceGenFragment(frag.id)} title={dirtyAudio ? 'Аудио устарело. Нажмите для переозвучки' : 'Переозвучить'}>
            <Mic size={14} />
          </button>

          {frag.audioFileName && (
            <button className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-0.5" onClick={() => {
              const a = document.createElement('a');
              a.href = `${API}/api/v1/render/media?path=${encodeURIComponent(frag.audioFileName!)}`;
              a.download = `Audio_Frag_${frag.id.slice(0,6)}.wav`;
              document.body.appendChild(a);
              a.click();
              a.remove();
            }} title="Скачать аудио">
              <Download size={14} />
            </button>
          )}

          <label className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-0.5 cursor-pointer" title="Заменить аудио фрагмента">
            <Upload size={14} />
            <input type="file" className="hidden" accept="audio/*" onChange={async (e) => {
               const file = e.target.files?.[0];
               if (!file) return;
               onShowNotification('Загрузка аудио...', 'info');
               const fd = new FormData();
               fd.append('file', file);
               fd.append('project_path', getProjectPath(project));
               fd.append('target_id', frag.id);
               try {
                 const res = await fetch(`${API}/api/v1/media/upload-audio`, { method: 'POST', body: fd });
                 const data = await res.json();
                 if (res.ok) {
                   onReplaceFragmentAudio(frag.id, data.path);
                   onShowNotification('Аудио фрагмента заменено!', 'success');
                 }
               } catch {
                 onShowNotification('Ошибка загрузки аудио', 'error');
               }
               e.target.value = '';
            }} />
          </label>

          <button className="text-[11px] text-on-surface-variant hover:text-error transition-colors flex items-center gap-0.5" onClick={() => onDeleteFragment(frag.id)} title="Удалить фрагмент">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 relative">
        <textarea className="w-full bg-surface-container-lowest/50 border border-white/5 rounded-lg p-2 text-xs text-on-surface-variant/80 font-mono resize-y focus:outline-none focus:border-primary/30 transition-all custom-scrollbar placeholder:text-on-surface-variant/30" rows={1} placeholder="Визуальная ремарка..." value={frag.visualNote || ''} onChange={e => onFragmentTextChange(frag.id, frag.text, e.target.value)} spellCheck={false} />

        <VoiceTagToolbar
          onInsertTag={insertTag}
          onToggleCaps={toggleCaps}
          hasSelection={hasSelection}
          className="self-start"
        />

        <textarea ref={textRef} className={`w-full bg-surface-container-lowest border border-white/10 rounded-lg p-2.5 text-sm text-on-surface resize-y focus:outline-none focus:border-primary/50 transition-all custom-scrollbar ${dirtyAudio ? 'border-warning/30 bg-warning/5' : ''}`} rows={2} placeholder="Текст для озвучки..." value={frag.text} onChange={e => onFragmentTextChange(frag.id, e.target.value)} spellCheck={false} />

        {frag.bRollFileName && (
          <div className="flex items-center justify-between text-[11px] bg-secondary/10 border border-secondary/30 text-secondary px-2 py-1 rounded-md font-mono">
            <span className="truncate flex-1">🎬 {frag.bRollFileName}</span>
            <button onClick={() => onUnlinkFragmentBRoll(frag.id)} className="text-error hover:text-error/80 ml-2" title="Отвязать B-Roll">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

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
  renderProgress: number
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
  onOpenCustomAudioModal?: (scope: 'fragment' | 'scene' | 'project', fragId?: string) => void
  onAutoMatchBRoll?: (scope: 'fragment' | 'scene' | 'project', targetFragId?: string) => void
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
  onRunRender: () => void
  onExportProject: () => void
  onShowNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
  onUpdateFragmentBRoll: (fragId: string, filename: string) => void
  onUnlinkFragmentBRoll: (fragId: string) => void
  onNudgeTiming: (fragId: string, type: 'start' | 'end', delta: number) => void
  onReplaceFragmentAudio: (fragId: string, path: string) => void
  onUpdateActiveGlobalVoice: (id: string | undefined) => void
  onUpdateProjectSettings: (project: ProjectSettings) => void
  onOpenMusicSettings?: () => void
  onOpenMusicLibrary?: () => void
}

type TabKey = 'content' | 'audio' | 'visual' | 'export';

export const PipelineInspector = ({
  project, activeScene, voiceModel, useWhisper, autoOffloadVram, isGeneratingAudio, isSyncing, isGeneratingCode, isRendering, renderProgress,
  onChangeVoiceModel, onChangeUseWhisper, onChangeAutoOffloadVram, onAddFragment, onDeleteFragment, onFragmentTextChange,
  onFragDragStart, onFragDrop, onOpenVoicebox, onOpenAiSettings, onOpenCustomAudioModal, onAutoMatchBRoll, onRunVoiceGen, onRunVoiceGenFragment, onResetAllSync,
  onResetAudio, onProcessAudio, onProcessAdvancedSilence, onUnloadVram, onRunSync, onToggleIgnoreTsx, onRunCodeGen, onRunProjectRender, onRunRender, onExportProject, onShowNotification,
  onUpdateFragmentBRoll, onUnlinkFragmentBRoll, onNudgeTiming, onReplaceFragmentAudio, onUpdateActiveGlobalVoice, onUpdateProjectSettings,
  onOpenMusicSettings, onOpenMusicLibrary
}: Props) => {
  const { globalVoices } = useSettingsStore()
  const [processScope, setProcessScope] = useState<'scene' | 'project'>('project')

  // Сохраняем состояние активной вкладки
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    return (localStorage.getItem('vidora:inspector-tab') as TabKey) || 'content';
  })

  useEffect(() => {
    localStorage.setItem('vidora:inspector-tab', activeTab)
  }, [activeTab])

  const [copyEmotionTags, setCopyEmotionTags] = useState<boolean>(() => {
    return localStorage.getItem('vidora:copy-emotion-tags') === 'true'
  })

  const toggleCopyEmotionTags = (val: boolean) => {
    setCopyEmotionTags(val)
    localStorage.setItem('vidora:copy-emotion-tags', val.toString())
  }

  const anyAudioDirty = activeScene?.fragments.some(isAudioDirty) ?? false
  const codeDirty = activeScene ? isCodeDirty(project, activeScene) : false

  return (
    <aside className="w-full h-full border-l border-white/10 flex flex-col bg-surface-container/60 backdrop-blur-2xl shrink-0">
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-surface-container-lowest/30">
        <h3 className="font-title-md text-title-md text-on-surface">Инспектор Пайплайна</h3>
      </div>

      {/* Навигация вкладок */}
      <div className="flex border-b border-white/10 bg-surface-container-lowest/50 shrink-0">
        <button
          onClick={() => setActiveTab('content')}
          className={`flex-1 py-2.5 px-1 text-center text-[10px] uppercase tracking-wide font-semibold transition-colors border-b-2 truncate ${activeTab === 'content' ? 'border-primary text-primary bg-primary/10' : 'border-transparent text-on-surface-variant hover:text-white hover:bg-white/5'}`}
        >
          Контент
        </button>
        <button
          onClick={() => setActiveTab('audio')}
          className={`flex-1 py-2.5 px-1 text-center text-[10px] uppercase tracking-wide font-semibold transition-colors border-b-2 truncate ${activeTab === 'audio' ? 'border-primary text-primary bg-primary/10' : 'border-transparent text-on-surface-variant hover:text-white hover:bg-white/5'}`}
        >
          Аудио
        </button>
        <button
          onClick={() => setActiveTab('visual')}
          className={`flex-1 py-2.5 px-1 text-center text-[10px] uppercase tracking-wide font-semibold transition-colors border-b-2 truncate ${activeTab === 'visual' ? 'border-primary text-primary bg-primary/10' : 'border-transparent text-on-surface-variant hover:text-white hover:bg-white/5'}`}
        >
          Визуал
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`flex-1 py-2.5 px-1 text-center text-[10px] uppercase tracking-wide font-semibold transition-colors border-b-2 truncate ${activeTab === 'export' ? 'border-primary text-primary bg-primary/10' : 'border-transparent text-on-surface-variant hover:text-white hover:bg-white/5'}`}
        >
          Экспорт
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">

        {/* =========================================================
            ВКЛАДКА 1: КОНТЕНТ (ФРАГМЕНТЫ)
        ========================================================= */}
        {activeTab === 'content' && (
          <section className="flex flex-col gap-3">
            <div className="flex justify-between items-center mb-2 gap-2">
              <span className="font-label text-sm font-semibold text-on-surface flex items-center gap-2 truncate">
                <Logs size={18} className="text-primary"/> Фрагменты сцены
              </span>
              <button className="text-[11px] text-primary bg-primary/10 border border-primary/30 hover:bg-primary/20 px-2 py-1 rounded transition-all flex items-center gap-1 font-medium active:scale-95 shrink-0" onClick={onAddFragment}>
                <Plus size={14} /> Добавить
              </button>
            </div>

            {/* Карточка переключателя Auto B-Roll */}
            <div className="flex flex-col gap-2 p-3 bg-surface-container-lowest/50 rounded-xl border border-secondary/20 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Video size={15} className="text-secondary" /> Auto B-Roll Matcher
                </span>
                <Switch
                  checked={project.autoBRollEnabled !== false}
                  onChange={val => onUpdateProjectSettings({ ...project, autoBRollEnabled: val })}
                />
              </div>
              {project.autoBRollEnabled !== false && (
                <Button
                  variant="secondary"
                  onClick={() => onAutoMatchBRoll?.('scene')}
                  className="w-full py-1.5 text-xs font-medium mt-1"
                  title="ИИ найдет видео на Pexels и нарежет их точно под тайминги фрагментов этой сцены"
                >
                  <Sparkles size={14} className="mr-1.5" /> Подобрать B-Roll для сцены
                </Button>
              )}
            </div>

            {/* Блок копирования суфлера с переключателем [emotion] */}
            <div className="flex flex-col gap-2 bg-surface-container-lowest/40 p-2.5 rounded-xl border border-white/5 shadow-inner">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                  <Copy size={12} className="text-secondary" /> Режим копирования:
                </span>
                <div className="flex bg-surface-container-lowest border border-white/10 rounded-lg p-0.5">
                  <button
                    onClick={() => toggleCopyEmotionTags(false)}
                    className={`text-[10px] px-2 py-0.5 rounded transition-all font-medium ${!copyEmotionTags ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-white'}`}
                    title="Копировать чистый текст без тегов и ремарок"
                  >
                    Чистый текст
                  </button>
                  <button
                    onClick={() => toggleCopyEmotionTags(true)}
                    className={`text-[10px] px-2 py-0.5 rounded transition-all font-medium ${copyEmotionTags ? 'bg-secondary/20 text-secondary border border-secondary/30' : 'text-on-surface-variant hover:text-white'}`}
                    title="Сохранять теги [emotion: ...] и паузы <#1.0#>, но без [instruct]"
                  >
                    + [emotion]
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => {
                    if (!activeScene) return
                    const text = getSceneTeleprompterScript(activeScene, { keepEmotionTags: copyEmotionTags, keepPauseSoundTags: copyEmotionTags })
                    navigator.clipboard.writeText(text)
                    onShowNotification(
                      copyEmotionTags ? 'Суфлер сцены скопирован с тегами [emotion]!' : 'Чистый суфлер сцены скопирован!',
                      'success'
                    )
                  }}
                  className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-[11px] text-on-surface hover:text-primary transition-all flex items-center justify-center gap-1 font-medium"
                  title="Скопировать суфлер для текущей сцены"
                >
                  <Copy size={13} /> Суфлер сцены
                </button>
                <button
                  onClick={() => {
                    const text = getProjectTeleprompterScript(project, { keepEmotionTags: copyEmotionTags, keepPauseSoundTags: copyEmotionTags })
                    navigator.clipboard.writeText(text)
                    onShowNotification(
                      copyEmotionTags ? 'Суфлер проекта скопирован с тегами [emotion]!' : 'Чистый суфлер проекта скопирован!',
                      'success'
                    )
                  }}
                  className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-[11px] text-on-surface hover:text-primary transition-all flex items-center justify-center gap-1 font-medium"
                  title="Скопировать суфлер для всего проекта целиком"
                >
                  <Copy size={13} /> Суфлер проекта
                </button>
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
                onAutoMatchBRoll={onAutoMatchBRoll}
                onRunVoiceGenFragment={fragId => onRunVoiceGenFragment(activeScene.id, fragId)}
                onUpdateFragmentBRoll={onUpdateFragmentBRoll}
                onUnlinkFragmentBRoll={onUnlinkFragmentBRoll}
                onReplaceFragmentAudio={onReplaceFragmentAudio}
                onShowNotification={onShowNotification}
              />
            ))}
          </section>
        )}

        {/* =========================================================
            ВКЛАДКА 2: АУДИО (Генерация, Синхронизация, Мастеринг)
        ========================================================= */}
        {activeTab === 'audio' && (
          <>
            {/* Секция 1: Озвучка */}
            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center bg-primary/10 p-2 rounded-lg border border-primary/20 gap-2">
                <span className="font-label text-xs uppercase tracking-wide text-primary flex items-center gap-1.5 truncate"><Mic size={16}/> Озвучка (TTS)</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button className="text-[11px] text-primary hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1 bg-primary/20 border border-primary/30" onClick={onOpenAiSettings} title="Настройки TTS"><SlidersHorizontal size={14} /></button>
                  <button className="text-[11px] text-secondary hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1 bg-secondary/20 border border-secondary/30" onClick={onOpenVoicebox} title="Voicebox (Клонирование)"><MicVocal size={14} /></button>
                </div>
              </div>

              <Button variant="secondary" onClick={() => onOpenCustomAudioModal?.('scene')} className="w-full py-2 text-xs font-semibold">
                <Upload size={14} className="mr-2" /> Загрузить свое аудио (Файл / Озвучка)
              </Button>

              <FieldGroup label="Голосовая модель">
                <div className="flex items-center gap-2">
                  <button onClick={() => { const isCustom = project.customVoices?.find(v => v.id === voiceModel) || globalVoices.find(v => v.id === project.activeGlobalVoiceId); const url = isCustom?.refAudioPath ? `${API}/api/v1/render/media?path=${encodeURIComponent(isCustom.refAudioPath)}` : `/samples/${voiceModel}.wav`; new Audio(url).play().catch(() => onShowNotification('Сэмпл не найден', 'error')) }} className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-on-surface-variant hover:text-white shrink-0"><Play size={16} /></button>
                  <Select
                    value={project.activeGlobalVoiceId ? `global_${project.activeGlobalVoiceId}` : voiceModel}
                    onChange={e => {
                      const val = e.target.value;
                      if (val.startsWith('global_')) {
                        onUpdateActiveGlobalVoice(val.replace('global_', ''));
                      } else {
                        onUpdateActiveGlobalVoice(undefined);
                        onChangeVoiceModel(val);
                      }
                    }}
                    className="flex-1 min-w-0 font-medium"
                  >
                    <optgroup label="Базовые голоса (OmniVoice)">
                      <option value="aria">Neural - Aria (Женский)</option>
                      <option value="marcus">Neural - Marcus (Мужской)</option>
                      <option value="nova">Expressive - Nova (Энергичный)</option>
                      <option value="Russian_ReliableMan">MiniMax - Russian Reliable</option>
                    </optgroup>
                    {globalVoices.length > 0 && (
                      <optgroup label="Глобальные голоса (Audio Hub)">
                        {globalVoices.map(v => <option key={`global_${v.id}`} value={`global_${v.id}`}>🌐 {v.name}</option>)}
                      </optgroup>
                    )}
                    {project.customVoices && project.customVoices.length > 0 && (
                      <optgroup label="Локальные клоны проекта">
                        {project.customVoices.map(v => <option key={v.id} value={v.id}>🎙️ Cloned - {v.name}</option>)}
                      </optgroup>
                    )}
                  </Select>
                </div>
              </FieldGroup>

              <div className="flex flex-wrap gap-2">
                <Button variant="dashed" disabled={isGeneratingAudio} onClick={onRunVoiceGen} className={`flex-1 min-w-[140px] ${anyAudioDirty ? 'border-warning/50 text-warning hover:bg-warning/10 hover:border-warning' : ''}`}>
                  {isGeneratingAudio ? <Spinner /> : anyAudioDirty ? 'Обновить голос (⚠️)' : 'Сгенерировать голос'}
                </Button>
                <div className="flex gap-1 shrink-0">
                <button className="text-[11px] text-on-surface-variant hover:text-primary flex items-center justify-center transition-colors w-9 h-9 rounded hover:bg-white/5 border border-white/10" onClick={async () => {
                  const paths = project.scenes.flatMap(s => s.fragments.map(f => f.audioFileName)).filter(Boolean) as string[];
                  if (paths.length === 0) { onShowNotification('Нет аудио', 'error'); return; }
                  try {
                    const outPath = `${getProjectPath(project)}/assets/voice/Project_${project.name}_Full.wav`;
                    const res = await fetch(`${API}/api/v1/audio/concat`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ audio_paths: paths, output_path: outPath })
                    });
                    if (res.ok) {
                      const a = document.createElement('a');
                      a.href = `${API}/api/v1/render/media?path=${encodeURIComponent(outPath)}`;
                      a.download = `Full_Audio_${project.name}.wav`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                    } else { onShowNotification('Ошибка склейки', 'error'); }
                  } catch { onShowNotification('Сбой скачивания', 'error'); }
                }} title="Скачать все аудио проекта одним файлом"><Download size={18} /></button>
                <button className="text-[11px] text-on-surface-variant hover:text-error flex items-center justify-center transition-colors w-9 h-9 rounded hover:bg-white/5 border border-white/10" onClick={onResetAudio} title="Сбросить все аудио"><Trash2 size={18} /></button>
                </div>
              </div>
            </section>

            <div className="h-px bg-white/5" />

            {/* Секция: Фоновая музыка & Auto-Ducking */}
            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center bg-accent/10 p-2 rounded-lg border border-accent/20 gap-2">
                <span className="font-label text-xs uppercase tracking-wide text-accent flex items-center gap-1.5 truncate">
                  <Volume2 size={16} /> Фоновая музыка & Ducking
                </span>
                <Switch
                  checked={Boolean(project.backgroundMusic?.enabled)}
                  onChange={(val) => onUpdateProjectSettings({
                    ...project,
                    backgroundMusic: { ...(project.backgroundMusic || DEFAULT_BACKGROUND_MUSIC), enabled: val },
                  })}
                />
              </div>
              <div className="p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-on-surface-variant truncate max-w-[170px]">{project.backgroundMusic?.trackName || 'Не выбран'}</span>
                  <button onClick={() => onOpenMusicLibrary?.()} className="text-[11px] text-secondary hover:underline shrink-0">Изменить</button>
                </div>
                <Button variant="secondary" onClick={() => onOpenMusicSettings?.()} className="w-full text-xs py-1.5 font-medium">
                  <SlidersHorizontal size={14} className="mr-1.5" /> Настроить Ducking & EQ
                </Button>
              </div>
            </section>

            <div className="h-px bg-white/5" />

            {/* Секция 2: Синхронизация */}
            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center bg-secondary/10 p-2 rounded-lg border border-secondary/20 gap-2">
                <span className="font-label text-xs uppercase tracking-wide text-secondary flex items-center gap-1.5 truncate"><AlignStartVertical size={16}/> Синхронизация</span>
                <div className="flex items-center gap-2 shrink-0">
                  {project.scenes.some(s => s.fragments.some(f => f.startTime !== undefined)) && (
                    <button className="text-[11px] text-error hover:text-white flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded bg-error/10 border border-error/30" onClick={onResetAllSync} title="Сбросить все тайминги"><RotateCcw size={14} /></button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2.5 p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl">
                <label className="flex items-center justify-between gap-2 text-xs text-on-surface-variant cursor-pointer">
                  <span className="flex-1 leading-tight">WhisperX ИИ</span>
                  <input type="checkbox" checked={useWhisper} onChange={e => onChangeUseWhisper(e.target.checked)} className="accent-primary size-3.5 shrink-0" />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-on-surface-variant cursor-pointer">
                  <span className="flex-1 leading-tight">Авто-освобождение VRAM</span>
                  <input type="checkbox" checked={autoOffloadVram} onChange={e => onChangeAutoOffloadVram(e.target.checked)} className="accent-primary size-3.5 shrink-0" />
                </label>
                <button onClick={onUnloadVram} className="text-[11px] text-secondary hover:bg-secondary/10 px-2 py-0.5 rounded transition-all flex items-center gap-1 mt-1 self-start font-medium leading-tight h-auto text-left"><Cpu size={14} /> Очистить VRAM вручную</button>
              </div>

              <Button variant="dashed" disabled={isSyncing} onClick={onRunSync} className="h-auto py-2 leading-tight">{isSyncing ? <Spinner /> : 'Синхронизировать тайминги'}</Button>
            </section>

            <div className="h-px bg-white/5" />

            {/* Секция 3: Мастеринг и обработка */}
            <section className="flex flex-col gap-3">
              <div className="flex justify-between items-center bg-warning/10 p-2 rounded-lg border border-warning/20 gap-2">
                <span className="font-label text-xs uppercase tracking-wide text-warning flex items-center gap-1.5 truncate"><AudioLines size={16}/> Мастеринг аудио</span>
                <div className="flex bg-surface-container-lowest border border-white/5 rounded-md p-0.5 shrink-0">
                  <button className={`text-[10px] px-2 py-1 rounded transition-colors ${processScope === 'scene' ? 'bg-warning/20 text-warning' : 'text-on-surface-variant hover:text-white'}`} onClick={() => setProcessScope('scene')}>Сцена</button>
                  <button className={`text-[10px] px-2 py-1 rounded transition-colors ${processScope === 'project' ? 'bg-warning/20 text-warning' : 'text-on-surface-variant hover:text-white'}`} onClick={() => setProcessScope('project')}>Проект</button>
                </div>
              </div>
              <Button variant="dashed" onClick={() => onProcessAudio('lavasr', processScope)} disabled={isGeneratingAudio} className="text-xs border-primary/30 hover:border-primary/60 hover:bg-primary/10 hover:text-primary h-auto py-2 leading-tight justify-center md:justify-start text-center md:text-left">
                ✨ LavaSR 48kHz (AI BWE Апскейл)
              </Button>
              <Button variant="dashed" onClick={() => onProcessAudio('mastering', processScope)} disabled={isGeneratingAudio} className="text-xs border-white/10 hover:border-warning/50 hover:bg-warning/10 hover:text-warning h-auto py-2 leading-tight justify-center md:justify-start text-center md:text-left">🎙️ Мастеринг (EQ + Normalize)</Button>
              <Button variant="dashed" onClick={() => onProcessAdvancedSilence?.(processScope)} disabled={isGeneratingAudio} className="text-xs border-white/10 hover:border-accent/50 hover:bg-accent/10 hover:text-accent h-auto py-2 leading-tight justify-center md:justify-start text-center md:text-left">✂️ Умная обрезка пауз (Pydub)</Button>
            </section>
          </>
        )}

        {/* =========================================================
            ВКЛАДКА 3: ВИЗУАЛ (АНИМАЦИЯ И КОД)
        ========================================================= */}
        {activeTab === 'visual' && (
          <section className="flex flex-col gap-3">
            <div className="flex justify-between items-center bg-accent/10 p-2 rounded-lg border border-accent/20 gap-2">
              <span className="font-label text-xs uppercase tracking-wide text-accent flex items-center gap-1.5 truncate"><Code size={16}/> Код (TSX)</span>
              <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                <button className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10" onClick={() => { if (activeScene) { void navigator.clipboard.writeText(generateRemotionPrompt(project, activeScene)); onShowNotification('Промпт сцены с таймкодами скопирован!', 'success') } }}><Copy size={12} /> Сцену</button>
                <button className="text-[11px] text-on-surface-variant hover:text-primary flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10" onClick={() => { void navigator.clipboard.writeText(generateProjectPrompt(project)); onShowNotification('Промпт проекта скопирован!', 'success') }}><Copy size={12} /> Проект</button>
              </div>
            </div>

            {activeScene && (
              <div className="p-3 bg-surface-container-lowest/40 border border-white/5 rounded-xl">
                <Switch checked={Boolean(activeScene.ignoreTsx)} onChange={() => onToggleIgnoreTsx(activeScene.id)} label="Игнорировать TSX (черный экран)" />
              </div>
            )}

            <Button variant="dashed" disabled={isGeneratingCode || Boolean(activeScene?.ignoreTsx)} onClick={onRunCodeGen} className={`h-auto py-2 leading-tight ${codeDirty ? 'border-warning/50 text-warning hover:bg-warning/10 hover:border-warning' : ''}`}>
              {isGeneratingCode ? <Spinner /> : codeDirty ? 'Обновить код TSX (⚠️)' : 'Сгенерировать код через Ollama'}
            </Button>
          </section>
        )}

        {/* =========================================================
            ВКЛАДКА 4: ЭКСПОРТ (СБОРКА MP4)
        ========================================================= */}
        {activeTab === 'export' && (
          <section className="flex flex-col gap-3">
            <div className="flex justify-between items-center bg-success/10 p-2 rounded-lg border border-success/20 gap-2">
              <span className="font-label text-xs uppercase tracking-wide text-success flex items-center gap-1.5 truncate"><Film size={16}/> Сборка (Рендер)</span>
            </div>

            <p className="text-xs text-on-surface-variant mb-2 leading-relaxed">
              Полный рендер всех неигнорируемых сцен с использованием локального инстанса Remotion и последующей склейкой аудиодорожек через FFmpeg.
            </p>

            <div className="flex flex-col gap-2">
              <Button variant="primary" disabled={isRendering} onClick={onRunProjectRender} className="py-3 h-auto leading-tight shadow-[0_0_15px_rgba(74,222,128,0.2)]">
                {isRendering ? `🎬 Рендер... ${renderProgress}%` : '🎬 Рендер всего проекта'}
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="dashed" disabled={isRendering} onClick={onRunRender} className="flex-1 min-w-[120px] text-xs py-2 px-2 h-auto leading-tight">
                  Текущая сцена
                </Button>
                <Button variant="dashed" disabled={isRendering} onClick={onExportProject} className="flex-1 min-w-[120px] text-xs py-2 px-2 h-auto leading-tight">
                  Экспорт ZIP <FileOutput size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          </section>
        )}

      </div>
    </aside>
  )
}