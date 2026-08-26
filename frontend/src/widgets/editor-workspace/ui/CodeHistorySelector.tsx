import { useCallback, useEffect, useState } from 'react'
import { API } from '@shared/lib'
import { History } from 'lucide-react'

interface Revision {
  revision_id: string
  timestamp: string
  prompt_snippet?: string
  char_count?: number
}

interface Props {
  projectId: string
  sceneId: string
  onRestoreCode: (code: string) => void
}

export const CodeHistorySelector: React.FC<Props> = ({ projectId, sceneId, onRestoreCode }) => {
  const [revisions, setRevisions] = useState<Revision[]>([])

  const loadRevisions = useCallback(async () => {
    if (!projectId || !sceneId) return
    try {
      const res = await fetch(`${API}/api/v1/system/history/${encodeURIComponent(projectId)}/${encodeURIComponent(sceneId)}`)
      const data = await res.json()
      setRevisions(data.revisions || [])
    } catch {
      setRevisions([])
    }
  }, [projectId, sceneId])

  const restore = async (revisionId: string) => {
    try {
      const res = await fetch(`${API}/api/v1/system/history/${encodeURIComponent(projectId)}/${encodeURIComponent(sceneId)}/${encodeURIComponent(revisionId)}`)
      const data = await res.json()
      if (data.tsx_code) onRestoreCode(data.tsx_code)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { void loadRevisions() }, 0)
    return () => clearTimeout(t)
  }, [loadRevisions])

  if (revisions.length === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      <History size={14} className="text-on-surface-variant" />
      <select
        onChange={e => { if (e.target.value) void restore(e.target.value) }}
        defaultValue=""
        className="bg-surface-container-lowest border border-white/10 text-[11px] font-mono text-on-surface rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary/50 max-w-[220px]"
      >
        <option value="" disabled>История версий TSX ({revisions.length})</option>
        {revisions.map(rev => (
          <option key={rev.revision_id} value={rev.revision_id}>
            {rev.timestamp} {rev.prompt_snippet ? `— ${rev.prompt_snippet}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
