import { prepareStatement, getDatabase } from '../connection'

export interface AnimeBangumiMapping {
  bangumiId: number
  title: string
  sites: {
    bilibili?: string
    bilibili_hk_mo_tw?: string
    iqiyi?: string
    qq?: string
    bahamut?: string
    youku?: string
    acfun?: string
    [site: string]: string | undefined
  }
}

export class BangumiDataRepository {
  /**
   * Get count of stored mapping records.
   */
  count(): number {
    try {
      const stmt = prepareStatement('SELECT COUNT(*) as c FROM bangumi_data_mapping;')
      const row = stmt.get() as { c: number } | undefined
      return Number(row?.c || 0)
    } catch {
      return 0
    }
  }

  /**
   * Get single mapping by Bangumi ID.
   */
  get(bangumiId: number): AnimeBangumiMapping | null {
    try {
      const stmt = prepareStatement(
        'SELECT bangumi_id, title, sites FROM bangumi_data_mapping WHERE bangumi_id = ? LIMIT 1;'
      )
      const row = stmt.get(bangumiId) as
        | { bangumi_id: number; title: string; sites: string }
        | undefined
      if (!row) return null
      return {
        bangumiId: Number(row.bangumi_id),
        title: row.title || '',
        sites: JSON.parse(row.sites || '{}'),
      }
    } catch {
      return null
    }
  }

  /**
   * Get all stored mapping records (used on startup to populate memory map).
   */
  getAll(): AnimeBangumiMapping[] {
    try {
      const stmt = prepareStatement(
        'SELECT bangumi_id, title, sites FROM bangumi_data_mapping;'
      )
      const rows = stmt.all() as Array<{
        bangumi_id: number
        title: string
        sites: string
      }>
      return rows.map((r) => ({
        bangumiId: Number(r.bangumi_id),
        title: r.title || '',
        sites: JSON.parse(r.sites || '{}'),
      }))
    } catch (err) {
      console.error('[db:bangumi-data] getAll error:', err)
      return []
    }
  }

  /**
   * Batch upsert records inside a single transaction for maximum speed.
   */
  batchUpsert(items: AnimeBangumiMapping[]): void {
    if (!items || items.length === 0) return
    const db = getDatabase()
    const now = Date.now()

    db.exec('BEGIN TRANSACTION;')
    try {
      const stmt = prepareStatement(`
        INSERT INTO bangumi_data_mapping (bangumi_id, title, sites, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(bangumi_id) DO UPDATE SET
          title = excluded.title,
          sites = excluded.sites,
          updated_at = excluded.updated_at;
      `)

      for (const item of items) {
        stmt.run(
          item.bangumiId,
          item.title || '',
          JSON.stringify(item.sites || {}),
          now
        )
      }
      db.exec('COMMIT;')
    } catch (err) {
      db.exec('ROLLBACK;')
      console.error('[db:bangumi-data] batchUpsert error:', err)
      throw err
    }
  }
}
