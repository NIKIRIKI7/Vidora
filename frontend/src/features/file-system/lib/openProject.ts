export const openProjectStructure = async () => {
  try {
    const showPicker = (window as unknown as { showDirectoryPicker: (options?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
    const projectDirHandle = await showPicker({ mode: 'readwrite' })
    const scenarioFileHandle = await projectDirHandle.getFileHandle('SCENARIO.md')
    const file = await scenarioFileHandle.getFile()
    const markdownContent = await file.text()

    return { projectDirHandle, markdownContent, projectName: projectDirHandle.name }
  } catch (error) {
    console.error('Error opening project:', error)
    return null
  }
}
