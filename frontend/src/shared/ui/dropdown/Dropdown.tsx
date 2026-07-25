import { useState, useRef, useEffect, type ReactNode } from 'react'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
  direction?: 'down' | 'up'
  className?: string
  containerClassName?: string
}

export const Dropdown = ({
  trigger,
  children,
  align = 'right',
  direction = 'down',
  className = '',
  containerClassName = ''
}: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const verticalClass = direction === 'up'
    ? 'bottom-full mb-2 slide-in-from-bottom-2'
    : 'top-full mt-2 slide-in-from-top-2'

  return (
    <div className={`relative inline-block ${containerClassName}`} ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      {isOpen && (
        <div
          className={`absolute z-[100] ${verticalClass} min-w-[14rem] bg-[#171f33] border border-white/15 rounded-xl shadow-2xl py-1.5 animate-in fade-in duration-150 ${align === 'right' ? 'right-0' : 'left-0'} ${className}`}
          onClick={() => setIsOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export const DropdownItem = ({ children, onClick, className = '', danger = false }: { children: ReactNode, onClick?: () => void, className?: string, danger?: boolean }) => (
  <button
    className={`w-full text-left px-4 py-2 font-label text-sm transition-colors ${danger ? 'text-error hover:bg-error/10' : 'text-on-surface hover:bg-white/10'} ${className}`}
    onClick={onClick}
  >
    {children}
  </button>
)
