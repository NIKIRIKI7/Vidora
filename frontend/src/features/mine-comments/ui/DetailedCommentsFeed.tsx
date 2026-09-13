import { useState, useMemo, type ReactNode } from 'react'
import { ThumbsUp, Copy, Check, Search, Filter } from 'lucide-react'
import type { DetailedComment } from '@shared/api'
import { FrictionBadge, detectFrictionCategory } from '@shared/ui/friction-badge'
import type { FrictionCategory } from '@shared/ui/friction-badge'

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
    return categorizedComments.filter((c) => {
      const matchType = filterType === 'all' || c.category === filterType
      const matchText = !searchQuery || c.text.toLowerCase().includes(searchQuery.toLowerCase()) || c.authorName.toLowerCase().includes(searchQuery.toLowerCase())
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

  const filterButtons: { key: FilterType; label: string; count?: number }[] = [
    { key: 'all', label: `Все (${comments.length})` },
    { key: 'problem', label: 'Ошибки' },
    { key: 'question', label: 'Вопросы' },
    { key: 'debate', label: 'Споры' },
    { key: 'mechanism', label: 'Почему' },
  ]

  return (
    <div className="flex flex-col h-full space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
          <input
            type="text"
            placeholder="Поиск по комментариям..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface placeholder-white/40 focus:outline-none focus:border-primary/50"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
          <Filter className="w-3 h-3 text-on-surface/40 mr-1 hidden sm:inline" />
          {filterButtons.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`px-2.5 py-1 rounded-md text-2xs transition-all whitespace-nowrap ${
                filterType === key
                  ? 'bg-primary text-on-primary font-bold shadow-lg shadow-primary/20'
                  : 'bg-surface-container text-on-surface/70 hover:bg-on-surface/10 border border-outline-variant/30'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[var(--layout-list)]">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-xs text-on-surface/40 bg-on-surface/[0.02] rounded-xl border border-outline-variant/30">
            Комментариев по выбранным критериям не найдено
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.commentId}
              className="p-3 bg-surface-container/60 hover:bg-surface-container border border-outline-variant/30 hover:border-primary/30 rounded-xl transition-all flex flex-col gap-2 group"
            >
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
                  <button
                    onClick={() => handleCopy(c)}
                    className="p-1 text-on-surface/50 hover:text-on-surface hover:bg-on-surface/10 rounded transition-colors"
                    title="Скопировать как цитату зрителя в сценарий"
                  >
                    {copiedId === c.commentId ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <p className="text-xs text-on-surface leading-relaxed whitespace-pre-line">{c.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
