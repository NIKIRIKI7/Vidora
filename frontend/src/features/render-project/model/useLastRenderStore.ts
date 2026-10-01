import { create } from 'zustand'

interface LastRenderState {
  blob: Blob | null
  url: string | null
  fileName: string | null
  scopeLabel: string
  createdAt: number | null
  save: (blob: Blob, fileName: string, scopeLabel: string) => void
  clear: () => void
}

/**
 * Хранит blob последнего успешного рендера, чтобы пользователь мог скачать
 * файл повторно без повторного кодирования.
 *
 * Object URL обязательно отзывается при перезаписи и очистке — иначе каждый
 * рендер оставляет в памяти блоб, который никто уже не освободит.
 */
export const useLastRenderStore = create<LastRenderState>((set, get) => ({
  blob: null,
  url: null,
  fileName: null,
  scopeLabel: '',
  createdAt: null,

  save: (blob, fileName, scopeLabel) => {
    const prev = get().url
    if (prev) URL.revokeObjectURL(prev)
    const url = URL.createObjectURL(blob)
    set({ blob, url, fileName, scopeLabel, createdAt: Date.now() })
  },

  clear: () => {
    const prev = get().url
    if (prev) URL.revokeObjectURL(prev)
    set({ blob: null, url: null, fileName: null, scopeLabel: '', createdAt: null })
  },
}))
