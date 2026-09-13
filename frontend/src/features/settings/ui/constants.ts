import type { SkillStage } from '@entities/skill'

export const STAGE_CONFIG: Record<SkillStage, { label: string; color: string; desc: string }> = {
  scene_generation: {
    label: 'Scene Gen',
    color: 'bg-primary/10 text-primary border-primary/30',
    desc: 'Генерация сцен и компонентов Remotion',
  },
  project: {
    label: 'Project Arch',
    color: 'bg-primary/10 text-primary border-primary/30',
    desc: 'Композиция и структура таймлайна',
  },
  fragment: {
    label: 'Fragment',
    color: 'bg-warning/10 text-warning border-warning/30',
    desc: 'Правки отдельных частей кода',
  },
  tts: {
    label: 'TTS Speech',
    color: 'bg-tertiary/10 text-tertiary border-tertiary/30',
    desc: 'Нормализация и разметка озвучки',
  },
  script_drafting: {
    label: 'Script Draft',
    color: 'bg-secondary/10 text-secondary border-secondary/30',
    desc: 'Генерация сценариев и скриптов',
  },
  hook_analysis: {
    label: 'Hook Analysis',
    color: 'bg-lime-500/10 text-lime-400 border-lime-500/30',
    desc: 'Анализ хуков, превью и удержания',
  },
  broll_matching: {
    label: 'B-Roll Matcher',
    color: 'bg-error/10 text-error border-error/30',
    desc: 'Подбор и встраивание B-Roll видео по семантике фрагмента',
  },
  general: {
    label: 'General / Global',
    color: 'bg-surface-container-highest/10 text-on-surface-variant border-outline-variant/30',
    desc: 'Глобальные правила (всегда подмешиваются)',
  },
}
