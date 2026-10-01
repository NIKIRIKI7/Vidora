type VoiceEngineType = 'CloudOpenAi' | 'CloudMiniMax' | 'LocalTts'

// Префиксы speaker_id, которые бэкенд создаёт автоматически.
//   des_*          — Voice Design, синтез только LocalTts (OmniVoice)
//   clone_local_*  — локальное клонирование, синтез только LocalTts
//   clone_mm_*     — облачное клонирование MiniMax
const LOCAL_SPEAKER_PREFIXES = ['des_', 'clone_local_', 'local_tts_'] as const
const MINIMAX_SPEAKER_PREFIXES = ['clone_mm_'] as const

const MINIMAX_BUILTIN_IDS = new Set(['male-qn-qingse', 'qingse', 'minimax'])
const OPENAI_BUILTIN_IDS = new Set(['alloy', 'echo', 'shimmer'])

/**
 * Приводит id диктора и строку каталога моделей к чистому VoiceEngineType,
 * который парсит C# JsonStringEnumConverter. Каталог отдаёт составные id
 * (например "minimax/speech-2.8-hd"), из-за которых .NET отвечает 400.
 *
 * Порядок важен: сначала разбираем префиксы speaker_id — это источник правды
 * на бэкенде. Раньше проверка шла по `includes` и молча промахивалась мимо
 * `des_*`, из-за чего фронт слал CloudMiniMax для голоса OmniVoice.
 */
const resolveCleanVoiceEngine = (
  speakerId?: string | null,
  rawEngine?: string | null
): VoiceEngineType => {
  const speaker = (speakerId || '').toLowerCase().trim()

  // 1. Speaker_id — самый надёжный сигнал, источник правды на бэкенде.
  if (LOCAL_SPEAKER_PREFIXES.some((p) => speaker.startsWith(p))) return 'LocalTts'
  if (MINIMAX_SPEAKER_PREFIXES.some((p) => speaker.startsWith(p))) return 'CloudMiniMax'
  if (MINIMAX_BUILTIN_IDS.has(speaker)) return 'CloudMiniMax'
  if (OPENAI_BUILTIN_IDS.has(speaker)) return 'CloudOpenAi'

  // 2. Явный провайдер-префикс от строки движка (формат "provider/model").
  const engine = (rawEngine || '').toLowerCase().trim()
  if (engine.startsWith('minimax/')) return 'CloudMiniMax'
  if (engine.startsWith('openai/') || engine.startsWith('openai:')) return 'CloudOpenAi'

  // 3. Мягкие подсказки внутри строки.
  if (engine.includes('minimax')) return 'CloudMiniMax'
  if (engine.includes('openai') || engine.includes('tts-1')) return 'CloudOpenAi'
  if (engine.includes('omnivoice') || engine.includes('omni_voice') || engine.includes('local')) return 'LocalTts'

  // 4. Fallback — локальный TTS: не требует API-ключей и доступен всегда.
  return 'LocalTts'
}

export { resolveCleanVoiceEngine, type VoiceEngineType }