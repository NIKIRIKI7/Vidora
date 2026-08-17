export const API = import.meta.env.VITE_API_URL || 'http://localhost:8355'

export const pad = (num: number) => num.toString().padStart(2, '0')

export const sanitizeFilename = (str: string) => str.trim().replace(/[^a-zA-Z0-9а-яА-Я_\- ]/g, '_')

export const formatTimecode = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export const formatShortTimecode = (sec: number): string => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${pad(s)}`
}

export const parseTcString = (str: string): number | null => {
  if (!str) return null
  const parts = str.trim().split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

export const hashCode = (str: string) => {
  let hash = 0
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return hash.toString()
}
