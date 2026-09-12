import React, { useState, useEffect } from 'react'
import type { ProjectSettings, Scene } from '@entities/project'
import { ContentTab } from './tabs/ContentTab'
import { AudioTab } from './tabs/AudioTab'
import { VisualTab } from './tabs/VisualTab'
import { ExportTab } from './tabs/ExportTab'

type InspectorTab = 'content' | 'audio' | 'visual' | 'export'

interface Props {
  project: ProjectSettings
  activeScene?: Scene
  voiceModel: string
  useWhisper: boolean
  autoOffloadVram: boolean
  isGeneratingAudio: boolean
  isSyncing: boolean
  isGeneratingCode: boolean
  isRendering: boolean
  renderProgress: number
  onChangeVoiceModel: (m: string) => void
  onChangeUseWhisper: (val: boolean) => void
  onChangeAutoOffloadVram: (val: boolean) => void
  onAddFragment: () => void
  onDeleteFragment: (id: string) => void
  onFragmentTextChange: (id: string, text: string, visualNote?: string) => void
  onFragDragStart: (idx: number) => () => void
  onFragDrop: (idx: number) => () => void
  onOpenVoicebox: () => void
  onOpenAiSettings: () => void
  onOpenCustomAudioModal?: (scope: 'fragment' | 'scene' | 'project', fragId?: string) => void
  onOpenBRollModal?: (scope: 'fragment' | 'scene' | 'project', fragId?: string) => void
  onAutoMatchBRoll?: (scope: 'fragment' | 'scene' | 'project', targetFragId?: string) => void
  onRunVoiceGen: () => void
  onRunVoiceGenFragment: (sceneId: string, fragId: string) => void
  onResetAllSync: () => void
  onResetAudio: () => void
  onProcessAudio: (action: string, scope: 'scene' | 'project', targetSceneId?: string) => void
  onProcessAdvancedSilence?: (scope: 'scene' | 'project', targetSceneId?: string) => void
  onUnloadVram: () => void
  onRunSync: () => void
  onToggleIgnoreTsx: (sceneId: string) => void
  onRunCodeGen: () => void
  onRunProjectRender: () => void
  onRunRender: () => void
  onExportProject: () => void
  onShowNotification: (msg: string, type?: 'success'|'error'|'info') => void
  onUpdateFragmentBRoll: (fragId: string, filename: string) => void
  onUnlinkFragmentBRoll: (fragId: string) => void
  onNudgeTiming: (fragId: string, type: 'start' | 'end', delta: number) => void
  onReplaceFragmentAudio: (fragId: string, path: string) => void
  onUpdateProjectSettings: (project: ProjectSettings) => void
  onOpenMusicSettings?: () => void
  onOpenMusicLibrary?: () => void
}

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'content', label: 'Контент' },
  { id: 'audio', label: 'Аудио' },
  { id: 'visual', label: 'Визуал' },
  { id: 'export', label: 'Экспорт' },
]

