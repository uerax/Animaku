export interface PlayerStatusOverlayProps {
  loading: boolean
  seekingUi: boolean
  bufferingUi: boolean
  mediaError: string
  offsetHint: string
  hudMessage?: string
}

export function PlayerStatusOverlay({
  loading,
  seekingUi,
  bufferingUi,
  mediaError,
  offsetHint,
  hudMessage,
}: PlayerStatusOverlayProps) {
  return (
    <>
      {(loading || seekingUi || bufferingUi) && !mediaError && (
        <div className="kz-status-layer" aria-busy="true">
          <div className="kz-stall-spinner" aria-label="加载中" />
        </div>
      )}

      {mediaError && (
        <div className="kz-status-layer">
          <div className="kz-media-error">{mediaError}</div>
        </div>
      )}

      {offsetHint && !mediaError && (
        <div
          className="kz-status-layer"
          style={{ alignItems: 'flex-start', paddingTop: '12%' }}
        >
          <div className="kz-status-hint">{offsetHint}</div>
        </div>
      )}

      {hudMessage && !mediaError && (
        <div
          className="kz-status-layer"
          style={{ alignItems: 'flex-start', paddingTop: '7%' }}
        >
          <div className="kz-status-hint flex items-center gap-2">
            <span className="flex h-2 w-2 relative flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--kz-accent)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--kz-accent)]" />
            </span>
            <span className="text-xs sm:text-sm font-medium">{hudMessage}</span>
          </div>
        </div>
      )}
    </>
  )
}
