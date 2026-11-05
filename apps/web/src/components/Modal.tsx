import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

export interface ModalProps {
  /** 弹窗是否开启 */
  open?: boolean
  /** 关闭弹窗回调 */
  onClose?: () => void
  /** 弹窗标题无障碍标签 ID 或字符串 */
  ariaLabel?: string
  ariaLabelledBy?: string
  /** 点击背景遮罩是否关闭，默认 true */
  closeOnBackdropClick?: boolean
  /** 按 ESC 键是否关闭，默认 true */
  closeOnEsc?: boolean
  /** 是否锁定 body 滚动，默认 true */
  lockScroll?: boolean
  /** 遮罩层样式类名 */
  backdropClassName?: string
  /** 居中对齐容器样式类名 */
  containerClassName?: string
  /** 弹窗卡片主体样式类名 */
  className?: string
  /** 是否渲染背景遮罩，默认 true */
  hasBackdrop?: boolean
  /** 子元素内容 */
  children: React.ReactNode
}

/**
 * 通用弹窗组件 (基于 framer-motion 实现优雅物理弹簧出入场与 Backdrop 渐隐)
 */
export function Modal({
  open = true,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  lockScroll = true,
  backdropClassName = 'bg-black/60 backdrop-blur-xs',
  containerClassName = 'p-4',
  className = '',
  hasBackdrop = true,
  children,
}: ModalProps) {
  const isReducedMotion = useReducedMotion()
  const contentRef = useRef<HTMLDivElement>(null)

  // 监听 ESC 键关闭
  useEffect(() => {
    if (!open || !closeOnEsc || !onClose) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, closeOnEsc, onClose])

  // 锁定底层 body 滚动，防止移动端与桌面端穿透滑动
  useEffect(() => {
    if (!open || !lockScroll) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open, lockScroll])

  if (typeof document === 'undefined') {
    return null
  }

  const portalTarget =
    document.fullscreenElement ||
    (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
    document.body

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto"
        >
          {/* 背景遮罩 */}
          {hasBackdrop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={closeOnBackdropClick ? onClose : undefined}
              className={`fixed inset-0 ${backdropClassName}`}
              aria-hidden="true"
            />
          )}

          {/* 模态框主体卡片 */}
          <div
            className={`relative z-10 flex w-full items-center justify-center pointer-events-none ${containerClassName}`}
          >
            <motion.div
              ref={contentRef}
              initial={
                isReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.94, y: 8 }
              }
              animate={
                isReducedMotion
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, y: 0 }
              }
              exit={
                isReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.95, y: 6 }
              }
              transition={{
                duration: isReducedMotion ? 0.15 : 0.22,
                ease: [0.16, 1, 0.3, 1],
              }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className={`pointer-events-auto ${className}`}
            >
              {children}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    portalTarget,
  )
}
