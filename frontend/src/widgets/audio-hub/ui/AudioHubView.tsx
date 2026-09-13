import { useAudioHub } from '../model/useAudioHub'
import { AudioHubHeader } from './AudioHubHeader'
import { SpeakerCatalog } from './SpeakerCatalog'
import { SynthesizePanel } from './SynthesizePanel'
import { VoiceDesignPanel } from './VoiceDesignPanel'
import { VoiceClonePanel } from './VoiceClonePanel'
import { AudioHubSettings } from './AudioHubSettings'

export const AudioHubView = ({ onBack }: { onBack: () => void }) => {
  const hub = useAudioHub()

  return (
    <div className="flex flex-col h-dvh w-full bg-surface text-on-surface overflow-hidden select-none">
      <AudioHubHeader
        onBack={onBack}
        activeAction={hub.activeAction}
        onActionChange={hub.setActiveAction}
        isLocalGpuReady={hub.isLocalGpuReady}
        isRefreshing={hub.isRefreshing}
        onRefresh={() => {
          void hub.loadData(true)
        }}
        localModels={hub.localModels}
        onUnloadVram={hub.handleUnloadVram}
      />

      <div className="flex-1 flex overflow-hidden">
        <SpeakerCatalog
          isLoading={hub.isLoading}
          speakers={hub.filteredSpeakers}
          activeSpeakerId={hub.activeSpeaker?.speaker_id ?? null}
          searchQuery={hub.searchQuery}
          onSearchChange={hub.setSearchQuery}
          activeEnv={hub.activeEnv}
          onEnvChange={hub.setActiveEnv}
          categoryFilter={hub.categoryFilter}
          onCategoryFilterChange={hub.setCategoryFilter}
          onSelectSpeaker={hub.handleSelectSpeaker}
        />

        {/* ЦЕНТРАЛЬНАЯ КОЛОНКА: Рабочая студия */}
        <main className="flex-1 flex flex-col bg-surface-container-lowest/30 overflow-y-auto custom-scrollbar p-6">
          <div className="max-w-3xl mx-auto w-full flex flex-col gap-6">
            {/* РЕЖИМ 1: ОЗВУЧКА & СИНТЕЗ (PLAYGROUND) */}
            {hub.activeAction === 'synthesize' && hub.activeSpeaker && (
              <SynthesizePanel
                activeSpeaker={hub.activeSpeaker}
                testText={hub.testText}
                onTestTextChange={hub.setTestText}
                textEditorRef={hub.textEditorRef}
                onInsertTag={hub.insertTag}
                onToggleCaps={hub.toggleCaps}
                hasSelection={hub.hasSelection}
                isSynthesizing={hub.isSynthesizing}
                onSynthesize={hub.handleSynthesize}
                audioResultUrl={hub.audioResultUrl}
                audioDuration={hub.audioDuration}
                timedWords={hub.timedWords}
                onDeleteSpeaker={hub.handleDeleteSpeaker}
              />
            )}

            {/* РЕЖИМ 2: VOICE DESIGN (КОНСТРУКТОР ТЕМБРА) */}
            {hub.activeAction === 'design' && (
              <VoiceDesignPanel
                designName={hub.designName}
                onDesignNameChange={hub.setDesignName}
                designPrompt={hub.designPrompt}
                onDesignPromptChange={hub.setDesignPrompt}
                designEngine={hub.designEngine}
                onDesignEngineChange={hub.setDesignEngine}
                availableDesignEngines={hub.availableDesignEngines}
                engines={hub.engines}
                isDesigning={hub.isDesigning}
                onCreate={hub.handleCreateDesign}
                onRandomPrompt={hub.handleRandomPrompt}
              />
            )}

            {/* РЕЖИМ 3: VOICE CLONE (КЛОНИРОВАНИЕ) */}
            {hub.activeAction === 'clone' && (
              <VoiceClonePanel
                cloneName={hub.cloneName}
                onCloneNameChange={hub.setCloneName}
                cloneMode={hub.cloneMode}
                onCloneModeChange={hub.handleCloneModeChange}
                cloneEngine={hub.cloneEngine}
                onCloneEngineChange={hub.setCloneEngine}
                availableCloneEngines={hub.availableCloneEngines}
                engines={hub.engines}
                cloneFile={hub.cloneFile}
                onCloneFileChange={hub.setCloneFile}
                uploadInputRef={hub.uploadInputRef}
                cloneRefText={hub.cloneRefText}
                onCloneRefTextChange={hub.setCloneRefText}
                isCloning={hub.isCloning}
                onCreate={hub.handleCreateClone}
              />
            )}
          </div>
        </main>

        <AudioHubSettings
          guidanceScale={hub.guidanceScale}
          onGuidanceScaleChange={hub.setGuidanceScale}
          numSteps={hub.numSteps}
          onNumStepsChange={hub.setNumSteps}
          speed={hub.speed}
          onSpeedChange={hub.setSpeed}
          pitch={hub.pitch}
          onPitchChange={hub.setPitch}
          enableDenoise={hub.enableDenoise}
          onEnableDenoiseChange={hub.setEnableDenoise}
          alignmentEngine={hub.alignmentEngine}
          onAlignmentEngineChange={hub.setAlignmentEngine}
          onReset={hub.handleResetParams}
        />
      </div>
    </div>
  )
}
