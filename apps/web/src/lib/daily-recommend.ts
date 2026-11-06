import { useQuery } from '@tanstack/react-query'
import {
  DailyRecommendService,
  collectUserGenreFrequencies,
  type RecommendItem,
  type DailyRecommendClient,
  type BangumiItem,
  type BangumiCollectionEntry,
} from '@animaku/shared'
import { bangumiApi } from './bangumi'
import { useHistoryStore } from '../stores/history'
import { useWatchedStore } from '../stores/watched'
import { useSettingsStore } from '../stores/settings'
import { useAuthStore } from '../stores/auth'
import { getCachedBrowserFingerprint } from './fingerprint'

const TAG_TOTALS_STORAGE_KEY = 'aniku:bgm:tag_totals'
const DEVICE_ID_STORAGE_KEY = 'animaku_device_id'

/**
 * 获取或创建稳定的设备机器码 / 用户标识（对齐 zakoway getOrCreateDeviceInstallId）：
 * 1. 若用户已登录（Bangumi 或自建用户系统），优先使用 user_${userId}，保证同一账号跨设备推荐绝对一致；
 * 2. 若未登录，优先读取持久化的设备机器码；不存在时尝试读取浏览器硬件指纹或生成唯一随机设备码。
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'device_server_fallback'

  // 1. 已登录用户账号优先
  const authUser = useAuthStore.getState().session?.profile
  if (authUser && authUser.id) {
    return `user_${authUser.provider}_${authUser.id}`
  }

  // 2. 本地持久化机器码
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (existing && existing.trim().length > 0) {
      return existing.trim()
    }

    const fp = getCachedBrowserFingerprint()
    const newId = fp && fp.length >= 16
      ? `fp_${fp}`
      : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

    localStorage.setItem(DEVICE_ID_STORAGE_KEY, newId)
    return newId
  } catch {
    return 'device_default_seed'
  }
}

/**
 * 题材容量持久化缓存读写
 */
function readTagTotalsCache(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(TAG_TOTALS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch {}
  return {}
}

function writeTagTotalCache(tag: string, total: number) {
  if (typeof window === 'undefined' || !tag || total <= 0) return
  try {
    const cache = readTagTotalsCache()
    cache[tag.trim()] = Math.max(10, Math.min(1000, total))
    localStorage.setItem(TAG_TOTALS_STORAGE_KEY, JSON.stringify(cache))
  } catch {}
}

/**
 * 每日推荐专用直连 Bangumi 客户端适配器
 */
export const dailyRecommendClient: DailyRecommendClient = {
  searchWithTotal: async (keyword, opts) => {
    // 强制限制 type: 2 (Anime 动画)，避免 Bangumi 上游检索命中 type: 6 (三次元/日剧)
    const res = await bangumiApi.search(keyword, {
      tags: opts.tags,
      sort: opts.sort,
      limit: opts.limit,
      offset: opts.offset,
      type: opts.type ?? 2,
    })
    const items = res.data || []
    const total = res.total

    // 若返回了 total，旁路搭车记录到题材容量缓存（过滤通用停用标签）
    if (total && opts.tags && opts.tags.length > 0) {
      for (const t of opts.tags) {
        if (t !== '日本' && t !== '剧场版' && t !== 'OVA') {
          writeTagTotalCache(t, total)
          break
        }
      }
    }

    return { items, total }
  },

  getTagTotal: async (tag: string) => {
    const cache = readTagTotalsCache()
    const clean = tag.trim()
    if (clean && cache[clean]) {
      return cache[clean]
    }
    // 安全基准默认容量（对齐 zakoway 400）
    return 400
  },

  getTrending: async (limit = 10) => {
    const res = await bangumiApi.trending(limit, 0)
    return res.data || []
  },
}

function readDiskCacheSync(key: string): RecommendItem[] | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.expiresAt || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key)
      return undefined
    }
    return parsed.data as RecommendItem[]
  } catch {
    return undefined
  }
}

/**
 * 本地 LocalStorage 硬盘缓存适配器（带 TTL 至今日 23:59:59）
 */
const diskCacheAdapter = {
  get: async (key: string): Promise<RecommendItem[] | null> => {
    return readDiskCacheSync(key) ?? null
  },

  set: async (key: string, data: RecommendItem[], maxAgeMs: number): Promise<void> => {
    if (typeof window === 'undefined') return
    try {
      const payload = {
        data,
        expiresAt: Date.now() + maxAgeMs,
      }
      localStorage.setItem(key, JSON.stringify(payload))
    } catch {}
  },
}

/**
 * 获取今日零点和今日结束毫秒数
 */
function getTodayDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 首页消费 Hook：获取今日算法推荐轮播条目
 */
export function useDailyRecommend() {
  const token = useSettingsStore((s) => s.bangumiToken)
  const authUserId = useAuthStore((s) => s.session?.profile?.id)
  const historyItems = useHistoryStore((s) => s.items)
  const watchedRecords = useWatchedStore((s) => s.records)

  const dateKey = getTodayDateKey()
  const diskCacheKey = `daily_roam_bundle_${dateKey}`
  const deviceId = getOrCreateDeviceId()

  return useQuery({
    queryKey: ['daily-recommend', dateKey, deviceId, authUserId, Boolean(token)],
    initialData: () => readDiskCacheSync(diskCacheKey),
    queryFn: async (): Promise<RecommendItem[]> => {
      // 1. 尝试并发读取 Bangumi 登录用户的在看 (type=2) 与看过 (type=3) 数据（若已配置 token）
      let bangumiCollections: BangumiCollectionEntry[] = []
      if (token && token.trim().length > 0) {
        try {
          const [watchingRes, watchedRes] = await Promise.allSettled([
            bangumiApi.collections({ type: 2, limit: 30 }),
            bangumiApi.collections({ type: 3, limit: 50 }),
          ])
          const watching = watchingRes.status === 'fulfilled' ? watchingRes.value.data || [] : []
          const watched = watchedRes.status === 'fulfilled' ? watchedRes.value.data || [] : []
          bangumiCollections = [...watching, ...watched]
        } catch {
          // 静默降级：网络受阻时不阻碍本地推荐生成
        }
      }

      // 2. 收集用户题材词频画像（按番剧去重 + Bangumi 收藏融合 + 留好自建系统口子）
      const rawUserTagFreq = collectUserGenreFrequencies({
        historyItems,
        bangumiCollections,
        userSystemTags: [], // <-- 预留给未来自建用户系统的口子
      })

      // 3. 收集已看去重黑名单 (watchedSubjectIds)
      const watchedSubjectIds = new Set<number>()
      for (const item of historyItems) {
        if (item.bangumiId > 0) watchedSubjectIds.add(item.bangumiId)
      }
      for (const bangumiIdStr of Object.keys(watchedRecords)) {
        const id = Number(bangumiIdStr)
        if (id > 0) watchedSubjectIds.add(id)
      }
      for (const col of bangumiCollections) {
        if (col.subjectId > 0) watchedSubjectIds.add(col.subjectId)
      }

      // 4. 执行调度算法（冷启动 vs 个性化 + 广域离散散落采样）
      return DailyRecommendService.getDailyRecommendations({
        client: dailyRecommendClient,
        rawUserTagFreq,
        watchedSubjectIds,
        customDeviceId: deviceId,
        diskCache: diskCacheAdapter,
      })
    },
    staleTime: 60 * 60_000, // 1 小时内保持稳定
    gcTime: 24 * 60 * 60_000,
  })
}
