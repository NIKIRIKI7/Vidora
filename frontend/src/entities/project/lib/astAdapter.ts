import { isAstFragment, type ScenarioAstDocument } from '@shared/api'
import type { AppColors } from '@shared/config'
import type { FPS, Metadata, Scene, SceneFragment } from '../model/types'
import { extractBRollFromVisualNote } from './parseMarkdown'

/**
 * СОВМЕСТИМЫЙ АДАПТЕР (НЕ парсер): перекладывает AST со Шлюза в локальную модель
 * проекта для легаси-фич (аудио, таймлайн, рендер). Единый источник правды —
 * backend-AST (SSOT); локальные SceneFragment'ы лишь кэш, в который по позиции
 * сохраняются аудио/code-метаданные.
 */
export interface AstProjectDelta {
  scenes: Scene[]
  metadata?: Partial<Metadata>
  montage?: { fps?: FPS; colors?: Partial<AppColors> }
}

const FPS_MAP: Record<number, FPS> = { 24: '24', 30: '30', 60: '60' }

const PALETTE_KEYS = ['primary', 'secondary', 'accent', 'background', 'surface', 'text'] as const

export const astToProjectDelta = (
  ast: ScenarioAstDocument,
  prevScenes: Scene[],
): AstProjectDelta => {
  const scenes: Scene[] = ast.scenes.map((astScene, sIdx) => {
    const prev = prevScenes[sIdx]

    const fragments: SceneFragment[] = astScene.nodes.filter(isAstFragment).map((af, fIdx) => {
      const prevFrag = prev?.fragments?.[fIdx]
      const parsed = extractBRollFromVisualNote(af.visual_note)

      return {
        ...prevFrag,
        id: prevFrag?.id ?? crypto.randomUUID(),
        visualNote: parsed.cleanNote,
        bRollFileName: parsed.bRollPath || prevFrag?.bRollFileName,
        text: af.spoken_text ?? '',
        startTime: prevFrag?.startTime ?? null,
        endTime: prevFrag?.endTime ?? null,
      } as SceneFragment
    })

    return {
      ...prev,
      id: prev?.id ?? crypto.randomUUID(),
      title: astScene.title || 'Без названия',
      timecode: astScene.declared_timecode ?? prev?.timecode ?? '00:00:00',
      fragments,
    } as Scene
  })

  const delta: AstProjectDelta = { scenes }

  const fm = ast.frontmatter
  if (fm.title && fm.title !== 'Untitled') {
    delta.metadata = { ...delta.metadata, title: fm.title }
  }

  const fps = FPS_MAP[fm.fps]
  const colors: Partial<AppColors> = {}
  for (const key of PALETTE_KEYS) {
    const hex = fm.colors?.[key]
    if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) colors[key] = hex as AppColors[keyof AppColors]
  }

  if (fps || Object.keys(colors).length > 0) {
    delta.montage = {}
    if (fps) delta.montage.fps = fps
    if (Object.keys(colors).length > 0) delta.montage.colors = colors
  }

  return delta
}

/** Полезный предикат для UI: сколько фрагментов в AST-сцене. */
export const countAstFragments = (astScene: ScenarioAstDocument['scenes'][number]): number =>
  astScene.nodes.filter(isAstFragment).length
