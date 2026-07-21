import type { ProjectSettings, Scene, SceneFragment, VideoFormat, Resolution } from '@entities/project'

const getDims = (res: Resolution, fmt: VideoFormat) => {
  const map = { '1080p': 1920, '1440p': 2560, '2160p': 3840 }
  const long = map[res]
  const short = long * (9 / 16)
  return fmt === '16:9' ? { width: long, height: short } : { width: short, height: long }
}

export const generateRemotionPrompt = (project: ProjectSettings, scene: Scene): string => {
  const { colors, fps, animationStyle, typography } = project.montage
  const duration = scene.fragments.reduce((acc, f) => acc + ((f.endTime || 5) - (f.startTime || 0)), 0) || 5
  const { width, height } = getDims(project.resolution, project.format)

  return `
# Remotion TSX Video Generator

You are an expert Remotion video developer. Generate production-ready TSX files based on user descriptions.

## Output Requirements
- **Format:** ${project.format} (${width}x${height})
- **Duration:** ${Math.ceil(duration)} seconds
- **FPS:** ${fps}
- **Style:** ${animationStyle}

## Code Structure (MANDATORY)
\`\`\`tsx
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';

export const compositionConfig = {
  id: '${scene.title.replace(/[^a-zA-Z0-9]/g, '') || 'SceneComponent'}',
  durationInSeconds: ${Math.ceil(duration)},
  fps: ${fps},
  width: ${width},
  height: ${height},
};

const COLORS = {
  primary: '${colors.primary}',
  secondary: '${colors.secondary}',
  accent: '${colors.accent}',
  background: '${colors.background}',
  text: '${colors.text}',
  surface: '${colors.surface}',
} as const;

const TYPOGRAPHY = {
  heading: '${typography.heading}, system-ui, sans-serif',
  body: '${typography.body}, system-ui, sans-serif',
} as const;
\`\`\`

## Critical Rules
1. inputRange MUST be strictly monotonically increasing.
2. For reverse mapping, flip outputRange, NOT inputRange.
3. ALWAYS use Easing.bezier() (e.g., Easing.bezier(0.33, 1, 0.68, 1)). NEVER use Easing.out(Easing.cubic).
4. ALL animations must be frame-based. NO useState, NO useEffect.
5. extrapolateLeft: 'clamp' and extrapolateRight: 'clamp' are MANDATORY for all interpolations.

## [ЗАДАЧА СЦЕНЫ]
Название: ${scene.title}
Таймкод: ${scene.timecode}

Сценарий (анимируй этот контент):
${scene.fragments.map((frag, i) => {
  const start = (frag.startTime ?? 0).toFixed(2)
  const end = (frag.endTime ?? 5).toFixed(2)
  const dur = ((frag.endTime ?? 5) - (frag.startTime ?? 0)).toFixed(2)
  return `- Фрагмент ${i + 1}:
Тайминг: начало ${start}с, конец ${end}с (длительность: ${dur}с)
Визуал: ${frag.visualNote}
Суфлер/Текст: "${frag.text}"`
}).join('\n')}

Generate ONLY the complete TSX code. No explanations before or after.
`.trim()
}

