import { ProjectCreator } from '@widgets/project-creator'
import { EditorWorkspace } from '@widgets/editor-workspace'
import { useProjectStore } from '@entities/project'

export const MainPage = () => {
  const projects = useProjectStore(s => s.projects)
  const activeProjectId = useProjectStore(s => s.activeProjectId)
  const setActiveProject = useProjectStore(s => s.setActiveProject)
  const addProject = useProjectStore(s => s.addProject)
  const updateProject = useProjectStore(s => s.updateProject)
  const deleteProject = useProjectStore(s => s.deleteProject)

  const activeProject = projects.find(p => p.name === activeProjectId)

  if (!activeProject) {
    return (
      <ProjectCreator 
        onCreate={addProject} 
        onCancel={projects.length > 0 ? () => setActiveProject(projects[0].name) : undefined}
      />
    )
  }

  return (
    <EditorWorkspace 
      project={activeProject} 
      projects={projects}
      onSwitchProject={setActiveProject}
      onNewProject={() => setActiveProject(null)}
      onUpdateProject={updateProject}
      onDeleteProject={deleteProject}
    />
  )
}
