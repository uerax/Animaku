import React, { useState, useEffect } from 'react'
import {
  extractImagePath,
  buildImageUrl,
  BANGUMI_IMAGE_HOST_BANGUMI,
} from '@animaku/shared'
import { useSettingsStore } from '../stores/settings'

export interface BangumiImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null
  fallback?: React.ReactNode
}

/**
 * Bangumi 专属图片渲染组件：
 * 专用于 Bangumi 封面/海报等图片资产的 Path 提取与当前 Host（官方直连 / 代理）动态拼装
 */
export const BangumiImage: React.FC<BangumiImageProps> = ({
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

export interface BangumiAvatarProps {
  src?: string | null
  name?: string
  sizeClass?: string
  className?: string
  alt?: string
}

/**
 * Bangumi 专属用户头像渲染组件：
 * 专用于 Bangumi 吐槽区/用户信息头像，支持动态 Host 切换与首字母优雅占位
 */
export const BangumiAvatar: React.FC<BangumiAvatarProps> = ({
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
      <BangumiImage
        src={src}
        alt={alt || name}
        fallback={defaultPlaceholder}
        className="h-full w-full object-cover"
      />
    </div>
  )
}
