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
    const voiceDir = await projectDir.getDirectoryHandle('voice')
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
