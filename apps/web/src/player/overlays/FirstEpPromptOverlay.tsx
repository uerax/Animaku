export interface FirstEpPromptData {
  type: 'op' | 'ed'
  targetTime: number
  countdown: number
}

export interface FirstEpPromptOverlayProps {
  prompt: FirstEpPromptData | null
  mediaError?: string
  onConfirm: () => void
  onDismiss: () => void
}

export function FirstEpPromptOverlay({
  prompt,
  mediaError,
  onConfirm,
  onDismiss,
}: FirstEpPromptOverlayProps) {
  if (!prompt || mediaError) return null

  return (
    <div className="kz-countdown-layer" onClick={(e) => e.stopPropagation()}>
      <div className="kz-countdown-overlay">
        <div className="kz-countdown-info">
          <span className="kz-countdown-label">
            {prompt.type === 'op'
              ? '首次观看 是否跳过 OP'
              : '首次观看 是否跳过 ED'}
          </span>
        </div>
        <div className="kz-countdown-actions">
          <button
            type="button"
            className="kz-countdown-btn kz-countdown-btn--primary"
            onClick={onConfirm}
          >
            跳过 ({prompt.countdown}s)
          </button>
          <button
            type="button"
            className="kz-countdown-btn kz-countdown-btn--secondary"
            title="关闭"
            onClick={onDismiss}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
