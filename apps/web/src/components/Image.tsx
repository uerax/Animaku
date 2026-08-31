import React, { useState, useEffect } from 'react'
import {
  extractImagePath,
  buildImageUrl,
  BANGUMI_IMAGE_HOST_BANGUMI,
} from '@animaku/shared'
import { useSettingsStore } from '../stores/settings'

export interface ImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null
  fallback?: React.ReactNode
}

/**
 * 通用图片组件：
 * 1. 从传入的 URL 提取标准路径 (path)
 * 2. 动态写入当前用户配置的 host: https://${host}${path}
 * 3. 若加载失败直接展示 fallback 占位，不做多余的回退重试
 */
export const Image: React.FC<ImageProps> = ({
  src,
  fallback,
  alt = '',
  className = '',
  ...rest
}) => {
  const host =
    useSettingsStore((s) => s.bangumiImageHost) || BANGUMI_IMAGE_HOST_BANGUMI
  const path = extractImagePath(src)
  const imageUrl = path ? buildImageUrl(path, host) : ''

  const [failed, setFailed] = useState(!imageUrl)

  useEffect(() => {
    setFailed(!imageUrl)
  }, [imageUrl])

  if (failed || !imageUrl) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className={`bg-[var(--kz-bg-soft)] ${className}`} />
    )
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
      {...rest}
    />
  )
}

export interface AvatarProps {
  src?: string | null
  name?: string
  sizeClass?: string
  className?: string
  alt?: string
}

/**
 * 通用头像组件：
 * 自动使用 Image 组件进行 host 拼接与容灾，404 或无图时优雅展示首字母占位
 */
export const Avatar: React.FC<AvatarProps> = ({
  src,
  name = '匿',
  sizeClass = 'h-9 w-9',
  className = '',
  alt,
}) => {
  const initial = (name.trim() || '匿')[0].toUpperCase()

  const defaultPlaceholder = (
    <div className="flex h-full w-full items-center justify-center font-semibold text-xs text-[var(--kz-fg-muted)] bg-[var(--kz-bg-soft)]">
      {initial}
    </div>
  )

  return (
    <div
      className={`relative shrink-0 select-none overflow-hidden rounded-full ring-1 ring-[var(--kz-border)]/60 shadow-xs ${sizeClass} ${className}`}
    >
      <Image
        src={src}
        alt={alt || name}
        fallback={defaultPlaceholder}
        className="h-full w-full object-cover"
      />
    </div>
  )
}
