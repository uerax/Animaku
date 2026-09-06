import { Hono } from 'hono'
import { config } from '../config'
import { canUseMediaProxy, clientRemoteAddress } from '../lib/access'
import { isPrivateHost } from '../lib/private-host'
import {
  acquireStream,
  releaseStream,
  createTrackedStream,
} from '../lib/media/stream-tracker'
import {
  fetchMediaWithFallback,
  cancelBody,
} from '../lib/media/media-fetcher'
import {
  isM3u8Path,
  isM3u8Response,
  readTextLimited,
  processM3u8Playlist,
  MAX_M3U8_BYTES,
  type RewriteOpts,
} from '../lib/media/m3u8-pipeline'

export const mediaRoutes = new Hono()

interface AuthCheckResult {
  allowed: boolean
  status?: 403
  payload?: Record<string, unknown>
}

/**
 * 校验客户端请求媒体代理的权限矩阵：
 * - 未鉴权访客：仅允许直接解析/改写 M3U8 文本（分片由浏览器直连 CDN）；
 * - 管理员鉴权（Token/局域网）：允许全量分片代理（受限于服务端 MEDIA_FULL_PROXY 配置）。
 */
function checkMediaProxyAuth(
  hasMediaAuth: boolean,
  target: URL,
  cookie: string,
  fullProxyRequested: boolean,
): AuthCheckResult {
  if (!hasMediaAuth) {
    if (cookie) {
      return {
        allowed: false,
        status: 403,
        payload: {
          error: 'forbidden',
          message:
            '带 Cookie 鉴权的媒体代理当前需管理员口令或局域网访问（PUBLIC_PROXY=0 / PROXY_TOKEN 已开启）。请在设置中输入口令解锁。',
        },
      }
    }
    if (fullProxyRequested) {
      return {
        allowed: false,
        status: 403,
        payload: {
          error: 'forbidden',
          message:
            '全量媒体流代理当前需管理员口令或局域网访问（PUBLIC_PROXY=0 / PROXY_TOKEN 已开启）。请在设置中输入口令解锁。',
        },
      }
    }
    if (!isM3u8Path(target)) {
      return {
        allowed: false,
        status: 403,
        payload: {
          error: 'forbidden',
          message:
            '媒体分片与流代理当前需管理员口令或局域网访问（PUBLIC_PROXY=0 / PROXY_TOKEN 已开启）。请在设置中输入口令解锁。',
          hint: 'M3U8 播放列表文本解析免密可用；TS/MP4 视频流分片请由浏览器直连 CDN',
        },
      }
    }
  } else if (!config.mediaFullProxy) {
    if (cookie && !isM3u8Path(target)) {
      return {
        allowed: false,
        status: 403,
        payload: {
          error: 'forbidden',
          message:
            '当前服务器未开启全量媒体代理（MEDIA_FULL_PROXY=0），无法代拉需 Cookie 的整段视频',
          hint: '部署方设置 MEDIA_FULL_PROXY=1 后可用于 Anime1 等源；或改用 HLS 规则',
          mediaFullProxy: false,
        },
      }
    }
    if (!isM3u8Path(target)) {
      return {
        allowed: false,
        status: 403,
        payload: {
          error: 'forbidden',
          message:
            '当前服务器仅允许代理 m3u8 播放列表（MEDIA_FULL_PROXY=0）',
          hint: '分片请由浏览器直连 CDN；需要代拉 ts/mp4 时设置 MEDIA_FULL_PROXY=1',
          mediaFullProxy: false,
        },
      }
    }
  }

  return { allowed: true }
}

