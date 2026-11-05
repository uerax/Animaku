import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

export function WatchHudToast({ message }: { message: string | null }) {
  const isReducedMotion = useReducedMotion()

  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center"
      style={{ top: '7%' }}
    >
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            key={message}
            initial={
              isReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -10, scale: 0.94 }
            }
            animate={
              isReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              isReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -8, scale: 0.95 }
            }
            transition={{
              duration: isReducedMotion ? 0.15 : 0.22,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="kz-status-hint flex items-center gap-2 shadow-2xl"
          >
            <span className="flex h-2 w-2 relative flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--kz-accent)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--kz-accent)]" />
            </span>
            <span className="text-xs sm:text-sm font-medium">{message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
