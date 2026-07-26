import type { Scene, ProjectSettings, SceneFragment, AppColors, AudioMixSettings, FPS } from '../model/types'

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
      },
      audioMix: {
        bgmPath: '',
        bgmVolume: 0.3,
        sidechainThreshold: -18,
        sidechainRatio: 4,
        sidechainAttack: 5,
        sidechainRelease: 50,
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

    const bgmPathMatch = yamlStr.match(/bgm_path:\s*(.+)/)
    if (bgmPathMatch) result.montage!.audioMix.bgmPath = bgmPathMatch[1].trim().replace(/^"|"$/g, '')
    const bgmVolMatch = yamlStr.match(/bgm_volume:\s*([\d.]+)/)
    if (bgmVolMatch) result.montage!.audioMix.bgmVolume = parseFloat(bgmVolMatch[1])
    const scThresholdMatch = yamlStr.match(/sidechain_threshold:\s*(-?[\d.]+)/)
    if (scThresholdMatch) result.montage!.audioMix.sidechainThreshold = parseFloat(scThresholdMatch[1])
    const scRatioMatch = yamlStr.match(/sidechain_ratio:\s*([\d.]+)/)
    if (scRatioMatch) result.montage!.audioMix.sidechainRatio = parseFloat(scRatioMatch[1])
    const scAttackMatch = yamlStr.match(/sidechain_attack:\s*([\d.]+)/)
    if (scAttackMatch) result.montage!.audioMix.sidechainAttack = parseFloat(scAttackMatch[1])
    const scReleaseMatch = yamlStr.match(/sidechain_release:\s*([\d.]+)/)
    if (scReleaseMatch) result.montage!.audioMix.sidechainRelease = parseFloat(scReleaseMatch[1])
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

export const serializeProjectToMarkdown = (project: ProjectSettings): string => {
  const { metadata, montage, scenes } = project
  const yaml = [
    '---',
    `title: "${metadata.title || project.name}"`,
    `description: "${metadata.description || ''}"`,
    `tags: [${(metadata.tags || []).join(', ')}]`,
    `animation_style: ${montage.animationStyle || 'screencast'}`,
    `fps: ${montage.fps || 30}`,
    `primary: "${montage.colors?.primary || '#ddb7ff'}"`,
    `secondary: "${montage.colors?.secondary || '#4fdbc8'}"`,
    `background: "${montage.colors?.background || '#0b1326'}"`,
    `surface: "${montage.colors?.surface || '#171f33'}"`,
    `accent: "${montage.colors?.accent || '#ffb4ab'}"`,
    `text: "${montage.colors?.text || '#dae2fd'}"`,
    ...(montage.audioMix?.bgmPath ? [`bgm_path: "${montage.audioMix.bgmPath}"`] : []),
    ...(montage.audioMix ? [
      `bgm_volume: ${montage.audioMix.bgmVolume ?? 0.3}`,
      `sidechain_threshold: ${montage.audioMix.sidechainThreshold ?? -18}`,
      `sidechain_ratio: ${montage.audioMix.sidechainRatio ?? 4}`,
      `sidechain_attack: ${montage.audioMix.sidechainAttack ?? 5}`,
      `sidechain_release: ${montage.audioMix.sidechainRelease ?? 50}`,
    ] : []),
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
