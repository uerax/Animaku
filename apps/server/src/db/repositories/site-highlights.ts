import type {
  HighlightConfig,
  HighlightItem,
  HighlightPlacement,
  HighlightSlotsMap,
} from '@animaku/shared'
import { isDatabaseActive, prepareStatement } from '../connection'

interface SiteHighlightRow {
  placement: string
  enabled: number
  layout: string
  items_json: string
  updated_at: number
}

export class SiteHighlightsRepository {
  /**
   * 永久驻留的内存缓存：首访全量读入后永不轮询查库；
   * 仅在后台配置保存/修改/删除时被主动原地更新与刷新。
   */
  private memoryCache: Map<HighlightPlacement, HighlightConfig> | null = null

  /**
   * 初始化/预热内存缓存（单例无竞态）
   */
  private ensureMemoryLoaded(): Map<HighlightPlacement, HighlightConfig> {
    if (this.memoryCache !== null) {
      return this.memoryCache
    }

    const map = new Map<HighlightPlacement, HighlightConfig>()
    this.memoryCache = map

    if (!isDatabaseActive()) {
      return map
    }

    try {
      const stmt = prepareStatement(`
        SELECT placement, enabled, layout, items_json, updated_at
        FROM site_highlights;
      `)
      const rows = stmt.all() as unknown as SiteHighlightRow[]
      for (const row of rows) {
        let items: HighlightItem[] = []
        try {
          items = JSON.parse(row.items_json)
          if (!Array.isArray(items)) items = []
        } catch {
          items = []
        }

        const placement = row.placement as HighlightPlacement
        map.set(placement, {
          placement,
          enabled: Boolean(row.enabled),
          layout: row.layout === 'double' ? 'double' : 'single',
          items,
          updatedAt: Number(row.updated_at || Date.now()),
        })
      }
    } catch (err) {
      console.error('[db:highlights] Failed to preload highlights from SQLite:', err)
    }

    return map
  }

  /**
   * 前台公共只读接口使用：
   * 100% 内存读取，只返回当前处于 enabled 状态且至少有 1 个条目的点位。
   */
  getPublicHighlights(): HighlightSlotsMap {
    const map = this.ensureMemoryLoaded()
    const result: HighlightSlotsMap = {}

    for (const [key, cfg] of map.entries()) {
      if (cfg.enabled && Array.isArray(cfg.items) && cfg.items.length > 0) {
        result[key] = cfg
      }
    }

    return result
  }

  /**
   * 管理后台专用：获取所有点位当前配置（无论启用还是禁用）
   */
  getAllConfigs(): Record<string, HighlightConfig> {
    const map = this.ensureMemoryLoaded()
    const result: Record<string, HighlightConfig> = {}

    for (const [key, cfg] of map.entries()) {
      result[key] = cfg
    }

    return result
  }

  /**
   * 管理后台专用：读取单个点位配置
   */
  getConfig(placement: HighlightPlacement): HighlightConfig | null {
    const map = this.ensureMemoryLoaded()
    return map.get(placement) || null
  }

  /**
   * 保存/更新点位配置：
   * 同步持久化写入 SQLite，并主动更新内存缓存。
   */
  saveConfig(config: {
    placement: HighlightPlacement
    enabled: boolean
    layout?: 'single' | 'double'
    items: HighlightItem[]
  }): HighlightConfig {
    const map = this.ensureMemoryLoaded()
    const now = Date.now()

    const sanitizedItems: HighlightItem[] = (config.items || []).map((it, idx) => ({
      id: it.id && typeof it.id === 'string' ? it.id : `hl_${now}_${idx}`,
      title: typeof it.title === 'string' ? it.title.trim().slice(0, 100) : '',
      subtitle: typeof it.subtitle === 'string' ? it.subtitle.trim().slice(0, 200) : undefined,
      imageUrl: typeof it.imageUrl === 'string' ? it.imageUrl.trim() : '',
      linkUrl: typeof it.linkUrl === 'string' ? it.linkUrl.trim() : '',
      target: it.target === '_self' ? ('_self' as const) : ('_blank' as const),
      badge: typeof it.badge === 'string' ? it.badge.trim().slice(0, 20) : undefined,
    }))

    const updatedConfig: HighlightConfig = {
      placement: config.placement,
      enabled: Boolean(config.enabled),
      layout: config.layout === 'double' ? 'double' : 'single',
      items: sanitizedItems,
      updatedAt: now,
    }

    // 1. 同步更新/覆盖内存缓存（内存缓存永久生效）
    map.set(config.placement, updatedConfig)

    // 2. 写入 SQLite 数据库持久化
    if (isDatabaseActive()) {
      try {
        const stmt = prepareStatement(`
          INSERT INTO site_highlights (placement, enabled, layout, items_json, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(placement) DO UPDATE SET
            enabled = excluded.enabled,
            layout = excluded.layout,
            items_json = excluded.items_json,
            updated_at = excluded.updated_at;
        `)
        stmt.run(
          updatedConfig.placement,
          updatedConfig.enabled ? 1 : 0,
          updatedConfig.layout,
          JSON.stringify(updatedConfig.items),
          updatedConfig.updatedAt,
        )
      } catch (err) {
        console.error('[db:highlights] Failed to save highlight to SQLite:', err)
      }
    }

    return updatedConfig
  }

  /**
   * 删除某个点位的配置
   */
  deleteConfig(placement: HighlightPlacement): void {
    const map = this.ensureMemoryLoaded()
    map.delete(placement)

    if (isDatabaseActive()) {
      try {
        const stmt = prepareStatement(`
          DELETE FROM site_highlights WHERE placement = ?;
        `)
        stmt.run(placement)
      } catch (err) {
        console.error('[db:highlights] Failed to delete highlight from SQLite:', err)
      }
    }
  }
}

export const siteHighlightsRepo = new SiteHighlightsRepository()
