import type { MouseEvent } from 'react'

interface SceneStatusBadgesProps {
  audioDirty: boolean
  hasAudio: boolean
  hasSync: boolean
  codeDirty: boolean
  hasCode: boolean
  isIgnored: boolean
  isVisualBoring: boolean
  isAudioBoring: boolean
  wpm: number
  pacingSeconds: number
  visualPacingThreshold: number
  audioSilenceThreshold: number
  audioWpmMin: number
  maxSilence: number
  onCopyFixPacingPrompt?: () => void
  onFixAudioPacing?: () => void
}

const stop = (fn?: () => void) => (e: MouseEvent) => {
  e.stopPropagation()
  fn?.()
}

/**
 * Разделяет технический статус артефактов (озвучка/тайминги/TSX) и режиссёрский
 * пейсинг (темп речи WPM, динамика кадра). Устраняет дубляж двух бейджей «Аудио».
 */
export const SceneStatusBadges = ({
  audioDirty,
  hasAudio,
  hasSync,
  codeDirty,
  hasCode,
  isIgnored,
  isVisualBoring,
  isAudioBoring,
  wpm,
  pacingSeconds,
  visualPacingThreshold,
  audioSilenceThreshold,
  audioWpmMin,
  maxSilence,
  onCopyFixPacingPrompt,
  onFixAudioPacing,
}: SceneStatusBadgesProps) => {
  return (
    <div className="flex flex-wrap gap-1.5 pl-1 mt-1">
      {/* 1. Технический статус озвучки */}
      {audioDirty ? (
        <span
          className="text-xxs px-1.5 py-0.5 rounded border border-warning/40 text-warning bg-warning/10 font-medium"
          title="Текст изменился — озвучку нужно перегенерировать"
        >
          ⚠️ Озвучка устарела
        </span>
      ) : hasAudio ? (
        <span
          className="text-xxs px-1.5 py-0.5 rounded border border-secondary/40 text-secondary bg-secondary/10 font-medium"
          title="Озвучка сгенерирована и совпадает с текущим текстом"
        >
          🎙️ Озвучено
        </span>
      ) : (
        <span
          className="text-xxs px-1.5 py-0.5 rounded border border-outline-variant/40 text-on-surface-variant/40 bg-on-surface/5 font-medium"
          title="Аудио ещё не сгенерировано"
        >
          ⏳ Без аудио
        </span>
      )}

      {/* 2. Тайминги и синхронизация */}
      <span
        className={`text-xxs px-1.5 py-0.5 rounded border font-medium ${
          hasSync
            ? 'border-primary/40 text-primary bg-primary/10'
            : 'border-outline-variant/40 text-on-surface-variant/40 bg-on-surface/5'
        }`}
      >
        ⏱️ {hasSync ? 'Выровнено' : 'Оценка'}
      </span>

      {/* 3. Технический статус TSX */}
      {isIgnored ? (
        <span className="text-xxs px-1.5 py-0.5 rounded border border-outline-variant/80 text-on-surface-variant bg-surface-container-lowest font-medium" title="Чёрный экран при рендере">
          ⬛ Чёрный экран
        </span>
      ) : codeDirty ? (
        <span className="text-xxs px-1.5 py-0.5 rounded border border-warning/40 text-warning bg-warning/10 font-medium" title="Код устарел">
          ⚠️ Код устарел
        </span>
      ) : (
        <span
          className={`text-xxs px-1.5 py-0.5 rounded border font-medium ${
            hasCode
              ? 'border-secondary/40 text-secondary bg-secondary/10'
              : 'border-outline-variant/40 text-on-surface-variant/40 bg-on-surface/5'
          }`}
        >
          💻 TSX
        </span>
      )}

      {/* 4. Режиссёрский пейсинг — динамика кадра */}
      <span
        className={`text-xxs px-1.5 py-0.5 rounded border font-medium ${
          isVisualBoring
            ? 'border-error/40 text-error bg-error/10'
            : 'border-secondary/40 text-secondary bg-secondary/10'
        }`}
        title={`Динамика: смена кадра в среднем раз в ${pacingSeconds.toFixed(1)}с (порог ${visualPacingThreshold}с). ${isVisualBoring ? 'Разбейте текст на больше фрагментов.' : 'Хороший темп.'}`}
      >
        {isVisualBoring ? `🐌 Динамика (${pacingSeconds.toFixed(1)}с)` : `⚡ Динамика (${pacingSeconds.toFixed(1)}с)`}
      </span>

      {/* 5. Режиссёрский пейсинг — темп речи (WPM) */}
      {hasSync && (
        <span
          className={`text-xxs px-1.5 py-0.5 rounded border font-medium ${
            isAudioBoring
              ? 'border-warning/40 text-warning bg-warning/10'
              : 'border-secondary/40 text-secondary bg-secondary/10'
          }`}
          title={`Темп речи: ${Math.round(wpm)} WPM (мин ${audioWpmMin}). Макс. пауза: ${maxSilence.toFixed(1)}с (порог ${audioSilenceThreshold}с).`}
        >
          {isAudioBoring ? `🐌 Темп речи (${Math.round(wpm)} WPM)` : `🔥 Темп речи (${Math.round(wpm)} WPM)`}
        </span>
      )}

      {isVisualBoring && onCopyFixPacingPrompt && (
        <button
          onClick={stop(onCopyFixPacingPrompt)}
          className="text-xxs px-1.5 py-0.5 rounded border border-primary/40 text-primary bg-primary/10 hover:bg-primary/20 transition-colors flex items-center gap-1 font-medium"
          title="Скопировать промпт для ИИ, чтобы добавить динамики"
        >
          ✨ ИИ
        </button>
      )}
      {isAudioBoring && onFixAudioPacing && (
        <button
          onClick={stop(onFixAudioPacing)}
          className="text-xxs px-1.5 py-0.5 rounded border border-secondary/40 text-secondary bg-secondary/10 hover:bg-secondary/20 transition-colors flex items-center gap-1 font-medium"
          title="Автоматически вырезать тишину и пересинхронизировать тайминги"
        >
          ✂️ Исправить
        </button>
      )}
    </div>
  )
}
