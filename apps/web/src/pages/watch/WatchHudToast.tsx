export function WatchHudToast({ message }: { message: string | null }) {
  if (!message) return null

  return (
    <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-sky-500/30 bg-[#0f141e]/90 px-4 py-2 text-xs font-medium text-sky-200 shadow-2xl shadow-black/80 backdrop-blur-xl transition-all animate-in fade-in slide-in-from-top-2 duration-200 sm:text-sm">
      <span className="flex h-2 w-2 relative">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
      </span>
      <span>{message}</span>
    </div>
  )
}
