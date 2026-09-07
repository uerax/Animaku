import type { Context } from 'hono'
import { Hono } from 'hono'
import { clientRemoteAddress } from '../lib/access'
import { assertPublicHttpUrl } from '../lib/private-host'
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
  readTextLimited,
  MAX_M3U8_BYTES,
} from '../lib/media/m3u8-pipeline'
import { playbackRegistry } from '../lib/media/playback-registry'
import { sourceRegistry } from '../lib/source/source-registry'
import { rewriteM3u8Ast } from '../lib/media/hls-pipeline'
import type { VerifyTicketResult } from '../lib/media/playback-types'

export const mediaRoutes = new Hono()

// =========================================================================
// 新一代受控媒体分发网关 (No-URL Parameter Media Gateway)
// =========================================================================

/**
 * 处理 HLS M3U8 播放列表文本分发与全要素 AST 改写
 */
async function handlePlaylistStream(
  c: Context,
  verifyResult: VerifyTicketResult & { valid: true },
) {
  const { asset, normalizedSub } = verifyResult

  // 1. IP 并发流控
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

  try {
    // 2. 解析目标媒体地址并执行出站白名单审计
    const targetUrlStr = playbackRegistry.resolveAssetUrl(asset, normalizedSub)
    let target: URL
    try {
      target = new URL(targetUrlStr)
    } catch {
      return c.json({ error: 'bad_request', message: '目标地址无效' }, 400)
    }

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

    // 3. 组装出站请求与敏感凭据解密
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

    // 4. EgressPolicyEngine 响应头门禁（严格拒绝 text/html）
    const contentType = (upstream.headers.get('content-type') || '').toLowerCase()
    if (
      contentType.includes('text/html') ||
      contentType.includes('application/xhtml+xml')
    ) {
      cancelBody(upstream)
      return c.json(
        {
          error: 'blocked_html_response',
          message:
            'EgressPolicyEngine: 上游返回 HTML 文本而非媒体播放列表（已被拦截，防403/盾页伪装）',
        },
        502,
      )
    }

    // 5. 读取并执行全要素 HLS AST 改写
    let rawText: string
    try {
      rawText = await readTextLimited(upstream, MAX_M3U8_BYTES)
    } catch (e) {
      cancelBody(upstream)
      return c.json(
        {
          error: 'upstream',
          message: (e as Error).message,
          hint: '播放列表异常，请重新选集或换线路',
        },
        502,
      )
    }

    const adFilter =
      c.req.query('adFilter') === '1' || c.req.query('adFilter') === 'true'
    const forceProxy =
      c.req.query('stream') === '1' || c.req.query('stream') === 'true'

    const rewrittenM3u8 = rewriteM3u8Ast(rawText, asset, normalizedSub, {
      adFilter,
      forceProxy,
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    }

    if (c.req.method === 'HEAD') {
      return new Response(null, { status: 200, headers })
    }

    return c.body(rewrittenM3u8, 200, headers)
  } finally {
    // 播放列表文本分发为瞬时请求，必须严格保证 100% 释放并发槽位，防止泄漏锁死
    releaseStream(clientIp)
  }
}

/**
 * 处理媒体分片与二进制流（MP4 / TS / Key）分发
 */
async function handleBinarySegment(
  c: Context,
  verifyResult: VerifyTicketResult & { valid: true },
) {
  const { payload, asset, normalizedSub } = verifyResult

  // 1. 解析目标分片地址
  const targetUrlStr = playbackRegistry.resolveAssetUrl(asset, normalizedSub)
  let target: URL
  try {
    target = new URL(targetUrlStr)
  } catch {
    return c.json({ error: 'bad_request', message: '目标地址无效' }, 400)
  }

  // 2. 出站安全校验
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

  // 3. 解密密钥 (Key) 模式：直接代拉透传 16 字节密钥（解决跨域与防盗链）
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
    const keyHeaders: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    }
    if (c.req.method === 'HEAD') {
      cancelBody(fetchResult.upstream)
      return new Response(null, {
        status: 200,
        headers: keyHeaders,
      })
    }
    const keyBytes = await fetchResult.upstream.arrayBuffer()
    return new Response(keyBytes, {
      status: 200,
      headers: keyHeaders,
    })
  }

  // 4. 媒体分片 / 直链模式：
  // 若存在敏感 Cookie 凭据（如 Anime1），必须通过服务端代拉；
  // 否则默认启用 302 零带宽直连模式（VPS 0 流量消耗，极速 CDN 直连）。
  const requiresProxyStream =
    Boolean(cookie) ||
    c.req.query('stream') === '1' ||
    c.req.query('stream') === 'true'

  if (!requiresProxyStream) {
    // 302 零流量高性能直连
    return c.redirect(target.href, 302)
  }

  // 5. 全量代拉流式传输
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

  let streamTracked = false
  try {
    const fetchResult = await fetchMediaWithFallback(target, {
      referer,
      cookie,
      range: c.req.header('Range'),
    })

    if (!fetchResult.ok) {
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
      'X-Content-Type-Options': 'nosniff',
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

    if (!upstream.body || c.req.method === 'HEAD') {
      cancelBody(upstream)
      return new Response(null, {
        status: upstream.status,
        headers: resHeaders,
      })
    }

    streamTracked = true
    const trackedBody = createTrackedStream(
      upstream.body as ReadableStream<Uint8Array>,
      () => releaseStream(clientIp),
    )

    return new Response(trackedBody, {
      status: upstream.status,
      headers: resHeaders,
    })
  } finally {
    if (!streamTracked) {
      releaseStream(clientIp)
    }
  }
}

