import { Hono } from 'hono'
import { config } from '../config'
import { canUseMediaProxy, clientRemoteAddress } from '../lib/access'
import { isPrivateHost, assertPublicHttpUrl } from '../lib/private-host'
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
import { playbackRegistry } from '../lib/media/playback-registry'
import { sourceRegistry } from '../lib/source/source-registry'
import { rewriteM3u8Ast } from '../lib/media/hls-pipeline'

export const mediaRoutes = new Hono()

// =========================================================================
// 新一代受控媒体分发网关 (Step 2-B: No-URL Parameter Media Gateway)
// =========================================================================

/**
 * GET /api/media/stream?t=...
 * 播放列表受控分发网关（严格拦截 url 参数，执行 Content-Type 门禁与全要素 HLS AST 改写）
 */
mediaRoutes.get('/stream', async (c) => {
  // 1. 彻底拦截 url 参数注入
  if (c.req.query('url') !== undefined) {
    return c.json(
      {
        error: 'forbidden_params',
        message: '直接通过 url 参数请求已被彻底禁止。请使用 Opaque Ticket ?t=...',
      },
      400,
    )
  }

  const t = (c.req.query('t') || '').trim()
  if (!t) {
    return c.json({ error: 'bad_request', message: '缺少播放票据凭证 t' }, 400)
  }

  // 2. 验票门禁 (Playlist Ticket)
  const verifyResult = playbackRegistry.verifyTicket(t, 'playlist')
  if (!verifyResult.valid) {
    return c.json(
      { error: verifyResult.code, message: verifyResult.reason },
      403,
    )
  }

  const { asset, normalizedSub } = verifyResult

  // 3. IP 并发流控
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

  // 4. 解析目标媒体地址并执行出站白名单审计
  const targetUrlStr = playbackRegistry.resolveAssetUrl(asset, normalizedSub)
  let target: URL
  try {
    target = new URL(targetUrlStr)
  } catch {
    releaseStream(clientIp)
    return c.json({ error: 'bad_request', message: '目标地址无效' }, 400)
  }

  const egressCheck = sourceRegistry.validateEgress(target.href, asset.source)
  if (!egressCheck.valid) {
    releaseStream(clientIp)
    return c.json(
      { error: 'forbidden', message: egressCheck.reason },
      403,
    )
  }

  try {
    assertPublicHttpUrl(target.href)
  } catch (err) {
    releaseStream(clientIp)
    return c.json(
      { error: 'forbidden', message: (err as Error).message },
      403,
    )
  }

  // 5. 组装出站请求与敏感凭据解密
  const cookie =
    playbackRegistry.getDecryptedCredentials<string>(asset) || ''
  const referer =
    asset.publicHeaders?.Referer ||
    asset.publicHeaders?.referer ||
    asset.baseUrl

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

  const { upstream } = fetchResult

  // 6. EgressPolicyEngine 响应头门禁（严格拒绝 text/html）
  const contentType = (upstream.headers.get('content-type') || '').toLowerCase()
  if (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml+xml')
  ) {
    cancelBody(upstream)
    releaseStream(clientIp)
    return c.json(
      {
        error: 'blocked_html_response',
        message:
          'EgressPolicyEngine: 上游返回 HTML 文本而非媒体播放列表（已被拦截，防403/盾页伪装）',
      },
      502,
    )
  }

  // 7. 读取并执行全要素 HLS AST 改写
  let rawText: string
  try {
    rawText = await readTextLimited(upstream, MAX_M3U8_BYTES)
  } catch (e) {
    cancelBody(upstream)
    releaseStream(clientIp)
    return c.json(
      {
        error: 'upstream',
        message: (e as Error).message,
        hint: '播放列表异常，请重新选集或换线路',
      },
      502,
    )
  }

  // 文本解析完成，释放并发槽位
  releaseStream(clientIp)

  const adFilter =
    c.req.query('adFilter') === '1' || c.req.query('adFilter') === 'true'

  const rewrittenM3u8 = rewriteM3u8Ast(rawText, asset, normalizedSub, {
    adFilter,
  })

  return c.body(rewrittenM3u8, 200, {
    'Content-Type': 'application/vnd.apple.mpegurl',
    'Cache-Control': 'public, max-age=60',
    'Access-Control-Allow-Origin': '*',
  })
})

/**
 * GET /api/media/segment?t=...
 * 媒体分片与密钥分发网关（支持 302 零流量直连与全量流式代拉）
 */
