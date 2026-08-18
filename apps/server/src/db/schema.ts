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
