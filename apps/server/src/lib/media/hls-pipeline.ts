import { posix } from 'node:path'
import { filterM3u8AdsIfApplicable } from '@animaku/shared'
import {
  playbackRegistry,
  type PlaybackRegistry,
} from './playback-registry'
import { sourceRegistry, type SourceRegistry } from '../source/source-registry'
import type { PlaybackAsset, PlaybackTicketType } from './playback-types'
import { validateSubPath } from './ticket-codec'

export interface RewriteHlsOptions {
  adFilter?: boolean
  forceProxy?: boolean
  playback?: PlaybackRegistry
  source?: SourceRegistry
}

/**
 * 计算相对于 asset.baseUrl 的规范化相对路径
 */
function computeRelativeSub(
  targetUri: string,
  baseUrl: URL,
  currentSub: string,
): { relativeSub: string | null; targetUrl: URL } {
  // 当前播放列表的实际 URL
  const currentPlaylistUrl = currentSub
    ? new URL(currentSub, baseUrl)
    : baseUrl

  const targetUrl = new URL(targetUri, currentPlaylistUrl)
  const [targetUriPath] = targetUri.split('?')

  // 1. 如果原始 URI 就是平级或向下相对路径 (没有 scheme、不以 / 开头，且不包含 .. 跨级相对跳转)
  if (
    !targetUriPath.includes(':') &&
    !targetUri.startsWith('//') &&
    !targetUri.startsWith('/') &&
    !targetUriPath.split('/').includes('..')
  ) {
    const currentSubPath = currentSub ? currentSub.split('?')[0] : ''
    const parentDir = currentSubPath ? posix.dirname(currentSubPath) : ''
    const candidate =
      parentDir && parentDir !== '.'
        ? posix.join(parentDir, targetUri)
        : targetUri
    const check = validateSubPath(candidate)
    if (check.valid) {
      return { relativeSub: check.normalized, targetUrl }
    }
  }

  // 2. 如果同源且位于同一路径前缀下（支持绝对路径与含 .. 跨级解析后的规范子路径）
  if (targetUrl.origin === baseUrl.origin) {
    const baseDir = baseUrl.pathname.endsWith('/')
      ? baseUrl.pathname.slice(0, -1) || '/'
      : posix.dirname(baseUrl.pathname)
    const baseDirPrefix = baseDir === '/' ? '/' : `${baseDir}/`
    if (targetUrl.pathname.startsWith(baseDirPrefix)) {
      const candidate = targetUrl.pathname.slice(baseDirPrefix.length)
      const query = targetUrl.search || ''
      const subWithQuery = query ? `${candidate}${query}` : candidate
      const check = validateSubPath(subWithQuery)
      if (check.valid) {
        return { relativeSub: check.normalized, targetUrl }
      }
    }
  }

  return { relativeSub: null, targetUrl }
}

/**
 * HLS AST 管线化全要素结构改写
 *
 * 覆盖改写：
 * - #EXT-X-STREAM-INF (变体多码率子列表) ➔ 签发 Playlist Ticket (TTL 15m)
 * - #EXT-X-KEY (AES-128 解密密钥) ➔ 签发 Key Ticket (TTL 60m)
 * - #EXT-X-MAP (fMP4 初始化切片 init.mp4) ➔ 签发 Segment Ticket (TTL 60m)
 * - #EXTINF (媒体切片 .ts / .m4s / .mp4) ➔ 签发 Segment Ticket (TTL 60m)
 */
