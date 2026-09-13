import { Dices, Sparkles, Wand2 } from 'lucide-react'
import { Button, Input, Select, Spinner, TextArea } from '@shared/ui'
import type { VoiceEngineInfoDto } from '@shared/api'

interface VoiceDesignPanelProps {
  designName: string
  onDesignNameChange: (value: string) => void
  designPrompt: string
  onDesignPromptChange: (value: string) => void
  designEngine: string
  onDesignEngineChange: (value: string) => void
  availableDesignEngines: VoiceEngineInfoDto[]
  engines: VoiceEngineInfoDto[]
  isDesigning: boolean
  onCreate: () => void
  onRandomPrompt: () => void
}

export const VoiceDesignPanel = ({
  designName,
  onDesignNameChange,
  designPrompt,
  onDesignPromptChange,
  designEngine,
  onDesignEngineChange,
  availableDesignEngines,
  engines,
  isDesigning,
  onCreate,
  onRandomPrompt,
}: VoiceDesignPanelProps) => (
  <div className="bg-surface-container/40 border border-secondary/20 rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
    <div className="border-b border-outline-variant/40 pb-3">
      <div className="flex items-center gap-2">
        <Wand2 size={16} className="text-secondary" />
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider">
          Конструктор тембра (Voice Design — Локально)
        </h3>
      </div>
      <p className="text-xs text-on-surface-variant mt-1">
        Сгенерируйте уникальный голос по текстовому описанию без аудиозаписи. Нейросеть OmniVoice
        создаст акустический вектор прямо на видеокарте.
      </p>
    </div>

    <div className="flex flex-col gap-4">
      {/* Динамический выбор движка дизайна с бэкенда */}
      <div className="space-y-1.5 bg-surface-container-lowest/60 p-3.5 rounded-xl border border-outline-variant/20">
        <div className="flex items-center justify-between text-xs">
          <label className="font-semibold text-on-surface">Движок генерации тембра</label>
          <span className="text-xxs font-mono text-secondary">
            {availableDesignEngines.length > 0
              ? `${availableDesignEngines.length} доступно`
              : 'Нет движков'}
          </span>
        </div>
        <Select
          value={designEngine}
          onChange={(e) => onDesignEngineChange(e.target.value)}
          className="text-xs py-2 bg-surface-container-lowest"
        >
          {availableDesignEngines.map((eng) => (
            <option key={eng.id} value={eng.id} disabled={!eng.is_available}>
              {eng.name}{' '}
              {!eng.is_available
                ? `(Недоступен: ${eng.status_message || 'нет весов'})`
                : '✓ Готов'}
            </option>
          ))}
        </Select>
        {engines.find((e) => e.id === designEngine)?.description && (
          <p className="text-2xs text-on-surface-variant/70 leading-relaxed">
            {engines.find((e) => e.id === designEngine)?.description}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-on-surface">Имя нового голоса</label>
        <Input
          value={designName}
          onChange={(e) => onDesignNameChange(e.target.value)}
          placeholder="Например: Дип-нарратор"
          className="text-xs py-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-on-surface">
            Промпт тембра и характера (свободный текст)
          </label>
          <Button variant="link" size="sm" icon={Dices} onClick={onRandomPrompt} className="text-2xs">
            Случайный пресет
          </Button>
        </div>
        <TextArea
          value={designPrompt}
          onChange={(e) => onDesignPromptChange(e.target.value)}
          rows={3}
          className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-3 text-xs text-on-surface focus:outline-none focus:border-secondary font-mono leading-relaxed"
          placeholder="Например: male, low pitch, russian accent"
        />
        <div className="text-xxs text-on-surface-variant/60 leading-relaxed bg-surface-container-lowest/20 p-2 rounded-lg border border-outline-variant/20 mt-1">
          <b>Допустимые теги (через запятую):</b><br />
          <b>Пол/Возраст:</b> male, female, child, teenager, young adult, middle-aged, elderly<br />
          <b>Голос:</b> whisper, very low pitch, low pitch, moderate pitch, high pitch, very high pitch<br />
          <b>Акцент:</b> russian accent, american accent, british accent и др.
        </div>
      </div>
    </div>

    <div className="pt-3 border-t border-outline-variant/40 flex justify-end">
      <Button
        variant="primary"
        onClick={onCreate}
        disabled={isDesigning || !designPrompt.trim()}
        className="px-6 py-2 text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-secondary to-primary text-surface-container-lowest"
      >
        {isDesigning ? <Spinner className="w-3.5 h-3.5" /> : <Sparkles size={14} />}
        Сгенерировать профиль
      </Button>
    </div>
  </div>
)
