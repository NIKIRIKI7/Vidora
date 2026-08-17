import { useState, useRef } from 'react'
import { Modal, Button, FieldGroup, Select, Switch } from '@shared/ui'
import { Upload, AudioLines, FileAudio } from 'lucide-react'
import type { ProjectSettings, Scene } from '@entities/project'

export interface CustomAudioUploadPayload {
  scope: 'fragment' | 'scene' | 'project'
  file: File
  targetSceneId?: string
  targetFragmentId?: string
  transcribeWithWhisper: boolean
  manualRefText: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  project: ProjectSettings
  activeScene?: Scene
  activeFragmentId?: string | null
  initialScope?: 'fragment' | 'scene' | 'project'
  onUpload: (params: CustomAudioUploadPayload) => Promise<void>
}

export const CustomAudioModal = ({
  isOpen,
  onClose,
  activeScene,
  activeFragmentId,
  initialScope = 'scene',
  onUpload,
}: Props) => {
  const [scope, setScope] = useState<'fragment' | 'scene' | 'project'>(initialScope)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [transcribeWithWhisper, setTranscribeWithWhisper] = useState(true)
  const [manualRefText, setManualRefText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleSubmit = async () => {
    if (!selectedFile) return
    setIsProcessing(true)
    try {
      await onUpload({
        scope,
        file: selectedFile,
        targetSceneId: activeScene?.id,
        targetFragmentId: activeFragmentId || activeScene?.fragments[0]?.id,
        transcribeWithWhisper,
        manualRefText,
      })
      onClose()
      setSelectedFile(null)
      setManualRefText('')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🎙️ Загрузка своего аудиофайла" className="max-w-lg">
      <div className="flex flex-col gap-5">
        <FieldGroup label="Масштаб применения аудио">
          <Select value={scope} onChange={e => setScope(e.target.value as 'fragment' | 'scene' | 'project')}>
            <option value="fragment">Текущий фрагмент ({activeFragmentId?.slice(0, 6) || 'выбранный'})</option>
            <option value="scene">Вся текущая сцена ({activeScene?.title || 'Сцена'})</option>
            <option value="project">Весь проект целиком (Единая аудиодорожка)</option>
          </Select>
        </FieldGroup>

        <FieldGroup label="Выберите аудиофайл (.mp3 / .wav / .m4a / .aac)">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="audio/*"
            onChange={handleFileChange}
          />
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2.5"
            >
              <Upload size={16} className="mr-2" />
              {selectedFile ? selectedFile.name : 'Выбрать аудиофайл'}
            </Button>
          </div>
          {selectedFile && (
            <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-surface-container-lowest text-xs text-secondary font-mono border border-secondary/20">
              <FileAudio size={14} />
              <span className="truncate">{selectedFile.name}</span>
              <span className="opacity-60 ml-auto">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
            </div>
          )}
        </FieldGroup>

        <div className="bg-surface-container-lowest/50 p-4 rounded-xl border border-white/5 flex flex-col gap-4">
          <Switch
            label="Авто-распознавание текста через Whisper (Transcribe)"
            checked={transcribeWithWhisper}
            onChange={setTranscribeWithWhisper}
          />

          <FieldGroup label="Или эталонный текст (Ref Text / если уже начитан по сценарию)">
            <textarea
              className="w-full bg-background border border-white/10 rounded-lg p-3 text-xs text-on-surface resize-none focus:border-primary/50 outline-none"
              rows={3}
              value={manualRefText}
              onChange={e => setManualRefText(e.target.value)}
              placeholder="Оставьте пустым для авто-сопоставления с текстом текущего сценария или вставьте свой..."
            />
          </FieldGroup>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedFile || isProcessing}
            className="px-6"
          >
            {isProcessing ? 'Обработка и выравнивание...' : <><AudioLines size={16} className="mr-1.5" /> Загрузить и выровнять</>}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
