/**
 * 媒体源上游网络请求与容灾降级调度器
 *
 * 封装防盗链 Referer/Origin 自动拟真、分阶段连接超时守卫、以及上游 401/403 宽松源自动重试机制。
 */

import { config } from '../../config'
import { fetchPublic } from '../private-host'

export interface MediaFetchOptions {
  referer?: string
  cookie?: string
  range?: string
  defaultUserAgent?: string
  connectTimeoutMs?: number
}

export type MediaFetchResult =
  | {
      ok: true
      upstream: Response
      target: URL
      effectiveReferer: string
      origin: string
    }
  | {
      ok: false
      status: number
      error: string
      message: string
      hint?: string
    }

export function originFromReferer(referer: string): string {
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

/**
 * 解析针对上游媒体源的有效 Referer 与 Origin：
 * - 若请求携带了外链 Referer（如来自规则的 baseURL），保留该 Referer 以穿透防盗链；
 * - 若 Referer 为空或是本地回环（localhost / 127.0.0.1），回退到目标自身的 Origin，模拟站内直接播放。
 */
export function resolveEffectiveReferer(
  reqReferer: string | undefined,
  target: URL,
): { referer: string; origin: string } {
  const raw = (reqReferer || '').trim()

  if (!raw) {
    return { referer: `${target.origin}/`, origin: target.origin }
  }

  try {
    const refUrl = new URL(raw)

    const isLocal =
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(refUrl.hostname) ||
      refUrl.hostname.endsWith('.invalid')

    if (isLocal) {
      return { referer: `${target.origin}/`, origin: target.origin }
    }

    return { referer: raw, origin: refUrl.origin }
  } catch {
    return { referer: `${target.origin}/`, origin: target.origin }
  }
}

/**
 * 创建仅作用于连接阶段的超时控制器。
 * 在接收到响应头后即可主动 clear()，避免长视频流播放时误触发全局超时导致中断。
 */
export function connectTimeoutSignal(ms: number): {
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

  timer.unref?.()
  return {
    signal: ac.signal,
    clear: () => clearTimeout(timer),
  }
}

/**
 * 优雅取消未使用的上游响应流，以便底层 Socket 连接可被连接池安全复用
 */
export function cancelBody(res: Response | null | undefined): void {
  try {
    void res?.body?.cancel().catch(() => {})
  } catch {
    /* ignore */
  }
}

/**
 * 请求上游媒体地址，带连接超时控制与 401/403 容灾降级重试
 */
export async function fetchMediaWithFallback(
  target: URL,
  opts: MediaFetchOptions = {},
): Promise<MediaFetchResult> {
  const { referer: effectiveReferer, origin } = resolveEffectiveReferer(
    opts.referer,
    target,
  )

  const headers: Record<string, string> = {
    'User-Agent': opts.defaultUserAgent || config.defaultUserAgent,
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }

  if (effectiveReferer) {
    headers.Referer = effectiveReferer
    if (origin) headers.Origin = origin
  }
  if (opts.cookie) {
    headers.Cookie = opts.cookie
  }
  if (opts.range) {
    headers.Range = opts.range
  }

  const timeoutMs = opts.connectTimeoutMs ?? 20_000
  let upstream: Response
  const connect = connectTimeoutSignal(timeoutMs)

  try {
    upstream = await fetchPublic(target.toString(), {
      headers,
      signal: connect.signal,
    })
  } catch (e) {
    connect.clear()
    const msg = e instanceof Error ? e.message : String(e)
    if (/内网|重定向/.test(msg)) {
      return { ok: false, status: 403, error: 'forbidden', message: msg }
    }
    return {
      ok: false,
      status: 502,
      error: 'upstream',
      message: `媒体源不可达: ${msg}`,
      hint: '链接可能已过期，请重新选集解析',
    }
  }

  // 成功握手接收到响应头，立即解除连接计时器，允许媒体数据持续流式传输
  connect.clear()

  if (!upstream.ok && upstream.status !== 206) {
    // 携带 Cookie 鉴权且返回 401/403 时（如 Anime1 等源的临时凭据过期）
    if (opts.cookie && (upstream.status === 403 || upstream.status === 401)) {
      cancelBody(upstream)
      return {
        ok: false,
        status: 403,
        error: 'auth_expired',
        message: `媒体鉴权失效 (${upstream.status})`,
        hint: '播放凭证已过期，请重新解析本集',
      }
    }

    // 针对某些严格校验 Origin 的 CDN，使用精简根路径 Origin 进行一次重试
    if (origin && (upstream.status === 403 || upstream.status === 401)) {
      const failedStatus = upstream.status
      cancelBody(upstream)
      const retryConnect = connectTimeoutSignal(timeoutMs)

      try {
        const retry = await fetchPublic(target.toString(), {
          headers: {
            ...headers,
            Referer: `${origin}/`,
            Origin: origin,
          },
          signal: retryConnect.signal,
        })
        retryConnect.clear()

        if (retry.ok || retry.status === 206) {
          upstream = retry
        } else {
          cancelBody(retry)
          return {
            ok: false,
            status: 502,
            error: 'upstream',
            message: `媒体源 ${retry.status}`,
            hint:
              retry.status === 404
                ? '播放地址已失效，请重新点选集获取新链接'
                : '源站防盗链拒绝，可换线路/规则',
          }
        }
      } catch (e) {
        retryConnect.clear()
        const msg = e instanceof Error ? e.message : String(e)
        if (/内网|重定向/.test(msg)) {
          return { ok: false, status: 403, error: 'forbidden', message: msg }
        }
        return {
          ok: false,
          status: 502,
          error: 'upstream',
          message: `媒体源 ${failedStatus}`,
          hint: '播放地址可能已过期，请重新选集',
        }
      }
    } else {
      cancelBody(upstream)
      return {
        ok: false,
        status: 502,
        error: 'upstream',
        message: `媒体源 ${upstream.status}`,
        hint:
          upstream.status === 404
            ? '播放地址已失效（常见于腾讯/签名短链），请重新点选集'
            : '源站返回错误，可换线路或规则',
      }
    }
  }

  return {
    ok: true,
    upstream,
    target,
    effectiveReferer,
    origin,
  }
}
