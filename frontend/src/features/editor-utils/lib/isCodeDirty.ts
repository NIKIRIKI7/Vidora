import type { ProjectSettings, Scene } from '@entities/project'
import { hashCode } from '@entities/project'
import { generateRemotionPrompt } from './generateRemotionPrompt'

export const isCodeDirty = (project: ProjectSettings, scene: Scene) => {
  if (scene.ignoreTsx) return false
  if (!scene.remotionCode) return true
  if (scene.lastCodeHash && scene.lastCodeHash !== hashCode(generateRemotionPrompt(project, scene))) return true
  return false
}
