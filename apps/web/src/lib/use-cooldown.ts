import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * 包装一个回调函数，并在触发后进入指定时长的冷却期 (CD)。
 * 冷却期间再次调用该函数将被直接忽略，杜绝短时间内并发连击与狂按回车。
 * 内部结合 ref 与 state，既保证同步同一 tick 立即上锁，又驱动 UI 按钮置灰。
 */
export function useCooldownCallback<T extends (...args: any[]) => any>(
  callback: T,
  cooldownMs = 500,
): [(...args: Parameters<T>) => ReturnType<T> | undefined, boolean] {
  const [cooling, setCooling] = useState(false)
  const coolingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const trigger = useCallback(
    (...args: Parameters<T>): ReturnType<T> | undefined => {
      if (coolingRef.current) return undefined
      coolingRef.current = true
      setCooling(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        coolingRef.current = false
        setCooling(false)
        timerRef.current = null
      }, cooldownMs)
      return callbackRef.current(...args)
    },
    [cooldownMs],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return [trigger, cooling]
}

/**
 * 支持按 key 细分的冷却包装器（例如按视频源 pluginName 独立冷却）。
 * 某个 key 进入冷却后，不影响其他 key 的操作。
 */
export function useKeyedCooldownCallback<K extends string, Args extends any[] = any[], Ret = any>(
  callback: (key: K, ...args: Args) => Ret,
  cooldownMs = 500,
): [
  (key: K, ...args: Args) => Ret | undefined,
  (key: K) => boolean,
] {
  const [coolingKeys, setCoolingKeys] = useState<Record<string, boolean>>({})
  const coolingKeysRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const trigger = useCallback(
    (key: K, ...args: Args): Ret | undefined => {
      if (coolingKeysRef.current.has(key)) return undefined
      coolingKeysRef.current.add(key)
      setCoolingKeys((prev) => ({ ...prev, [key]: true }))

      const existing = timersRef.current.get(key)
      if (existing) clearTimeout(existing)

      const t = setTimeout(() => {
        coolingKeysRef.current.delete(key)
        setCoolingKeys((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        timersRef.current.delete(key)
      }, cooldownMs)

      timersRef.current.set(key, t)
      return callbackRef.current(key, ...args)
    },
    [cooldownMs],
  )

  const isCooling = useCallback(
    (key: K) => Boolean(coolingKeys[key]),
    [coolingKeys],
  )

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) {
        clearTimeout(t)
      }
      timersRef.current.clear()
    }
  }, [])

  return [trigger, isCooling]
}
