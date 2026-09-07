/**
 * Choose video src: prefer direct CDN URL to save server bandwidth,
 * use media proxy when required by source capability or server config,
 * or when proxy auth / ad-filter requires server handling.
 *
 * Always use proxy *entry* when:
 * - no playUrl
 * - proxy carries cookie= (auth-gated progressive sources)
 * - proxy carries adFilter= / forceAdFilter (playlist must be server-filtered;
 *   hybrid rewrite then leaves .ts on CDN unless fullProxy/cookie)
 * - forceProxy (source requires full media proxy)
 *
 * forceProxy also sets fullProxy=1 so m3u8 rewrite still tunnels every segment
 * (not only nested playlists).
 */

export type PlaybackSrcMode = 'direct' | 'proxy'

/**
 * How media bytes are expected to flow for the chosen src.
 * - direct: entry is bare CDN URL
 * - full-proxy: every segment/key also tunnels /api/media/proxy
 * - playlist-proxy: entry (+ nested m3u8) via proxy for ad strip; .ts stay on CDN
 */
export type PlaybackTransit = 'direct' | 'full-proxy' | 'playlist-proxy'

export function proxyRequiresAuth(proxyUrl: string | undefined | null): boolean {
  if (!proxyUrl) return false
  return /[?&]cookie=/.test(proxyUrl)
}

/** Proxy URL already requests HLS discontinuity ad-filter */
export function proxyHasAdFilter(proxyUrl: string | undefined | null): boolean {
  if (!proxyUrl) return false
  return (
    /[?&]adFilter=1(?:&|$)/.test(proxyUrl) ||
    /[?&]adFilter=true(?:&|$)/.test(proxyUrl)
  )
}

export function proxyHasFullProxy(proxyUrl: string | undefined | null): boolean {
  if (!proxyUrl) return false
  return /[?&]fullProxy=(?:1|true)(?:&|$)/.test(proxyUrl)
}

/** Whether URL is a modern ticket-based media stream */
export function isTicketStream(url: string | undefined | null): boolean {
  if (!url) return false
  return (
    url.startsWith('/api/media/stream') ||
    url.startsWith('/api/media/segment')
  )
}

/** Short UI label for WatchMeta (简介条). */
export function playbackTransitLabel(transit: PlaybackTransit): string {
  switch (transit) {
    case 'direct':
      return '直连源站'
    case 'playlist-proxy':
      return '列表代理·分片直连'
    case 'full-proxy':
    default:
      return '经服务器代理'
  }
}

export function inferPlaybackTransit(src: string, mode: PlaybackSrcMode): PlaybackTransit {
  if (mode === 'direct') return 'direct'
  if (!src) return 'full-proxy'
  if (isTicketStream(src)) {
    if (/[?&]stream=(?:1|true)(?:&|$)/.test(src)) return 'full-proxy'
    return src.includes('/segment') ? 'full-proxy' : 'playlist-proxy'
  }
  // Cookie / fullProxy → server rewrite keeps every URI on proxy
  if (proxyRequiresAuth(src) || proxyHasFullProxy(src)) return 'full-proxy'
  // adFilter without the above → hybrid rewrite (segments absolute CDN)
  if (proxyHasAdFilter(src)) return 'playlist-proxy'
  // Plain proxy (CORS/hotlink fallback, no ad filter): full tunnel
  return 'full-proxy'
}

function setProxyQueryFlag(proxyUrl: string, key: string, value: string): string {
  if (!proxyUrl) return proxyUrl
  try {
    const u = new URL(proxyUrl, 'http://local.invalid')
    u.searchParams.set(key, value)
    return u.pathname + u.search
  } catch {
    const sep = proxyUrl.includes('?') ? '&' : '?'
    // naive append if not already present
    if (new RegExp(`[?&]${key}=`).test(proxyUrl)) return proxyUrl
    return `${proxyUrl}${sep}${key}=${value}`
  }
}

/**
 * Ensure media proxy URL has adFilter=1 (global force, or merge onto rule URL).
 */
export function withAdFilter(proxyUrl: string): string {
  if (!proxyUrl) return proxyUrl
  if (proxyHasAdFilter(proxyUrl)) return proxyUrl
  return setProxyQueryFlag(proxyUrl, 'adFilter', '1')
}

