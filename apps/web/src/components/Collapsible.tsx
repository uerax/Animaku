import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

export interface CollapsibleProps {
  /** 是否展开 */
  open: boolean
  /** 内容 */
  children: React.ReactNode
  /** 外层容器类名 */
  className?: string
  /** 动画持续时间（秒），默认 0.26 */
  duration?: number
}

/**
 * 通用平滑折叠动画容器 (利用 framer-motion 的 height: 0 -> auto 实现无布局跳动的平滑推拉)
 */
export function Collapsible({
  open,
  children,
  className = '',
  duration = 0.26,
}: CollapsibleProps) {
  const isReducedMotion = useReducedMotion()

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={
            isReducedMotion
              ? { opacity: 0 }
              : { height: 0, opacity: 0 }
          }
          animate={
            isReducedMotion
              ? { opacity: 1 }
              : { height: 'auto', opacity: 1 }
          }
          exit={
            isReducedMotion
              ? { opacity: 0 }
              : { height: 0, opacity: 0 }
          }
          transition={{
            height: {
              duration: isReducedMotion ? 0 : duration,
              ease: [0.16, 1, 0.3, 1],
            },
            opacity: {
              duration: isReducedMotion ? 0 : duration * 0.75,
              ease: 'easeOut',
            },
          }}
          className={`overflow-hidden ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