export function rewriteM3u8Ast(
  rawM3u8: string,
  asset: PlaybackAsset,
  currentSub: string = '',
  options: RewriteHlsOptions = {},
): string {
  const playback = options.playback || playbackRegistry
  const srcRegistry = options.source || sourceRegistry

  let text = rawM3u8
  const baseUrl = new URL(asset.baseUrl)

  // 1. 广告过滤清洗
  if (options.adFilter) {
    try {
      const currentUrl = currentSub
        ? new URL(currentSub, baseUrl).toString()
        : asset.baseUrl
      const filtered = filterM3u8AdsIfApplicable(text, currentUrl)
      text = filtered.content
    } catch {
      // 过滤异常优雅降级
    }
  }

  const lines = text.split('\n')
  const rewrittenLines: string[] = []

  let nextIsVariantPlaylist = false
  let nextIsSegment = false

  // 本次 M3U8 改写范围内的跨域/绝对路径子资产共享缓存（按基址缓存，杜绝重复创建）
  const subAssetCache = new Map<string, PlaybackAsset>()

  function issueTicketForUri(uri: string, typ: PlaybackTicketType): string {
    const trimmed = uri.trim()
    if (!trimmed) return uri

    const { relativeSub, targetUrl } = computeRelativeSub(
      trimmed,
      baseUrl,
      currentSub,
    )

    let targetAsset = asset
    let finalSub = ''

    if (relativeSub !== null) {
      finalSub = relativeSub
    } else {
      // 跨目录或跨 CDN 域名：按目录基址登记共享子资产（同一目录下的成百上千个分片共享同一个 targetAsset）
      const baseDir = posix.dirname(targetUrl.pathname)
      const targetBase = `${targetUrl.origin}${baseDir === '/' ? '' : baseDir}/`
      const candidateSub = targetUrl.pathname.slice(baseDir === '/' ? 1 : baseDir.length + 1)
      const subWithQuery = targetUrl.search ? `${candidateSub}${targetUrl.search}` : candidateSub

      const check = validateSubPath(subWithQuery)
      if (check.valid) {
        let cached = subAssetCache.get(targetBase)
        if (!cached) {
          cached = playback.registerAsset({
            source: asset.source,
            baseUrl: targetBase,
            trustLevel: asset.trustLevel,
            publicHeaders: asset.publicHeaders,
            credentials: asset.encryptedCredentials
              ? playback.getDecryptedCredentials(asset) || undefined
              : undefined,
            ttlMs: Math.max(1000, asset.expiresAt - Date.now()),
          })
          subAssetCache.set(targetBase, cached)
        }
        targetAsset = cached
        finalSub = check.normalized
      } else {
        // 极端异常兜底：以完整 URL 登记单个子资产并加入单 URL 缓存
        let cached = subAssetCache.get(targetUrl.href)
        if (!cached) {
          cached = playback.registerAsset({
            source: asset.source,
            baseUrl: targetUrl.href,
            trustLevel: asset.trustLevel,
            publicHeaders: asset.publicHeaders,
            credentials: asset.encryptedCredentials
              ? playback.getDecryptedCredentials(asset) || undefined
              : undefined,
            ttlMs: Math.max(1000, asset.expiresAt - Date.now()),
          })
          subAssetCache.set(targetUrl.href, cached)
        }
        targetAsset = cached
        finalSub = ''
      }
    }

    // 动态生命周期：由 PlaybackRegistry 依据层级模型自动决断（Playlist 30m，Segment 4h 且跟随 Asset 剩余寿命）
    const ticket = playback.issueTicket({
      aid: targetAsset.assetId,
      src: asset.source,
      typ,
      sub: finalSub,
    })

    if (typ === 'playlist') {
      const q: string[] = []
      if (options.adFilter) q.push('adFilter=1')
      if (options.forceProxy) q.push('stream=1')
      const query = q.length > 0 ? `&${q.join('&')}` : ''
      return `/api/media/stream?t=${encodeURIComponent(ticket)}${query}`
    }
    const query = options.forceProxy ? '&stream=1' : ''
    return `/api/media/segment?t=${encodeURIComponent(ticket)}${query}`
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      rewrittenLines.push(line)
      continue
    }

    // 1. 处理属性标签行中的 URI 引用：#EXT-X-KEY / #EXT-X-MAP / #EXT-X-MEDIA
    if (
      trimmed.startsWith('#EXT-X-KEY') ||
      trimmed.startsWith('#EXT-X-MAP') ||
      trimmed.startsWith('#EXT-X-MEDIA')
    ) {
      let typ: PlaybackTicketType = 'segment'
      if (trimmed.startsWith('#EXT-X-KEY')) {
        typ = 'key'
      } else if (trimmed.startsWith('#EXT-X-MEDIA')) {
        typ = 'playlist'
      }

      const rewrittenLine = line.replace(
        /URI=(["'])([^"']+)\1/gi,
        (_m, quote: string, uri: string) => {
          try {
            const proxied = issueTicketForUri(uri, typ)
            return `URI=${quote}${proxied}${quote}`
          } catch {
            return `URI=${quote}${uri}${quote}`
          }
        },
      )
      rewrittenLines.push(rewrittenLine)
      continue
    }

    // 2. 状态标识标记
    if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
      nextIsVariantPlaylist = true
      rewrittenLines.push(line)
      continue
    }

    if (trimmed.startsWith('#EXTINF')) {
      nextIsSegment = true
      rewrittenLines.push(line)
      continue
    }

    // 3. 注释或其他非 URI 标签
    if (trimmed.startsWith('#')) {
      rewrittenLines.push(line)
      continue
    }

    // 4. URI 数据行改写
    // 提取 URI 的路径部分（剔除 Query 参数），并排查 nextIsSegment
    // 防止切片 URL 参数中携带 .m3u8（如 ?orig=video.m3u8）导致误判为子播放列表
    const uriPath = trimmed.split('?')[0].toLowerCase()
    const looksLikePlaylist =
      nextIsVariantPlaylist ||
      (!nextIsSegment && (uriPath.endsWith('.m3u8') || uriPath.endsWith('.m3u')))

    if (looksLikePlaylist) {
      nextIsVariantPlaylist = false
      nextIsSegment = false
      try {
        const proxied = issueTicketForUri(trimmed, 'playlist')
        rewrittenLines.push(proxied)
      } catch {
        rewrittenLines.push(line)
      }
      continue
    }

    if (nextIsSegment || !trimmed.startsWith('#')) {
      nextIsSegment = false
      try {
        const proxied = issueTicketForUri(trimmed, 'segment')
        rewrittenLines.push(proxied)
      } catch {
        rewrittenLines.push(line)
      }
      continue
    }

    rewrittenLines.push(line)
  }

  return rewrittenLines.join('\n')
}