export const generateFragmentPrompt = (project: ProjectSettings, scene: Scene, fragment: SceneFragment): string => {
  const { colors, fps, animationStyle, typography } = project.montage
  const duration = (fragment.endTime || 5) - (fragment.startTime || 0) || 5
  const { width, height } = getDims(project.resolution, project.format)
  const start = (fragment.startTime ?? 0).toFixed(2)
  const end = (fragment.endTime ?? 5).toFixed(2)

  return `
# Remotion TSX Video Generator (Fragment)

You are an expert Remotion video developer. Generate production-ready TSX files based on user descriptions.

## Output Requirements
- **Format:** ${project.format} (${width}x${height})
- **Duration:** ${Math.ceil(duration)} seconds
- **FPS:** ${fps}
- **Style:** ${animationStyle}

## Code Structure (MANDATORY)
\`\`\`tsx
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';

export const compositionConfig = {
  id: 'Fragment_${fragment.id.replace(/[^a-zA-Z0-9]/g, '')}',
  durationInSeconds: ${Math.ceil(duration)},
  fps: ${fps},
  width: ${width},
  height: ${height},
};

const COLORS = {
  primary: '${colors.primary}',
  secondary: '${colors.secondary}',
  accent: '${colors.accent}',
  background: '${colors.background}',
  text: '${colors.text}',
  surface: '${colors.surface}',
} as const;

const TYPOGRAPHY = {
  heading: '${typography.heading}, system-ui, sans-serif',
  body: '${typography.body}, system-ui, sans-serif',
} as const;
\`\`\`

## Critical Rules
1. inputRange MUST be strictly monotonically increasing.
2. For reverse mapping, flip outputRange, NOT inputRange.
3. ALWAYS use Easing.bezier(). NEVER use Easing.out(Easing.cubic).
4. ALL animations must be frame-based. NO useState, NO useEffect.
5. extrapolateLeft: 'clamp' and extrapolateRight: 'clamp' are MANDATORY.

## [ЗАДАЧА ФРАГМЕНТА]
Сцена: ${scene.title}
Таймкод сцены: ${scene.timecode}
Тайминг фрагмента: начало ${start}с, конец ${end}с (длительность: ${duration.toFixed(2)}с)
Визуал фрагмента: ${fragment.visualNote}
Суфлер/Текст: "${fragment.text}"

Generate ONLY the complete TSX code. No explanations before or after.
`.trim()
}

export const generateProjectPrompt = (project: ProjectSettings): string => {
  const { colors, fps, animationStyle, typography } = project.montage
  const { width, height } = getDims(project.resolution, project.format)

  return `
# Remotion TSX Video Generator (Project)

You are an expert Remotion video developer. Generate production-ready TSX files based on user descriptions.

## Output Requirements
- **Format:** ${project.format} (${width}x${height})
- **FPS:** ${fps}
- **Style:** ${animationStyle}

## Code Structure (MANDATORY)
\`\`\`tsx
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, Sequence, Composition } from 'remotion';

const COLORS = {
  primary: '${colors.primary}',
  secondary: '${colors.secondary}',
  accent: '${colors.accent}',
  background: '${colors.background}',
  text: '${colors.text}',
  surface: '${colors.surface}',
} as const;

const TYPOGRAPHY = {
  heading: '${typography.heading}, system-ui, sans-serif',
  body: '${typography.body}, system-ui, sans-serif',
} as const;
\`\`\`

## Critical Rules
1. inputRange MUST be strictly monotonically increasing.
2. For reverse mapping, flip outputRange, NOT inputRange.
3. ALWAYS use Easing.bezier(). NEVER use Easing.out(Easing.cubic).
4. ALL animations must be frame-based. NO useState, NO useEffect.
5. extrapolateLeft: 'clamp' and extrapolateRight: 'clamp' are MANDATORY.

## [СЦЕНЫ ПРОЕКТА]
${project.scenes.map((scene, si) => {
  const duration = scene.fragments.reduce((acc, f) => acc + ((f.endTime || 5) - (f.startTime || 0)), 0) || 5
  return `
### Сцена ${si + 1}: ${scene.title}
Таймкод: ${scene.timecode} | Длительность: ~${Math.ceil(duration)}с

${scene.fragments.map((frag, i) => `- Фрагмент ${i + 1}: "${frag.text}"
  Визуал: ${frag.visualNote}
  Тайминг: ${(frag.startTime ?? 0).toFixed(2)}с - ${(frag.endTime ?? 5).toFixed(2)}с`).join('\n')}`
}).join('\n')}

Generate ONLY the complete TSX code. No explanations before or after.
`.trim()
}
