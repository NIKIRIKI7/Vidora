import type { InputHTMLAttributes } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '../input/Input'

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void
}

export const SearchInput = ({ className = '', onClear, value, ...props }: SearchInputProps) => (
  <div className="relative w-full">
    <Search size={16} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
    <Input className={`pl-9 ${onClear ? 'pr-9' : ''} ${className}`} value={value} {...props} />
    {onClear && value ? (
      <button
        type="button"
        onClick={onClear}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-on-surface/10 transition-colors cursor-pointer"
        aria-label="Очистить"
      >
        <X size={14} />
      </button>
    ) : null}
  </div>
)
