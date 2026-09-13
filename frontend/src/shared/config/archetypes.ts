import { ZoomIn, Sparkles, Layers, MoveRight, Activity } from 'lucide-react'
import type { ElementType } from 'react'

export type VisualArchetype = 'PULL' | 'EXPLODE' | 'CASCADE' | 'FLOW' | 'PULSE'

export interface ArchetypeConfig {
  id: VisualArchetype
  label: string
  shortDesc: string
  physicsHint: string
  icon: ElementType
  color: string
  bgHover: string
}

/**
 * Пять визуальных архетипов движения — декларативный контракт для LLM-генератора
 * Remotion. Выбор архетипа фиксирует кинематику кадра, избавляя автора от
 * ручного написания TSX.
 */
export const VISUAL_ARCHETYPES: Record<VisualArchetype, ArchetypeConfig> = {
  PULL: {
    id: 'PULL',
    label: 'Наезд (Zoom)',
    shortDesc: 'Плавное приближение камеры scale: 1 -> 1.15 к ключевому объекту',
    physicsHint: 'spring(damping: 14, mass: 0.8)',
    icon: ZoomIn,
    color: 'text-secondary border-secondary/30 bg-secondary/10',
    bgHover: 'hover:border-secondary/50',
  },
  EXPLODE: {
    id: 'EXPLODE',
    label: 'Взрыв (Breakout)',
    shortDesc: 'Разлёт элементов из центра: цифры, графики, шок-факты',
    physicsHint: 'interpolate(progress, [0, 1], [0.8, 1.25])',
    icon: Sparkles,
    color: 'text-warning border-warning/30 bg-warning/10',
    bgHover: 'hover:border-warning/50',
  },
  CASCADE: {
    id: 'CASCADE',
    label: 'Каскад (Lists)',
    shortDesc: 'Поочерёдное появление списков и плашек с задержкой 3 кадра',
    physicsHint: 'stagger(delay = index * 3)',
    icon: Layers,
    color: 'text-tertiary border-tertiary/30 bg-tertiary/10',
    bgHover: 'hover:border-tertiary/50',
  },
  FLOW: {
    id: 'FLOW',
    label: 'Движение (Path)',
    shortDesc: 'Направленное смещение по траектории слева направо',
    physicsHint: 'translateX with clamp',
    icon: MoveRight,
    color: 'text-success border-success/30 bg-success/10',
    bgHover: 'hover:border-success/50',
  },
  PULSE: {
    id: 'PULSE',
    label: 'Пульс (Rhythm)',
    shortDesc: 'Ритмичный акцент и возврат под ударные слова диктора',
    physicsHint: 'sin(frame * frequency) scale pulse',
    icon: Activity,
    color: 'text-error border-error/30 bg-error/10',
    bgHover: 'hover:border-error/50',
  },
}

export const ARCHETYPE_MARKER = 'Архетип движения:'

export const stripArchetypeMarker = (note: string): string =>
  note.replace(/Архетип движения:\s*[A-Z]+(\s*—\s*)?/i, '').trim()

export const detectArchetype = (note: string): VisualArchetype | undefined => {
  const upper = note.toUpperCase()
  return (Object.keys(VISUAL_ARCHETYPES) as VisualArchetype[]).find((a) => upper.includes(a))
}