mediaRoutes.get('/segment', async (c) => {
  // 1. 拦截 url 参数注入
  if (c.req.query('url') !== undefined) {
    return c.json(
      {
        error: 'forbidden_params',
        message: '直接通过 url 参数请求已被彻底禁止。请使用 Opaque Ticket ?t=...',
      },
      400,
    )
  }

  const t = (c.req.query('t') || '').trim()
  if (!t) {
    return c.json({ error: 'bad_request', message: '缺少播放票据凭证 t' }, 400)
  }

  // 2. 验票门禁 (Segment 或 Key Ticket)
  const verifyResult = playbackRegistry.verifyTicket(t)
  if (!verifyResult.valid) {
    return c.json(
      { error: verifyResult.code, message: verifyResult.reason },
      403,
    )
  }

  const { payload, asset, normalizedSub } = verifyResult
  if (payload.typ !== 'segment' && payload.typ !== 'key') {
    return c.json(
      {
        error: 'TYPE_MISMATCH',
        message: `此接口仅接受 segment 或 key 类型的 Ticket，当前为 ${payload.typ}`,
      },
      400,
    )
  }

  // 3. 解析目标分片地址
  const targetUrlStr = playbackRegistry.resolveAssetUrl(asset, normalizedSub)
  let target: URL
  try {
    target = new URL(targetUrlStr)
  } catch {
    return c.json({ error: 'bad_request', message: '目标地址无效' }, 400)
  }

  // 4. 302 安全校验 (防止 Open Redirect 开放重定向攻击)
  const egressCheck = sourceRegistry.validateEgress(target.href, asset.source)
  if (!egressCheck.valid) {
    return c.json(
      { error: 'forbidden', message: egressCheck.reason },
      403,
    )
  }

  try {
    assertPublicHttpUrl(target.href)
  } catch (err) {
    return c.json(
      { error: 'forbidden', message: (err as Error).message },
      403,
    )
  }

  const referer =
    asset.publicHeaders?.Referer ||
    asset.publicHeaders?.referer ||
    asset.baseUrl
  const cookie =
    playbackRegistry.getDecryptedCredentials<string>(asset) || ''

  // 5. 解密密钥 (Key) 模式：直接代拉透传 16 字节密钥（解决跨域与防盗链）
  if (payload.typ === 'key') {
    const fetchResult = await fetchMediaWithFallback(target, {
      referer,
      cookie,
    })
    if (!fetchResult.ok) {
      return c.json(
        { error: fetchResult.error, message: fetchResult.message },
        fetchResult.status as 403 | 502,
      )
    }
    const keyBytes = await fetchResult.upstream.arrayBuffer()
    return new Response(keyBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }

  // 6. 媒体分片模式：
  // 若存在敏感 Cookie 凭据（如 Anime1），必须通过服务端代拉；
  // 否则默认启用 302 零带宽直连模式（VPS 0 流量消耗，极速 CDN 直连）。
  const requiresProxyStream = Boolean(cookie) || c.req.query('stream') === '1'

  if (!requiresProxyStream) {
    // 302 零流量高性能直连
    return c.redirect(target.href, 302)
  }

  // 7. 全量代拉流式传输
  const clientIp = clientRemoteAddress(c) || 'unknown'
  if (!acquireStream(clientIp)) {
    return c.json(
      {
        error: 'rate_limited',
        message: '媒体流并发连接数超限，请稍后重试',
      },
      429,
    )
  }

  const fetchResult = await fetchMediaWithFallback(target, {
    referer,
    cookie,
    range: c.req.header('Range'),
  })

  if (!fetchResult.ok) {
    releaseStream(clientIp)
    return c.json(
      { error: fetchResult.error, message: fetchResult.message },
      fetchResult.status as 403 | 502,
    )
  }

  const { upstream } = fetchResult
  const resHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
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

// =========================================================================
// 历史兼容路由防御 (/api/media/proxy 严禁开放 url 参数)
// =========================================================================

interface AuthCheckResult {
  allowed: boolean
  status?: 403
  payload?: Record<string, unknown>
}

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
            '带 Cookie 鉴权的媒体代理当前需管理员口令或局域网访问。',
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
            '全量媒体流代理当前需管理员口令或局域网访问。',
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
            '媒体分片与流代理当前需管理员口令或局域网访问。',
          hint: 'M3U8 播放列表文本解析免密可用；TS/MP4 视频流分片请由浏览器直连 CDN',
        },
      }
    }
  }

  return { allowed: true }
}

mediaRoutes.get('/proxy', async (c) => {
  // 彻底拦截 url 参数注入（消灭开放代理漏洞）
  if (c.req.query('url') !== undefined) {
    return c.json(
      {
        error: 'forbidden_params',
        message:
          '开放式 url 代理已被彻底禁用，请切换至受控网关 /api/media/stream?t=...',
      },
      400,
    )
  }

  return c.json(
    {
      error: 'bad_request',
      message: '请使用 /api/media/stream?t=... 播放媒体流',
    },
    400,
  )
})

