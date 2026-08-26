import type { Context, Next } from 'hono'
import { getClientIp } from './logger'
import { clientRemoteAddress } from './access'
import { isLoopbackIp } from './private-host'
import { ipAccessRepo } from '../db'

export interface RateLimitOptions {
  /** Global API limit per second (default: 30) */
  apiLimitPerSec?: number
  /** Heavy plugin/media parsing API limit per second (default: 10) */
  heavyLimitPerSec?: number
}

interface WindowBucket {
  count: number
  windowStart: number
}

// In-memory sliding window rate limiter stores
const apiWindowStore = new Map<string, WindowBucket>()
const heavyWindowStore = new Map<string, WindowBucket>()

// Cleanup idle windows every 60 seconds
const pruneTimer = setInterval(() => {
  const now = Date.now()
  for (const [ip, bucket] of apiWindowStore.entries()) {
    if (now - bucket.windowStart > 5000) {
      apiWindowStore.delete(ip)
    }
  }
  for (const [ip, bucket] of heavyWindowStore.entries()) {
    if (now - bucket.windowStart > 5000) {
      heavyWindowStore.delete(ip)
    }
  }
}, 60 * 1000)
pruneTimer.unref()

function resolveIp(c: Context): string {
  const ip = getClientIp(c.req)
  if (ip && ip !== '127.0.0.1') return ip
  const sock = clientRemoteAddress(c)
  return sock || ip || '127.0.0.1'
}

export function isHealthCheckPath(path: string): boolean {
  return (
    path === '/api/health' ||
    path === '/api/health/' ||
    path === '/health' ||
    path === '/health/'
  )
}

function checkWindowLimit(
  store: Map<string, WindowBucket>,
  ip: string,
  limit: number,
  now: number,
): { allowed: boolean; remaining: number } {
  let bucket = store.get(ip)
  if (!bucket || now - bucket.windowStart >= 1000) {
    bucket = { count: 1, windowStart: now }
    store.set(ip, bucket)
    return { allowed: true, remaining: limit - 1 }
  }

  bucket.count += 1
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0 }
  }
  return { allowed: true, remaining: limit - bucket.count }
}

/**
 * IP Access Recording & Anti-Abuse Rate Limit Middleware
 * - Records IP traffic asynchronously in memory (<1μs) and flushes in batches.
 * - Enforces sliding window rate limits on /api/* and /api/plugin|media/* endpoints.
 */
export function ipAccessAndRateLimit(options?: RateLimitOptions) {
  const apiLimit = options?.apiLimitPerSec ?? 30
  const heavyLimit = options?.heavyLimitPerSec ?? 10

  return async function middleware(c: Context, next: Next) {
    const path = c.req.path
    const method = c.req.method

    // Skip rate limiting and traffic recording for preflight OPTIONS requests
    if (method === 'OPTIONS') {
      return next()
    }

    const ip = resolveIp(c)
    const isLocal = isLoopbackIp(ip)
    const isHealthCheck = isHealthCheckPath(path)

    // 1. Skip traffic recording & rate limiting for loopback addresses & health checks
    if (isLocal || isHealthCheck) {
      return next()
    }

    // 2. Asynchronously record IP visit in memory (0 DB blocking) for non-local real requests
    ipAccessRepo.recordHit(ip)

    // 3. Skip rate limiting for non-api requests
    if (!path.startsWith('/api/')) {
      return next()
    }

    const now = Date.now()

    // 3. Heavy endpoints check (/api/plugin/*, /api/media/*)
    const isHeavyEndpoint =
      path.startsWith('/api/plugin') || path.startsWith('/api/media')

    if (isHeavyEndpoint) {
      const { allowed, remaining } = checkWindowLimit(
        heavyWindowStore,
        ip,
        heavyLimit,
        now,
      )
      c.res.headers.set('X-RateLimit-Limit', String(heavyLimit))
      c.res.headers.set('X-RateLimit-Remaining', String(remaining))

      if (!allowed) {
        c.res.headers.set('Retry-After', '1')
        return c.json(
          {
            error: 'too_many_requests',
            message: '请求过于频繁，请稍后再试 (Rate limit exceeded for heavy endpoints)',
          },
          429,
        )
      }
    }

    // 4. Standard API check (/api/*)
    const { allowed, remaining } = checkWindowLimit(
      apiWindowStore,
      ip,
      apiLimit,
      now,
    )
    if (!isHeavyEndpoint) {
      c.res.headers.set('X-RateLimit-Limit', String(apiLimit))
      c.res.headers.set('X-RateLimit-Remaining', String(remaining))
    }

    if (!allowed) {
      c.res.headers.set('Retry-After', '1')
      return c.json(
        {
          error: 'too_many_requests',
          message: '请求过于频繁，请稍后再试 (Too Many Requests)',
        },
        429,
      )
    }

    return next()
  }
}
