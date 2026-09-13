import type { VisualArchetype } from '@shared/config'
import { VISUAL_ARCHETYPES } from '@shared/config'
import { Button, OptionCard } from '@shared/ui'

type ArchetypeAccent = 'primary' | 'secondary' | 'success' | 'warning' | 'error'

const ARCHETYPE_ACCENT: Record<VisualArchetype, ArchetypeAccent> = {
  PULL: 'secondary',
  EXPLODE: 'warning',
  CASCADE: 'primary',
  FLOW: 'success',
  PULSE: 'error',
}

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
            <Button
              key={key}
              variant={isSelected ? 'secondary' : 'ghost'}
              size="sm"
              icon={Icon}
              onClick={() => onSelect(key)}
              title={`${item.label} — ${item.shortDesc}`}
              className="p-1.5 rounded-lg shrink-0"
            >
              <span className="text-xxs uppercase font-mono">{item.id}</span>
            </Button>
          )
        }

        return (
          <OptionCard
            key={key}
            icon={Icon}
            title={item.label}
            subtitle={item.shortDesc}
            isActive={isSelected}
            accent={ARCHETYPE_ACCENT[key]}
            onClick={() => onSelect(key)}
            className={`flex-1 min-w-[var(--layout-chip)] ${item.bgHover}`}
          />
        )
      })}
    </div>
  )
}
