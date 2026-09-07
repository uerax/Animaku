export interface PlaybackRippleProps {
  ripple: { id: number; type: 'play' | 'pause' } | null
}

export function PlaybackRipple({ ripple }: PlaybackRippleProps) {
  if (!ripple) return null

  return (
    <div key={ripple.id} className="kz-player-ripple" aria-hidden="true">
      {ripple.type === 'play' ? (
        <svg className="w-8 h-8 fill-current ml-0.5" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      ) : (
        <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      )}
    </div>
  )
}
