import type React from 'react'
import type { ProjectSettings } from '@entities/project'
import { Button, FieldGroup, Input, Modal } from '@shared/ui'
import { Trash2, Upload } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  project: ProjectSettings
  newVoiceName: string
  newVoiceText: string
  newVoiceTags: string
  newVoiceAudioPath: string | null
  refVoiceInputRef: React.RefObject<HTMLInputElement | null>
  onChangeName: (v: string) => void
  onChangeText: (v: string) => void
  onChangeTags: (v: string) => void
  onUploadRefVoiceAudio: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSaveCustomVoice: () => void
  onDeleteCustomVoice: (id: string) => void
}

export const VoiceboxModal = ({
  isOpen,
  onClose,
  project,
  newVoiceName,
  newVoiceText,
  newVoiceTags,
  newVoiceAudioPath,
  refVoiceInputRef,
  onChangeName,
  onChangeText,
  onChangeTags,
  onUploadRefVoiceAudio,
  onSaveCustomVoice,
  onDeleteCustomVoice,
}: Props) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Voicebox — Клонирование голоса">
    <div className="flex flex-col gap-5 w-full pb-4">
      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-label uppercase text-primary">Добавить новый голос</h4>

        <FieldGroup label="Имя диктора / Модели">
          <Input
            value={newVoiceName}
            onChange={e => onChangeName(e.target.value)}
            placeholder="Например: Артем (Информационный)"
          />
        </FieldGroup>

        <FieldGroup label="Аудио референс (.wav/.mp3)">
          <input
            type="file"
            ref={refVoiceInputRef}
            className="hidden"
            accept="audio/*"
            onChange={onUploadRefVoiceAudio}
          />
          <Button variant="dashed" icon={Upload} onClick={() => refVoiceInputRef.current?.click()}>
            {newVoiceAudioPath ? 'Заменить референс' : 'Загрузить аудиофайл'}
          </Button>
          {newVoiceAudioPath && <span className="text-xs text-secondary font-mono truncate">{newVoiceAudioPath}</span>}
        </FieldGroup>

        <FieldGroup label="Текст референса (опционально)">
          <Input
            value={newVoiceText}
            onChange={e => onChangeText(e.target.value)}
            placeholder="Текст, произнесенный в референсе..."
          />
        </FieldGroup>

        <FieldGroup label="Теги (через запятую)">
          <Input
            value={newVoiceTags}
            onChange={e => onChangeTags(e.target.value)}
            placeholder="мужской, глубокий, рус"
          />
        </FieldGroup>

        <Button variant="primary" onClick={onSaveCustomVoice} className="mt-2">
          Сохранить голос
        </Button>
      </div>

      {project.customVoices && project.customVoices.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
          <h4 className="text-xs font-label uppercase text-on-surface-variant">Сохранённые голоса</h4>
          {project.customVoices.map(v => (
            <div
              key={v.id}
              className="flex justify-between items-center p-2 rounded-lg bg-surface-container-lowest/50 border border-white/5"
            >
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-on-surface">{v.name}</span>
                <span className="text-xxs text-on-surface-variant/60">{v.tags?.join(', ')}</span>
              </div>
              <button className="text-error hover:text-error/80 p-1" onClick={() => onDeleteCustomVoice(v.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  </Modal>
)
