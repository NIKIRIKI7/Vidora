import { useState, useMemo, type ReactNode } from 'react'
import { ThumbsUp, Copy, Check } from 'lucide-react'
import type { DetailedComment } from '@shared/api'
import { FrictionBadge, detectFrictionCategory } from '@shared/ui/friction-badge'
import type { FrictionCategory } from '@shared/ui/friction-badge'
import { SearchInput, SegmentedControl, IconButton, EmptyState, VirtualList } from '@shared/ui'

interface DetailedCommentsFeedProps {
  comments: DetailedComment[]
  videoTitle?: string
  onUseAsInsight?: (insight: string) => void
}

type FilterType = FrictionCategory | 'all'

export const DetailedCommentsFeed = ({
  comments,
  videoTitle = '',
  onUseAsInsight,
}: DetailedCommentsFeedProps): ReactNode => {
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const categorizedComments = useMemo(() => {
    return comments.map((c) => ({
      ...c,
      category: c.category ?? detectFrictionCategory(c.text),
    }))
  }, [comments])

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return categorizedComments.filter((c) => {
      const matchType = filterType === 'all' || c.category === filterType
      const matchText = !q || c.text.toLowerCase().includes(q) || c.authorName.toLowerCase().includes(q)
      return matchType && matchText
    })
  }, [categorizedComments, filterType, searchQuery])

  const handleCopy = (comment: DetailedComment) => {
    const formatted = `[Инсайт из комментария к "${videoTitle}"]\nЗритель (${comment.authorName}, ${comment.likeCount} лайков): "${comment.text}"`
    navigator.clipboard.writeText(formatted)
    setCopiedId(comment.commentId)
    setTimeout(() => setCopiedId(null), 2000)
    onUseAsInsight?.(formatted)
  }

  const filterOptions = [
    { value: 'all' as const, label: `Все (${comments.length})` },
    { value: 'problem' as const, label: 'Ошибки' },
    { value: 'question' as const, label: 'Вопросы' },
    { value: 'debate' as const, label: 'Споры' },
    { value: 'mechanism' as const, label: 'Почему' },
  ]

  return (
    <div className="flex flex-col h-full space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
        <SearchInput
          className="flex-1"
          placeholder="Поиск по комментариям..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery('')}
        />
        <div className="overflow-x-auto">
          <SegmentedControl value={filterType} onChange={setFilterType} options={filterOptions} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Комментариев не найдено"
          description="Попробуйте изменить фильтр или поисковый запрос."
          className="flex-1 bg-on-surface/[0.02] rounded-xl border border-outline-variant/30"
        />
      ) : (
        <VirtualList
          items={filtered}
          estimateSize={110}
          gap={10}
          className="flex-1 max-h-[var(--layout-list)]"
          getKey={(c) => c.commentId}
          renderItem={(c) => (
            <div className="p-3 bg-surface-container/60 hover:bg-surface-container border border-outline-variant/30 hover:border-primary/30 rounded-xl transition-all flex flex-col gap-2 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-on-surface">{c.authorName}</span>
                  <span className="text-xxs text-on-surface/40">{c.publishedTime}</span>
                  <FrictionBadge category={c.category} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-2xs text-secondary font-mono bg-secondary/10 px-1.5 py-0.5 rounded">
                    <ThumbsUp className="w-3 h-3" />
                    {c.likeCount}
                  </span>
                  <IconButton
                    icon={copiedId === c.commentId ? Check : Copy}
                    size="sm"
                    accent={copiedId === c.commentId ? 'success' : 'neutral'}
                    onClick={() => handleCopy(c)}
                    title="Скопировать как цитату зрителя в сценарий"
                  />
                </div>
              </div>

              <p className="text-xs text-on-surface leading-relaxed whitespace-pre-line">{c.text}</p>
            </div>
          )}
        />
      )}
    </div>
  )
}
