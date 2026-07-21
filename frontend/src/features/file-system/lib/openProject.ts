export const openProjectStructure = async () => {
  try {
    const projectDirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    const scenarioFileHandle = await projectDirHandle.getFileHandle('SCENARIO.md')
    const file = await scenarioFileHandle.getFile()
    const markdownContent = await file.text()

    return { projectDirHandle, markdownContent, projectName: projectDirHandle.name }
  } catch (error) {
    console.error('Error opening project:', error)
    return null
  }
}
