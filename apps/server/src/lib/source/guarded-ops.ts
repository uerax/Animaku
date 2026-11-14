import {
  PLUGIN_CACHE_TTL,
  PLUGIN_MAX_ENTRIES,
  cacheDelete,
  cacheGet,
  cacheGetOrSet,
  cacheSet,
  shortHash,
} from '../ttl-cache'
import { pluginCircuitBreaker } from './plugin-circuit-breaker'
import {
  checkSourceRateLimit,
  SourceRateLimitError,
} from '../source-rate-limit'

export interface GuardedOpOptions<T> {
  kind: 'search' | 'chapters'
  upstreamKey: string
  cacheKey: string
  clientIp: string
  bypass?: boolean
  loader: () => Promise<T>
  isEmpty?: (val: T) => boolean
  reformatResult?: (val: T) => T
  maxEntries?: number
}

export interface GuardedOpResult<T> {
  data: T
  hit: boolean
}

/**
 * 跨端共享缓存 Key 格式：
 * src:<sourceId>:<kind>:<输入内容哈希>
 */
export function buildSourceCacheKey(
  sourceId: string,
  kind: 'search' | 'chapters',
  payload: string,
): string {
  return `src:${sourceId.toLowerCase().trim()}:${kind}:${shortHash(payload)}`
}

/**
 * 选集缓存 30 秒绕过冷却记录。
 * Key 为选集 cacheKey，30 秒内仅允许绕过一次源站；
 * 30 秒内再次带 refresh 时直接返回缓存。
 */
const chaptersRefreshCooldownMap = new Map<string, number>()
const CHAPTERS_REFRESH_COOLDOWN_MS = 30_000
const MAX_COOLDOWN_ENTRIES = 50_000

const cooldownPruneTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, timestamp] of chaptersRefreshCooldownMap.entries()) {
    if (now - timestamp >= CHAPTERS_REFRESH_COOLDOWN_MS) {
      chaptersRefreshCooldownMap.delete(key)
    }
  }
}, CHAPTERS_REFRESH_COOLDOWN_MS)
cooldownPruneTimer.unref()

export function isChapterInCooldown(
  cacheKey: string,
  now: number = Date.now(),
): boolean {
  const lastTime = chaptersRefreshCooldownMap.get(cacheKey)
  return Boolean(lastTime && now - lastTime < CHAPTERS_REFRESH_COOLDOWN_MS)
}

export function recordChapterCooldown(
  cacheKey: string,
  now: number = Date.now(),
): void {
  if (chaptersRefreshCooldownMap.size >= MAX_COOLDOWN_ENTRIES) {
    const firstKey = chaptersRefreshCooldownMap.keys().next().value
    if (firstKey) chaptersRefreshCooldownMap.delete(firstKey)
  }
  chaptersRefreshCooldownMap.set(cacheKey, now)
}

export function canBypassChapters(
  cacheKey: string,
  now: number = Date.now(),
): boolean {
  if (isChapterInCooldown(cacheKey, now)) {
    return false
  }
  recordChapterCooldown(cacheKey, now)
  return true
}

/** 仅供单测清空状态 */
export function clearChaptersCooldown(): void {
  chaptersRefreshCooldownMap.clear()
}

/**
 * 统一视频源安全防护层
 *
 * 核心流程：
 * 1. 规范化 bypass 策略：
 *    - 搜索：强制忽略 refresh / no-cache（bypass = false）
 *    - 选集：保留 refresh，但同一部番（同一 cacheKey）30 秒内仅允许绕过 1 次
 * 2. 查缓存：命中则直接返回（不记限额、不打源站）；
 * 3. 检查频控 (改动 B)：未命中缓存时检查 (IP + upstreamKey + kind)，超限抛出 SourceRateLimitError；
 * 4. 检查熔断状态：使用服务端确定的 upstreamKey 检查，阻断异常源站的连锁超时；
 * 5. 并发合并 (Single-flight)：相同请求并发合并为单次源站调用；
 * 6. 写入缓存并记录熔断状态（空搜索 90s，异常绝不写假空缓存）；
 * 7. 根据调用方动态格式化返回（如覆写 pluginName）。
 */
