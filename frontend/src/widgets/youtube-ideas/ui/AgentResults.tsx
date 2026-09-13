import { Tabs } from '@shared/ui'
import { List, Compass, MessageSquare, Eye } from 'lucide-react'
import { ExportButton, type ExportDataset } from '@features/research-export'
import type {
  EarlySignalItem,
  VideoResult,
  BlueOceanOpportunity,
  CommentGoldmineVideoEntry,
} from '@entities/project'
import type { ResultsTab } from '../model/constants'
import { AgentDetailsTab } from './tabs/AgentDetailsTab'
import { AgentBlueOceanTab } from './tabs/AgentBlueOceanTab'
import { AgentGoldmineTab } from './tabs/AgentGoldmineTab'
import { AgentThumbnailsTab } from './tabs/AgentThumbnailsTab'

interface AgentResultsProps {
  resultsTab: ResultsTab
  onResultsTabChange: (id: string) => void
  isGridView: boolean
  onGridViewChange: (v: boolean) => void
  earlySignals: EarlySignalItem[]
  agentResults: VideoResult[]
  blueOceanGaps: BlueOceanOpportunity[]
  goldmineReports: CommentGoldmineVideoEntry[]
  isAgentRunning: boolean
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
  onAnalyzeHook: (video: VideoResult) => void
  onLoadMoreVideos: () => void
  onSynthesizeBlueOceans: () => void
  onRunAgent: () => void
  exportDataset: ExportDataset
  onNotify: (message: string, type?: 'success' | 'error' | 'info', details?: string) => void
}

export const AgentResults = ({
  resultsTab,
  onResultsTabChange,
  isGridView,
  onGridViewChange,
  earlySignals,
  agentResults,
  blueOceanGaps,
  goldmineReports,
  isAgentRunning,
  copiedKey,
  onCopy,
  onAnalyzeHook,
  onLoadMoreVideos,
  onSynthesizeBlueOceans,
  onRunAgent,
  exportDataset,
  onNotify,
}: AgentResultsProps) => (
  <div className="flex-1 bg-surface-container-low/60 border border-outline-variant/40 rounded-xl overflow-y-auto custom-scrollbar relative shadow-xl">
    <div className="sticky top-0 z-30 flex justify-between items-center bg-surface-container-low/90 backdrop-blur-md px-6 py-3 border-b border-outline-variant/40">
      <Tabs
        variant="pill"
        value={resultsTab}
        onChange={onResultsTabChange}
        items={[
          { id: 'details', label: 'Детали', icon: List },
          {
            id: 'blue_ocean',
            label: 'Голубые Океаны',
            icon: Compass,
            badge: blueOceanGaps.length > 0
              ? <span className="text-xxs font-bold bg-secondary/20 text-secondary px-1.5 rounded-full">{blueOceanGaps.length}</span>
              : undefined,
          },
          {
            id: 'goldmine',
            label: 'Боли & Споры',
            icon: MessageSquare,
            badge: goldmineReports.length > 0
              ? <span className="text-xxs font-bold bg-warning/20 text-warning px-1.5 rounded-full">{goldmineReports.length}</span>
              : undefined,
          },
          { id: 'thumbnails', label: 'Обложки', icon: Eye },
        ]}
      />
      <ExportButton dataset={exportDataset} onNotify={onNotify} />
    </div>

    <div className="p-6 flex flex-col gap-10">
      {resultsTab === 'details' && (
        <AgentDetailsTab
          earlySignals={earlySignals}
          agentResults={agentResults}
          isGridView={isGridView}
          onGridViewChange={onGridViewChange}
          isAgentRunning={isAgentRunning}
          onAnalyzeHook={onAnalyzeHook}
          onLoadMoreVideos={onLoadMoreVideos}
        />
      )}

      {resultsTab === 'blue_ocean' && (
        <AgentBlueOceanTab
          blueOceanGaps={blueOceanGaps}
          copiedKey={copiedKey}
          onCopy={onCopy}
          onSynthesizeBlueOceans={onSynthesizeBlueOceans}
        />
      )}

      {resultsTab === 'goldmine' && (
        <AgentGoldmineTab
          goldmineReports={goldmineReports}
          copiedKey={copiedKey}
          isAgentRunning={isAgentRunning}
          onCopy={onCopy}
          onRunAgent={onRunAgent}
        />
      )}

      {resultsTab === 'thumbnails' && (
        <AgentThumbnailsTab
          agentResults={agentResults}
          copiedKey={copiedKey}
          onCopy={onCopy}
        />
      )}
    </div>
  </div>
)
