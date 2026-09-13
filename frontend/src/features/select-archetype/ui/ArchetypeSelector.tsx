import type { VisualArchetype } from '@shared/config'
import { VISUAL_ARCHETYPES } from '@shared/config'

interface ArchetypeSelectorProps {
  currentArchetype?: VisualArchetype | null
  onSelect: (archetype: VisualArchetype) => void
  compact?: boolean
}

/**
 * Селектор пяти визуальных архетипов движения. Заменяет ручное написание TSX
 * декларативным выбором кинематики, который уходит в LLM-генератор Remotion.
 */
export const ArchetypeSelector = ({ currentArchetype, onSelect, compact = false }: ArchetypeSelectorProps) => {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar">
      {(Object.keys(VISUAL_ARCHETYPES) as VisualArchetype[]).map((key) => {
        const item = VISUAL_ARCHETYPES[key]
        const isSelected = currentArchetype === key
        const Icon = item.icon

        if (compact) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              title={`${item.label} — ${item.shortDesc}`}
              className={`p-1.5 rounded-lg border text-xs transition-all flex items-center gap-1 shrink-0 ${
                isSelected
                  ? `${item.color} shadow-sm font-bold scale-105`
                  : 'border-outline-variant/40 bg-surface-container-lowest/20 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/100'
              }`}
            >
              <Icon size={13} />
              <span className="text-xxs uppercase font-mono">{item.id}</span>
            </button>
          )
        }

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`flex-1 min-w-[var(--layout-chip)] p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${item.bgHover} ${
              isSelected
                ? `${item.color} shadow-md ring-1 ring-current`
                : 'border-outline-variant/40 bg-surface-container-lowest/60 text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Icon size={14} />
              <span className="text-xs font-bold">{item.label}</span>
            </div>
            <span className="text-xxs opacity-70 leading-tight line-clamp-2">{item.shortDesc}</span>
          </button>
        )
      })}
    </div>
  )
}
