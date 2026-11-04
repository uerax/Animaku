import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'

export interface SwitchProps {
  /** 当前开关状态 */
  checked: boolean
  /** 状态变更回调 */
  onChange: (checked: boolean) => void
  /** 是否禁用 */
  disabled?: boolean
  /** 开关无障碍描述标签 */
  ariaLabel?: string
  /** 尺寸大小，默认 'md' */
  size?: 'sm' | 'md'
  /** 自定义外层样式类名 */
  className?: string
}

/**
 * 现代 iOS 风格胶囊开关组件 (基于 framer-motion layout 与 spring 物理弹簧阻尼)
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  size = 'md',
  className = '',
}: SwitchProps) {
  const isReducedMotion = useReducedMotion()

  const handleToggle = () => {
    if (disabled) return
    onChange(!checked)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onChange(!checked)
    }
  }

  // 尺寸定义
  const isSm = size === 'sm'
  const trackClass = isSm
    ? 'w-9 h-5 p-0.5'
    : 'w-11 h-6 p-0.5'
  const thumbClass = isSm
    ? 'w-4 h-4'
    : 'w-5 h-5'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kz-accent)] focus-visible:ring-offset-2 select-none cursor-pointer ${trackClass} ${
        checked
          ? 'bg-[var(--kz-accent)]'
          : 'bg-[var(--kz-border)] hover:bg-[var(--kz-border-subtle,#cbd5e1)]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
    >
      <motion.span
        layout
        transition={
          isReducedMotion
            ? { duration: 0.1 }
            : { type: 'spring', stiffness: 500, damping: 30 }
        }
        className={`pointer-events-none block rounded-full bg-white shadow-md ring-0 ${thumbClass} ${
          checked ? 'ml-auto' : 'mr-auto'
        }`}
      />
    </button>
  )
}

export interface SwitchRowProps extends SwitchProps {
  /** 标题文字 */
  label: React.ReactNode
  /** 副标题或说明文案 */
  description?: React.ReactNode
}

/**
 * 带标题与说明的设置项开关行组件
 */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  size = 'md',
  className = '',
}: SwitchRowProps) {
  return (
    <div
      onClick={() => {
        if (!disabled) onChange(!checked)
      }}
      className={`flex items-center justify-between gap-3 py-1 select-none cursor-pointer ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      } ${className}`}
    >
      <div className="min-w-0 flex-1 pr-2">
        <div className="text-xs sm:text-sm font-medium text-[var(--kz-fg)]">
          {label}
        </div>
        {description && (
          <div className="text-[11px] sm:text-xs text-[var(--kz-fg-muted)] mt-0.5 leading-relaxed">
            {description}
          </div>
        )}
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        size={size}
      />
    </div>
  )
}
