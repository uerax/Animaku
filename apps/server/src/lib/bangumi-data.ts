import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bangumiDataRepo, kvCache, type AnimeBangumiMapping } from '../db'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const memoryMap = new Map<number, AnimeBangumiMapping>()
let isInitialized = false
let isSyncing = false

const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/bangumi-data@latest/dist/data.json',
  'https://unpkg.com/bangumi-data@latest/dist/data.json',
  'https://raw.githubusercontent.com/bangumi-data/bangumi-data/master/dist/data.json',
]

/**
 * Filter raw bangumi-data items into AnimeBangumiMapping list (preserving all cross-platform site IDs).
 */
function pruneRawBangumiData(items: Array<Record<string, unknown>>): AnimeBangumiMapping[] {
  const result: AnimeBangumiMapping[] = []

  for (const item of items || []) {
    const rawSites = (item.sites as Array<{ site?: string; id?: string }>) || []
    const bgmSite = rawSites.find((s) => s.site === 'bangumi')
    if (!bgmSite || !bgmSite.id) continue
    const bgmId = Number(bgmSite.id)
    if (!bgmId) continue

    const sites: Record<string, string> = {}
    for (const s of rawSites) {
      if (!s.site || !s.id || s.site === 'bangumi') continue
      sites[s.site] = String(s.id)
    }

    if (Object.keys(sites).length > 0) {
      const titles = item.titleTranslate as Record<string, string[]> | undefined
      const titleCn = titles?.['zh-Hans']?.[0] || (item.title as string) || ''
      result.push({
        bangumiId: bgmId,
        title: titleCn,
        sites,
      })
    }
  }
  return result
}

/**
 * Fetch and sync latest bangumi-data in background (non-blocking).
 */
export async function syncBangumiDataRemote(): Promise<boolean> {
  if (isSyncing) return false
  isSyncing = true

  try {
    console.log('[bangumi-data] 检查远程 bangumi-data 更新...')
    let rawData: { items?: Array<Record<string, unknown>> } | null = null

    for (const cdnUrl of CDN_URLS) {
      try {
        const res = await fetch(cdnUrl, {
          headers: { 'User-Agent': 'Animaku/1.0' },
          signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(30_000)
            : undefined,
        })
        if (res.ok) {
          rawData = (await res.json()) as { items?: Array<Record<string, unknown>> }
          if (rawData?.items && rawData.items.length > 0) {
            console.log(`[bangumi-data] 成功从 ${cdnUrl} 获取 ${rawData.items.length} 条原始数据`)
            break
          }
        }
      } catch (e) {
        console.warn(`[bangumi-data] 从 ${cdnUrl} 拉取失败:`, e instanceof Error ? e.message : e)
      }
    }

    if (!rawData?.items || rawData.items.length === 0) {
      console.warn('[bangumi-data] 所有 CDN 源均未成功返回有效数据，保持现有数据')
      return false
    }

    const pruned = pruneRawBangumiData(rawData.items)
    if (pruned.length > 0) {
      bangumiDataRepo.batchUpsert(pruned)
      for (const item of pruned) {
        memoryMap.set(item.bangumiId, item)
      }
      kvCache.set('bangumi_data', 'last_synced_at', Date.now())
      console.log(`[bangumi-data] 增量同步完成，当前内存映射总数: ${memoryMap.size}`)
      return true
    }
  } catch (err) {
    console.error('[bangumi-data] 远程同步异常:', err)
  } finally {
    isSyncing = false
  }
  return false
}

/**
 * Initialize bangumi-data mapping:
 * 1. Loads from SQLite into memory map (<10ms).
 * 2. If SQLite is empty, loads from local snapshot file and populates DB.
 * 3. Triggers asynchronous 7-day background sync if overdue.
 */
export function initBangumiDataMapping(): void {
  if (isInitialized) return
  isInitialized = true

  try {
    const existing = bangumiDataRepo.getAll()
    if (existing.length > 0) {
      for (const item of existing) {
        memoryMap.set(item.bangumiId, item)
      }
      console.log(`[bangumi-data] 从 SQLite 载入 ${memoryMap.size} 条跨站映射`)
    } else {
      // Load bundled snapshot
      const snapshotPath = path.resolve(__dirname, '../data/bangumi-data-snapshot.json')
      if (fs.existsSync(snapshotPath)) {
        try {
          const content = fs.readFileSync(snapshotPath, 'utf8')
          const rawItems = JSON.parse(content) as Array<{
            id: number
            title: string
            sites: Record<string, string>
          }>
          const items: AnimeBangumiMapping[] = rawItems.map((r) => ({
            bangumiId: r.id,
            title: r.title,
            sites: r.sites,
          }))
          bangumiDataRepo.batchUpsert(items)
          for (const item of items) {
            memoryMap.set(item.bangumiId, item)
          }
          console.log(`[bangumi-data] 首次从初始快照载入 ${memoryMap.size} 条跨站映射`)
        } catch (e) {
          console.error('[bangumi-data] 读取初始快照失败:', e)
        }
      }
    }

    // Check 7-day sync interval
    const lastSynced = kvCache.get<number>('bangumi_data', 'last_synced_at') || 0
    if (Date.now() - lastSynced > SYNC_INTERVAL_MS) {
      // Run background sync without awaiting
      syncBangumiDataRemote().catch((e) =>
        console.error('[bangumi-data] 后台周度同步失败:', e)
      )
    }
  } catch (err) {
    console.error('[bangumi-data] 初始化失败:', err)
  }
}

/**
 * Get anime cross-platform mapping by Bangumi ID (O(1) memory lookup).
 */
export function getAnimeSitesByBangumiId(
  bangumiId: number
): AnimeBangumiMapping | null {
  if (!isInitialized) initBangumiDataMapping()
  return memoryMap.get(bangumiId) || null
}

/**
 * Get Bilibili target ID with HK/MO/TW fallback for a given Bangumi ID.
 */
export function getBilibiliTargetByBangumiId(
  bangumiId: number
): {
  targetId: string
  isHkMoTw: boolean
  title?: string
} | null {
  const mapping = getAnimeSitesByBangumiId(bangumiId)
  if (!mapping?.sites) return null

  // 1. Prefer mainland Bilibili ID
  if (mapping.sites.bilibili) {
    return {
      targetId: mapping.sites.bilibili,
      isHkMoTw: false,
      title: mapping.title,
    }
  }

  // 2. Fallback to HK/MO/TW Bilibili ID
  if (mapping.sites.bilibili_hk_mo_tw) {
    return {
      targetId: mapping.sites.bilibili_hk_mo_tw,
      isHkMoTw: true,
      title: mapping.title,
    }
  }

  return null
}
