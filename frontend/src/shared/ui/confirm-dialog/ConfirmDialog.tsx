import type { ReactNode } from 'react'
import { Modal } from '../modal/Modal'
import { Button } from '../button/Button'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export const ConfirmDialog = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} className="max-w-md">
    <div className="flex flex-col gap-5">
      {description && <div className="text-sm text-on-surface-variant leading-relaxed">{description}</div>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  </Modal>
)
