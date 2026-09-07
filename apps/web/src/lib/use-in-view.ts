import { useState, useEffect } from 'react'

export interface UseInViewOptions {
  /**
   * 视口边距偏移量，支持提前静默预加载（例如 '350px' 表示距离视口 350px 时即触发）
   * @default '350px'
   */
  rootMargin?: string
  /**
   * 触发阈值（0.0 ~ 1.0）
   * @default 0
   */
  threshold?: number | number[]
  /**
   * 是否仅触发一次。默认 true，进入预热区后永久保持 true 并立即销毁监听器，0 持续性能损耗。
   * @default true
   */
  triggerOnce?: boolean
}

export interface UseInViewReturn<T extends HTMLElement = HTMLElement> {
  /** Callback Ref 绑定目标 DOM 元素，即使条件挂载或延迟渲染也能精准捕获节点 */
  ref: (node: T | null) => void
  /** 当前元素是否已进入视口或预热区 */
  inView: boolean
}

/**
 * 通用高性能视口可见性探测 Hook
 * - 0 外部依赖，原生 IntersectionObserver 驱动；
 * - 默认提前 350px 静默预热拉取；
 * - 触发后自动 disconnect() 释放监听器，内存安全。
 */
export function useInView<T extends HTMLElement = HTMLElement>(
  options: UseInViewOptions = {},
): UseInViewReturn<T> {
  const { rootMargin = '350px', threshold = 0, triggerOnce = true } = options
  const [inView, setInView] = useState(false)
  const [node, setNode] = useState<T | null>(null)

  useEffect(() => {
    // 已经触发且开启单次模式时，不再重复监听
    if (inView && triggerOnce) return
    if (!node) return

    // 环境降级兜底（无头或不支持 IntersectionObserver 时直接判定可见）
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isIntersecting = Boolean(entry?.isIntersecting)
        if (isIntersecting) {
          setInView(true)
          if (triggerOnce) {
            observer.disconnect()
          }
        } else if (!triggerOnce) {
          setInView(false)
        }
      },
      { rootMargin, threshold },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [node, rootMargin, threshold, triggerOnce, inView])

  return { ref: setNode, inView }
}
