import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from '../config'

let dbInstance: DatabaseSync | null = null
const statementCache = new Map<string, StatementSync>()
let isClosing = false

export interface DatabaseOptions {
  path?: string
  wal?: boolean
  busyTimeout?: number
}

/**
 * Open and initialize the singleton SQLite database connection.
 * Configures WAL mode, busy timeout, and memory pragmas for high concurrency.
 */
export function getDatabase(options?: DatabaseOptions): DatabaseSync {
  if (dbInstance && dbInstance.isOpen) {
    return dbInstance
  }

  const targetPath = options?.path ?? config.sqlitePath
  const isMemory = targetPath === ':memory:'

  if (!isMemory) {
    const dbDir = dirname(targetPath)
    if (!existsSync(dbDir)) {
      try {
        mkdirSync(dbDir, { recursive: true })
      } catch (err) {
        console.error(`[db] Failed to create data directory ${dbDir}:`, err)
      }
    }
  }

  try {
    const db = new DatabaseSync(targetPath, {
      open: true,
      enableForeignKeyConstraints: true,
    })

    const busyTimeout = options?.busyTimeout ?? config.sqliteBusyTimeout
    db.exec(`PRAGMA busy_timeout = ${busyTimeout};`)

    if (!isMemory && (options?.wal ?? config.sqliteWal)) {
      // WAL mode allows multiple concurrent readers while writing
      db.exec('PRAGMA journal_mode = WAL;')
      db.exec('PRAGMA synchronous = NORMAL;')
    }

    db.exec('PRAGMA temp_store = MEMORY;')
    db.exec('PRAGMA cache_size = -8000;') // ~8MB page cache

    dbInstance = db
    console.log(`[db] SQLite initialized at ${isMemory ? ':memory:' : targetPath}`)
    return db
  } catch (err) {
    console.error(`[db] Failed to open SQLite at ${targetPath}, falling back to in-memory:`, err)
    const fallbackDb = new DatabaseSync(':memory:', {
      open: true,
      enableForeignKeyConstraints: true,
    })
    fallbackDb.exec('PRAGMA temp_store = MEMORY;')
    dbInstance = fallbackDb
    return fallbackDb
  }
}

/**
 * Prepare and cache SQL statement for maximum execution performance.
 */
export function prepareStatement(sql: string, db?: DatabaseSync): StatementSync {
  const targetDb = db || getDatabase()
  // Statement cache is scoped to current database instance
  let stmt = statementCache.get(sql)
  if (!stmt) {
    stmt = targetDb.prepare(sql)
    statementCache.set(sql, stmt)
  }
  return stmt
}

/**
 * Execute a function within an immediate transaction (ensures atomic writes).
 */
export function transaction<T>(callback: () => T, db?: DatabaseSync): T {
  const targetDb = db || getDatabase()
  targetDb.exec('BEGIN IMMEDIATE;')
  try {
    const result = callback()
    targetDb.exec('COMMIT;')
    return result
  } catch (err) {
    try {
      targetDb.exec('ROLLBACK;')
    } catch {
      /* ignore rollback error */
    }
    throw err
  }
}

/**
 * Gracefully close the database connection and flush statement cache.
 */
export function closeDatabase(): void {
  if (isClosing || !dbInstance || !dbInstance.isOpen) return
  isClosing = true
  try {
    statementCache.clear()
    dbInstance.close()
    console.log('[db] SQLite connection closed.')
  } catch (err) {
    console.error('[db] Error while closing SQLite connection:', err)
  } finally {
    dbInstance = null
    isClosing = false
  }
}
