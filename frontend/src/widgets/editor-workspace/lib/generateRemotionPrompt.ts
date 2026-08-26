import { useSettingsStore, getActivePrompt, getSkillsForProcess } from '@entities/project'
import type { ProjectSettings, Scene, SceneFragment, VideoFormat, Resolution } from '@entities/project'
import { resolveBRollVideoSrc } from './bRollSrc'

const getDims = (res: Resolution, fmt: VideoFormat) => {
  const map = { '1080p': 1920, '1440p': 2560, '2160p': 3840 }
  const long = map[res]
  const short = long * (9 / 16)
  return fmt === '16:9' ? { width: long, height: short } : { width: short, height: long }
}

const getBaseVars = (project: ProjectSettings) => {
  const { width, height } = getDims(project.resolution, project.format)
  const { colors, fps } = project.montage

  const use3DInstruction = project.use3D ? `
## ⚡ 3D GRAPHICS (R3F) ENABLED & STRICT RULES ⚡
You are allowed to use \`@remotion/three\`, \`@react-three/fiber\`, and \`@react-three/drei\`.
CRITICAL RULES FOR 3D IN REMOTION (PREVENT JITTER):
1. Use \`<ThreeCanvas width={${width}} height={${height}}>\` from \`@remotion/three\`, NOT the standard R3F \`<Canvas>\`.
2. DO NOT use time-dependent Drei components like \`<Float>\` or auto-rotating \`<OrbitControls>\`. They cause severe jitter in Remotion.
3. Animate hovering and rotation MANUALLY using \`useCurrentFrame()\`. Example: \`const floatY = Math.sin(frame / 15) * 0.15;\`
4. NEVER use \`Math.max(0, frame - offset)\` inside \`spring()\`. Pass \`frame - offset\` directly (Remotion returns 0 for negative frames).
5. ALWAYS add \`<ambientLight>\` and directional light, otherwise meshes render black.
6. If using \`<ContactShadows>\`, ALWAYS add \`frames={1}\` to bake the shadow.
7. Place 2D HTML/Tailwind overlays on top of \`ThreeCanvas\` in a separate \`<AbsoluteFill>\` with \`pointer-events-none\`.
` : `
## 3D GRAPHICS FORBIDDEN
Do NOT use three.js, @react-three/fiber, \`@remotion/three\`, or any 3D library. Produce purely 2D CSS/Tailwind animations with Remotion primitives.
`

  return {
    FORMAT: project.format,
    WIDTH: width,
    HEIGHT: height,
    FPS: fps,
    COLORS: JSON.stringify(colors),
    USE_3D_INSTRUCTION: use3DInstruction,
  }
}

const replaceVars = (tpl: string, vars: Record<string, string | number>) => {
  let res = tpl
  for (const [k, v] of Object.entries(vars)) {
    res = res.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
  }
  return res
}

// ponytail: uses max endTime from Whisper sync for duration; falls back to heuristic
const getSceneDuration = (fragments: SceneFragment[]): number => {
  const syncedEnds = fragments.map(f => f.endTime).filter((e): e is number => typeof e === 'number' && e > 0)
  if (syncedEnds.length > 0) return Math.max(...syncedEnds)
  return fragments.reduce((acc, f) => acc + Math.max(f.text.split(' ').length / 2.5, 1.0), 0)
}

const formatFragmentsForPrompt = (fragments: SceneFragment[], fps: number): string => {
  let runningStart = 0

  return fragments.map((frag, i) => {
    const startSec = frag.startTime ?? runningStart
    const fallbackDur = Math.max((frag.text || '').split(' ').length / 2.5, 1.0)
    const endSec = frag.endTime ?? startSec + fallbackDur
    runningStart = endSec

    const startFrame = Math.round(startSec * fps)
    const durationFrames = Math.max(1, Math.round((endSec - startSec) * fps))

    if (frag.bRollFileName) {
      const bRollSrc = resolveBRollVideoSrc(frag.bRollFileName)
      return `- Фрагмент ${i + 1} [ТИП: B-ROLL ВИДЕОРЯД]:
  Тайминг: ${startSec.toFixed(2)}с - ${endSec.toFixed(2)}с (Sequence from={${startFrame}} durationInFrames={${durationFrames}})
  Видеофайл: <OffthreadVideo src={${bRollSrc}} />
  Ремарка: ${frag.visualNote || 'Фоновое видео'}
  Суфлер: "${frag.text || ''}"
  Правило: в этом интервале рендерите <OffthreadVideo src={${bRollSrc}} /> на весь кадр (object-cover), поверх - легкое затемнение и аккуратный субтитр. Сложную фоновую графику не добавлять.`
    }

    return `- Фрагмент ${i + 1} [ТИП: АНИМАЦИЯ / МОУШН-ДИЗАЙН]:
  Тайминг: ${startSec.toFixed(2)}с - ${endSec.toFixed(2)}с (Sequence from={${startFrame}} durationInFrames={${durationFrames}})
  Ремарка: ${frag.visualNote}
  Суфлер: "${frag.text || ''}"
  Правило: полная кинетическая 2D-анимация по ремарке (карточки, схемы, типографика) строго внутри этого интервала.`
  }).join('\n\n')
}

