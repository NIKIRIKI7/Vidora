import type { Scene, ProjectSettings, SceneFragment, FPS } from '../model/types'
import type { AppColors } from '@shared/config'

const MEDIA_EXT = '(?:mp4|webm|mov|mkv|avi|m4v|png|jpg|jpeg|webp)'
// Пути могут содержать пробелы и обратные слэши; заканчиваются на .ext
const WIN_ABS = `[a-zA-Z]:[\\\\/][^|\\n\\r*]+?\\.${MEDIA_EXT}`
const UNIX_ABS = `/(?:Users|home|Volumes|var|tmp|mnt|media|Applications|data)[^|\\n\\r*]*?\\.${MEDIA_EXT}`
const REL_PATH = `(?:assets/|public/|\\./)[^|\\n\\r*]+?\\.${MEDIA_EXT}`
const URL_PATH = `https?:\\/\\/[^\\s|,;>)]+`
const COMMENT_PATH = `(?:${WIN_ABS})|(?:${UNIX_ABS})|(?:${REL_PATH})`

// Похоже ли на медиа-путь: имеет расширение и явный корень ИЛИ имя без пробелов.
const isPathish = (s: string): boolean => {
  const t = s.trim()
  return (
    new RegExp(`\\.${MEDIA_EXT}$`, 'i').test(t) &&
    (/^(?:https?:|assets\/|public\/|\.\/|[a-zA-Z]:[\\/]|\/(?:Users|home|Volumes|var|tmp|mnt|media|Applications|data))/.test(t) || !t.includes(' '))
  )
}

interface ExtractedBRoll {
  cleanNote: string
  bRollPath?: string
}

