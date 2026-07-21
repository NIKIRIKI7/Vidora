import { useEffect, type ReactNode } from 'react'
import { Icon } from '../icon/Icon'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
}

export const Modal = ({ isOpen, onClose, title, children, className = '' }: ModalProps) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleEscape)
    }
    return () => {
      document.body.style.overflow = 'unset'
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div 
        className={`relative w-full max-w-[448px] bg-surface-container/60 backdrop-blur-2xl border border-white/10 rounded-xl shadow-[0_0_40px_rgba(221,183,255,0.2)] flex flex-col overflow-hidden transition-all ${className}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-surface-container-lowest/30">
          <h2 className="font-title-md text-title-md text-on-surface">{title}</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-on-surface-variant transition-colors"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[70vh] custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  )
}
