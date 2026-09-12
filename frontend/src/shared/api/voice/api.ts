import { fetchClient, apiErrorMessage } from '@shared/api'
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
    const { data, error } = await fetchClient.GET('/api/v1/system/models')
    if (error || data === undefined) throw new Error(apiErrorMessage(error))
    return data as AiModelDto[]
  },

  // Получение дикторов и маппинг в 'local' | 'cloud'
  async getSpeakerProfiles(): Promise<SpeakerProfileDto[]> {
    const { data, error } = await fetchClient.GET('/api/v1/voice/speakers/profiles')
    if (error || data === undefined) throw new Error(apiErrorMessage(error))
    const raw = data as unknown as RawSpeakerDto[]

    return raw.map((d: RawSpeakerDto): SpeakerProfileDto => {
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
    const { data, error } = await fetchClient.GET('/api/v1/voice/engines')
    if (error || data === undefined) throw new Error(apiErrorMessage(error))
    return data as VoiceEngineInfoDto[]
  },

  // Синтез речи (engine=null → бэкенд резолвит движок из профиля диктора)
  async synthesize(payload: SynthesizePayload): Promise<VoiceJobDto> {
    const { data, error } = await fetchClient.POST('/api/v1/voice/synthesize', {
      body: {
        text: payload.text,
        speaker_id: payload.speaker_id,
        engine: (payload.backend_engine || null) as never,
        speed: payload.speed ?? 1.0,
        pitch: payload.pitch ?? 1.0,
        guidance_scale: payload.guidance_scale ?? 2.0,
        num_steps: payload.num_steps ?? 24,
        alignment_engine: payload.alignment_engine ?? 'Whisper',
        reference_audio_path: payload.reference_audio_path ?? null,
      },
    })
    if (error || data === undefined) throw new Error(apiErrorMessage(error))

    const result = data as unknown as VoiceJobDto & { engine?: string | null }
    const isLocal = String(result.engine || '').toLowerCase().startsWith('local')
    return {
      ...result,
      mode: isLocal ? 'local' : 'cloud',
    }
  },

  // Voice Design (всегда локально: engine=LocalTts + local_engine_id=omni_voice_v1)
  async designSpeaker(payload: DesignSpeakerPayload): Promise<SpeakerProfileDto> {
    const { data, error } = await fetchClient.POST('/api/v1/voice/speakers/profiles/design', {
      body: payload as never,
    })
    if (error || data === undefined) throw new Error(apiErrorMessage(error))
    const d = data as unknown as RawSpeakerDto
    return {
      ...d,
      mode: 'local',
      backend_engine: d.engine,
    } as SpeakerProfileDto
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
    // Локальный клон: движок-переключатель VoiceEngineType=LocalTts, а конкретная
    // модель воркера уходит отдельным полем localEngineId (id из /engines).
    const localEngineId = mode === 'local' ? engine ?? undefined : undefined
    const finalEngine = mode === 'local' ? 'LocalTts' : 'CloudMiniMax'

    const formData = new FormData()
    formData.append('name', name)
    formData.append('engine', finalEngine)
    if (localEngineId) formData.append('localEngineId', localEngineId)
    formData.append('referenceAudio', audioFile)
    if (referenceText) formData.append('referenceText', referenceText)
    if (language) formData.append('language', language)

    const { data, error } = await fetchClient.POST('/api/v1/voice/speakers/profiles/clone', {
      body: formData as never,
    })
    if (error || data === undefined) throw new Error(apiErrorMessage(error))
    const d = data as unknown as RawSpeakerDto
    return {
      ...d,
      mode,
      backend_engine: d.engine,
    } as SpeakerProfileDto
  },

  // Очистка VRAM памяти GPU
  async unloadVram(): Promise<void> {
    const { error } = await fetchClient.POST('/api/v1/voice/vram/unload')
    if (error) throw new Error(apiErrorMessage(error))
  },

  // Удаление диктора
  async deleteSpeaker(id: string): Promise<void> {
    const { error } = await fetchClient.DELETE('/api/v1/voice/speakers/profiles/{id}', {
      params: { path: { id } },
    })
    if (error) throw new Error(apiErrorMessage(error))
  },
}