/**
 * GET/HEAD /api/media/status?t=...
 * 播放票据与关联媒体资产存活性轻量探活端点（零外部网络 I/O，微秒级响应）
 * 专供客户端/Safari 假死看门狗探测凭据健康度：
 * - 拦截 url 参数注入，防止被利用为开放代理或探测外部地址；
 * - 纯内存执行 verifyTicket(t) 校验解密、过期时间与关联资产存活性；
 * - 凭据与资产均有效返回 204 No Content；
 * - 凭据无效或关联资产不存在返回 403 Forbidden；
 * - 严禁触发任何外部源站抓取或 AST 改写。
 */
mediaRoutes.on(['GET', 'HEAD'], '/status', (c) => {
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

  // 2. 纯内存验票与资产存活校验
  const verifyResult = playbackRegistry.verifyTicket(t)
  if (!verifyResult.valid) {
    return c.json(
      { error: verifyResult.code, message: verifyResult.reason },
      403,
    )
  }

  // 3. 票据与资产存活健康，返回 204 No Content
  return new Response(null, {
    status: 204,
    headers: {
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

/**
 * GET/HEAD /api/media/stream?t=...
 * 播放列表受控分发网关（严格拦截 url 参数，执行 Content-Type 门禁与全要素 HLS AST 改写）
 * 自适应兼容：若收到合法的 segment 票据（如 MP4 直链），直接内部进入分片/直连处理管道，免去多余重定向
 */
mediaRoutes.on(['GET', 'HEAD'], '/stream', async (c) => {
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

  // 2. 验票门禁
  const verifyResult = playbackRegistry.verifyTicket(t)
  if (!verifyResult.valid) {
    return c.json(
      { error: verifyResult.code, message: verifyResult.reason },
      403,
    )
  }

  // 3. 能力不可升级门禁：Key ticket 严禁通过 /stream 访问（防越权）
  if (verifyResult.payload.typ === 'key') {
    return c.json(
      {
        error: 'forbidden_capability',
        message: 'Key ticket 严禁通过 /stream 路由访问',
      },
      403,
    )
  }

  // 4. 内部复用：若票据类型是 segment，直接内部进入分片/直连处理管道，避免多余 302 hop
  if (verifyResult.payload.typ === 'segment') {
    return handleBinarySegment(c, verifyResult)
  }

  return handlePlaylistStream(c, verifyResult)
})

/**
 * GET/HEAD /api/media/segment?t=...
 * 媒体分片与密钥分发网关（支持 302 零流量直连与全量流式代拉）
 * 自适应兼容：若收到合法的 playlist 票据，直接内部进入播放列表处理管道
 */
mediaRoutes.on(['GET', 'HEAD'], '/segment', async (c) => {
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

  // 2. 验票门禁
  const verifyResult = playbackRegistry.verifyTicket(t)
  if (!verifyResult.valid) {
    return c.json(
      { error: verifyResult.code, message: verifyResult.reason },
      403,
    )
  }

  // 3. 内部复用：若票据类型是 playlist，直接内部调用播放列表处理管道
  if (verifyResult.payload.typ === 'playlist') {
    return handlePlaylistStream(c, verifyResult)
  }

  return handleBinarySegment(c, verifyResult)
})

// =========================================================================
// 历史兼容路由防御 (/api/media/proxy 严禁开放 url 参数)
// =========================================================================

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
