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
    color: 'text-sky-400 border-sky-400/30 bg-sky-400/10',
    bgHover: 'hover:border-sky-400/50',
  },
  EXPLODE: {
    id: 'EXPLODE',
    label: 'Взрыв (Breakout)',
    shortDesc: 'Разлёт элементов из центра: цифры, графики, шок-факты',
    physicsHint: 'interpolate(progress, [0, 1], [0.8, 1.25])',
    icon: Sparkles,
    color: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
    bgHover: 'hover:border-amber-400/50',
  },
  CASCADE: {
    id: 'CASCADE',
    label: 'Каскад (Lists)',
    shortDesc: 'Поочерёдное появление списков и плашек с задержкой 3 кадра',
    physicsHint: 'stagger(delay = index * 3)',
    icon: Layers,
    color: 'text-fuchsia-400 border-fuchsia-400/30 bg-fuchsia-400/10',
    bgHover: 'hover:border-fuchsia-400/50',
  },
  FLOW: {
    id: 'FLOW',
    label: 'Движение (Path)',
    shortDesc: 'Направленное смещение по траектории слева направо',
    physicsHint: 'translateX with clamp',
    icon: MoveRight,
    color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    bgHover: 'hover:border-emerald-400/50',
  },
  PULSE: {
    id: 'PULSE',
    label: 'Пульс (Rhythm)',
    shortDesc: 'Ритмичный акцент и возврат под ударные слова диктора',
    physicsHint: 'sin(frame * frequency) scale pulse',
    icon: Activity,
    color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
    bgHover: 'hover:border-rose-500/50',
  },
}

export const ARCHETYPE_MARKER = 'Архетип движения:'

export const stripArchetypeMarker = (note: string): string =>
  note.replace(/Архетип движения:\s*[A-Z]+(\s*—\s*)?/i, '').trim()

export const detectArchetype = (note: string): VisualArchetype | undefined => {
  const upper = note.toUpperCase()
  return (Object.keys(VISUAL_ARCHETYPES) as VisualArchetype[]).find((a) => upper.includes(a))
}
