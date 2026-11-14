export type SourceOpKind = 'search' | 'chapters' | 'resolve'

export interface SourceRateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
  limit: number
}

export class SourceRateLimitError extends Error {
  readonly retryAfterSec: number
  readonly limit: number
  readonly kind: SourceOpKind
  readonly upstreamKey: string

  constructor(opts: {
    retryAfterSec: number
    limit: number
    kind: SourceOpKind
    upstreamKey: string
  }) {
    super(
      `该视频源请求过于频繁，请 ${opts.retryAfterSec} 秒后重试`,
    )
    this.name = 'SourceRateLimitError'
    this.retryAfterSec = opts.retryAfterSec
    this.limit = opts.limit
    this.kind = opts.kind
    this.upstreamKey = opts.upstreamKey
  }
}

interface WindowBucket {
  count: number
  windowStart: number
}

function envInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function getSourceRateLimits(): Record<SourceOpKind, number> {
  return {
    search: envInt(process.env.SOURCE_SEARCH_LIMIT_PER_MIN, 15),
    chapters: envInt(process.env.SOURCE_CHAPTERS_LIMIT_PER_MIN, 15),
    resolve: envInt(process.env.SOURCE_RESOLVE_LIMIT_PER_MIN, 30),
  }
}

const WINDOW_SIZE_MS = 60 * 1000
const MAX_STORE_ENTRIES = envInt(process.env.SOURCE_LIMIT_MAX_ENTRIES, 200_000)

// In-memory rate limit store: `${ip}|${upstreamKey}|${kind}` -> WindowBucket
const store = new Map<string, WindowBucket>()

// 定期清理已过期的桶（每 60 秒检查一次）
const pruneTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of store.entries()) {
    if (now - bucket.windowStart >= WINDOW_SIZE_MS) {
      store.delete(key)
    }
  }
}, WINDOW_SIZE_MS)
pruneTimer.unref()

/**
 * 检查并消耗指定 IP 对特定源在特定操作上的限额。
 * 命中缓存的请求绝对不要调用此函数，仅统计真正打到源站的请求。
 */
export function checkSourceRateLimit(
  ip: string,
  upstreamKey: string,
  kind: SourceOpKind,
  now: number = Date.now(),
): SourceRateLimitResult {
  const limits = getSourceRateLimits()
  const limit = limits[kind] ?? 15

  // 彻底移除回环豁免：无论来源是否为 127.0.0.1、::1 或外部伪造头，统一按 IP 计入滑动窗口
  const normalizedIp = (ip || 'unknown').trim().toLowerCase()
  const normalizedKey = upstreamKey.trim().toLowerCase()
  const storeKey = `${normalizedIp}|${normalizedKey}|${kind}`

  let bucket = store.get(storeKey)
  if (!bucket || now - bucket.windowStart >= WINDOW_SIZE_MS) {
    bucket = { count: 0, windowStart: now }
    // 达到上限时淘汰最旧项防内存泄漏
    if (store.size >= MAX_STORE_ENTRIES) {
      const firstKey = store.keys().next().value
      if (firstKey) store.delete(firstKey)
    }
    store.set(storeKey, bucket)
  }

  if (bucket.count >= limit) {
    const elapsed = now - bucket.windowStart
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_SIZE_MS - elapsed) / 1000))
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec,
      limit,
    }
  }

  bucket.count++
  const remaining = limit - bucket.count
  return {
    allowed: true,
    remaining,
    retryAfterSec: 0,
    limit,
  }
}

/** 仅供单元测试或重置状态使用 */
export function clearSourceRateLimits(): void {
  store.clear()
}
