import type { DatabaseSync } from 'node:sqlite'
import { getDatabase } from './connection'

export interface Migration {
  version: number
  name: string
  up: (db: DatabaseSync) => void
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      // 1. Video source anime search results cache table
      db.exec(`
        CREATE TABLE IF NOT EXISTS plugin_search_cache (
          key TEXT PRIMARY KEY,
          plugin_name TEXT NOT NULL,
          keyword TEXT NOT NULL,
          rule_hash TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          hit_count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_plugin_search_expires ON plugin_search_cache(expires_at);
        CREATE INDEX IF NOT EXISTS idx_plugin_search_name_kw ON plugin_search_cache(plugin_name, keyword);
        CREATE INDEX IF NOT EXISTS idx_plugin_search_created ON plugin_search_cache(created_at);
      `)

      // 2. Generic Key-Value Cache table for future extensibility (danmaku, chapters, metadata, etc.)
      db.exec(`
        CREATE TABLE IF NOT EXISTS kv_cache (
          namespace TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (namespace, key)
        );
        CREATE INDEX IF NOT EXISTS idx_kv_cache_expires ON kv_cache(expires_at);
        CREATE INDEX IF NOT EXISTS idx_kv_cache_ns ON kv_cache(namespace);
      `)
    },
  },
  {
    version: 2,
    name: 'plugin_chapters_cache',
    up: (db) => {
      // Video source anime episode / chapter lists cache table
      db.exec(`
        CREATE TABLE IF NOT EXISTS plugin_chapters_cache (
          key TEXT PRIMARY KEY,
          plugin_name TEXT NOT NULL,
          source_url TEXT NOT NULL,
          rule_hash TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          hit_count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_plugin_chapters_expires ON plugin_chapters_cache(expires_at);
        CREATE INDEX IF NOT EXISTS idx_plugin_chapters_name_src ON plugin_chapters_cache(plugin_name, source_url);
        CREATE INDEX IF NOT EXISTS idx_plugin_chapters_created ON plugin_chapters_cache(created_at);
      `)
    },
  },
  {
    version: 3,
    name: 'anime_play_stats',
    up: (db) => {
      // Anime subject & episode play metrics table
      db.exec(`
        CREATE TABLE IF NOT EXISTS anime_play_stats (
          bangumi_id INTEGER NOT NULL,
          episode INTEGER NOT NULL,
          play_count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (bangumi_id, episode)
        );
        CREATE INDEX IF NOT EXISTS idx_play_stats_bgm ON anime_play_stats(bangumi_id);
      `)
    },
  },
  {
    version: 4,
    name: 'ip_access_logs',
    up: (db) => {
      // IP access and PV metrics table
      db.exec(`
        CREATE TABLE IF NOT EXISTS ip_access_logs (
          ip TEXT PRIMARY KEY,
          total_hits INTEGER NOT NULL DEFAULT 1,
          today_hits INTEGER NOT NULL DEFAULT 1,
          last_date TEXT NOT NULL,
          first_seen INTEGER NOT NULL,
          last_seen INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ip_last_seen ON ip_access_logs(last_seen);
      `)
    },
  },
  {
    version: 5,
    name: 'bangumi_data_mapping',
    up: (db) => {
      // Universal cross-platform anime mapping table (bangumi-data)
      db.exec(`
        CREATE TABLE IF NOT EXISTS bangumi_data_mapping (
          bangumi_id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          sites TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bgm_mapping_updated ON bangumi_data_mapping(updated_at);
      `)
    },
  },
  {
    version: 6,
    name: 'anime_play_counts',
    up: (db) => {
      // Streamlined anime play counts table (decoupled, subject-level only)
      db.exec(`
        CREATE TABLE IF NOT EXISTS anime_play_counts (
          bangumi_id INTEGER PRIMARY KEY,
          play_count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_play_counts_desc ON anime_play_counts(play_count DESC);
      `)
    },
  },
  {
    version: 7,
    name: 'device_and_daily_views_metrics',
    up: (db) => {
      // 1. Devices table for hardware / client identification and telemetry
      db.exec(`
        CREATE TABLE IF NOT EXISTS devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT NOT NULL UNIQUE,
          fingerprint TEXT,
          first_seen_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL,
          last_ip TEXT,
          total_plays INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_devices_did ON devices(device_id);
        CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);
      `)

      // 2. Daily active devices (DAU) & overall view metrics table
      db.exec(`
        CREATE TABLE IF NOT EXISTS daily_active_stats (
          date TEXT PRIMARY KEY,
          dau INTEGER NOT NULL DEFAULT 0,
          new_devices INTEGER NOT NULL DEFAULT 0,
          total_views INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
      `)

      // 3. Anime total views table (migrating existing anime_play_counts data if present)
      db.exec(`
        CREATE TABLE IF NOT EXISTS anime_total_views (
          bangumi_id INTEGER PRIMARY KEY,
          total_views INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_anime_total_views_desc ON anime_total_views(total_views DESC);
      `)

      // Seamlessly backfill historical counts from anime_play_counts into anime_total_views
      try {
        db.exec(`
          INSERT OR IGNORE INTO anime_total_views (bangumi_id, total_views, updated_at)
          SELECT bangumi_id, play_count, updated_at FROM anime_play_counts;
        `)
      } catch {
        // Safe ignore if anime_play_counts table doesn't exist yet
      }

      // 4. Anime daily views table (partitioned by date for instant 1d/7d/30d aggregations)
      db.exec(`
        CREATE TABLE IF NOT EXISTS anime_daily_views (
          bangumi_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          views INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (bangumi_id, date)
        );
        CREATE INDEX IF NOT EXISTS idx_daily_views_date_count ON anime_daily_views(date, views DESC);
        CREATE INDEX IF NOT EXISTS idx_daily_views_bgm ON anime_daily_views(bangumi_id);
      `)
    },
  },
]

/**
 * Initialize database schema and run any pending migrations.
 */
export function initSchema(db?: DatabaseSync): void {
  const targetDb = db || getDatabase()

  // Ensure migration tracking table exists
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)

  // Read applied migrations
  const rows = targetDb
    .prepare('SELECT version FROM _schema_migrations ORDER BY version ASC;')
    .all() as Array<{ version: number }>
  const appliedVersions = new Set(rows.map((r) => Number(r.version)))

  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`[db] Applying migration v${migration.version}: ${migration.name}...`)
      migration.up(targetDb)
      targetDb
        .prepare('INSERT INTO _schema_migrations (version, name, applied_at) VALUES (?, ?, ?);')
        .run(migration.version, migration.name, Date.now())
      console.log(`[db] Migration v${migration.version} applied successfully.`)
    }
  }
}