/**
 * forceMediaProxy / session fallback: rewrite every segment through us.
 * Without this, adFilter hybrid mode leaves .ts on the CDN.
 */
export function withFullProxy(proxyUrl: string): string {
  if (!proxyUrl) return proxyUrl
  if (/[?&]fullProxy=(?:1|true)(?:&|$)/.test(proxyUrl)) return proxyUrl
  return setProxyQueryFlag(proxyUrl, 'fullProxy', '1')
}

export function pickPlaybackSrc(opts: {
  playUrl?: string | null
  proxyUrl?: string | null
  /** Master/per-source forced proxy (serverProxy / per-source proxy enabled) — also fullProxy segments */
  forceProxy?: boolean
  /**
   * Global force HLS ad-filter (PlayerSettings.forceAdBlocker).
   * When true, entry src is proxy with adFilter=1 (playlist filter only;
   * segments stay on CDN unless forceProxy/cookie).
   */
  forceAdFilter?: boolean
  /** Explicit flag indicating media stream or upstream requires proxy handling (e.g. cookie auth) */
  requiresProxy?: boolean
}): {
  src: string
  mode: PlaybackSrcMode
  transit: PlaybackTransit
  canTryDirect: boolean
} {
  const rawProxy = (opts.proxyUrl || '').trim()
  const play = (opts.playUrl || '').trim()

  const needProxyForAds =
    Boolean(opts.forceAdFilter) || proxyHasAdFilter(rawProxy)

  // 1. 直连 CDN 优先策略（节省服务器宝贵带宽）：
  // 只要源站有直接可用 CDN 链接，且不需要强制代理、不需要 Cookie 鉴权、未开启广告过滤，首选直连源站！
  const canTryDirect =
    Boolean(play) &&
    /^https?:\/\//i.test(play) &&
    !opts.requiresProxy &&
    !proxyRequiresAuth(rawProxy) &&
    !needProxyForAds &&
    !opts.forceProxy

  if (canTryDirect) {
    return {
      src: play,
      mode: 'direct',
      transit: 'direct',
      canTryDirect: true,
    }
  }

  // 2. 当确实需要走服务端代理时（开启了服务器代理 / 需带 Cookie 鉴权 / 过滤分集广告 / 直连不可用）：
  if (rawProxy) {
    // 现代 Ticket 受控媒体流：装配受控业务选项（adFilter, stream 代拉），严禁向 Ticket 注入废弃的 token
    if (isTicketStream(rawProxy)) {
      let ticketUrl = rawProxy

      // 若 forceAdFilter 为 true 且当前为 /stream 路由，追加 &adFilter=1
      if (
        opts.forceAdFilter &&
        (ticketUrl.startsWith('/api/media/stream') || ticketUrl.includes('/api/media/stream'))
      ) {
        if (!/[?&]adFilter=/.test(ticketUrl)) {
          ticketUrl = setProxyQueryFlag(ticketUrl, 'adFilter', '1')
        }
      }

      // 若 forceProxy 为 true，在分片或流请求上追加 &stream=1（通知网关禁止 302 丢回源站，开启流式代拉）
      if (opts.forceProxy) {
        if (!/[?&]stream=/.test(ticketUrl)) {
          ticketUrl = setProxyQueryFlag(ticketUrl, 'stream', '1')
        }
      }

      return {
        src: ticketUrl,
        mode: 'proxy',
        transit: inferPlaybackTransit(ticketUrl, 'proxy'),
        canTryDirect: false,
      }
    }

    let proxy = rawProxy
    if (opts.forceAdFilter && proxy) {
      proxy = withAdFilter(proxy)
    }
    if (opts.forceProxy && proxy) {
      proxy = withFullProxy(proxy)
    }

    return {
      src: proxy,
      mode: 'proxy',
      transit: inferPlaybackTransit(proxy, 'proxy'),
      canTryDirect: false,
    }
  }
  if (play) {
    return {
      src: play,
      mode: 'direct',
      transit: 'direct',
      canTryDirect: false,
    }
  }
  return {
    src: '',
    mode: 'proxy',
    transit: 'full-proxy',
    canTryDirect: false,
  }
}
