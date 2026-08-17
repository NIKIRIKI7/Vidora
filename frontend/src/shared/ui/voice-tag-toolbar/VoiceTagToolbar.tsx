import { useState, type MouseEvent } from 'react'

export interface VoiceTagToolbarProps {
  onInsertTag: (before: string, after?: string) => void
  onToggleCaps: () => void
  hasSelection?: boolean
  voiceEngineMode?: 'omnivoice' | 'cosyvoice'
  className?: string
}

interface Preset {
  label: string
  tag: string
}

const PAUSES: Preset[] = [
  { label: '⏱ +0.5с', tag: '<#0.5#>' },
  { label: '⏱ +1.0с', tag: '<#1.0#>' },
  { label: '⏱ +1.5с', tag: '<#1.5#>' },
  { label: '⏱ +2.0с', tag: '<#2.0#>' },
]

const EMOTIONS: Preset[] = [
  { label: '😄 Радость', tag: '[emotion: happy]' },
  { label: '😢 Грусть', tag: '[emotion: sad]' },
  { label: '😡 Злость', tag: '[emotion: angry]' },
  { label: '😨 Страх', tag: '[emotion: fearful]' },
  { label: '🤢 Отвращение', tag: '[emotion: disgusted]' },
  { label: '😱 Удивление', tag: '[emotion: surprised]' },
  { label: '😌 Спокойствие', tag: '[emotion: calm]' },
]

const SOUNDS: Preset[] = [
  { label: '😮‍💨 вздох', tag: '(sighs)' },
  { label: '😏 смешок', tag: '(chuckle)' },
  { label: '🫨 вдох', tag: '(gasps)' },
  { label: '😄 смех', tag: '(laughs)' },
  { label: '🗣️ кашель', tag: '(clear-throat)' },
  { label: '😤 стон', tag: '(groans)' },
]

const INSTRUCTS: Preset[] = [
  { label: 'Шепот', tag: '[instruct: Speak in a whisper]' },
  { label: 'Энергично', tag: '[instruct: Speak with excitement and energy]' },
  { label: 'Медленно', tag: '[instruct: Speak slowly and clearly]' },
  { label: 'Таинственно', tag: '[instruct: Speak softly and mysteriously]' },
]

export const VoiceTagToolbar = ({
  onInsertTag,
  onToggleCaps,
  hasSelection = false,
  voiceEngineMode = 'omnivoice',
  className = '',
}: VoiceTagToolbarProps) => {
  const [open, setOpen] = useState<string | null>(null)

  // onMouseDown={preventBlur} критичен: без него клик по кнопке уводит фокус из textarea
  const preventBlur = (e: MouseEvent) => e.preventDefault()

  const dropdowns = [
    voiceEngineMode === 'cosyvoice'
      ? { key: 'instruct', label: '🎙 Instruct', items: INSTRUCTS }
      : { key: 'emotions', label: '😄 Эмоции', items: EMOTIONS },
    { key: 'sounds', label: '🗣 Звуки', items: SOUNDS },
  ]

  return (
    <div className={`flex items-center gap-1 p-1 rounded-lg bg-surface-container-lowest/80 border border-white/10 select-none flex-wrap ${className}`} onMouseDown={preventBlur}>
      <button
        type="button"
        onMouseDown={preventBlur}
        onClick={onToggleCaps}
        className={`px-2 py-1 rounded text-[11px] font-bold transition-colors border ${hasSelection ? 'bg-warning/20 text-warning border-warning/40 hover:bg-warning/30' : 'bg-white/5 text-on-surface-variant border-white/5 hover:text-white hover:bg-white/10'}`}
        title={hasSelection ? 'Сделать выделение ЗАГЛАВНЫМ — ударение в TTS (повторный клик — обратно)' : 'Выделите слово или гласную букву для ударения'}
      >
        🔠 КАПС
      </button>

      <div className="h-4 w-px bg-white/10 mx-0.5" />

      {PAUSES.map(p => (
        <button
          key={p.tag}
          type="button"
          onMouseDown={preventBlur}
          onClick={() => onInsertTag(p.tag)}
          className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-secondary/10 text-secondary border border-secondary/20 hover:bg-secondary/20 transition-colors"
          title={`Пауза ${p.tag}`}
        >
          {p.label}
        </button>
      ))}

      <div className="h-4 w-px bg-white/10 mx-0.5" />

      {dropdowns.map(({ key, label, items }) => (
        <div key={key} className="relative">
          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={() => setOpen(open === key ? null : key)}
            className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${open === key ? 'bg-primary/20 text-primary border-primary/40' : 'bg-white/5 text-on-surface-variant border-white/5 hover:text-white hover:bg-white/10'}`}
          >
            {label} <span className="text-[8px]">{open === key ? '▲' : '▼'}</span>
          </button>
          {open === key && (
            <div className="absolute left-0 top-full mt-1 z-50 p-1.5 bg-surface-container-high border border-white/15 rounded-lg shadow-2xl flex flex-wrap gap-1 w-48">
              {items.map(it => (
                <button
                  key={it.tag}
                  type="button"
                  onMouseDown={preventBlur}
                  onClick={() => { onInsertTag(it.tag); setOpen(null) }}
                  className="flex-1 min-w-[45%] flex items-center gap-1 px-1.5 py-1 rounded text-[11px] text-on-surface hover:bg-primary/20 hover:text-primary transition-colors"
                  title={it.tag}
                >
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
