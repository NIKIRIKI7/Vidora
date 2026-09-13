import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useProjectStore, useNotificationStore, type IdeaFormat, type VideoResult } from '@entities/project'
import { useSkillsStore } from '@features/settings'
import { Spinner, Button } from '@shared/ui'
import { $api } from '@shared/api'
import { CircleCheckBig, TriangleAlert, Info, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'

const EditorPage = lazy(() => import('@pages/editor').then(m => ({ default: m.EditorPage })))
const YoutubeIdeasView = lazy(() => import('@widgets/youtube-ideas').then(m => ({ default: m.YoutubeIdeasView })))
const ScenarioBuilder = lazy(() => import('@widgets/scenario-builder').then(m => ({ default: m.ScenarioBuilder })))
const GlobalSettingsView = lazy(() => import('@widgets/global-settings').then(m => ({ default: m.GlobalSettingsView })))
const AudioHubView = lazy(() => import('@widgets/audio-hub').then(m => ({ default: m.AudioHubView })))
const DashboardView = lazy(() => import('@widgets/dashboard').then(m => ({ default: m.DashboardView })))

const NotificationToast = ({ notification }: { notification: { message: string; type: 'success' | 'error' | 'info'; details?: string } }) => {
  const [showDetails, setShowDetails] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard.writeText(`${notification.message}\n\n${notification.details || ''}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed top-20 right-6 z-[100] w-[var(--layout-toast)] max-w-[90vw] animate-in fade-in slide-in-from-right-8 duration-300">
      <div className={`px-4 py-3 rounded-lg shadow-xl border flex flex-col gap-2 backdrop-blur-xl
        ${notification.type === 'success' ? 'bg-secondary/10 border-secondary/50 text-secondary' :
          notification.type === 'error' ? 'bg-error/10 border-error/50 text-error' :
            'bg-primary/10 border-primary/50 text-primary'}
      `}>
        <div className="flex items-center gap-3">
          {notification.type === 'success' && <CircleCheckBig size={20} fill="currentColor" />}
          {notification.type === 'error' && <TriangleAlert size={20} fill="currentColor" />}
          {notification.type === 'info' && <Info size={20} fill="currentColor" />}
          <span className="font-medium text-sm flex-1">{notification.message}</span>
        </div>
        {notification.details && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={showDetails ? ChevronUp : ChevronDown}
                onClick={() => setShowDetails(v => !v)}
                className="px-2 py-1 rounded bg-surface-container-lowest/20 hover:bg-surface-container-lowest/40 text-2xs font-mono"
              >
                Подробнее
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={copied ? Check : Copy}
                onClick={copy}
                className="px-2 py-1 rounded bg-surface-container-lowest/20 hover:bg-surface-container-lowest/40 text-2xs font-mono"
              >
                {copied ? 'Скопировано' : 'Копировать'}
              </Button>
            </div>
            {showDetails && (
              <pre className="p-2.5 rounded-lg bg-surface-container-lowest/80 text-error font-mono text-2xs leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap custom-scrollbar">
                {notification.details}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const BootScreen = () => (
  <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-[200]">
    <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-50" />
    <div className="z-10 flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
      <h1 className="text-4xl font-bold text-primary tracking-tight shadow-primary/20 drop-shadow-2xl">Vidora</h1>
      <Spinner className="text-4xl" />
      <span className="font-mono text-xs text-on-surface-variant animate-pulse">Запуск AI-движка...</span>
    </div>
  </div>
)

const RouteFallback = () => (
  <div className="fixed inset-0 bg-background flex items-center justify-center z-[200]">
    <Spinner className="text-4xl" />
  </div>
)

export const App = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const projects = useProjectStore(s => s.projects)
  const activeProjectId = useProjectStore(s => s.activeProjectId)
  const setActiveProject = useProjectStore(s => s.setActiveProject)
  const addProject = useProjectStore(s => s.addProject)
  const updateProject = useProjectStore(s => s.updateProject)
  const deleteProject = useProjectStore(s => s.deleteProject)

  const { notification } = useNotificationStore()
  const activeProject = projects.find(p => p.name === activeProjectId)

  useEffect(() => {
    // Подтягиваем свежие скилы из SQLite при старте интерфейса (единый источник для генерации промптов)
    useSkillsStore.getState().fetchSkills().catch((err) => { console.error('App.fetchSkills:', err) })
  }, [])

  const { data: health, isLoading: isBooting } = $api.useQuery(
    'get',
    '/api/health',
    {},
    { refetchInterval: query => (query.state.data ? false : 1000), retry: true },
  )

  if (isBooting || !health) {
    return <BootScreen />
  }

  const scenarioState = (location.state ?? {}) as { idea?: IdeaFormat; videos?: VideoResult[] }

  return (
    <>
      {notification && (
        <NotificationToast key={notification.timestamp} notification={notification} />
      )}

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <DashboardView
                onOpenTrends={() => navigate('/ideas')}
                onOpenScript={() => navigate('/scenario', { state: {} })}
                onOpenAudio={() => navigate('/audio')}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            }
          />
          <Route
            path="/ideas"
            element={
              <YoutubeIdeasView
                onBack={() => navigate('/')}
                onSelectIdea={(idea, videos) => navigate('/scenario', { state: { idea, videos } })}
              />
            }
          />
          <Route
            path="/scenario"
            element={
              <ScenarioBuilder
                idea={scenarioState.idea}
                videos={scenarioState.videos ?? []}
                onBack={() => navigate(scenarioState.idea ? '/ideas' : '/')}
                onCreate={(p) => {
                  addProject(p)
                  setActiveProject(p.name)
                  navigate('/editor')
                }}
              />
            }
          />
          <Route path="/audio" element={<AudioHubView onBack={() => navigate('/')} />} />
          <Route
            path="/editor"
            element={
              activeProject ? (
                <EditorPage
                  key={activeProject.name}
                  project={activeProject}
                  projects={projects}
                  onSwitchProject={setActiveProject}
                  onNewProject={() => {
                    setActiveProject(null)
                    navigate('/')
                  }}
                  onBack={() => {
                    setActiveProject(null)
                    navigate('/')
                  }}
                  onUpdateProject={updateProject}
                  onDeleteProject={deleteProject}
                  onOpenGlobalSettings={() => setSettingsOpen(true)}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {settingsOpen && (
        <Suspense fallback={null}>
          <div className="fixed inset-0 z-[150] bg-background">
            <GlobalSettingsView
              onBack={() => setSettingsOpen(false)}
              onGoToAudio={() => {
                setSettingsOpen(false)
                setActiveProject(null)
                navigate('/audio')
              }}
            />
          </div>
        </Suspense>
      )}
    </>
  )
}
