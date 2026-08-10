import type { Scene, ProjectSettings, SceneFragment, FPS } from '../model/types'
import type { AppColors } from '@shared/config'

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
  const sceneRegex = /\[(.*?)\]\s*\((.*?)\)([\s\S]*?)(?=\[|$)/g
  let sceneMatch

  const scenes: Scene[] = []

  while ((sceneMatch = sceneRegex.exec(bodyText)) !== null) {
    const title = sceneMatch[1].trim()
    const timecode = sceneMatch[2].trim()
    const rawContent = sceneMatch[3].trim()

    const fragmentRegex = /\*\((.*?)\)\*\s*([^*[]+)/g
    const fragments: SceneFragment[] = []
    let fragMatch

    while ((fragMatch = fragmentRegex.exec(rawContent)) !== null) {
      fragments.push({
        id: crypto.randomUUID(),
        visualNote: fragMatch[1].trim(),
        text: fragMatch[2].trim().replace(/\n/g, ' '),
        startTime: null,
        endTime: null,
      })
    }

    if (fragments.length === 0 && rawContent) {
      fragments.push({
        id: crypto.randomUUID(),
        visualNote: 'A-roll: Без ремарок',
        text: rawContent.trim()
      })
    }

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
    const frags = s.fragments.map(f => {
      if (f.visualNote) {
        return `*(${f.visualNote})* ${f.text}`
      }
      return f.text
    }).join('\n')
    return `${header}\n${frags}`
  }).join('\n\n')

  return `${yaml}\n${body}`
}

export const serializeSceneToMarkdown = (s: Scene): string => {
  const header = `[${s.title}] (${s.timecode || '00:00:00'})`
  const frags = s.fragments.map(f => f.visualNote ? `*(${f.visualNote})* ${f.text}` : f.text).join('\n')
  return `${header}\n${frags}`
}

export const parseSceneMarkdown = (md: string): Omit<Scene, 'id'> | null => {
  const match = /\[(.*?)\]\s*\((.*?)\)([\s\S]*)/.exec(md.trim())
  if (!match) return null
  const fragments: SceneFragment[] = []
  const fragmentRegex = /\*\((.*?)\)\*\s*([^*[]+)/g
  let fragMatch
  while ((fragMatch = fragmentRegex.exec(match[3].trim())) !== null) {
    fragments.push({ id: crypto.randomUUID(), visualNote: fragMatch[1].trim(), text: fragMatch[2].trim().replace(/\n/g, ' ') })
  }
  if (fragments.length === 0 && match[3].trim()) fragments.push({ id: crypto.randomUUID(), visualNote: 'A-roll: Без ремарок', text: match[3].trim() })
  return { title: match[1].trim(), timecode: match[2].trim(), fragments }
}
