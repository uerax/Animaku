export function WatchHudToast({ message }: { message: string | null }) {
  if (!message) return null

  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center"
      style={{ top: '7%' }}
    >
      <div className="kz-status-hint flex items-center gap-2 shadow-2xl">
        <span className="flex h-2 w-2 relative flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--kz-accent)] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--kz-accent)]" />
        </span>
        <span className="text-xs sm:text-sm font-medium">{message}</span>
      </div>
    </div>
  )
}
