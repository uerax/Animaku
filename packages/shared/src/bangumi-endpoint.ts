/**
 * Bangumi 端点与主机配置（API 反代、图片反代、Web 站点镜像）。
 *
 * 官方源 vs 镜像反代源：
 * - API:    https://api.bgm.tv   <-> https://bgmapi.anibt.net
 * - Image:  lain.bgm.tv          <-> bgmimg.anibt.net
 * - Web:    https://bgm.tv       <-> https://bgmmi.anibt.net
 */

export const BANGUMI_IMAGE_HOST_BANGUMI = 'lain.bgm.tv'
export const BANGUMI_IMAGE_HOST_MIRROR = 'bgmimg.anibt.net'
export const DEFAULT_BANGUMI_IMAGE_HOST = BANGUMI_IMAGE_HOST_MIRROR

export const BANGUMI_API_HOST_BANGUMI = 'api.bgm.tv'
export const BANGUMI_API_HOST_MIRROR = 'bgmapi.anibt.net'
export const BANGUMI_API_URL_BANGUMI = 'https://api.bgm.tv'
export const BANGUMI_API_URL_MIRROR = 'https://bgmapi.anibt.net'
export const DEFAULT_BANGUMI_API_HOST = BANGUMI_API_HOST_MIRROR

export const BANGUMI_WEB_HOST_BANGUMI = 'bgm.tv'
export const BANGUMI_WEB_HOST_MIRROR = 'bgmmi.anibt.net'
export const BANGUMI_WEB_URL_BANGUMI = 'https://bgm.tv'
export const BANGUMI_WEB_URL_MIRROR = 'https://bgmmi.anibt.net'

/** 可改写的已知图片 host —— 其它 host（插件站图等）原样返回。 */
const REWRITABLE_IMAGE_HOSTS = new Set([
  BANGUMI_IMAGE_HOST_BANGUMI,
  BANGUMI_IMAGE_HOST_MIRROR,
  'bgm.tv',
  'www.bgm.tv',
  'bgmmi.anibt.net',
])

/** 容忍 `https://host/`、`host/path` 之类输入。 */
export function normalizeBangumiImageHost(raw?: string | null): string {
  return (raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
}

export function normalizeBangumiApiHost(raw?: string | null): string {
  return (raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
}

export function normalizeBangumiWebHost(raw?: string | null): string {
  return (raw || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
}

/**
 * 解析用户配置的 API 源（支持 'official' | 'mirror' | 'api.bgm.tv' | 'bgmapi.anibt.net' | 'https://...' 等）
 */
export function resolveBangumiApiPreset(raw?: string | null): string {
  const v = (raw || '').trim().toLowerCase()
  if (!v || v === 'mirror' || v === 'proxy' || v === '1' || v.includes('bgmapi')) {
    return BANGUMI_API_HOST_MIRROR
  }
  if (v === 'official' || v === 'direct' || v === '0' || v.includes('bgm.tv')) {
    return BANGUMI_API_HOST_BANGUMI
  }
  return normalizeBangumiApiHost(v) || BANGUMI_API_HOST_MIRROR
}

/**
 * 解析用户配置的图片源（支持 'official' | 'mirror' | 'lain.bgm.tv' | 'bgmimg.anibt.net' | 'https://...' 等）
 */
export function resolveBangumiImagePreset(raw?: string | null): string {
  const v = (raw || '').trim().toLowerCase()
  if (!v || v === 'mirror' || v === 'proxy' || v === '1' || v.includes('bgmimg')) {
    return BANGUMI_IMAGE_HOST_MIRROR
  }
  if (
    v === 'official' ||
    v === 'direct' ||
    v === '0' ||
    v.includes('lain') ||
    v.includes('bgm.tv')
  ) {
    return BANGUMI_IMAGE_HOST_BANGUMI
  }
  return normalizeBangumiImageHost(v) || BANGUMI_IMAGE_HOST_MIRROR
}

export function toBangumiApiUrl(hostOrUrl?: string | null): string {
  const raw = (hostOrUrl || '').trim()
  if (!raw) return BANGUMI_API_URL_MIRROR
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '')
  }
  const host = resolveBangumiApiPreset(raw)
  return host ? `https://${host}` : BANGUMI_API_URL_MIRROR
}

export function toBangumiWebUrl(hostOrUrl?: string | null): string {
  const raw = (hostOrUrl || '').trim()
  if (!raw) return BANGUMI_WEB_URL_BANGUMI
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '')
  }
  const host = normalizeBangumiWebHost(raw)
  return host ? `https://${host}` : BANGUMI_WEB_URL_BANGUMI
}