export async function guardedOp<T>(
  opts: GuardedOpOptions<T>,
): Promise<GuardedOpResult<T>> {
  const {
    kind,
    upstreamKey,
    cacheKey,
    clientIp,
    bypass = false,
    loader,
    isEmpty,
    reformatResult,
    maxEntries = PLUGIN_MAX_ENTRIES,
  } = opts

  // 1. 规范化 bypass 策略
  let effectiveBypass = false
  if (bypass) {
    if (kind === 'search') {
      // 搜索强制忽略 refresh，避免全站刷屏爬虫穿透
      effectiveBypass = false
    } else if (kind === 'chapters') {
      // 选集检查是否处于 30 秒冷却期内（不在冷却期才允许尝试 bypass，暂不记录冷却位）
      effectiveBypass = !isChapterInCooldown(cacheKey)
    }
  }

  // 2. 查缓存（非 bypass 请求若命中缓存，不记限额、不打源站直接返回）
  if (!effectiveBypass) {
    const memHit = cacheGet<T>(cacheKey)
    if (memHit !== undefined) {
      const data = reformatResult ? reformatResult(memHit) : memHit
      return { data, hit: true }
    }
  }

  // 3. 检查每用户每源限次 (改动 B)
  // 核心安全时序：必须在真正向源站发包前检查！
  // 若超限抛出 429，旧缓存绝不被删除，且不记录 30 秒冷却，彻底杜绝 Cache Eviction DoS
  const rateLimitResult = checkSourceRateLimit(clientIp, upstreamKey, kind)
  if (!rateLimitResult.allowed) {
    throw new SourceRateLimitError({
      retryAfterSec: rateLimitResult.retryAfterSec,
      limit: rateLimitResult.limit,
      kind,
      upstreamKey,
    })
  }

  // 4. 限频校验通过后：若为合法 bypass 请求，安全删除旧缓存并正式计入 30 秒冷却
  if (effectiveBypass) {
    cacheDelete(cacheKey)
    if (kind === 'chapters') {
      recordChapterCooldown(cacheKey)
    }
  }

  // 4. 熔断短路检查（服务端 upstreamKey）
  const breakerCheck = pluginCircuitBreaker.checkBeforeSearch(upstreamKey)
  if (!breakerCheck.allowed) {
    throw new Error(breakerCheck.reason || '源站响应异常，熔断冷却中')
  }

  // 5. Single-flight loader 并发合并与执行
  try {
    const { value, hit: flightHit } = await cacheGetOrSet(
      cacheKey,
      0, // 初始不写入，待分类判空后再写
      loader,
      { bypass: false, maxEntries },
    )

    // 成功：记录熔断正常
    pluginCircuitBreaker.recordSuccess(upstreamKey)

    // 若当前请求是真正执行 loader 的首个请求，按内容分类写入 TTL 缓存
    if (!flightHit) {
      let ttl: number = PLUGIN_CACHE_TTL.search
      const empty = isEmpty ? isEmpty(value) : false

      if (kind === 'search') {
        // 搜索结果：空结果 90 秒，非空 4 小时
        ttl = empty ? PLUGIN_CACHE_TTL.searchEmpty : PLUGIN_CACHE_TTL.search
      } else if (kind === 'chapters') {
        // 选集结果：空结果 60 秒，非空 30 分钟
        ttl = empty ? PLUGIN_CACHE_TTL.chaptersEmpty : PLUGIN_CACHE_TTL.chapters
      }

      if (ttl > 0) {
        cacheSet(cacheKey, value, ttl, maxEntries)
      }
    }

    const data = reformatResult ? reformatResult(value) : value
    return { data, hit: flightHit }
  } catch (err) {
    // 失败：记录熔断异常，绝不写缓存
    const message = err instanceof Error ? err.message : String(err)
    pluginCircuitBreaker.recordFailure(upstreamKey, message)
    throw err
  }
}
