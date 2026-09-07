export interface AutoNextOverlayProps {
  countdown: number | null
  mediaError?: string
  onPlayNow: () => void
  onCancel: () => void
}

export function AutoNextOverlay({
  countdown,
  mediaError,
  onPlayNow,
  onCancel,
}: AutoNextOverlayProps) {
  if (countdown === null || mediaError) return null

  return (
    <div className="kz-countdown-layer" onClick={(e) => e.stopPropagation()}>
      <div className="kz-countdown-overlay">
        <div className="kz-countdown-ring-wrap">
          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="2.5"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeDasharray="94.2"
              strokeDashoffset={94.2 * (1 - countdown / 4)}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <span className="kz-countdown-number">{countdown}</span>
        </div>
        <div className="kz-countdown-info">
          <span className="kz-countdown-label">即将播放下一话</span>
          <span className="kz-countdown-sub">已开启自动连播</span>
        </div>
        <div className="kz-countdown-actions">
          <button
            type="button"
            className="kz-countdown-btn kz-countdown-btn--primary"
            onClick={(e) => {
              e.stopPropagation()
              onPlayNow()
            }}
          >
            立即播放
          </button>
          <button
            type="button"
            className="kz-countdown-btn kz-countdown-btn--secondary"
            onClick={(e) => {
              e.stopPropagation()
              onCancel()
            }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
