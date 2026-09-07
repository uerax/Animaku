import { useCallback, useRef } from 'react'
import { bufferedAhead } from '../media/format'

/**
 * 统一程序化操作意图守卫：
 * 记录主动程序化操作（倍速调整、Seek 拖动、跳过 OP/ED）引发的底层 DOM 噪声豁免截止时间。
 */
export function useIntentGuard() {
  const programmaticIntentExpiryRef = useRef(0)

  const withIntentGuard = useCallback(
    (durationMs: number, action: () => void) => {
      programmaticIntentExpiryRef.current = Date.now() + durationMs
      action()
    },
    [],
  )

  const isProgrammaticNoise = useCallback(() => {
    return Date.now() < programmaticIntentExpiryRef.current
  }, [])

  /**
   * 缓冲感知判断：
   * 只有在「处于程序化守卫期」且「当前具备可播数据（不是真正的网络缺数据饥饿）」时，才将 pause 判定为瞬态噪声并豁免。
   * 若当前缓冲确实耗尽（video.readyState < HAVE_CURRENT_DATA 且 bufferedAhead <= 0），则必须正常触发缓冲等待，严禁盲目 play() 造成抖动。
   */
  const shouldSuppressPause = useCallback((v: HTMLVideoElement) => {
    if (Date.now() >= programmaticIntentExpiryRef.current) return false
    const reallyStarved =
      v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA &&
      bufferedAhead(v) <= 0
    return !reallyStarved
  }, [])

  const shouldSuppressPauseRef = useRef(shouldSuppressPause)
  shouldSuppressPauseRef.current = shouldSuppressPause

  const withIntentGuardRef = useRef(withIntentGuard)
  withIntentGuardRef.current = withIntentGuard

  return {
    programmaticIntentExpiryRef,
    withIntentGuard,
    withIntentGuardRef,
    isProgrammaticNoise,
    shouldSuppressPause,
    shouldSuppressPauseRef,
  }
}