mediaRoutes.get('/proxy', async (c) => {
  const url = c.req.query('url')
  const referer = c.req.query('referer') || ''
  const cookie = c.req.query('cookie') || ''
  const token = (
    c.req.query('token') ||
    c.req.query('proxyToken') ||
    c.req.header('x-animaku-proxy-token') ||
    c.req.header('x-aniku-proxy-token') ||
    c.req.header('x-proxy-token') ||
    ''
  ).trim()

  const adFilter =
    c.req.query('adFilter') === '1' ||
    c.req.query('adFilter') === 'true' ||
    c.req.query('hlsAdFilter') === '1'

  const fullProxyRequested =
    c.req.query('fullProxy') === '1' || c.req.query('fullProxy') === 'true'
  const fullProxy = fullProxyRequested && config.mediaFullProxy

  if (!url) {
    return c.json({ error: 'bad_request', message: '缺少 url' }, 400)
  }

  // 1. IP 并发流控防御
  const clientIp = clientRemoteAddress(c) || 'unknown'
  if (!acquireStream(clientIp)) {
    return c.json(
      {
        error: 'rate_limited',
        message:
          '媒体流并发连接数超限（单IP最多8个并发），请勿使用多线程下载工具并发请求',
      },
      429,
    )
  }

  // 2. URL 与 SSRF 安全检查
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

  // 3. 媒体代理权限决策
  const hasMediaAuth = canUseMediaProxy(c)
  const authCheck = checkMediaProxyAuth(
    hasMediaAuth,
    target,
    cookie,
    fullProxyRequested,
  )
  if (!authCheck.allowed && authCheck.payload) {
    releaseStream(clientIp)
    return c.json(authCheck.payload, authCheck.status || 403)
  }

  // 4. 上游媒体源连接与容灾获取
  const fetchResult = await fetchMediaWithFallback(target, {
    referer,
    cookie,
    range: c.req.header('Range'),
  })

  if (!fetchResult.ok) {
    releaseStream(clientIp)
    return c.json(
      {
        error: fetchResult.error,
        message: fetchResult.message,
        ...(fetchResult.hint ? { hint: fetchResult.hint } : {}),
      },
      fetchResult.status as 403 | 502,
    )
  }

  const { upstream, effectiveReferer } = fetchResult

  // 5. M3U8 播放列表文本管道处理
  if (isM3u8Response(upstream, target)) {
    let rawText: string
    try {
      rawText = await readTextLimited(upstream, MAX_M3U8_BYTES)
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

    // M3U8 文本解析已在内存中完成，立即释放并发槽位
    releaseStream(clientIp)

    const rewriteOpts: RewriteOpts = {
      referer: effectiveReferer,
      cookie: config.mediaFullProxy && hasMediaAuth ? cookie : '',
      token: hasMediaAuth ? token : '',
      hasMediaAuth,
      adFilter,
      fullProxy: hasMediaAuth ? fullProxy : false,
    }

    const { content, cacheControl } = processM3u8Playlist(
      rawText,
      target,
      rewriteOpts,
    )

    return c.body(content, 200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': cacheControl,
      'X-Media-Full-Proxy': config.mediaFullProxy ? '1' : '0',
    })
  }

  // 6. 二进制音视频分片权限校验
  if (!hasMediaAuth) {
    cancelBody(upstream)
    releaseStream(clientIp)
    return c.json(
      {
        error: 'forbidden',
        message:
          '媒体流代理当前需管理员口令或局域网访问（PUBLIC_PROXY=0 / PROXY_TOKEN 已开启）。请在设置中输入口令解锁。',
        hint: 'M3U8 播放列表文本解析免密可用；TS/MP4 视频流分片请由浏览器直连 CDN',
      },
      403,
    )
  }

  const rawContentType = (upstream.headers.get('content-type') || '').toLowerCase()
  const isMediaStream =
    rawContentType.startsWith('video/') ||
    rawContentType.startsWith('audio/') ||
    rawContentType === 'application/octet-stream' ||
    /\.(ts|m4s|mp4|webm|aac|mp3|m4a|flv)(\?|$)/i.test(
      target.pathname + target.search,
    )

  if (!isMediaStream) {
    cancelBody(upstream)
    releaseStream(clientIp)
    return c.json({ error: 'forbidden', message: '拒绝代理非音视频流内容' }, 403)
  }

  const contentLength = Number(upstream.headers.get('content-length') || 0)
  if (contentLength > 150_000_000 && !config.mediaFullProxy) {
    cancelBody(upstream)
    releaseStream(clientIp)
    return c.json(
      { error: 'forbidden', message: '单个媒体分片体积超过上限 (150MB)' },
      403,
    )
  }

  // 7. 组装透传响应头与生命周期流追踪
  const resHeaders: Record<string, string> = {
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Accept-Ranges',
  }
  const passHeaders = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'cache-control',
  ]
  for (const h of passHeaders) {
    const v = upstream.headers.get(h)
    if (v) resHeaders[h] = v
  }
  resHeaders['X-Media-Full-Proxy'] = config.mediaFullProxy ? '1' : '0'

  if (!upstream.body) {
    releaseStream(clientIp)
  }

  const trackedBody = upstream.body
    ? createTrackedStream(
        upstream.body as ReadableStream<Uint8Array>,
        () => releaseStream(clientIp),
      )
    : null

  return new Response(trackedBody, {
    status: upstream.status,
    headers: resHeaders,
  })
})
