import { Modal } from '../../components/Modal'

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
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--kz-border)] px-3.5 py-1.5 text-sm font-medium text-[var(--kz-fg-muted)] transition-colors hover:bg-[var(--kz-bg-hover)] cursor-pointer"
        >
          {cancelText}
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => {
            onConfirm()
            onClose()
          }}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white shadow-xs transition-colors cursor-pointer ${
            isDanger
              ? 'bg-[var(--kz-danger)] hover:opacity-90'
              : 'bg-[var(--kz-accent)] hover:opacity-90'
          }`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}