export const PipelineInspector = React.memo((props: Props) => {
  const {
    project, activeScene, voiceModel, useWhisper, autoOffloadVram,
    isGeneratingAudio, isSyncing, isGeneratingCode, isRendering, renderProgress,
    onChangeVoiceModel, onChangeUseWhisper, onChangeAutoOffloadVram,
    onAddFragment, onDeleteFragment, onFragmentTextChange, onFragDragStart, onFragDrop,
    onOpenVoicebox, onOpenAiSettings, onOpenCustomAudioModal, onOpenBRollModal, onAutoMatchBRoll,
    onRunVoiceGen, onRunVoiceGenFragment, onResetAllSync, onResetAudio,
    onProcessAudio, onProcessAdvancedSilence, onUnloadVram, onRunSync, onToggleIgnoreTsx,
    onRunCodeGen, onRunProjectRender, onRunRender, onExportProject, onShowNotification,
    onUpdateFragmentBRoll, onUnlinkFragmentBRoll, onNudgeTiming, onReplaceFragmentAudio,
    onUpdateProjectSettings, onOpenMusicSettings, onOpenMusicLibrary,
  } = props

  const [activeTab, setActiveTab] = useState<InspectorTab>(() => {
    return (localStorage.getItem('vidora:inspector-tab') as InspectorTab) || 'content'
  })

  useEffect(() => {
    localStorage.setItem('vidora:inspector-tab', activeTab)
  }, [activeTab])

  const [copyEmotionTags, setCopyEmotionTags] = useState(() => {
    return localStorage.getItem('vidora:copy-emotion-tags') === 'true'
  })

  const toggleCopyEmotionTags = (val: boolean) => {
    setCopyEmotionTags(val)
    localStorage.setItem('vidora:copy-emotion-tags', val.toString())
  }

  return (
    <aside className="w-full h-full border-l border-white/10 bg-surface-container/30 flex flex-col shrink-0">
      <div className="flex border-b border-white/10 bg-surface-container-lowest/50 shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2.5 px-1 text-center text-[10px] uppercase tracking-wide font-semibold transition-colors border-b-2 truncate ${activeTab === t.id ? 'border-primary text-primary bg-primary/10' : 'border-transparent text-on-surface-variant hover:text-white hover:bg-white/5'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">
        {activeTab === 'content' && (
          <ContentTab
            project={project}
            activeScene={activeScene}
            copyEmotionTags={copyEmotionTags}
            onToggleCopyEmotionTags={toggleCopyEmotionTags}
            onAddFragment={onAddFragment}
            onDeleteFragment={onDeleteFragment}
            onFragmentTextChange={onFragmentTextChange}
            onFragDragStart={onFragDragStart}
            onFragDrop={onFragDrop}
            onOpenCustomAudioModal={onOpenCustomAudioModal}
            onOpenBRollModal={onOpenBRollModal}
            onAutoMatchBRoll={onAutoMatchBRoll}
            onRunVoiceGenFragment={onRunVoiceGenFragment}
            onUpdateFragmentBRoll={onUpdateFragmentBRoll}
            onUnlinkFragmentBRoll={onUnlinkFragmentBRoll}
            onReplaceFragmentAudio={onReplaceFragmentAudio}
            onShowNotification={onShowNotification}
            onNudgeTiming={onNudgeTiming}
          />
        )}
        {activeTab === 'audio' && (
          <AudioTab
            project={project}
            voiceModel={voiceModel}
            useWhisper={useWhisper}
            autoOffloadVram={autoOffloadVram}
            isGeneratingAudio={isGeneratingAudio}
            isSyncing={isSyncing}
            onChangeVoiceModel={onChangeVoiceModel}
            onChangeUseWhisper={onChangeUseWhisper}
            onChangeAutoOffloadVram={onChangeAutoOffloadVram}
            onOpenVoicebox={onOpenVoicebox}
            onOpenAiSettings={onOpenAiSettings}
            onOpenCustomAudioModal={onOpenCustomAudioModal}
            onRunVoiceGen={onRunVoiceGen}
            onResetAllSync={onResetAllSync}
            onResetAudio={onResetAudio}
            onProcessAudio={onProcessAudio}
            onProcessAdvancedSilence={onProcessAdvancedSilence}
            onUnloadVram={onUnloadVram}
            onRunSync={onRunSync}
            onUpdateProjectSettings={onUpdateProjectSettings}
            onOpenMusicSettings={onOpenMusicSettings}
            onOpenMusicLibrary={onOpenMusicLibrary}
            onShowNotification={onShowNotification}
          />
        )}
        {activeTab === 'visual' && (
          <VisualTab
            project={project}
            activeScene={activeScene}
            isGeneratingCode={isGeneratingCode}
            onRunCodeGen={onRunCodeGen}
            onToggleIgnoreTsx={onToggleIgnoreTsx}
            onUpdateProjectSettings={onUpdateProjectSettings}
            onShowNotification={onShowNotification}
          />
        )}
        {activeTab === 'export' && (
          <ExportTab
            project={project}
            isRendering={isRendering}
            renderProgress={renderProgress}
            onRunProjectRender={onRunProjectRender}
            onRunRender={onRunRender}
            onExportProject={onExportProject}
            onUpdateProjectSettings={onUpdateProjectSettings}
          />
        )}
      </div>
    </aside>
  )
})
