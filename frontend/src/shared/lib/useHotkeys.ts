import { useEffect } from 'react'

export const useHotkeys = (key: string, ctrl: boolean, callback: () => void) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      
      if (e.code === key && (!ctrl || e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        callback()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [key, ctrl, callback])
}
