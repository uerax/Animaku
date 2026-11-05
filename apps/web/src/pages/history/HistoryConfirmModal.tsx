import { Modal } from '../../components/Modal'
import { KzButton } from '../../components/ui'

interface HistoryConfirmModalProps {
  isOpen: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function HistoryConfirmModal({
  isOpen,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  isDanger = false,
  onConfirm,
  onClose,
}: HistoryConfirmModalProps) {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      ariaLabelledBy="confirm-modal-title"
      className="w-full max-w-sm rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-card)] p-5 shadow-2xl"
    >
      <h3
        id="confirm-modal-title"
        className="text-base font-bold text-[var(--kz-fg)]"
      >
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--kz-fg-muted)]">
        {description}
      </p>
      <div className="mt-6 flex justify-end gap-2.5">
        <KzButton
          variant="outline"
          size="sm"
          onClick={onClose}
        >
          {cancelText}
        </KzButton>
        <KzButton
          variant={isDanger ? 'danger' : 'primary'}
          size="sm"
          autoFocus
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmText}
        </KzButton>
      </div>
    </Modal>
  )
}
