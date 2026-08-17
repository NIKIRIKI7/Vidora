import { useEffect, useState, type RefObject } from 'react'

const WORD_RE = /[\w\u0400-\u04FF]+/

/** Обкладывает тег паузы пробелами, если он вставлен впритык к слову. */
export const padPauseTag = (tag: string, value: string, pos: number): string => {
  const charBefore = pos > 0 ? value[pos - 1] : ''
  const charAfter = pos < value.length ? value[pos] : ''
  return `${charBefore && !/\s/.test(charBefore) ? ' ' : ''}${tag}${charAfter && !/\s/.test(charAfter) ? ' ' : ''}`
}

/** Границы слова (латиница/кириллица/цифры) вокруг позиции курсора. */
export const findWordRange = (value: string, pos: number): [number, number] => {
  const mBefore = value.slice(0, pos).match(WORD_RE.source + '$')
  const onWordChar = !!value[pos] && !/\s/.test(value[pos])
  if (onWordChar) {
    const mAfter = value.slice(pos).match('^' + WORD_RE.source)
    return [
      mBefore ? pos - mBefore[0].length : pos,
      mAfter ? pos + mAfter[0].length : pos,
    ]
  }
  // Курсор на пробеле/знаке — ближайшее слово справа (или последнее слева)
  const next = value.slice(pos).match(WORD_RE.source)
  if (next?.index !== undefined) return [pos + next.index, pos + next.index + next[0].length]
  return mBefore ? [pos - mBefore[0].length, pos] : [pos, pos]
}

/**
 * Вставка тегов в textarea с сохранением фокуса и нативным undo (Ctrl+Z).
 * Каждая правка пишется через document.execCommand('insertText') — единственный
 * способ получить запись в стеке undo контролируемого textarea (прямой setState
 * в value стирает историю отмены в Chromium).
 */
export const useVoiceTagInserter = (ref: RefObject<HTMLTextAreaElement | null>) => {
  const [hasSelection, setHasSelection] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = () => setHasSelection(el.selectionStart !== el.selectionEnd)
    el.addEventListener('keyup', sync)
    el.addEventListener('mouseup', sync)
    el.addEventListener('select', sync)
    return () => {
      el.removeEventListener('keyup', sync)
      el.removeEventListener('mouseup', sync)
      el.removeEventListener('select', sync)
    }
  }, [ref])

  const replaceRange = (start: number, end: number, text: string) => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(start, end)
    document.execCommand('insertText', false, text)
  }

  /**
   * Вставляет тег в позицию курсора или оборачивает выделение.
   * Паузы <#...#> при вставке без выделения обкладываются пробелами,
   * чтобы не слипаться со словами.
   */
  const insertTag = (before: string, after = '') => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const selected = el.value.substring(start, end)

    const tag = !selected && before.startsWith('<#') ? padPauseTag(before, el.value, start) : before
    replaceRange(start, end, selected ? before + selected + after : tag)
    setHasSelection(false)
  }

  /**
   * Переключает регистр выделения (или слова под курсором).
   * Верхний регистр в TTS-тексте даёт смысловое ударение; повторный клик — обратно.
   */
  const toggleCaps = () => {
    const el = ref.current
    if (!el) return
    let start = el.selectionStart ?? 0
    let end = el.selectionEnd ?? 0

    if (start === end) {
      [start, end] = findWordRange(el.value, start)
      if (start === end) return
    }

    const selected = el.value.substring(start, end)
    const toggled = selected === selected.toUpperCase() ? selected.toLowerCase() : selected.toUpperCase()
    replaceRange(start, end, toggled)
    const el2 = ref.current
    if (el2) el2.setSelectionRange(start, start + toggled.length)
  }

  return { insertTag, toggleCaps, hasSelection }
}
