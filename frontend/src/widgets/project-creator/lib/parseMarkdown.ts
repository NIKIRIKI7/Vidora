import type { Scene, ProjectSettings, SceneFragment, AppColors, FPS } from '@entities/project'

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

    const extractColor = (key: keyof AppColors) => {
      const match = yamlStr.match(new RegExp(`${key}:\\s*"([^"]+)"`))
      if (match) (result.montage!.colors as unknown as Record<string, string>)[key] = match[1]
    }
    ;(['primary', 'secondary', 'background', 'surface', 'accent', 'text'] as const).forEach(extractColor)
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
        startTime: undefined,
        endTime: undefined,
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
