import { useState } from 'react'
import type { ProjectSettings, Scene, SceneFragment } from '@entities/project'
import { parseTcString, hashCode, API } from '@shared/lib'
import { normalizeText, recalculateTimingsProportionally, applyBRollWithRipple, recalculateProjectTimecodes } from '../lib/timingAlgorithms'
import { getProjectPath } from '../lib/helpers'
import type { BRollApplyParams } from '../ui/BRollModal'

interface UseTimelineOperationsProps {
  project: ProjectSettings
  activeScene?: Scene
  onUpdateProjectSync: (project: ProjectSettings) => void
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export const useTimelineOperations = ({
  project,
  activeScene,
  onUpdateProjectSync,
  showNotification,
}: UseTimelineOperationsProps) => {
  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null)
  const [draggedFragIdx, setDraggedFragIdx] = useState<number | null>(null)

  const handleFragDragStart = (idx: number) => () => setDraggedFragIdx(idx)

  const handleFragDrop = (dropIdx: number) => () => {
    if (!activeScene || draggedFragIdx === null || draggedFragIdx === dropIdx) {
      setDraggedFragIdx(null)
      return
    }
    const fragments = [...activeScene.fragments]
    const [moved] = fragments.splice(draggedFragIdx, 1)
    fragments.splice(dropIdx, 0, moved)
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments } : s)),
    })
    setDraggedFragIdx(null)
  }

  const handleAddFragment = () => {
    if (!activeScene) return
    const newFrag: SceneFragment = { id: crypto.randomUUID(), visualNote: 'Визуальная ремарка', text: 'Текст суфлера...' }
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: [...s.fragments, newFrag] } : s)),
    })
    showNotification('Фрагмент добавлен', 'success')
  }

  const handleDeleteFragment = (fragId: string) => {
    if (!activeScene) return
    if (activeScene.fragments.length <= 1) {
      showNotification('Сцена должна содержать хотя бы один фрагмент', 'error')
      return
    }
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s =>
        s.id === activeScene.id ? { ...s, fragments: s.fragments.filter(f => f.id !== fragId) } : s
      ),
    })
    if (selectedFragmentId === fragId) setSelectedFragmentId(null)
  }

  const handleFragmentTextChange = (fragId: string, newText: string, newVisualNote?: string) => {
    if (!activeScene) return
    const oldTotalText = activeScene.fragments.map(f => normalizeText(f.text)).join('')
    const updatedFragments = activeScene.fragments.map(f => {
      if (f.id !== fragId) return f
      const vNote = newVisualNote !== undefined ? newVisualNote : f.visualNote
      let newStart = f.startTime
      let newEnd = f.endTime
      const match = vNote.match(
        /^(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)\s*-\s*(\d{1,2}:\d{2}(\.\d+)?|\d{1,2}:\d{2}:\d{2}(\.\d+)?)/
      )
      if (match) {
        const parsedStart = parseTcString(match[1])
        const parsedEnd = parseTcString(match[4])
        if (parsedStart !== null) newStart = parsedStart
        if (parsedEnd !== null) newEnd = parsedEnd
      }
      return { ...f, text: newText, visualNote: vNote, startTime: newStart, endTime: newEnd }
    })
    const newTotalText = updatedFragments.map(f => normalizeText(f.text)).join('')
    if (oldTotalText === newTotalText && project.audioMode === 'scene') {
      const firstStartTime = activeScene.fragments[0].startTime || 0
      const lastEndTime = activeScene.fragments[activeScene.fragments.length - 1].endTime || 0
      const totalDuration = lastEndTime - firstStartTime
      if (totalDuration > 0) {
        const remapped = recalculateTimingsProportionally(updatedFragments, totalDuration)
        onUpdateProjectSync({
          ...project,
          scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: remapped } : s)),
        })
        return
      }
    }
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)),
    })
  }

  const handleUpdateFragmentBounds = (fragId: string, edge: 'start' | 'end', newTime: number, ripple = true) => {
    if (!activeScene) return
    const updatedFragments = [...activeScene.fragments]
    const idx = updatedFragments.findIndex(f => f.id === fragId)
    if (idx === -1) return
    const safeTime = Math.max(0, Number(newTime.toFixed(3)))
    if (edge === 'start') {
      const maxStart = (updatedFragments[idx].endTime || 1) - 0.1
      const finalStart = Math.min(safeTime, maxStart)
      updatedFragments[idx] = { ...updatedFragments[idx], startTime: finalStart }
      if (idx > 0 && ripple) {
        updatedFragments[idx - 1] = { ...updatedFragments[idx - 1], endTime: finalStart }
      }
    } else {
      const minEnd = (updatedFragments[idx].startTime || 0) + 0.1
      const finalEnd = Math.max(safeTime, minEnd)
      updatedFragments[idx] = { ...updatedFragments[idx], endTime: finalEnd }
      if (idx < updatedFragments.length - 1 && ripple) {
        updatedFragments[idx + 1] = { ...updatedFragments[idx + 1], startTime: finalEnd }
      }
    }
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)),
    })
  }

  const handleNudgeTiming = (fragId: string, type: 'start' | 'end', delta: number) => {
    if (!activeScene) return
    const updatedFragments = [...activeScene.fragments]
    const idx = updatedFragments.findIndex(f => f.id === fragId)
    if (idx === -1) return
    if (type === 'start') {
      const val = Math.max(0, (updatedFragments[idx].startTime || 0) + delta)
      updatedFragments[idx] = { ...updatedFragments[idx], startTime: val }
      if (idx > 0 && updatedFragments[idx - 1].endTime !== undefined) {
        updatedFragments[idx - 1] = { ...updatedFragments[idx - 1], endTime: val }
      }
    } else {
      const val = Math.max(0, (updatedFragments[idx].endTime || 0) + delta)
      updatedFragments[idx] = { ...updatedFragments[idx], endTime: val }
      if (idx < updatedFragments.length - 1 && updatedFragments[idx + 1].startTime !== undefined) {
        updatedFragments[idx + 1] = { ...updatedFragments[idx + 1], startTime: val }
      }
    }
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)),
    })
  }

  const handleSplitFragment = (fragId: string, splitTime: number) => {
    if (!activeScene) return
    const fragIdx = activeScene.fragments.findIndex(f => f.id === fragId)
    if (fragIdx === -1) return
    const target = activeScene.fragments[fragIdx]
    const start = target.startTime ?? 0
    const end = target.endTime ?? start + Math.max(target.text.split(' ').length / 2.5, 1)
    if (splitTime <= start + 0.05 || splitTime >= end - 0.05) return
    const ratio = Math.max(0.05, Math.min(0.95, (splitTime - start) / (end - start)))
    const emotionMatch = target.text.match(/^\[emotion:\s*[^\]]+]\s*/i)
    const emotionTag = emotionMatch ? emotionMatch[0] : ''
    const rawText = emotionMatch ? target.text.slice(emotionMatch[0].length) : target.text
    const words = rawText.trim().split(/\s+/).filter(Boolean)
    const splitWordIdx = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)))
    const fallbackAudio = target.audioFileName || activeScene.fragments.find(f => f.audioFileName)?.audioFileName
    const frag1: SceneFragment = {
      ...target,
      text: (emotionTag + words.slice(0, splitWordIdx).join(' ')).trim(),
      startTime: Number(start.toFixed(3)),
      endTime: Number(splitTime.toFixed(3)),
      audioFileName: fallbackAudio,
      lastAudioHash: undefined,
    }
    const frag2: SceneFragment = {
      id: crypto.randomUUID(),
      visualNote: target.visualNote,
      text: (emotionTag + words.slice(splitWordIdx).join(' ')).trim(),
      startTime: Number(splitTime.toFixed(3)),
      endTime: Number(end.toFixed(3)),
      audioFileName: fallbackAudio,
      bRollFileName: target.bRollFileName,
    }
    const updatedFrags = [...activeScene.fragments]
    updatedFrags.splice(fragIdx, 1, frag1, frag2)
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFrags } : s)),
    })
    setSelectedFragmentId(frag2.id)
    showNotification('Фрагмент разрезан!', 'success')
  }

  const handleDuplicateFragment = (fragId: string) => {
    if (!activeScene) return
    const fragIdx = activeScene.fragments.findIndex(f => f.id === fragId)
    if (fragIdx === -1) return
    const source = activeScene.fragments[fragIdx]
    const dur = Math.max((source.endTime ?? (source.startTime ?? 0) + 3) - (source.startTime ?? 0), 0.5)
    const newStart = source.endTime ?? (source.startTime ?? 0) + dur
    const copy: SceneFragment = {
      ...source,
      id: crypto.randomUUID(),
      startTime: Number(newStart.toFixed(3)),
      endTime: Number((newStart + dur).toFixed(3)),
      audioFileName: undefined,
      lastAudioHash: undefined,
    }
    const updatedFrags = [...activeScene.fragments]
    updatedFrags.splice(fragIdx + 1, 0, copy)
    for (let i = fragIdx + 2; i < updatedFrags.length; i++) {
      const f = updatedFrags[i]
      updatedFrags[i] = {
        ...f,
        startTime: f.startTime != null ? f.startTime + dur : f.startTime,
        endTime: f.endTime != null ? f.endTime + dur : f.endTime,
      }
    }
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFrags } : s)),
    })
    setSelectedFragmentId(copy.id)
    showNotification('Фрагмент продублирован', 'success')
  }

  const handleUpdateFragmentBRoll = (fragId: string, filename: string) => {
    if (!activeScene) return
    const updatedFragments = activeScene.fragments.map(f => (f.id === fragId ? { ...f, bRollFileName: filename } : f))
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)),
    })
  }

  const handleUnlinkFragmentBRoll = (fragId: string) => {
    if (!activeScene) return
    const updatedFragments = activeScene.fragments.map(f => (f.id === fragId ? { ...f, bRollFileName: undefined } : f))
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)),
    })
  }

  const handleReplaceFragmentAudio = (fragId: string, path: string) => {
    if (!activeScene) return
    const updatedFragments = activeScene.fragments.map(f =>
      f.id === fragId ? { ...f, audioFileName: path, lastAudioHash: hashCode(f.text) } : f
    )
    onUpdateProjectSync({
      ...project,
      scenes: project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s)),
    })
  }

  // === SMART B-ROLL APPLIER & NORMALIZER ===
  const handleApplyBRollAdvanced = async (params: BRollApplyParams) => {
    const { scope, sourcePath, targetFragId, fitMode, timingMode, audioMode } = params
    const projectPath = getProjectPath(project)
    const shouldKeepAudio = audioMode === 'broll' || audioMode === 'mix'
    const shouldExtractAudio = audioMode === 'broll'

    showNotification('Нормализация B-Roll под разрешение проекта...', 'info')

    try {
      if (scope === 'fragment' && targetFragId && activeScene) {
        const targetFrag = activeScene.fragments.find(f => f.id === targetFragId)
        if (!targetFrag) return

        const currentDur = Math.max(0.5, (targetFrag.endTime ?? 3.0) - (targetFrag.startTime ?? 0.0))
        const targetDuration = timingMode === 'trim' ? currentDur : params.duration

        const procRes = await fetch(`${API}/api/v1/media/process-broll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_path: projectPath,
            source_path: sourcePath,
            filename_prefix: `broll_${targetFrag.id.slice(0, 6)}`,
            target_format: project.format,
            target_resolution: project.resolution,
            fps: Number(project.montage?.fps) || 30,
            fit_mode: fitMode,
            target_duration: targetDuration,
            loop_if_shorter: timingMode === 'trim',
            keep_audio: shouldKeepAudio,
            extract_audio: shouldExtractAudio
          })
        })
        const procData = await procRes.json()
        if (!procRes.ok || procData.status !== 'ok') throw new Error(procData.detail || 'Processing error')

        let updatedFragments = activeScene.fragments.map(f => {
          if (f.id !== targetFragId) return f
          const updatedFrag: SceneFragment = {
            ...f,
            bRollFileName: procData.filename,
            bRollAudioMode: audioMode,
          }
          if (audioMode === 'broll' && procData.extracted_audio_path) {
            updatedFrag.audioFileName = procData.extracted_audio_path
          }
          return updatedFrag
        })

        if (timingMode === 'ripple') {
          updatedFragments = applyBRollWithRipple(updatedFragments, targetFragId, procData.duration)
        }

        const updatedScenes = recalculateProjectTimecodes(
          project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s))
        )

        onUpdateProjectSync({ ...project, scenes: updatedScenes })
        showNotification('B-Roll применен и тайминги пересчитаны!', 'success')
      } else if (scope === 'scene' && activeScene) {
        const totalSceneDur = Math.max(1.0, ...activeScene.fragments.map(f => f.endTime || 0))
        const procRes = await fetch(`${API}/api/v1/media/process-broll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_path: projectPath,
            source_path: sourcePath,
            filename_prefix: `broll_scene_${activeScene.id.slice(0, 6)}`,
            target_format: project.format,
            target_resolution: project.resolution,
            fps: Number(project.montage?.fps) || 30,
            fit_mode: fitMode,
            target_duration: timingMode === 'trim' ? totalSceneDur : params.duration,
            loop_if_shorter: true,
            keep_audio: shouldKeepAudio
          })
        })
        const procData = await procRes.json()
        if (!procRes.ok || procData.status !== 'ok') throw new Error(procData.detail)

        let updatedFragments: SceneFragment[] = activeScene.fragments.map(f => ({
          ...f,
          bRollFileName: procData.filename,
          bRollAudioMode: audioMode,
        }))

        if (timingMode === 'ripple' && procData.duration) {
          updatedFragments = recalculateTimingsProportionally(updatedFragments, procData.duration)
        }

        const updatedScenes = recalculateProjectTimecodes(
          project.scenes.map(s => (s.id === activeScene.id ? { ...s, fragments: updatedFragments } : s))
        )
        onUpdateProjectSync({ ...project, scenes: updatedScenes })
        showNotification(`B-Roll применен ко всей сцене "${activeScene.title}"!`, 'success')
      } else if (scope === 'project') {
        const procRes = await fetch(`${API}/api/v1/media/process-broll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_path: projectPath,
            source_path: sourcePath,
            filename_prefix: `broll_proj_bg`,
            target_format: project.format,
            target_resolution: project.resolution,
            fps: Number(project.montage?.fps) || 30,
            fit_mode: fitMode,
            loop_if_shorter: true,
            keep_audio: shouldKeepAudio
          })
        })
        const procData = await procRes.json()
        if (!procRes.ok || procData.status !== 'ok') throw new Error(procData.detail)

        const updatedScenes = project.scenes.map(s => ({
          ...s,
          fragments: s.fragments.map(f => ({ ...f, bRollFileName: procData.filename, bRollAudioMode: audioMode }))
        }))

        onUpdateProjectSync({ ...project, scenes: updatedScenes })
        showNotification('B-Roll видеоряд применен ко всему проекту!', 'success')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showNotification(`Ошибка B-Roll: ${msg}`, 'error')
    }
  }

  return {
    selectedFragmentId,
    setSelectedFragmentId,
    handleFragDragStart,
    handleFragDrop,
    handleAddFragment,
    handleDeleteFragment,
    handleFragmentTextChange,
    handleUpdateFragmentBounds,
    handleNudgeTiming,
    handleSplitFragment,
    handleDuplicateFragment,
    handleUpdateFragmentBRoll,
    handleUnlinkFragmentBRoll,
    handleReplaceFragmentAudio,
    handleApplyBRollAdvanced,
  }
}