export const generateRemotionPrompt = (project: ProjectSettings, scene: Scene): string => {
  const globalPrompts = useSettingsStore.getState().globalPrompts
  const durationSec = getSceneDuration(scene.fragments)
  const fps = Number(project.montage.fps) || 30

  const bRollRules = scene.fragments.some(f => Boolean(f.bRollFileName))
    ? `

## 🎞️ ПРАВИЛА РЕНДЕРА B-ROLL ВИДЕО:
В этой сцене есть фрагменты с видеофайлом B-Roll. В их интервалах рендерится реальный видеоряд, а не 2D-графика.
1. Импортируйте видео-компоненты: \`import { OffthreadVideo, staticFile } from 'remotion';\`.
2. Каждый фрагмент [ТИП: B-ROLL ВИДЕОРЯД] верстайте строго так (точные from/durationInFrames и имя файла указаны в блоке фрагмента):
   \`\`\`tsx
   <Sequence from={...} durationInFrames={...}>
     <OffthreadVideo src={staticFile("assets/b-roll/ИМЯ_ФАЙЛА")} className="w-full h-full object-cover" />
     <AbsoluteFill className="bg-black/30" />
     <AbsoluteFill className="flex items-end p-12">
       <p className="text-4xl font-black text-white drop-shadow-md">ТЕКСТ СУФЛЕРА</p>
     </AbsoluteFill>
   </Sequence>
   \`\`\`
3. Фрагменты [ТИП: АНИМАЦИЯ / МОУШН-ДИЗАЙН] рендерите программной графикой по ремарке.
4. Не накладывайте тяжелую графику поверх видео - только затемнение и читаемые субтитры.
5. Соблюдайте тайминги из блоков фрагментов без наложений и пустот между ними.`
    : ''

  const promptBody = replaceVars(project.promptOverrides?.scene || getActivePrompt(globalPrompts.scene), {
    ...getBaseVars(project),
    DURATION: durationSec.toFixed(1),
    DURATION_FRAMES: Math.max(Math.ceil(durationSec * fps), 30),
    SCENE_TITLE: scene.title,
    SCENE_TIMECODE: scene.timecode,
    FRAGMENTS: formatFragmentsForPrompt(scene.fragments, fps),
  })

  const audioOffsetInstruction = scene.audioOffset && scene.audioOffset > 0
    ? `\n\n> ВАЖНО ДЛЯ МОНТАЖА: В этой сцене вы должны использовать <Audio src={...} startFrom={Math.round(${scene.audioOffset} * fps)} /> потому что аудиофайл является общим для всего проекта, и эта сцена начинается на ${scene.audioOffset} секунде общего файла.`
    : '';

  return promptBody + bRollRules + audioOffsetInstruction + getSkillsForProcess('scene');
}

export const generateFragmentPrompt = (project: ProjectSettings, scene: Scene, fragment: SceneFragment): string => {
  const globalPrompts = useSettingsStore.getState().globalPrompts
  const fps = Number(project.montage.fps) || 30
  const durationSec = Math.max((fragment.endTime || 5) - (fragment.startTime || 0), 1)

  const isBRoll = Boolean(fragment.bRollFileName)
  const bRollSrc = fragment.bRollFileName ? resolveBRollVideoSrc(fragment.bRollFileName) : ''
  const visualPrompt = isBRoll
    ? `[B-ROLL ВИДЕОРЯД] Вставьте <OffthreadVideo src={${bRollSrc}} className="w-full h-full object-cover" /> на весь кадр, поверх - легкое затемнение и субтитры. Ремарка: ${fragment.visualNote}`
    : `[ГРАФИКА] ${fragment.visualNote}`

  return replaceVars(project.promptOverrides?.fragment || getActivePrompt(globalPrompts.fragment), {
    ...getBaseVars(project),
    DURATION: durationSec.toFixed(1),
    DURATION_FRAMES: Math.max(Math.ceil(durationSec * fps), 30),
    SCENE_TITLE: scene.title,
    VISUAL_NOTE: visualPrompt,
    TEXT: fragment.text || '',
  }) + getSkillsForProcess('fragment')
}

export const generateProjectPrompt = (project: ProjectSettings): string => {
  const globalPrompts = useSettingsStore.getState().globalPrompts

  const scenesList = project.scenes.map((scene, si) => {
    const duration = getSceneDuration(scene.fragments)
    const fragmentsDesc = scene.fragments
      .map((frag, i) => {
        const brollTag = frag.bRollFileName ? ` [B-Roll: ${frag.bRollFileName}]` : ''
        return `- Фрагмент ${i + 1}${brollTag}: "${frag.text || ''}"\n  Визуал: ${frag.visualNote}`
      })
      .join('\n')
    return `### Сцена ${si + 1}: ${scene.title}\nТаймкод: ${scene.timecode} | Длительность: ~${Math.ceil(duration)}с\n${fragmentsDesc}`
  }).join('\n\n')

  return replaceVars(project.promptOverrides?.project || getActivePrompt(globalPrompts.project), {
    ...getBaseVars(project),
    SCENES_LIST: scenesList
  }) + getSkillsForProcess('project')
}