let currentImageHost: string = BANGUMI_IMAGE_HOST_MIRROR
let currentApiHost: string = BANGUMI_API_HOST_MIRROR

export function setBangumiImageHost(host?: string | null): void {
  currentImageHost = resolveBangumiImagePreset(host) || BANGUMI_IMAGE_HOST_MIRROR
}

export function getBangumiImageHost(): string {
  return currentImageHost
}

export function setBangumiApiHost(host?: string | null): void {
  currentApiHost = resolveBangumiApiPreset(host) || BANGUMI_API_HOST_MIRROR
}

export function getBangumiApiHost(): string {
  return currentApiHost
}

export function getBangumiApiUrl(): string {
  return toBangumiApiUrl(currentApiHost)
}

/** 把已知 Bangumi 图片 host 换成当前源或指定源；其它 host / 相对路径原样返回。 */
export function bangumiImageUrl(
  url: string,
  overrideHost?: string | null,
): string {
  const src = (url || '').trim()
  if (!src) return ''
  const m = /^(https?:)\/\/([^/?#]+)(.*)$/i.exec(src)
  if (!m) return src
  const host = m[2].toLowerCase()
  const targetHost = overrideHost
    ? resolveBangumiImagePreset(overrideHost) || currentImageHost
    : currentImageHost
  if (host === targetHost || !REWRITABLE_IMAGE_HOSTS.has(host)) return src
  return `${m[1]}//${targetHost}${m[3]}`
}

/** 把已知 Bangumi 图片 host 强制换成官方源 lain.bgm.tv（用于 SEO / Sitemap / JSON-LD） */
export function toBangumiOfficialImageUrl(url: string): string {
  const src = (url || '').trim()
  if (!src) return ''
  const m = /^(https?:)\/\/([^/?#]+)(.*)$/i.exec(src)
  if (!m) return src
  const host = m[2].toLowerCase()
  if (REWRITABLE_IMAGE_HOSTS.has(host)) {
    return `https://${BANGUMI_IMAGE_HOST_BANGUMI}${m[3]}`
  }
  return src
}

/**
 * 从任意完整图片 URL 或相对路径中提取标准路径 (Pathname + Query)
 * 无论输入 https://lain.bgm.tv/pic/user/1.jpg、https://bgmimg.anibt.net/pic/user/1.jpg 还是 /pic/user/1.jpg
 * 均提取出 /pic/user/1.jpg
 */
export function extractImagePath(rawUrl?: string | null): string {
  if (!rawUrl || !rawUrl.trim()) return ''
  const trimmed = rawUrl.trim()
  const m = /^(?:https?:)?\/\/[^/?#]+(\/[^?#]*)(\?.*)?$/i.exec(trimmed)
  if (m) {
    return `${m[1]}${m[2] || ''}`
  }
  if (trimmed.startsWith('/')) {
    return trimmed
  }
  return `/${trimmed}`
}

/**
 * 纯粹按 Host 与 Path 拼装最终图片 URL：https://${host}${path}
 */
export function buildImageUrl(
  path?: string | null,
  host: string = BANGUMI_IMAGE_HOST_BANGUMI,
): string {
  if (!path || !path.trim()) return ''
  const cleanPath = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`
  const cleanHost = (host || BANGUMI_IMAGE_HOST_BANGUMI)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
  return `https://${cleanHost}${cleanPath}`
}

/** 生成 Bangumi 条目页面 URL（固定跳转官方 bgm.tv） */
export function bangumiSubjectUrl(id: number | string): string {
  return `https://bgm.tv/subject/${id}`
}

/** 生成 Bangumi OAuth / Access Token 页面 URL（固定跳转官方 bgm.tv） */
export function bangumiOAuthUrl(): string {
  return 'https://next.bgm.tv/demo/access-token'
}
