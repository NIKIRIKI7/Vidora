import { useRef } from 'react'
import { Video, Upload, Sparkles, Trash2, ExternalLink } from 'lucide-react'
import { Dropdown, DropdownItem } from '@shared/ui'

interface FragmentBrollControlProps {
  brollFilename?: string | null
  onOpenStockModal: () => void
  onAutoMatchAi: () => void
  onUploadFile: (file: File) => void
  onUnlink: () => void
}

/**
 * Единая точка управления B-Roll фрагмента: сток, локальный файл, AI-автоподбор,
 * отвязка. Заменяет ряд из нескольких микро-кнопок.
 */
export const FragmentBrollControl = ({
  brollFilename,
  onOpenStockModal,
  onAutoMatchAi,
  onUploadFile,
  onUnlink,
}: FragmentBrollControlProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasBroll = Boolean(brollFilename)

  return (
    <div className="flex items-center">
      <input
        type="file"
        ref={fileInputRef}
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUploadFile(file)
          e.target.value = ''
        }}
      />

      <Dropdown
        align="left"
        trigger={
          <button
            type="button"
            className={`text-[11px] p-1 rounded transition-colors flex items-center gap-1 border ${
              hasBroll
                ? 'text-secondary border-secondary/40 bg-secondary/10 hover:bg-secondary/20'
                : 'text-on-surface-variant border-transparent hover:text-secondary hover:bg-white/5'
            }`}
            title={hasBroll ? `B-Roll: ${brollFilename}` : 'Медиа / B-Roll'}
          >
            <Video size={13} />
          </button>
        }
      >
        <DropdownItem onClick={onOpenStockModal}>
          <ExternalLink size={14} className="mr-2 inline text-sky-400" />
          Выбрать из стока (Pexels)
        </DropdownItem>
        <DropdownItem onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} className="mr-2 inline text-emerald-400" />
          Загрузить локальный файл
        </DropdownItem>
        <DropdownItem onClick={onAutoMatchAi}>
          <Sparkles size={14} className="mr-2 inline text-fuchsia-400" />
          Автоподбор через AI
        </DropdownItem>
        {hasBroll && (
          <>
            <div className="h-px bg-white/10 my-1" />
            <DropdownItem onClick={onUnlink} danger>
              <Trash2 size={14} className="mr-2 inline" />
              Отвязать B-Roll
            </DropdownItem>
          </>
        )}
      </Dropdown>
    </div>
  )
}
