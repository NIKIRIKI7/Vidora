import type { SceneFragment } from '@entities/project'

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
    let duration = totalDuration * fraction
    let end = currentStart + duration
    if (i === fragments.length - 1) end = totalDuration
    const newFrag = { ...f, startTime: Number(currentStart.toFixed(3)), endTime: Number(end.toFixed(3)) }
    currentStart = end
    return newFrag
  })
}
