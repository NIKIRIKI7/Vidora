import type { RefObject } from 'react'
import { Mic, Play, Trash2 } from 'lucide-react'
import { Button, IconButton, Spinner, TextArea, VoiceTagToolbar } from '@shared/ui'
import type { SpeakerProfileDto, TimedWord } from '@shared/api'

interface SynthesizePanelProps {
  activeSpeaker: SpeakerProfileDto
  testText: string
  onTestTextChange: (value: string) => void
  textEditorRef: RefObject<HTMLTextAreaElement | null>
  onInsertTag: (before: string, after?: string) => void
  onToggleCaps: () => void
  hasSelection: boolean
  isSynthesizing: boolean
  onSynthesize: () => void
  audioResultUrl: string | null
  audioDuration: number | null
  timedWords: TimedWord[]
  onDeleteSpeaker: (id: string, name: string) => void
}

export const SynthesizePanel = ({
  activeSpeaker,
  testText,
  onTestTextChange,
  textEditorRef,
  onInsertTag,
  onToggleCaps,
  hasSelection,
  isSynthesizing,
  onSynthesize,
  audioResultUrl,
  audioDuration,
  timedWords,
  onDeleteSpeaker,
}: SynthesizePanelProps) => (
  <>
    {/* Карточка активного диктора */}
    <div className="p-5 bg-surface-container/60 rounded-2xl border border-outline-variant/40 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-primary/30 to-secondary/30 border border-outline-variant/40 flex items-center justify-center text-lg font-bold text-on-surface shrink-0">
          {activeSpeaker.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-on-surface">{activeSpeaker.name}</h2>
            <span
              className={`text-3xs font-mono px-2 py-0.5 rounded-full border ${
                activeSpeaker.mode === 'local'
                  ? 'bg-success/15 text-success border-success/30'
                  : 'bg-secondary/15 text-secondary border-secondary/30'
              }`}
            >
              {activeSpeaker.mode === 'local' ? 'Локальный GPU' : 'Облако API'}
            </span>
            <span className="text-3xs font-mono px-2 py-0.5 rounded-full bg-on-surface/5 text-on-surface-variant border border-outline-variant/40">
              {activeSpeaker.source_type}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {activeSpeaker.description || 'Базовый диктор платформы Vidora.'}
          </p>
        </div>
      </div>

      {!activeSpeaker.is_default && (
        <IconButton
          icon={Trash2}
          size="sm"
          accent="error"
          onClick={() => onDeleteSpeaker(activeSpeaker.id, activeSpeaker.name)}
          title="Удалить диктора"
        />
      )}
    </div>

    {/* Редактор текста с интонационными тегами */}
    <div className="bg-surface-container/40 border border-primary/20 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-on-surface flex items-center gap-1.5">
          <Mic size={14} className="text-primary" /> Текст для синтеза
        </span>
        <span className="text-2xs font-mono text-secondary">
          Диктор: <b className="text-on-surface">{activeSpeaker.speaker_id}</b>
        </span>
      </div>

      <VoiceTagToolbar
        onInsertTag={onInsertTag}
        onToggleCaps={onToggleCaps}
        hasSelection={hasSelection}
        className="w-full"
      />

      <TextArea
        ref={textEditorRef}
        value={testText}
        onChange={(e) => onTestTextChange(e.target.value)}
        rows={3}
        className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3 text-xs text-on-surface focus:outline-none focus:border-primary/50 font-sans leading-relaxed resize-none shadow-inner"
        placeholder="Введите текст для озвучки диктором..."
      />

      {/* Кнопка запуска синтеза */}
      <div className="flex items-center justify-between gap-4 pt-1">
        <Button
          variant="primary"
          onClick={onSynthesize}
          disabled={isSynthesizing || !testText.trim()}
          className="py-2.5 px-6 text-xs font-bold flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          {isSynthesizing ? (
            <>
              <Spinner className="w-3.5 h-3.5" /> Синтез речи...
            </>
          ) : (
            <>
              <Play size={14} className="fill-current" /> Озвучить
            </>
          )}
        </Button>

        {audioResultUrl && (
          <div className="flex-1 flex items-center gap-3 bg-surface-container-lowest/40 px-3 py-1.5 rounded-xl border border-secondary/30 animate-in fade-in">
            <audio src={audioResultUrl} autoPlay controls className="w-full h-7" />
            {audioDuration && (
              <span className="text-xs font-mono text-secondary whitespace-nowrap">
                {audioDuration.toFixed(2)} с
              </span>
            )}
          </div>
        )}
      </div>

      {/* Пословные таймкоды (Whisper) */}
      {timedWords.length > 0 && (
        <div className="pt-3 border-t border-outline-variant/20 flex flex-col gap-2">
          <span className="text-xxs font-mono text-on-surface-variant uppercase tracking-wider">
            Пословные таймкоды (Whisper Alignment):
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar">
            {timedWords.map((w, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded bg-surface-container-lowest border border-outline-variant/40 text-2xs font-mono text-on-surface hover:border-primary/50 hover:text-primary transition-colors cursor-default"
                title={`${(w.start_ms / 1000).toFixed(2)}s - ${(w.end_ms / 1000).toFixed(2)}s (Уверенность: ${Math.round(w.confidence * 100)}%)`}
              >
                {w.word}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  </>
)
