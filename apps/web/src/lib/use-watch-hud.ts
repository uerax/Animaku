import { useCallback, useEffect, useState } from 'react'

export interface UseWatchHudOptions {
  /** HUD 消息自动淡出时长（毫秒），默认 3500ms */
  autoDismissMs?: number
}

/**
 * 播放页 HUD 悬浮提示状态机：
 * 负责接收全局 HUD 提示并在指定时长后自动清除。
 */
export function useWatchHud(options: UseWatchHudOptions = {}) {
  const { autoDismissMs = 3500 } = options
  const [hudMessage, setHudMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!hudMessage) return
    const timer = setTimeout(() => {
      setHudMessage(null)
    }, autoDismissMs)
    return () => clearTimeout(timer)
  }, [hudMessage, autoDismissMs])

  const clearHudMessage = useCallback(() => setHudMessage(null), [])

  return {
    hudMessage,
    setHudMessage,
    clearHudMessage,
  }
}
