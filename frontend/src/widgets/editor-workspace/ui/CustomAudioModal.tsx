import { useState, useRef } from 'react'
import { Modal, Button, FieldGroup, Select, Switch } from '@shared/ui'
import { Upload, AudioLines, FileAudio, Layers } from 'lucide-react'
import type { ProjectSettings, Scene } from '@entities/project'

export interface CustomAudioUploadPayload {
  scope: 'fragment' | 'scene' | 'project' | 'all_scenes'
  file: File
  files?: File[]
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
  initialScope?: 'fragment' | 'scene' | 'project' | 'all_scenes'
  onUpload: (params: CustomAudioUploadPayload) => Promise<void>
}

export const CustomAudioModal = ({
  isOpen,
  onClose,
  project,
  activeScene,
  activeFragmentId,
  initialScope = 'scene',
  onUpload,
}: Props) => {
  const [scope, setScope] = useState<'fragment' | 'scene' | 'project' | 'all_scenes'>(initialScope)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [transcribeWithWhisper, setTranscribeWithWhisper] = useState(true)
  const [manualRefText, setManualRefText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isBatch = scope === 'all_scenes'
  const selectedFile = selectedFiles[0]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      setSelectedFiles(Array.from(e.target.files))
    }
  }

  const handleScopeChange = (next: string) => {
    setScope(next as typeof scope)
    setSelectedFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return
    setIsProcessing(true)
    try {
      await onUpload({
        scope,
        file: selectedFile,
        files: selectedFiles,
        targetSceneId: activeScene?.id,
        targetFragmentId: activeFragmentId || activeScene?.fragments[0]?.id,
        transcribeWithWhisper,
        manualRefText,
      })
      onClose()
      setSelectedFiles([])
      setManualRefText('')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🎙️ Загрузка своего аудиофайла" className="max-w-lg">
      <div className="flex flex-col gap-5">
        <FieldGroup label="Масштаб применения аудио">
          <Select value={scope} onChange={e => handleScopeChange(e.target.value)}>
            <option value="fragment">Текущий фрагмент ({activeFragmentId?.slice(0, 6) || 'выбранный'})</option>
            <option value="scene">Вся текущая сцена ({activeScene?.title || 'Сцена'})</option>
            <option value="all_scenes">⭐ Все сцены проекта (пакетная привязка по номерам)</option>
            <option value="project">Весь проект целиком (Единая аудиодорожка)</option>
          </Select>
        </FieldGroup>

        <FieldGroup label={isBatch ? 'Выберите пачку аудиофайлов (.mp3 / .wav / .m4a / .aac)' : 'Выберите аудиофайл (.mp3 / .wav / .m4a / .aac)'}>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="audio/*"
            multiple={isBatch}
            onChange={handleFileChange}
          />
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2.5"
            >
              <Upload size={16} className="mr-2" />
              {selectedFiles.length > 0
                ? (isBatch ? `Выбрано файлов: ${selectedFiles.length}` : selectedFile.name)
                : (isBatch ? 'Выбрать все аудиофайлы' : 'Выбрать аудиофайл')}
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

        {isBatch ? (
          <div className="bg-surface-container-lowest/50 p-4 rounded-xl border border-white/5 flex items-start gap-3">
            <Layers size={18} className="text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-secondary leading-relaxed">
              <p className="font-medium text-on-surface mb-1">{project.scenes.length} сцен в проекте</p>
              <p>
                Файлы привяжутся по номерам в названии:{' '}
                <span className="font-mono text-primary">voice_01.wav</span> → Сцена 1,{' '}
                <span className="font-mono text-primary">voice_02.wav</span> → Сцена 2 и т.д.
                Без номеров — по алфавиту 1 к 1. После загрузки тайминги выровняются через Whisper.
              </p>
            </div>
          </div>
        ) : (
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
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={selectedFiles.length === 0 || isProcessing}
            className="px-6"
          >
            {isProcessing
              ? 'Обработка и выравнивание...'
              : (isBatch
                  ? <><Layers size={16} className="mr-1.5" /> Загрузить и привязать ко всем сценам</>
                  : <><AudioLines size={16} className="mr-1.5" /> Загрузить и выровнять</>)}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
