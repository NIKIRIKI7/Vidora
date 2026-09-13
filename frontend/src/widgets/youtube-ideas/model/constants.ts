import type { VideoResult } from '@entities/project'

export type ResultsTab = 'details' | 'blue_ocean' | 'goldmine' | 'thumbnails'

export interface AgentLog {
  message: string
  status: 'info' | 'success' | 'error' | 'warning'
}

export interface BlueOceanSeed {
  title?: string
  query?: string
  growth_pct?: string
  vps_score?: number
  source_platform?: string
}

export interface NichePreset {
  id: string
  label: string
  enQuery: string
}

export interface SavedFilters {
  searchEngine?: 'auto' | 'ytscrape' | 'api'
  searchMode?: 'trending' | 'competitors'
  videoType?: 'all' | 'long' | 'short'
  language?: string
  channelContext?: string
  daysBack?: number
  minSubs?: number
  maxSubs?: number
  minRatio?: number
  ideasCount?: number
  competitorChannels?: string[]
}

export const NICHE_PRESETS: Record<string, NichePreset[]> = {
  ru: [
    { id: 'custom', label: '✍️ Свой вариант...', enQuery: '' },
    { id: 'IT, Программирование, Нейросети', label: '💻 IT и Программирование', enQuery: 'AI programming software development' },
    { id: 'Кибербезопасность, Хакинг, Инфобез', label: '🔐 Кибербезопасность', enQuery: 'cybersecurity ethical hacking' },
    { id: 'Криптовалюта, Инвестиции, Трейдинг', label: '📈 Крипта и Финансы', enQuery: 'crypto trading investing' },
    { id: 'Здоровье, Фитнес, Питание', label: '🏋️ Здоровье и Фитнес', enQuery: 'fitness health nutrition workout' },
    { id: 'Саморазвитие, Психология, Продуктивность', label: '🧠 Саморазвитие', enQuery: 'self improvement psychology productivity' },
    { id: 'Бизнес, Предпринимательство, Маркетинг', label: '📊 Бизнес и Маркетинг', enQuery: 'business entrepreneurship marketing growth' },
    { id: 'Образование, Наука, Факты', label: '🎓 Образование и Наука', enQuery: 'education science facts learning' },
    { id: 'Кулинария, Рецепты, Лайфхаки', label: '🍳 Кулинария и Лайфхаки', enQuery: 'cooking recipes food hacks' },
    { id: 'Путешествия, Хобби, Лайфстайл', label: '✈️ Путешествия и Лайфстайл', enQuery: 'travel lifestyle hobbies adventure' },
  ],
  en: [
    { id: 'custom', label: '✍️ Custom topic...', enQuery: '' },
    { id: 'AI, Programming, Software Engineering', label: '💻 AI & Programming', enQuery: 'AI, Programming, Software Engineering' },
    { id: 'Cybersecurity, Ethical Hacking, InfoSec', label: '🔐 Cybersecurity & Hacking', enQuery: 'Cybersecurity, Ethical Hacking, InfoSec' },
    { id: 'Crypto, DeFi, Trading Strategies', label: '📈 Crypto & Trading', enQuery: 'Crypto, DeFi, Trading Strategies' },
    { id: 'Health, Fitness, Nutrition, Workout', label: '🏋️ Health & Fitness', enQuery: 'Health, Fitness, Nutrition, Workout' },
    { id: 'Self Improvement, Psychology, Productivity', label: '🧠 Self Improvement', enQuery: 'Self Improvement, Psychology, Productivity' },
    { id: 'Business, Entrepreneurship, Marketing', label: '📊 Business & Marketing', enQuery: 'Business, Entrepreneurship, Marketing' },
    { id: 'Education, Science, Facts, Learning', label: '🎓 Education & Science', enQuery: 'Education, Science, Facts, Learning' },
    { id: 'Cooking, Recipes, Food Hacks', label: '🍳 Cooking & Recipes', enQuery: 'Cooking, Recipes, Food Hacks' },
    { id: 'Travel, Lifestyle, Hobbies, Adventure', label: '✈️ Travel & Lifestyle', enQuery: 'Travel, Lifestyle, Hobbies, Adventure' },
  ],
}

export const DEEP_TREND_SETTINGS_KEY = 'vidora_deeptrend_user_filters'

export const getSavedFilters = (): SavedFilters | null => {
  try {
    const raw = localStorage.getItem(DEEP_TREND_SETTINGS_KEY)
    if (raw) return JSON.parse(raw) as SavedFilters
  } catch (err) {
    console.error('YoutubeIdeasView.getSavedFilters:', err)
  }
  return null
}

export const fmtDuration = (v: VideoResult) => {
  if (v.is_short) return '⚡ SHORT'
  if (!v.duration_sec) return '—'
  return `${Math.floor(v.duration_sec / 60)}:${String(v.duration_sec % 60).padStart(2, '0')}`
}

export const isYoutubeUrl = (url: string) => /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)
