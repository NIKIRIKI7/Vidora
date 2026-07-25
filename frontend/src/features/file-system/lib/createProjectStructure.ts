export const createProjectStructure = async (projectName: string, markdownContent: string) => {
  try {
    const showPicker = (window as unknown as { showDirectoryPicker: (options?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
    const parentDirHandle = await showPicker({ mode: 'readwrite' })

    const safeProjectName = projectName.replace(/[^a-z0-9а-яё \\-_]/gi, '_').trim()
    const projectDirHandle = await parentDirHandle.getDirectoryHandle(safeProjectName, { create: true })

    const assetsDir = await projectDirHandle.getDirectoryHandle('assets', { create: true })
    await assetsDir.getDirectoryHandle('b-roll', { create: true })
    await assetsDir.getDirectoryHandle('a-roll', { create: true })
    await assetsDir.getDirectoryHandle('voice', { create: true }) // Added voice inside assets

    const codeDir = await projectDirHandle.getDirectoryHandle('code', { create: true })
    await codeDir.getDirectoryHandle('a-roll', { create: true })

    await projectDirHandle.getDirectoryHandle('music', { create: true })
    await projectDirHandle.getDirectoryHandle('preview', { create: true })

    const scenarioFileHandle = await projectDirHandle.getFileHandle('SCENARIO.md', { create: true })
    const writable = await scenarioFileHandle.createWritable()
    await writable.write(markdownContent)
    await writable.close()

    return projectDirHandle
  } catch (error) {
    console.error('Ошибка создания файловой структуры:', error)
    return null
  }
}
