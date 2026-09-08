import React, { useState, useEffect, useRef, useLayoutEffect } from 'react'
import {
  extractImagePath,
  buildImageUrl,
  DEFAULT_BANGUMI_IMAGE_HOST,
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
    useSettingsStore((s) => s.bangumiImageHost) || DEFAULT_BANGUMI_IMAGE_HOST
  const path = extractImagePath(src)
  const imageUrl = path ? buildImageUrl(path, host) : ''

  const [failed, setFailed] = useState(!imageUrl)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const isLoaded = Boolean(imageUrl && loadedUrl === imageUrl)
  const imgRef = useRef<HTMLImageElement>(null)

  // 物理级 0 闪烁防线：首帧 Paint 前同步检查是否命中本地缓存，并重置错误态
  useLayoutEffect(() => {
    setFailed(!imageUrl)
    if (imageUrl && imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoadedUrl(imageUrl)
    }
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
      key={imageUrl}
      ref={imgRef}
      src={imageUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onLoad={() => setLoadedUrl(imageUrl)}
      onError={() => setFailed(true)}
      className={`bg-[var(--kz-bg-soft)] ${className} transition-opacity duration-300 ease-out ${
        isLoaded ? 'opacity-100' : 'opacity-0'
      }`}
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
