import type { SkillStage } from '../api/skillsApi'

export const STAGE_CONFIG: Record<SkillStage, { label: string; color: string; desc: string }> = {
  scene_generation: {
    label: 'Scene Gen',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    desc: 'Генерация сцен и компонентов Remotion',
  },
  widget_creation: {
    label: 'Widget Creator',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    desc: 'Создание автономных виджетов',
  },
  project: {
    label: 'Project Arch',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    desc: 'Композиция и структура таймлайна',
  },
  fragment: {
    label: 'Fragment',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    desc: 'Правки отдельных частей кода',
  },
  tts: {
    label: 'TTS Speech',
    color: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
    desc: 'Нормализация и разметка озвучки',
  },
  script_drafting: {
    label: 'Script Draft',
    color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    desc: 'Генерация сценариев и скриптов',
  },
  hook_analysis: {
    label: 'Hook Analysis',
    color: 'bg-lime-500/10 text-lime-400 border-lime-500/30',
    desc: 'Анализ хуков, превью и удержания',
  },
  general: {
    label: 'General / Global',
    color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
    desc: 'Глобальные правила (всегда подмешиваются)',
  },
}
