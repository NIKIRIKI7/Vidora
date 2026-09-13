import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

interface VirtualListProps<T> {
  items: T[]
  estimateSize?: number
  overscan?: number
  gap?: number
  className?: string
  getKey: (item: T, index: number) => string | number
  renderItem: (item: T, index: number) => ReactNode
}

/**
 * Лёгкая windowing-виртуализация на чистом React (без сторонних хуков):
 * рендерим только видимый диапазон, высоты строк измеряем через ref-колбэк.
 */
export function VirtualList<T>({
  items,
  estimateSize = 96,
  overscan = 4,
  gap = 8,
  className = '',
  getKey,
  renderItem,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [heights, setHeights] = useState<Record<number, number>>({})

  const offsets = useMemo(() => {
    const result: number[] = new Array(items.length + 1)
    result[0] = 0
    for (let i = 0; i < items.length; i++) {
      result[i + 1] = result[i] + (heights[i] ?? estimateSize) + gap
    }
    return result
  }, [items.length, heights, estimateSize, gap])

  const totalSize = offsets[items.length] ?? 0

  let start = 0
  while (start < items.length && offsets[start + 1] <= scrollTop) start++
  let end = start
  while (end < items.length && offsets[end] < scrollTop + viewportHeight) end++
  const from = Math.max(0, start - overscan)
  const to = Math.min(items.length, end + overscan)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setViewportHeight(el.clientHeight)
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const measureRow = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const index = Number(el.dataset.index)
    const height = el.getBoundingClientRect().height
    setHeights((prev) => (prev[index] === height ? prev : { ...prev, [index]: height }))
  }, [])

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={`overflow-y-auto custom-scrollbar ${className}`}
    >
      <div style={{ height: totalSize, position: 'relative', width: '100%' }}>
        {Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k).map((index) => (
          <div
            key={getKey(items[index], index)}
            data-index={index}
            ref={measureRow}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${offsets[index]}px)`,
              paddingBottom: gap,
            }}
          >
            {renderItem(items[index], index)}
          </div>
        ))}
      </div>
    </div>
  )
}