// Вытаскивает путь B-Roll из визуальной ремарки и возвращает чистый текст ремарки.
// Поддерживаются: B-roll: path | описание, описание -> path, [описание](path), просто path.
// Пути могут быть полными: C:\Users\...\clip.mp4, /Users/.../clip.webm, assets/..., https://...
export const extractBRollFromVisualNote = (rawNote: string): ExtractedBRoll => {
  if (!rawNote) return { cleanNote: '' }
  let note = rawNote.trim()
  let bRollPath: string | undefined

  // 1. Markdown-ссылка: [Описание](C:\Videos\clip.mp4)
  const mdLink = note.match(/\[([^\]]*)\]\(([^)]+)\)/)
  if (mdLink && isPathish(mdLink[2])) {
    bRollPath = mdLink[2].trim()
    note = note.replace(mdLink[0], mdLink[1] || '').trim()
  }

  // 2. Префикс "B-roll: <path> [| описание]"
  if (!bRollPath) {
    const prefix = note.match(new RegExp(`^(?:B-roll|Футаж|Footage|Видео)\\s*:\\s*([^|\\n\\r]+?\\.${MEDIA_EXT})(?:\\s*\\|\\s*([\\s\\S]*))?$`, 'i'))
    if (prefix) {
      bRollPath = prefix[1].trim()
      note = prefix[2] ? prefix[2].trim() : ''
    }
  }

  // 3. Хвостовая стрелка/пайп: "описание -> C:\...\clip.mp4"
  if (!bRollPath) {
    const tail = note.match(new RegExp(`(?:->|\\u2192|\\|)\\s*([^\\n\\r]+?\\.${MEDIA_EXT})\\s*$`, 'i'))
    if (tail) {
      bRollPath = tail[1].trim()
      note = note.slice(0, tail.index).replace(/[->|\u2192\s]+$/, '').trim()
    }
  }

  // 4. Вся ремарка — это путь
  if (!bRollPath) {
    const whole = note.match(new RegExp(`^([^|\\n\\r]+?\\.${MEDIA_EXT})$`, 'i'))
    if (whole && isPathish(whole[1])) {
      bRollPath = whole[1].trim()
      note = ''
    }
  }

  // 5. Путь внутри ремарки при упоминании b-roll/футажа/видео
  if (!bRollPath && /b-roll|футаж|footage|видео/i.test(note)) {
    const found = note.match(new RegExp(`(?:${COMMENT_PATH})|(?:${URL_PATH})`, 'i'))
    if (found) bRollPath = found[0].trim()
  }

  if (bRollPath) {
    note = note.replace(/^(?:B-roll|Футаж|Footage|Видео)\s*:\s*/i, '').trim()
    bRollPath = bRollPath.replace(/^["']|["']$/g, '').replace(/^\.\//, '').trim()
  }

  return {
    cleanNote: note.replace(/\s+/g, ' ').trim() || 'B-roll',
    bRollPath,
  }
}

// Мапит относительный путь b-roll (как в сценарии) на путь для staticFile() в Remotion.
// public/foo.mp4 -> assets/foo.mp4 (проектные ассеты линкуются в public/assets)
// foo.mp4 -> assets/b-roll/foo.mp4 (короткое имя по умолчанию в папке b-roll)
export const toStaticFilePath = (bRollFileName: string): string => {
  if (!bRollFileName) return ''
  const p = bRollFileName.trim().replace(/^\.\//, '')
  if (p.startsWith('assets/')) return p
  if (p.startsWith('public/')) return `assets/${p.slice('public/'.length)}`
  if (p.includes('/')) return `assets/${p}`
  return `assets/b-roll/${p}`
}

const parseMarkdownCore = (rawContent: string): SceneFragment[] => {
  const fragments: SceneFragment[] = []

  // Выдёргиваем b-roll из HTML-комментариев и вычищаем комментарии из текста (они не должны попадать в озвучку)
  const bRollComments: { path: string; fragNumbers: number[] }[] = []
  const cleanContent = rawContent.replace(/<!--[\s\S]*?-->/g, comment => {
    const mediaMatch = comment.match(new RegExp(`(?:${COMMENT_PATH})|(?:${URL_PATH})`, 'i'))
    if (mediaMatch && /b-roll/i.test(comment)) {
      const fragNumbers: number[] = []
      const numRe = /фрагмент\s*([\d\s\-–,]+)/gi
      let numMatch
      while ((numMatch = numRe.exec(comment)) !== null) {
        numMatch[1].split(/[^\d]+/).forEach(n => {
          if (n) fragNumbers.push(parseInt(n, 10))
        })
      }
      bRollComments.push({ path: mediaMatch[0].replace(/^\.\//, '').trim(), fragNumbers })
    }
    return ''
  })

  // Разбиваем контент по визуальным ремаркам вида *(...)*
  const fragmentRegex = /\*\(([\s\S]*?)\)\*/g
  let lastIndex = 0
  let match

  while ((match = fragmentRegex.exec(cleanContent)) !== null) {
    // Текст перед найденной ремаркой принадлежит ПРЕДЫДУЩЕМУ фрагменту
    const textBefore = cleanContent.slice(lastIndex, match.index).trim()
    if (textBefore) {
      if (fragments.length > 0) {
        fragments[fragments.length - 1].text += (fragments[fragments.length - 1].text ? ' ' : '') + textBefore.replace(/\n/g, ' ')
      } else {
        // Если текст есть до первой ремарки
        fragments.push({
          id: crypto.randomUUID(),
          visualNote: 'A-roll: Без ремарок',
          text: textBefore.replace(/\n/g, ' '),
          startTime: null,
          endTime: null,
        })
      }
    }

    // Добавляем новый фрагмент с ремаркой (текст заполнится на следующей итерации или в конце)
    const { cleanNote, bRollPath } = extractBRollFromVisualNote(match[1])
    fragments.push({
      id: crypto.randomUUID(),
      visualNote: cleanNote,
      bRollFileName: bRollPath,
      text: '',
      startTime: null,
      endTime: null,
    })
    lastIndex = fragmentRegex.lastIndex
  }

  // Забираем весь оставшийся текст после последней ремарки
  const remainingText = cleanContent.slice(lastIndex).trim()
  if (remainingText) {
    if (fragments.length > 0) {
      fragments[fragments.length - 1].text += (fragments[fragments.length - 1].text ? ' ' : '') + remainingText.replace(/\n/g, ' ')
    } else {
      // Если ремарок вообще не было
      fragments.push({
        id: crypto.randomUUID(),
        visualNote: 'A-roll: Без ремарок',
        text: remainingText.replace(/\n/g, ' '),
        startTime: null,
        endTime: null,
      })
    }
  }

  // Назначаем b-roll из комментариев фрагментам (по номеру "фрагмент N" или по порядку)
  const fragmentsWithoutBRoll = fragments.filter(f => !f.bRollFileName)
  let commentIdx = 0
  bRollComments.forEach(({ path, fragNumbers }) => {
    const targets = fragNumbers.length > 0
      ? fragNumbers.map(n => fragments[n - 1]).filter((f): f is SceneFragment => Boolean(f) && !f.bRollFileName)
      : []
    if (targets.length === 0 && commentIdx < fragmentsWithoutBRoll.length) {
      targets.push(fragmentsWithoutBRoll[commentIdx])
      commentIdx++
    }
    targets.forEach(frag => {
      frag.bRollFileName = path
    })
  })

  // Финальная зачистка пробелов
  fragments.forEach(f => {
    f.text = f.text.trim()
  })

  return fragments
}

const formatFragmentLine = (f: SceneFragment): string => {
  let note = f.visualNote || ''
  if (f.bRollFileName) {
    if (!note.includes(f.bRollFileName)) {
      const base = note.replace(/^B-roll:\s*/i, '').trim()
      note = base && base !== 'A-roll: Без ремарок' && base !== 'B-roll'
        ? `B-roll: ${f.bRollFileName} | ${base}`
        : `B-roll: ${f.bRollFileName}`
    }
  }
  const remark = note && note !== 'A-roll: Без ремарок' ? `*(${note})* ` : ''
  return `${remark}${f.text}`
}

export const parseMarkdownFull = (markdown: string): Partial<ProjectSettings> => {
  const result: Partial<ProjectSettings> = {
    metadata: { title: '', description: '', tags: [] },
    montage: {
      fps: '30',
      animationStyle: 'screencast',
      transitions: [],
      colors: {
        primary: '#ddb7ff', secondary: '#4fdbc8', background: '#0b1326',
        surface: '#171f33', accent: '#ffb4ab', text: '#dae2fd',
      },
      typography: {
        heading: 'Inter',
        body: 'Geist'
      }
    },
    scenes: [],
  }

  const yamlMatch = markdown.match(/^---\n([\s\S]+?)\n---/)
  if (yamlMatch) {
    const yamlStr = yamlMatch[1]
    const titleMatch = yamlStr.match(/title:\s*"([^"]+)"/)
    if (titleMatch) result.metadata!.title = titleMatch[1]

    const descMatch = yamlStr.match(/description:\s*"([^"]+)"/)
    if (descMatch) result.metadata!.description = descMatch[1]

    const tagsMatch = yamlStr.match(/tags:\s*\[(.*?)\]/)
    if (tagsMatch) result.metadata!.tags = tagsMatch[1].split(',').map(t => t.trim())

    const transMatch = yamlStr.match(/transitions:\s*\[(.*?)\]/)
    if (transMatch) result.montage!.transitions = transMatch[1].split(',').map(t => t.trim())

    const styleMatch = yamlStr.match(/animation_style:\s*([^\n]+)/)
    if (styleMatch) result.montage!.animationStyle = styleMatch[1].trim()

    const fpsMatch = yamlStr.match(/fps:\s*(\d+)/)
    if (fpsMatch) result.montage!.fps = fpsMatch[1] as FPS
      
    const use3dMatch = yamlStr.match(/use_3d:\s*(true|false)/)
    if (use3dMatch) result.use3D = use3dMatch[1] === 'true'

    const extractColor = (key: keyof AppColors) => {
      const k = String(key)
      const match = yamlStr.match(new RegExp(`${k}:\\s*"([^"]+)"`))
      if (match) (result.montage!.colors as unknown as Record<string, string>)[k] = match[1]
    }
    const colorKeys: (keyof AppColors)[] = ['primary', 'secondary', 'background', 'surface', 'accent', 'text']
    colorKeys.forEach(k => extractColor(k))
  }

  const bodyText = markdown.replace(/^---\n[\s\S]+?\n---/, '')
  const sceneRegex = /\[(.*?)\]\s*\(([\d:.\s-]+)\)([\s\S]*?)(?=\n[#\s]*\[.*\]\s*\([\d:.\s-]+\)|$)/g
  let sceneMatch
  const scenes: Scene[] = []

  while ((sceneMatch = sceneRegex.exec(bodyText)) !== null) {
    const title = sceneMatch[1].trim()
    const timecode = sceneMatch[2].trim()
    const rawContent = sceneMatch[3].trim()

    const fragments = parseMarkdownCore(rawContent)

    scenes.push({ id: crypto.randomUUID(), title, timecode, fragments })
  }

  result.scenes = scenes
  return result
}

export const serializeProjectToMarkdown = (project: ProjectSettings): string => {
  const { metadata, montage, scenes } = project

  const yaml = [
    '---',
    `title: "${metadata.title || project.name}"`,
    `description: "${metadata.description || ''}"`,
    `tags: [${(metadata.tags || []).join(', ')}]`,
    `use_3d: ${project.use3D ? 'true' : 'false'}`,
    `animation_style: ${montage.animationStyle || 'screencast'}`,
    `fps: ${montage.fps || 30}`,
    `primary: "${montage.colors?.primary || '#ddb7ff'}"`,
    `secondary: "${montage.colors?.secondary || '#4fdbc8'}"`,
    `background: "${montage.colors?.background || '#0b1326'}"`,
    `surface: "${montage.colors?.surface || '#171f33'}"`,
    `accent: "${montage.colors?.accent || '#ffb4ab'}"`,
    `text: "${montage.colors?.text || '#dae2fd'}"`,
    '---',
    ''
  ].join('\n')

  const body = scenes.map(s => {
    const header = `[${s.title}] (${s.timecode || '00:00:00'})`
    const frags = s.fragments.map(formatFragmentLine).join('\n\n')
    return `${header}\n${frags}`
  }).join('\n\n')

  return `${yaml}\n${body}`
}

export const serializeSceneToMarkdown = (s: Scene): string => {
  const header = `[${s.title}] (${s.timecode || '00:00:00'})`
  const frags = s.fragments.map(formatFragmentLine).join('\n\n')
  return `${header}\n${frags}`
}

export const parseSceneMarkdown = (md: string): Omit<Scene, 'id'> | null => {
  const match = /\[(.*?)\]\s*\(([\d:.\s-]+)\)([\s\S]*)/.exec(md.trim())
  if (!match) return null

  const fragments = parseMarkdownCore(match[3].trim())

  return { title: match[1].trim(), timecode: match[2].trim(), fragments }
}
