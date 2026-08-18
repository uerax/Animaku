import { Hono } from 'hono'
import { filterM3u8AdsIfApplicable } from '@animaku/shared'
import { config } from '../config'
import { requireMediaProxyAccess, clientRemoteAddress } from '../lib/access'
import { fetchPublic, isPrivateHost } from '../lib/private-host'

export const mediaRoutes = new Hono()

mediaRoutes.use('*', requireMediaProxyAccess)

/** Track active streaming connections per client IP to prevent concurrency DDoS / mass-leeching */
const MAX_CONCURRENT_MEDIA_PER_IP = 8
const activeStreamsPerIp = new Map<string, number>()

function acquireStream(ip: string): boolean {
  const current = activeStreamsPerIp.get(ip) || 0
  if (current >= MAX_CONCURRENT_MEDIA_PER_IP) return false
  activeStreamsPerIp.set(ip, current + 1)
  return true
}

function releaseStream(ip: string): void {
  const current = activeStreamsPerIp.get(ip) || 1
  if (current <= 1) {
    activeStreamsPerIp.delete(ip)
  } else {
    activeStreamsPerIp.set(ip, current - 1)
  }
}

/** Wrap a ReadableStream to guarantee connection counter decrement on close/abort/error */
function createTrackedStream(
  body: ReadableStream<Uint8Array>,
  onDone: () => void,
): ReadableStream<Uint8Array> {
  let released = false
  const doRelease = () => {
    if (!released) {
      released = true
      onDone()
    }
  }
  const reader = body.getReader()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          doRelease()
          controller.close()
        } else {
          controller.enqueue(value)
        }
      } catch (err) {
        doRelease()
        controller.error(err)
      }
    },
    cancel(reason) {
      doRelease()
      return reader.cancel(reason)
    },
  })
}

