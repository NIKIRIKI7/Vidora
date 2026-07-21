import { ProjectCreator } from '@widgets/project-creator'
import { EditorWorkspace } from '@widgets/editor-workspace'
import { useProjectStore, useNotificationStore } from '@entities/project'
import { Icon } from '@shared/ui'

export const MainPage = () => {
  const projects = useProjectStore(s => s.projects)
  const activeProjectId = useProjectStore(s => s.activeProjectId)
  const setActiveProject = useProjectStore(s => s.setActiveProject)
  const addProject = useProjectStore(s => s.addProject)
  const updateProject = useProjectStore(s => s.updateProject)
  const deleteProject = useProjectStore(s => s.deleteProject)

  const { notification } = useNotificationStore()

  const activeProject = projects.find(p => p.name === activeProjectId)

  return (
    <>
      {notification && (
        <div className="fixed top-20 right-6 z-[100] animate-in fade-in slide-in-from-right-8 duration-300">
          <div className={`px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 backdrop-blur-xl
            ${notification.type === 'success' ? 'bg-secondary/10 border-secondary/50 text-secondary' :
              notification.type === 'error' ? 'bg-error/10 border-error/50 text-error' :
              'bg-primary/10 border-primary/50 text-primary'}
          `}>
            <Icon name={notification.type === 'success' ? 'check_circle' : notification.type === 'error' ? 'error' : 'info'} className="text-[20px]" filled />
            <span className="font-medium text-sm">{notification.message}</span>
          </div>
        </div>
      )}

      {!activeProject ? (
        <ProjectCreator
          onCreate={addProject}
          onCancel={projects.length > 0 ? () => setActiveProject(projects[0].name) : undefined}
        />
      ) : (
        <EditorWorkspace
          project={activeProject}
          projects={projects}
          onSwitchProject={setActiveProject}
          onNewProject={() => setActiveProject(null)}
          onUpdateProject={updateProject}
          onDeleteProject={deleteProject}
        />
      )}
    </>
  )
}
