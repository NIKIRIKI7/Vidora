export type VoiceEngineType = 'CloudOpenAi' | 'CloudMiniMax' | 'LocalTts'

const LOCAL_SPEAKER_MARKERS = ['clone_local_', 'local', 'omni']
const MINIMAX_SPEAKER_MARKERS = ['clone_mm_', 'qingse', 'minimax']
const OPENAI_SPEAKER_IDS = new Set(['alloy', 'echo', 'shimmer'])

/**
 * Приводит id диктора и строку каталога моделей к чистому VoiceEngineType,
 * который парсит C# JsonStringEnumConverter. Каталог отдаёт составные id
 * (например "minimax/speech-2.8-hd"), из-за которых .NET отвечает 400.
 * Решение принимается по id диктора, а строка движка — только fallback.
 */
export const resolveCleanVoiceEngine = (
  speakerId?: string | null,
  rawEngine?: string | null
): VoiceEngineType => {
  const speaker = (speakerId || '').toLowerCase()
  if (LOCAL_SPEAKER_MARKERS.some(marker => speaker.includes(marker))) return 'LocalTts'
  if (MINIMAX_SPEAKER_MARKERS.some(marker => speaker.includes(marker))) return 'CloudMiniMax'
  if (OPENAI_SPEAKER_IDS.has(speaker)) return 'CloudOpenAi'

  const engine = (rawEngine || '').toLowerCase()
  if (engine.includes('minimax')) return 'CloudMiniMax'
  if (engine.includes('openai') || engine.includes('tts-1')) return 'CloudOpenAi'
  return 'LocalTts'
}
