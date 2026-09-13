import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

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

  const isCustomWidth = className.includes('max-w-')
  const widthClass = isCustomWidth ? '' : 'max-w-[var(--layout-modal)]'

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 select-none overflow-y-auto">
      <div
        className="fixed inset-0 bg-surface-container-lowest/90 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div
        className={`relative w-full ${widthClass} bg-surface-container-lowest border border-outline-variant/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10 my-auto animate-in fade-in zoom-in-95 duration-200 ${className}`}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/40 bg-surface-container-low/70 shrink-0">
            <h2 className="font-bold text-base text-on-surface tracking-tight">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        )}
        <div className="p-6 overflow-y-auto max-h-[82vh] custom-scrollbar flex-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
