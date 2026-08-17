import { useState, useEffect } from 'react'
import { ProjectCreator } from '@widgets/project-creator'
import { EditorWorkspace, YoutubeIdeasView } from '@widgets/editor-workspace'
import { ScenarioBuilder } from '@widgets/scenario-builder'
import { GlobalSettingsView } from '@widgets/global-settings'
import { AudioHubView } from '@widgets/audio-hub'
import { useProjectStore, useNotificationStore, type IdeaFormat, type VideoResult } from '@entities/project'
import { Spinner } from '@shared/ui'
import { API } from '@shared/lib'
import { CircleCheckBig, TriangleAlert, Info } from 'lucide-react'

type ViewState = 'hub' | 'ideas' | 'scenario' | 'settings' | 'audio-hub'

export const MainPage = () => {
  const [isBooting, setIsBooting] = useState(true)
  const [view, setView] = useState<ViewState>('hub')

  const [selectedIdea, setSelectedIdea] = useState<IdeaFormat | null>(null)
  const [selectedVideos, setSelectedVideos] = useState<VideoResult[]>([])

  const projects = useProjectStore(s => s.projects)
  const activeProjectId = useProjectStore(s => s.activeProjectId)
  const setActiveProject = useProjectStore(s => s.setActiveProject)
  const addProject = useProjectStore(s => s.addProject)
  const updateProject = useProjectStore(s => s.updateProject)
  const deleteProject = useProjectStore(s => s.deleteProject)

  const { notification } = useNotificationStore()
  const activeProject = projects.find(p => p.name === activeProjectId)

  useEffect(() => {
    const ping = async () => {
      try {
        const res = await fetch(`${API}/api/health`)
        if (res.ok) setTimeout(() => setIsBooting(false), 800)
        else setTimeout(ping, 1000)
      } catch {
        setTimeout(ping, 1000)
      }
    }
    void ping()
  }, [])

  if (isBooting) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-[200]">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-50" />
        <div className="z-10 flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
          <h1 className="text-4xl font-bold text-primary tracking-tight shadow-primary/20 drop-shadow-2xl">Vidora</h1>
          <Spinner className="text-4xl" />
          <span className="font-mono text-xs text-on-surface-variant animate-pulse">Запуск AI-движка...</span>
        </div>
      </div>
    )
  }

  return (
    <>
      {notification && (
        <div className="fixed top-20 right-6 z-[100] animate-in fade-in slide-in-from-right-8 duration-300">
          <div className={`px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 backdrop-blur-xl
            ${notification.type === 'success' ? 'bg-secondary/10 border-secondary/50 text-secondary' :
              notification.type === 'error' ? 'bg-error/10 border-error/50 text-error' :
                'bg-primary/10 border-primary/50 text-primary'}
          `}>
            {notification.type === 'success' && <CircleCheckBig size={20} fill="currentColor" />}
            {notification.type === 'error' && <TriangleAlert size={20} fill="currentColor" />}
            {notification.type === 'info' && <Info size={20} fill="currentColor" />}
            <span className="font-medium text-sm">{notification.message}</span>
          </div>
        </div>
      )}

      {activeProject ? (
        <EditorWorkspace
          key={activeProject.name}
          project={activeProject}
          projects={projects}
          onSwitchProject={setActiveProject}
          onNewProject={() => {
            setActiveProject(null)
            setView('hub')
          }}
          onUpdateProject={updateProject}
          onDeleteProject={deleteProject}
          onOpenGlobalSettings={() => setView('settings')}
        />
      ) : view === 'ideas' ? (
        <YoutubeIdeasView
          onBack={() => setView('hub')}
          onSelectIdea={(idea, videos) => {
            setSelectedIdea(idea)
            setSelectedVideos(videos)
            setView('scenario')
          }}
        />
      ) : view === 'scenario' ? (
        <ScenarioBuilder
          idea={selectedIdea ?? undefined}
          videos={selectedVideos}
          onBack={() => setView(selectedIdea ? 'ideas' : 'hub')}
          onCreate={(p) => {
            addProject(p)
            setActiveProject(p.name)
          }}
        />
      ) : view === 'audio-hub' ? (
        <AudioHubView onBack={() => setView('hub')} />
      ) : (
        <ProjectCreator
          onGoIdeas={() => setView('ideas')}
          onGoScenario={() => {
            setSelectedIdea(null)
            setSelectedVideos([])
            setView('scenario')
          }}
          onGoSettings={() => setView('settings')}
          onGoAudioHub={() => setView('audio-hub')}
          projects={projects}
          onOpenProject={setActiveProject}
          onDeleteProject={deleteProject}
        />
      )}

      {view === 'settings' && (
        <div className="fixed inset-0 z-[150] bg-background">
          <GlobalSettingsView onBack={() => setView('hub')} />
        </div>
      )}
    </>
  )
}
