import type { RefObject } from 'react'
import { Cloud, FileAudio, Server, Upload } from 'lucide-react'
import { Button, Input, OptionCard, Select, Spinner, TextArea } from '@shared/ui'
import type { VoiceEngineInfoDto, VoiceMode } from '@shared/api'

interface VoiceClonePanelProps {
  cloneName: string
  onCloneNameChange: (value: string) => void
  cloneMode: VoiceMode
  onCloneModeChange: (mode: VoiceMode) => void
  cloneEngine: string
  onCloneEngineChange: (value: string) => void
  availableCloneEngines: VoiceEngineInfoDto[]
  engines: VoiceEngineInfoDto[]
  cloneFile: File | null
  onCloneFileChange: (file: File | null) => void
  uploadInputRef: RefObject<HTMLInputElement | null>
  cloneRefText: string
  onCloneRefTextChange: (value: string) => void
  isCloning: boolean
  onCreate: () => void
}

export const VoiceClonePanel = ({
  cloneName,
  onCloneNameChange,
  cloneMode,
  onCloneModeChange,
  cloneEngine,
  onCloneEngineChange,
  availableCloneEngines,
  engines,
  cloneFile,
  onCloneFileChange,
  uploadInputRef,
  cloneRefText,
  onCloneRefTextChange,
  isCloning,
  onCreate,
}: VoiceClonePanelProps) => (
  <div className="bg-surface-container/40 border border-secondary/20 rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
    <div className="border-b border-outline-variant/40 pb-3">
      <div className="flex items-center gap-2">
        <Upload size={16} className="text-secondary" />
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider">
          Клонирование голоса по аудио (Voice Clone)
        </h3>
      </div>
      <p className="text-xs text-on-surface-variant mt-1">
        Создание цифрового клона голоса по короткому аудио-сэмплу (5–15 секунд чистой речи).
      </p>
    </div>

    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <label className="text-xs font-semibold text-on-surface">Название голоса</label>
        <Input
          value={cloneName}
          onChange={(e) => onCloneNameChange(e.target.value)}
          placeholder="Например: Мой студийный микрофон"
          className="text-xs py-2"
        />
      </div>

      {/* Четкий выбор: Локально или Облако */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-on-surface-variant">Среда клонирования</label>
          <div className="grid grid-cols-2 gap-3">
            <OptionCard
              title="Локально (GPU)"
              subtitle="Бесплатно на вашей видеокарте"
              icon={Server}
              isActive={cloneMode === 'local'}
              accent="success"
              onClick={() => onCloneModeChange('local')}
            />
            <OptionCard
              title="В облаке (API)"
              subtitle="Высокоточный облачный клон"
              icon={Cloud}
              isActive={cloneMode === 'cloud'}
              accent="secondary"
              onClick={() => onCloneModeChange('cloud')}
            />
          </div>
        </div>

        {/* Динамический выбор движка, полученного с бэкенда */}
        <div className="space-y-1.5 bg-surface-container-lowest/60 p-3 rounded-xl border border-outline-variant/20">
          <div className="flex items-center justify-between text-xs">
            <label className="font-semibold text-on-surface">Движок клонирования</label>
            <span className="text-xxs font-mono text-secondary">
              {availableCloneEngines.length > 0
                ? `${availableCloneEngines.length} доступно`
                : 'Нет движков'}
            </span>
          </div>
          <Select
            value={cloneEngine}
            onChange={(e) => onCloneEngineChange(e.target.value)}
            className="text-xs py-2 bg-surface-container-lowest"
          >
            {availableCloneEngines.map((eng) => (
              <option key={eng.id} value={eng.id} disabled={!eng.is_available}>
                {eng.name}{' '}
                {!eng.is_available
                  ? `(Недоступен: ${eng.status_message || 'настройте модель'})`
                  : '✓ Готов к работе'}
              </option>
            ))}
          </Select>
          {engines.find((e) => e.id === cloneEngine)?.description && (
            <p className="text-2xs text-on-surface-variant/70 leading-relaxed">
              {engines.find((e) => e.id === cloneEngine)?.description}
            </p>
          )}
        </div>
      </div>

      {/* Выбор файла */}
      <div className="space-y-1">
        <label className="text-xs text-on-surface-variant">
          Аудиофайл образца (.wav / .mp3)
        </label>
        <input
          type="file"
          ref={uploadInputRef}
          accept="audio/*"
          className="hidden"
          onChange={(e) => onCloneFileChange(e.target.files?.[0] ?? null)}
        />
        <Button
          variant="dashed"
          size="sm"
          icon={FileAudio}
          onClick={() => uploadInputRef.current?.click()}
          className="w-full py-4 rounded-xl border-secondary/40 text-secondary hover:text-secondary hover:bg-secondary/10 text-xs font-semibold"
        >
          {cloneFile ? cloneFile.name : 'Выбрать аудиофайл (5–15 сек)'}
        </Button>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-on-surface-variant">
          Текст из аудиофайла (опционально)
        </label>
        <TextArea
          value={cloneRefText}
          onChange={(e) => onCloneRefTextChange(e.target.value)}
          rows={2}
          placeholder="Оставьте пустым или укажите текст, который звучит в файле..."
          className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3 text-xs text-on-surface focus:outline-none focus:border-secondary"
        />
      </div>
    </div>

    <div className="pt-3 border-t border-outline-variant/40 flex justify-end">
      <Button
        variant="primary"
        onClick={onCreate}
        disabled={isCloning || !cloneName.trim() || !cloneFile}
        className="px-6 py-2 text-xs font-bold"
      >
        {isCloning ? <Spinner className="w-3.5 h-3.5 mr-1" /> : null}
        Клонировать голос
      </Button>
    </div>
  </div>
)
