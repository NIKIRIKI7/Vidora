/**
 * Переносит медиа-компоненты из `remotion` в `@remotion/media`, потому что
 * `@remotion/web-renderer` выбрасывает `Html5Audio/OffthreadVideo is not
 * supported`. `staticFile` и всё остальное остаются в `remotion`.
 *
 * `OffthreadVideo` переименовывается в `Video` — `@remotion/media` не
 * экспортирует компонент с именем `OffthreadVideo`.
 */
export const rewriteRemotionMediaImports = (code: string): string => {
  const mediaNeeded = new Set<string>()
  let renamedOffthreadVideo = false

  const rewritten = code.replace(
    /import\s*\{([^}]*)\}\s*from\s*(['"])remotion\2;?/g,
    (_match, specifiers: string) => {
      const parts = specifiers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const keep: string[] = []
      for (const raw of parts) {
        const bare = raw.replace(/^type\s+/, '')
        if (bare === 'Audio') {
          mediaNeeded.add('Audio')
        } else if (bare === 'Video') {
          mediaNeeded.add('Video')
        } else if (bare === 'OffthreadVideo') {
          mediaNeeded.add('Video')
          renamedOffthreadVideo = true
        } else {
          keep.push(raw)
        }
      }

      return keep.length > 0 ? `import { ${keep.join(', ')} } from 'remotion';` : ''
    }
  )

  if (mediaNeeded.size === 0) return code

  const withRenames = renamedOffthreadVideo
    ? rewritten.replace(/\bOffthreadVideo\b/g, 'Video')
    : rewritten

  return `import { ${[...mediaNeeded].join(', ')} } from '@remotion/media';\n${withRenames}`
}