function originFromReferer(referer: string): string {
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

/**
 * Resolve effective referer/origin for upstream media requests.
 *
 * - If reqReferer is a valid external platform URL (e.g. from plugin JSON `rule.referer` / `rule.baseURL`),
 *   preserve it so anti-hotlink checks pass on source sites like LIBVIO/MXdm.
 * - If reqReferer is empty or a local loopback address (e.g. localhost, 127.0.0.1),
 *   fallback to target's own origin (`target.origin/`) so CDNs treat it as same-site playback.
 */
function resolveEffectiveReferer(
  reqReferer: string | undefined,
  target: URL,
): { referer: string; origin: string } {
  const raw = (reqReferer || '').trim()

  if (!raw) {
    return { referer: `${target.origin}/`, origin: target.origin }
  }

  try {
    const refUrl = new URL(raw)

    // Check if referer is local / loopback
    const isLocal =
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(refUrl.hostname) ||
      refUrl.hostname.endsWith('.invalid')

    if (isLocal) {
      return { referer: `${target.origin}/`, origin: target.origin }
    }

    // Preserve valid non-local referers (e.g. from plugin JSON rules)
    return { referer: raw, origin: refUrl.origin }
  } catch {
    return { referer: `${target.origin}/`, origin: target.origin }
  }
}

/**
 * Abort only until response headers arrive. Do NOT use AbortSignal.timeout()
 * for media proxy: that timer stays armed during body streaming and aborts
 * long progressive mp4 / HLS segments after ~20s → uncaught TimeoutError in
 * Node while the player still needs the rest of the file.
 */
function connectTimeoutSignal(ms: number): {
  signal: AbortSignal
  clear: () => void
} {
  const ac = new AbortController()
  const timer = setTimeout(() => {
    try {
      ac.abort(
        new DOMException(
          `媒体源连接超时 (${Math.round(ms / 1000)}s)`,
          'TimeoutError',
        ),
      )
    } catch {
      ac.abort()
    }
  }, ms)
  // Avoid keeping the event loop alive solely for this timer
  timer.unref?.()
  return {
    signal: ac.signal,
    clear: () => clearTimeout(timer),
  }
}

/** Drop unused upstream body so sockets can reuse (error / retry paths). */
function cancelBody(res: Response | null | undefined) {
  try {
    void res?.body?.cancel().catch(() => {})
  } catch {
    /* ignore */
  }
}

/** Cap playlist text so a malicious "m3u8" cannot blow heap. */
const MAX_M3U8_BYTES = 1_500_000

async function readTextLimited(
  res: Response,
  maxBytes: number,
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

function isM3u8Path(abs: URL): boolean {
  return /\.m3u8($|[?#])/i.test(abs.pathname + abs.search)
}

type RewriteOpts = {
  referer: string
  cookie: string
  /** Administrator proxy authorization token (propagated to child segments) */
  token?: string
  /** Propagate so nested media playlists still filter (master is a no-op) */
  adFilter?: boolean
  /**
   * Force every public URI through proxy (cookie auth, forceMediaProxy,
   * or session fallback after direct segment failure).
   */
  fullProxy?: boolean
  /**
   * Always proxy this URI even in hybrid ad-filter mode.
   * Used for #EXT-X-KEY / MAP URI= attrs (small, often hotlink-gated).
   */
  alwaysProxy?: boolean
}

/**
 * Rewrite one playlist URI for the client.
 *
 * - Default / fullProxy / cookie: all public URIs → /api/media/proxy (classic).
 * - adFilter without cookie/fullProxy (**hybrid**): only nested .m3u8 stay on
 *   proxy (so discontinuity ads still get stripped); .ts/.m4s etc. stay on CDN.
 *   Ad strip only needs a clean playlist — segment bodies need not transit us.
 */
function rewriteM3u8Uri(u: string, base: URL, opts: RewriteOpts): string {
  const abs = new URL(u, base)
  if (isPrivateHost(abs.hostname)) {
    // Do not proxy private segment/key URLs
    return abs.toString()
  }

  const adFilter = Boolean(opts.adFilter)
  const fullProxy = Boolean(opts.fullProxy)
  const cookie = opts.cookie || ''
  const token = opts.token || ''
  const playlist = isM3u8Path(abs)

  // Hybrid ad-filter: browser pulls media segments straight from CDN.
  if (
    adFilter &&
    !cookie &&
    !fullProxy &&
    !playlist &&
    !opts.alwaysProxy
  ) {
    return abs.toString()
  }

  const q = new URLSearchParams({
    url: abs.toString(),
    referer: opts.referer,
  })
  if (cookie) q.set('cookie', cookie)
  if (token) q.set('token', token)
  if (fullProxy) q.set('fullProxy', '1')
  // Master → media child must keep adFilter=1; without this only the
  // top playlist is filtered (no-op on master) and ads stay in mixed.m3u8.
  // Only attach to nested playlists (.m3u8), not TS/KEY segments.
  if (adFilter && playlist) {
    q.set('adFilter', '1')
  }
  return `/api/media/proxy?${q.toString()}`
}

/** Rewrite URI="..." and URI='...' in #EXT lines (KEY / MAP / …) */
function rewriteExtUriAttrs(
  line: string,
  base: URL,
  opts: RewriteOpts,
): string {
  return line.replace(/URI=(["'])([^"']+)\1/gi, (_m, quote: string, u: string) => {
    try {
      // KEY/MAP: always proxy even in hybrid — tiny payloads, often referer-gated
      const proxied = rewriteM3u8Uri(u, base, { ...opts, alwaysProxy: true })
      return `URI=${quote}${proxied}${quote}`
    } catch {
      return `URI=${quote}${u}${quote}`
    }
  })
}

mediaRoutes.get('/proxy', async (c) => {
  const url = c.req.query('url')
  const referer = c.req.query('referer') || ''
  /** Optional upstream Cookie (e.g. anime1 path-scoped e/p/h). Not used by most sources. */
  const cookie = c.req.query('cookie') || ''
  /** Proxy token extracted from query or headers */
  const token = (
    c.req.query('token') ||
    c.req.query('proxyToken') ||
    c.req.header('x-animaku-proxy-token') ||
    c.req.header('x-aniku-proxy-token') ||
    c.req.header('x-proxy-token') ||
    ''
  ).trim()
  /** HLS discontinuity ad-filter. Query: adFilter=1 */
  const adFilter =
    c.req.query('adFilter') === '1' ||
    c.req.query('adFilter') === 'true' ||
    c.req.query('hlsAdFilter') === '1'
  /**
   * fullProxy=1 → rewrite every segment through us (forceMediaProxy / fallback).
   * Cookie alone also disables hybrid segment direct (browser can't send it).
   * Honored only when MEDIA_FULL_PROXY=1 (config.mediaFullProxy).
   */
  const fullProxyRequested =
    c.req.query('fullProxy') === '1' ||
    c.req.query('fullProxy') === 'true'
  const fullProxy = fullProxyRequested && config.mediaFullProxy
  if (!url) return c.json({ error: 'bad_request', message: '缺少 url' }, 400)

  const clientIp = clientRemoteAddress(c) || 'unknown'
  if (!acquireStream(clientIp)) {
    return c.json(
      {
        error: 'rate_limited',
        message: '媒体流并发连接数超限（单IP最多8个并发），请勿使用多线程下载工具并发请求',
      },
      429,
    )
  }

  let target: URL
  try {
    target = new URL(url)
  } catch {
    releaseStream(clientIp)
    return c.json({ error: 'bad_request', message: 'url 无效' }, 400)
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    releaseStream(clientIp)
    return c.json({ error: 'bad_request', message: '仅支持 http/https' }, 400)
  }
  if (isPrivateHost(target.hostname)) {
    releaseStream(clientIp)
    return c.json({ error: 'forbidden', message: '禁止代理内网地址' }, 403)
  }

  // MEDIA_FULL_PROXY=0 (default): only HLS playlists — no ts/mp4 bandwidth tunnel
  if (!config.mediaFullProxy) {
    if (cookie && !isM3u8Path(target)) {
      releaseStream(clientIp)
      return c.json(
        {
          error: 'forbidden',
          message:
            '当前服务器未开启全量媒体代理（MEDIA_FULL_PROXY=0），无法代拉需 Cookie 的整段视频',
          hint: '部署方设置 MEDIA_FULL_PROXY=1 后可用于 Anime1 等源；或改用 HLS 规则',
          mediaFullProxy: false,
        },
        403,
      )
    }
    if (!isM3u8Path(target)) {
      releaseStream(clientIp)
      return c.json(
        {
          error: 'forbidden',
          message:
            '当前服务器仅允许代理 m3u8 播放列表（MEDIA_FULL_PROXY=0）',
          hint: '分片请由浏览器直连 CDN；需要代拉 ts/mp4 时设置 MEDIA_FULL_PROXY=1',
          mediaFullProxy: false,
        },
        403,
      )
    }
  }

  const { referer: effectiveReferer, origin } = resolveEffectiveReferer(
    referer,
    target,
  )
  const headers: Record<string, string> = {
    'User-Agent': config.defaultUserAgent,
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }
  if (effectiveReferer) {
    headers.Referer = effectiveReferer
    if (origin) headers.Origin = origin
  }
  if (cookie) {
    headers.Cookie = cookie
  }

  // forward range for seeking
  const range = c.req.header('Range')
  if (range) headers.Range = range

  let upstream: Response
  const connect = connectTimeoutSignal(20_000)
  try {
    upstream = await fetchPublic(target.toString(), {
      headers,
      signal: connect.signal,
    })
  } catch (e) {
    connect.clear()
    releaseStream(clientIp)
    const msg = e instanceof Error ? e.message : String(e)
    if (/内网|重定向/.test(msg)) {
      return c.json({ error: 'forbidden', message: msg }, 403)
    }
    return c.json(
      {
        error: 'upstream',
        message: `媒体源不可达: ${msg}`,
        hint: '链接可能已过期，请重新选集解析',
      },
      502,
    )
  }
  // Headers received — allow body to stream without the connect timer.
  connect.clear()

  if (!upstream.ok && upstream.status !== 206) {
    // Cookie / auth expired (anime1 and similar)
    if (cookie && (upstream.status === 403 || upstream.status === 401)) {
      cancelBody(upstream)
      releaseStream(clientIp)
      return c.json(
        {
          error: 'auth_expired',
          message: `媒体鉴权失效 (${upstream.status})`,
          hint: '播放凭证已过期，请重新解析本集',
        },
        403,
      )
    }
    // Retry once with a looser referer (some CDNs only care about site origin)
    if (origin && (upstream.status === 403 || upstream.status === 401)) {
      const failedStatus = upstream.status
      cancelBody(upstream)
      const retryConnect = connectTimeoutSignal(20_000)
      try {
        const retry = await fetchPublic(target.toString(), {
          headers: {
            ...headers,
            Referer: origin + '/',
            Origin: origin,
          },
          signal: retryConnect.signal,
        })
        retryConnect.clear()
        if (retry.ok || retry.status === 206) {
          upstream = retry
        } else {
          cancelBody(retry)
          releaseStream(clientIp)
          return c.json(
            {
              error: 'upstream',
              message: `媒体源 ${retry.status}`,
              hint:
                retry.status === 404
                  ? '播放地址已失效，请重新点选集获取新链接'
                  : '源站防盗链拒绝，可换线路/规则',
            },
            502,
          )
        }
      } catch (e) {
        retryConnect.clear()
        releaseStream(clientIp)
        const msg = e instanceof Error ? e.message : String(e)
        if (/内网|重定向/.test(msg)) {
          return c.json({ error: 'forbidden', message: msg }, 403)
        }
        return c.json(
          {
            error: 'upstream',
            message: `媒体源 ${failedStatus}`,
            hint: '播放地址可能已过期，请重新选集',
          },
          502,
        )
      }
    } else {
      cancelBody(upstream)
      releaseStream(clientIp)
      return c.json(
        {
          error: 'upstream',
          message: `媒体源 ${upstream.status}`,
          hint:
            upstream.status === 404
              ? '播放地址已失效（常见于腾讯/签名短链），请重新点选集'
              : '源站返回错误，可换线路或规则',
        },
        502,
      )
    }
  }

  const rawContentType = (upstream.headers.get('content-type') || '').toLowerCase()
  const isM3u8 =
    rawContentType.includes('mpegurl') ||
    rawContentType.includes('m3u8') ||
    target.pathname.endsWith('.m3u8')

  if (isM3u8) {
    let text: string
    try {
      text = await readTextLimited(upstream, MAX_M3U8_BYTES)
    } catch (e) {
      cancelBody(upstream)
      releaseStream(clientIp)
      const msg = e instanceof Error ? e.message : String(e)
      return c.json(
        {
          error: 'upstream',
          message: msg,
          hint: '播放列表异常，请重新选集或换线路',
        },
        502,
      )
    }
    // M3U8 text parsing is complete in memory — release stream concurrency counter immediately
    releaseStream(clientIp)

    const base = target
    if (adFilter) {
      try {
        const { content } = filterM3u8AdsIfApplicable(text, target.toString())
        text = content
      } catch {
        // Keep original playlist if filter fails
      }
    }
    // When full media proxy is off, never rewrite segments through us even if
    // client sent fullProxy/cookie (cookie on m3u8 master is rare; still hybrid).
    const rewriteOpts: RewriteOpts = {
      referer: effectiveReferer,
      cookie: config.mediaFullProxy ? cookie : '',
      token,
      adFilter,
      fullProxy,
    }
    const rewritten = text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) {
          return rewriteExtUriAttrs(line, base, rewriteOpts)
        }
        try {
          return rewriteM3u8Uri(trimmed, base, rewriteOpts)
        } catch {
          return line
        }
      })
      .join('\n')

    // VOD playlists (static with ENDLIST or master playlist) can safely cache
    // for 180s (3min) to eliminate redundant regex rewriting & RTT during seeking,
    // while remaining far below typical upstream token expiration (15~30m).
    // Live rolling playlists stay short-lived (3s).
    const isVodOrMaster =
      text.includes('#EXT-X-ENDLIST') ||
      text.includes('#EXT-X-STREAM-INF') ||
      text.includes('#EXT-X-PLAYLIST-TYPE:VOD')
    const cacheControl = isVodOrMaster
      ? 'private, max-age=180'
      : 'private, max-age=3'

    return c.body(rewritten, 200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': cacheControl,
      'X-Media-Full-Proxy': config.mediaFullProxy ? '1' : '0',
    })
  }

  // Non-M3U8 media stream safety checks (MIME & size)
  const isMediaStream =
    rawContentType.startsWith('video/') ||
    rawContentType.startsWith('audio/') ||
    rawContentType === 'application/octet-stream' ||
    /\.(ts|m4s|mp4|webm|aac|mp3|m4a|flv)(\?|$)/i.test(target.pathname + target.search)

  if (!isMediaStream) {
    cancelBody(upstream)
    releaseStream(clientIp)
    return c.json(
      {
        error: 'forbidden',
        message: '拒绝代理非音视频流内容',
      },
      403,
    )
  }

  const contentLength = Number(upstream.headers.get('content-length') || 0)
  if (contentLength > 150_000_000 && !config.mediaFullProxy) {
    cancelBody(upstream)
    releaseStream(clientIp)
    return c.json(
      {
        error: 'forbidden',
        message: '单个媒体分片体积超过上限 (150MB)',
      },
      403,
    )
  }

  const resHeaders: Record<string, string> = {
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Accept-Ranges',
  }
  const pass = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'cache-control',
  ]
  for (const h of pass) {
    const v = upstream.headers.get(h)
    if (v) resHeaders[h] = v
  }

  resHeaders['X-Media-Full-Proxy'] = config.mediaFullProxy ? '1' : '0'

  const trackedBody = upstream.body
    ? createTrackedStream(upstream.body as ReadableStream<Uint8Array>, () => releaseStream(clientIp))
    : null

  return new Response(trackedBody, {
    status: upstream.status,
    headers: resHeaders,
  })
})
