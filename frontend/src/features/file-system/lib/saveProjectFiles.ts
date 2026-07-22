import type { ProjectSettings } from '@entities/project'
import { serializeProjectToMarkdown } from '@widgets/project-creator/lib/parseMarkdown'

export const saveProjectToDisk = async (project: ProjectSettings) => {
  if (!project.projectDir) return
  try {
    const markdownContent = serializeProjectToMarkdown(project)
    const scenarioFileHandle = await project.projectDir.getFileHandle('SCENARIO.md', { create: true })
    const writableScenario = await scenarioFileHandle.createWritable()
    await writableScenario.write(markdownContent)
    await writableScenario.close()

    const codeDir = await project.projectDir.getDirectoryHandle('code', { create: true })
    const aRollDir = await codeDir.getDirectoryHandle('a-roll', { create: true })

    for (const scene of project.scenes) {
      if (scene.remotionCode) {
        const fileHandle = await aRollDir.getFileHandle(`${scene.id}.tsx`, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(scene.remotionCode)
        await writable.close()
      }
    }
  } catch (error) {
    console.error('Ошибка сохранения проекта на диск:', error)
  }
}

export const saveSceneCodeToDisk = async (projectDir: FileSystemDirectoryHandle, sceneId: string, code: string) => {
  try {
    const codeDir = await projectDir.getDirectoryHandle('code')
    const aRollDir = await codeDir.getDirectoryHandle('a-roll')
    const fileHandle = await aRollDir.getFileHandle(`${sceneId}.tsx`, { create: true })

    const writable = await fileHandle.createWritable()
    await writable.write(code)
    await writable.close()
    return true
  } catch (error) {
    console.error('Error saving code:', error)
    return false
  }
}

export const saveAudioToDisk = async (projectDir: FileSystemDirectoryHandle, file: File) => {
  try {
    const assetsDir = await projectDir.getDirectoryHandle('assets')
    const voiceDir = await assetsDir.getDirectoryHandle('voice', { create: true })
    const fileHandle = await voiceDir.getFileHandle(file.name, { create: true })

    const writable = await fileHandle.createWritable()
    await writable.write(file)
    await writable.close()
    return true
  } catch (error) {
    console.error('Error saving audio:', error)
    return false
  }
}

export const saveAssetToDisk = async (projectDir: FileSystemDirectoryHandle, file: File, type: 'a-roll' | 'b-roll') => {
  try {
    const assetsDir = await projectDir.getDirectoryHandle('assets')
    const targetDir = await assetsDir.getDirectoryHandle(type)
    const fileHandle = await targetDir.getFileHandle(file.name, { create: true })

    const writable = await fileHandle.createWritable()
    await writable.write(file)
    await writable.close()
    return true
  } catch (error) {
    console.error('Error saving asset:', error)
    return false
  }
}
