import { useState, useRef, type ChangeEvent } from 'react'
import type { ProjectSettings, CustomVoice } from '@entities/project'
import { API, getProjectPath } from '../lib/helpers'

interface UseVoiceManagementProps {
  project: ProjectSettings
  onUpdateProjectSync: (project: ProjectSettings) => void
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
  setVoiceModel: (model: string) => void
  voiceModel: string
}

export const useVoiceManagement = ({
  project,
  onUpdateProjectSync,
  showNotification,
  setVoiceModel,
  voiceModel,
}: UseVoiceManagementProps) => {
  const [isVoiceboxOpen, setIsVoiceboxOpen] = useState(false)
  const [isCustomAudioModalOpen, setIsCustomAudioModalOpen] = useState(false)
  const [customAudioScope, setCustomAudioScope] = useState<'fragment' | 'scene' | 'project'>('scene')
  const [customAudioTargetFragId, setCustomAudioTargetFragId] = useState<string | null>(null)

  const [newVoiceName, setNewVoiceName] = useState('')
  const [newVoiceText, setNewVoiceText] = useState('')
  const [newVoiceTags, setNewVoiceTags] = useState('')
  const [newVoiceAudioPath, setNewVoiceAudioPath] = useState<string | null>(null)
  const refVoiceInputRef = useRef<HTMLInputElement>(null)

  const handleOpenCustomAudio = (scope: 'fragment' | 'scene' | 'project', fragId?: string) => {
    setCustomAudioScope(scope)
    setCustomAudioTargetFragId(fragId || null)
    setIsCustomAudioModalOpen(true)
  }

  const handleUploadRefVoiceAudio = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('project_path', getProjectPath(project))
    formData.append('folder', 'refs')
    try {
      const res = await fetch(`${API}/api/v1/media/upload`, { method: 'POST', body: formData })
      const data = await res.json()
      if (data.status === 'ok') {
        setNewVoiceAudioPath(data.path)
        showNotification('Референсный файл загружен', 'success')
      }
    } catch {
      showNotification('Ошибка загрузки референса', 'error')
    }
    e.target.value = ''
  }

  const handleSaveCustomVoice = () => {
    if (!newVoiceName || !newVoiceAudioPath) {
      showNotification('Укажите имя и загрузите файл', 'error')
      return
    }
    const newVoice: CustomVoice = {
      id: crypto.randomUUID(),
      name: newVoiceName,
      refAudioPath: newVoiceAudioPath,
      refText: newVoiceText,
      tags: newVoiceTags.split(',').map(t => t.trim()).filter(Boolean),
    }
    onUpdateProjectSync({
      ...project,
      customVoices: [...(project.customVoices || []), newVoice],
    })
    setVoiceModel(newVoice.id)
    setIsVoiceboxOpen(false)
    setNewVoiceName('')
    setNewVoiceText('')
    setNewVoiceTags('')
    setNewVoiceAudioPath(null)
    showNotification(`Голос "${newVoice.name}" сохранен!`, 'success')
  }

  const handleDeleteCustomVoice = (voiceId: string) => {
    onUpdateProjectSync({
      ...project,
      customVoices: (project.customVoices || []).filter(v => v.id !== voiceId),
    })
    if (voiceModel === voiceId) setVoiceModel('aria')
    showNotification('Голос удален', 'info')
  }

  return {
    isVoiceboxOpen,
    setIsVoiceboxOpen,
    isCustomAudioModalOpen,
    setIsCustomAudioModalOpen,
    customAudioScope,
    customAudioTargetFragId,
    newVoiceName,
    setNewVoiceName,
    newVoiceText,
    setNewVoiceText,
    newVoiceTags,
    setNewVoiceTags,
    newVoiceAudioPath,
    refVoiceInputRef,
    handleOpenCustomAudio,
    handleUploadRefVoiceAudio,
    handleSaveCustomVoice,
    handleDeleteCustomVoice,
  }
}
