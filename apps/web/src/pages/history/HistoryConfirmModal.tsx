import { useEffect } from 'react'

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
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // 弹窗开启时锁定底层 body 滚动，防止移动端与桌面端穿透滑动
  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* 遮罩背景 */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 模态框主体 */}
      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg-card)] p-5 shadow-2xl transition-all">
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
            className="rounded-lg border border-[var(--kz-border)] px-3.5 py-1.5 text-sm font-medium text-[var(--kz-fg-muted)] transition-colors hover:bg-[var(--kz-bg-hover)]"
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
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white shadow-xs transition-colors ${
              isDanger
                ? 'bg-[var(--kz-danger)] hover:opacity-90'
                : 'bg-[var(--kz-accent)] hover:opacity-90'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
