import { toStaticFilePath } from '@entities/project'

// Возвращает JSX-выражение для src у <OffthreadVideo>/<Img> в сгенерированном TSX:
// URL -> прямая ссылка; абсолютный локальный путь -> staticFile("assets/b-roll/<имя>")
// (бэкенд перед рендером копирует внешний файл в public/assets/b-roll);
// relative -> staticFile().
export const resolveBRollVideoSrc = (rawPath: string): string => {
  let p = rawPath.trim().replace(/^["']|["']$/g, '')
  if (p.startsWith('/assets/')) p = p.slice(1)

  if (/^https?:\/\//i.test(p)) return JSON.stringify(p)

  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/')) {
    const filename = p.split(/[\\/]/).pop() || p
    return `staticFile(${JSON.stringify(`assets/b-roll/${filename}`)})`
  }

  return `staticFile(${JSON.stringify(toStaticFilePath(p))})`
}
