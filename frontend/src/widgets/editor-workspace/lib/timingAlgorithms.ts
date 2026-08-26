import type { Scene, SceneFragment } from '@entities/project'

export const normalizeText = (text: string) => text.toLowerCase().replace(/[^\w\u0400-\u04FF]/g, '').trim()

export const fixOverlappingTimings = (fragments: SceneFragment[], totalDuration?: number): SceneFragment[] => {
  let currentStart = 0
  return fragments.map((f, i) => {
    let duration = (f.endTime || 0) - (f.startTime || 0)
    if (duration <= 0) duration = Math.max(f.text.split(' ').length / 2.5, 1.0)
    let end = currentStart + duration
    if (totalDuration && i === fragments.length - 1) end = Math.max(end, totalDuration)
    const newFrag = { ...f, startTime: Number(currentStart.toFixed(3)), endTime: Number(end.toFixed(3)) }
    currentStart = end
    return newFrag
  })
}

export const recalculateTimingsProportionally = (fragments: SceneFragment[], totalDuration: number): SceneFragment[] => {
  const totalLength = fragments.reduce((acc, f) => acc + normalizeText(f.text).length, 0)
  let currentStart = 0
  return fragments.map((f, i) => {
    const textLength = normalizeText(f.text).length
    const fraction = totalLength > 0 ? textLength / totalLength : 1 / fragments.length
    const duration = totalDuration * fraction
    let end = currentStart + duration
    if (i === fragments.length - 1) end = totalDuration
    const newFrag = { ...f, startTime: Number(currentStart.toFixed(3)), endTime: Number(end.toFixed(3)) }
    currentStart = end
    return newFrag
  })
}

/**
 * Каскадный сдвиг (Ripple Edit) при изменении длины конкретного фрагмента под B-Roll
 */
export const applyBRollWithRipple = (
  fragments: SceneFragment[],
  targetFragId: string,
  bRollDuration: number
): SceneFragment[] => {
  const targetIdx = fragments.findIndex(f => f.id === targetFragId)
  if (targetIdx === -1) return fragments

  const target = fragments[targetIdx]
  const currentStart = target.startTime ?? 0
  const currentEnd = target.endTime ?? (currentStart + 3.0)
  const currentDur = currentEnd - currentStart
  const delta = bRollDuration - currentDur

  return fragments.map((frag, idx) => {
    if (idx < targetIdx) {
      return frag
    }
    if (idx === targetIdx) {
      const newEnd = Number((currentStart + bRollDuration).toFixed(3))
      return {
        ...frag,
        startTime: currentStart,
        endTime: newEnd,
      }
    }
    // Все последующие фрагменты сдвигаются на дельту
    const prevStart = frag.startTime ?? 0
    const prevEnd = frag.endTime ?? (prevStart + 3.0)
    return {
      ...frag,
      startTime: Number(Math.max(0, prevStart + delta).toFixed(3)),
      endTime: Number(Math.max(0.1, prevEnd + delta).toFixed(3)),
    }
  })
}

/**
 * Сквозной пересчет глобальных таймкодов всех сцен проекта
 */
export const recalculateProjectTimecodes = (scenes: Scene[]): Scene[] => {
  let cumulativeSeconds = 0
  return scenes.map((scene) => {
    const pad = (n: number) => n.toString().padStart(2, '0')
    const h = Math.floor(cumulativeSeconds / 3600)
    const m = Math.floor((cumulativeSeconds % 3600) / 60)
    const s = Math.floor(cumulativeSeconds % 60)
    const timecode = `${pad(h)}:${pad(m)}:${pad(s)}`

    const lastFragEnd = Math.max(
      ...scene.fragments.map(f => f.endTime || 0),
      scene.fragments.reduce((acc, f) => acc + Math.max(f.text.split(' ').length / 2.5, 1.0), 0)
    )

    cumulativeSeconds += lastFragEnd
    return {
      ...scene,
      timecode,
    }
  })
}
