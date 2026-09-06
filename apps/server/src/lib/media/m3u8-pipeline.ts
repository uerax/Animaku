/**
 * M3U8 播放列表处理管道
 *
 * 包含播放列表体积限制读取、广告切片清洗过滤、内部 URI 与 EXT 属性改写、以及 VOD/Live 缓存策略计算。
 */

import { filterM3u8AdsIfApplicable } from '@animaku/shared'
import { isPrivateHost } from '../private-host'
import { cancelBody } from './media-fetcher'

/** 限制播放列表单次拉取最大字节数 (1.5MB)，防止异常大文本撑爆内存 */
export const MAX_M3U8_BYTES = 1_500_000

export interface RewriteOpts {
  referer: string
  cookie: string
  /** 管理员媒体代理鉴权 Token */
  token?: string
  /** 客户端是否具有媒体流完整代理权限 */
  hasMediaAuth?: boolean
  /** 是否开启切片广告过滤 */
  adFilter?: boolean
  /** 是否强制全量媒体分片代理 */
  fullProxy?: boolean
  /** 是否强制代理该 URI（用于 KEY / MAP 等小体积受限资源） */
  alwaysProxy?: boolean
}

export function isM3u8Path(abs: URL): boolean {
  return /\.m3u8($|[?#])/i.test(abs.pathname + abs.search)
}

/**
 * 判断上游响应是否为 M3U8 格式（依据 Content-Type 与 URL 后缀）
 */
export function isM3u8Response(res: Response, target: URL): boolean {
  const rawContentType = (res.headers.get('content-type') || '').toLowerCase()
  return (
    rawContentType.includes('mpegurl') ||
    rawContentType.includes('m3u8') ||
    target.pathname.endsWith('.m3u8')
  )
}

/**
 * 带有体积上限限制的安全文本读取器
 */
export async function readTextLimited(
  res: Response,
  maxBytes: number = MAX_M3U8_BYTES,
): Promise<string> {
  const cl = res.headers.get('content-length')
  if (cl) {
    const n = Number(cl)
    if (Number.isFinite(n) && n > maxBytes) {
      cancelBody(res)
      throw new Error(`播放列表过大 (${n} > ${maxBytes} bytes)`)
    }
  }

  if (!res.body) return res.text()

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value?.byteLength) continue
    total += value.byteLength
    if (total > maxBytes) {
      try {
        await reader.cancel()
      } catch {
        /* ignore */
      }
      throw new Error(`播放列表过大 (>${maxBytes} bytes)`)
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged)
}

/**
 * 改写播放列表中单条 URI：
 * - 默认 / fullProxy / cookie 场景：所有公共 URI 改写为 `/api/media/proxy`；
 * - 混合模式 (hybrid)：仅嵌套的 .m3u8 走代理过滤，.ts / .m4s 视频切片直连 CDN 降低服务端带宽压力。
 */
export function rewriteM3u8Uri(u: string, base: URL, opts: RewriteOpts): string {
  const abs = new URL(u, base)
  if (isPrivateHost(abs.hostname)) {
    // 禁止代理内网分片或密钥地址
    return abs.toString()
  }

  const adFilter = Boolean(opts.adFilter)
  const fullProxy = Boolean(opts.fullProxy)
  const cookie = opts.cookie || ''
  const token = opts.token || ''
  const playlist = isM3u8Path(abs)

  // 混合广告过滤或无授权场景：客户端直连 CDN 拉取媒体分片
  if (
    !opts.hasMediaAuth ||
    (adFilter && !cookie && !fullProxy && !playlist && !opts.alwaysProxy)
  ) {
    if (!playlist) {
      return abs.toString()
    }
  }

  const q = new URLSearchParams({
    url: abs.toString(),
    referer: opts.referer,
  })

  if (cookie) q.set('cookie', cookie)
  if (token) q.set('token', token)
  if (fullProxy) q.set('fullProxy', '1')
  // 嵌套 M3U8 子列表保持 adFilter 标志传递
  if (adFilter && playlist) {
    q.set('adFilter', '1')
  }

  return `/api/media/proxy?${q.toString()}`
}

/**
 * 改写 #EXT-X-KEY / #EXT-X-MAP 等标签行中的 URI="..." 属性
 */
export function rewriteExtUriAttrs(
  line: string,
  base: URL,
  opts: RewriteOpts,
): string {
  return line.replace(/URI=(["'])([^"']+)\1/gi, (_m, quote: string, u: string) => {
    try {
      const proxied = rewriteM3u8Uri(u, base, {
        ...opts,
        alwaysProxy: Boolean(opts.hasMediaAuth && (opts.token || opts.fullProxy)),
      })
      return `URI=${quote}${proxied}${quote}`
    } catch {
      return `URI=${quote}${u}${quote}`
    }
  })
}

/**
 * 完整处理 M3U8 文本：执行广告过滤、行级 URI 改写并计算缓存标头
 */
export function processM3u8Playlist(
  rawText: string,
  target: URL,
  opts: RewriteOpts,
): { content: string; cacheControl: string } {
  let text = rawText

  if (opts.adFilter) {
    try {
      const { content } = filterM3u8AdsIfApplicable(text, target.toString())
      text = content
    } catch {
      // 广告过滤异常时优雅降级为原样内容
    }
  }

  const base = target
  const content = text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        return rewriteExtUriAttrs(line, base, opts)
      }
      try {
        return rewriteM3u8Uri(trimmed, base, opts)
      } catch {
        return line
      }
    })
    .join('\n')

  // 点播与主播放列表允许缓存 180s（3分钟），滚动直播列表短期缓存 3s
  const isVodOrMaster =
    text.includes('#EXT-X-ENDLIST') ||
    text.includes('#EXT-X-STREAM-INF') ||
    text.includes('#EXT-X-PLAYLIST-TYPE:VOD')

  const cacheControl = isVodOrMaster
    ? 'private, max-age=180'
    : 'private, max-age=3'

  return { content, cacheControl }
}
