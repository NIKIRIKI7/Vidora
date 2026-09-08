import { API } from '@shared/lib'
import type {
  AiModelDto,
  SpeakerProfileDto,
  VoiceJobDto,
  DesignSpeakerPayload,
  SynthesizePayload,
  VoiceMode,
  SpeakerSourceType,
  VoiceEngineInfoDto,
} from './types'

const VOICE_BASE = `${API}/api/v1/voice`
const SYSTEM_BASE = `${API}/api/v1/system`

interface RawSpeakerDto {
  id: string
  speaker_id: string
  name: string
  description?: string | null
  source_type: SpeakerSourceType
  engine?: string | null
  language: string
  gender?: string | null
  is_default: boolean
  is_active: boolean
  preview_audio_path?: string | null
}

export const voiceApi = {
  // Получение доступности локальных моделей
  async getAiModels(): Promise<AiModelDto[]> {
    const res = await fetch(`${SYSTEM_BASE}/models`)
    if (!res.ok) throw new Error(`Ошибка загрузки моделей: ${res.statusText}`)
    return res.json()
  },

  // Получение дикторов и маппинг в 'local' | 'cloud'
  async getSpeakerProfiles(): Promise<SpeakerProfileDto[]> {
    const res = await fetch(`${VOICE_BASE}/speakers/profiles`)
    if (!res.ok) throw new Error(`Ошибка загрузки дикторов: ${res.statusText}`)
    const data = await res.json()

    return data.map((d: RawSpeakerDto): SpeakerProfileDto => {
      const isLocal = String(d.engine || '').toLowerCase().startsWith('local')
      return {
        id: d.id,
        speaker_id: d.speaker_id,
        name: d.name,
        description: d.description,
        source_type: d.source_type,
        mode: isLocal ? 'local' : 'cloud',
        backend_engine: d.engine ?? undefined,
        language: d.language,
        gender: d.gender,
        is_default: d.is_default,
        is_active: d.is_active,
        preview_audio_path: d.preview_audio_path,
      }
    })
  },

  // Получение списка доступных движков с бэкенда
  async getEngines(): Promise<VoiceEngineInfoDto[]> {
    const res = await fetch(`${VOICE_BASE}/engines`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  },

  // Синтез речи (engine=null → бэкенд резолвит движок из профиля диктора)
  async synthesize(payload: SynthesizePayload): Promise<VoiceJobDto> {
    const res = await fetch(`${VOICE_BASE}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: payload.text,
        speaker_id: payload.speaker_id,
        engine: payload.backend_engine || null,
        speed: payload.speed ?? 1.0,
        pitch: payload.pitch ?? 1.0,
        guidance_scale: payload.guidance_scale ?? 2.0,
        num_steps: payload.num_steps ?? 24,
        alignment_engine: payload.alignment_engine ?? 'Whisper',
        reference_audio_path: payload.reference_audio_path ?? null,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `Сбой синтеза речи (${res.status})`)
    }

    const result = await res.json()
    const isLocal = String(result.engine || '').toLowerCase().startsWith('local')
    return {
      ...result,
      mode: isLocal ? 'local' : 'cloud',
    }
  },

  // Voice Design (всегда локально на базе OmniVoice)
  async designSpeaker(payload: DesignSpeakerPayload): Promise<SpeakerProfileDto> {
    const res = await fetch(`${VOICE_BASE}/speakers/profiles/design`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Сбой генерации дизайна голоса')
    }
    const d = await res.json()
    return {
      ...d,
      mode: 'local',
      backend_engine: d.engine,
    }
  },

  // Voice Clone (Локально OmniVoice или Облако MiniMax)
  async cloneSpeaker(
    name: string,
    mode: VoiceMode,
    audioFile: File,
    referenceText?: string,
    language?: string,
    engine?: string
  ): Promise<SpeakerProfileDto> {
    const finalEngine = engine || (mode === 'local' ? 'LocalOmniVoice' : 'CloudMiniMax')
    const formData = new FormData()
    formData.append('name', name)
    formData.append('engine', finalEngine)
    formData.append('referenceAudio', audioFile)
    if (referenceText) formData.append('referenceText', referenceText)
    if (language) formData.append('language', language)

    const res = await fetch(`${VOICE_BASE}/speakers/profiles/clone`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Сбой клонирования голоса')
    }
    const d = await res.json()
    return {
      ...d,
      mode,
      backend_engine: d.engine,
    }
  },

  // Очистка VRAM памяти GPU
  async unloadVram(): Promise<void> {
    const res = await fetch(`${VOICE_BASE}/vram/unload`, { method: 'POST' })
    if (!res.ok) throw new Error('Сбой очистки памяти VRAM')
  },

  // Удаление диктора
  async deleteSpeaker(id: string): Promise<void> {
    const res = await fetch(`${VOICE_BASE}/speakers/profiles/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Не удалось удалить профиль диктора')
  },
}