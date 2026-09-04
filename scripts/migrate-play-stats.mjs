#!/usr/bin/env node

/**
 * 独立数据迁移脚本：anime_play_stats (旧表) -> anime_play_counts (新表)
 *
 * 用途：
 *   将旧版按单集拆分的播放统计数据聚合迁移至全新的单一职责 anime_play_counts 表中。
 *   纯独立运行，零污染主工程业务代码。
 *
 * 使用方式：
 *   - 本地宿主机：node scripts/migrate-play-stats.mjs
 *   - Docker 容器：docker compose exec animaku node scripts/migrate-play-stats.mjs
 *   - 指定数据库路径：SQLITE_PATH=/path/to/animaku.db node scripts/migrate-play-stats.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dbPath = process.env.SQLITE_PATH || path.resolve(process.cwd(), 'data/animaku.db')

console.log('='.repeat(60))
console.log(' Animaku 观看次数数据库独立迁移工具')
console.log('='.repeat(60))
console.log(`[db] 目标数据库路径: ${dbPath}`)

if (!fs.existsSync(dbPath)) {
  console.log(`[info] 数据库文件不存在: ${dbPath}，无需执行迁移。`)
  process.exit(0)
}

const db = new DatabaseSync(dbPath)

// 1. 确保目标表 anime_play_counts 已初始化
db.exec(`
  CREATE TABLE IF NOT EXISTS anime_play_counts (
    bangumi_id INTEGER PRIMARY KEY,
    play_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_play_counts_desc ON anime_play_counts(play_count DESC);
`)

// 2. 检查旧表 anime_play_stats 是否存在
const hasOldTable = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'anime_play_stats';")
  .get()

if (!hasOldTable) {
  console.log('[info] 未检测到旧表 anime_play_stats，无需迁移。')
  process.exit(0)
}

// 3. 读取旧表中所有需要迁移的聚合数据
const rows = db.prepare(`
  SELECT
    bangumi_id,
    COALESCE(
      MAX(CASE WHEN episode = 0 THEN play_count END),
      SUM(play_count)
    ) AS total_plays,
    MAX(updated_at) AS latest_updated_at
  FROM anime_play_stats
  GROUP BY bangumi_id;
`).all()

if (!rows || rows.length === 0) {
  console.log('[info] 旧表 anime_play_stats 中无历史数据。')
  process.exit(0)
}

console.log(`[migration] 检测到 ${rows.length} 部番剧的历史播放统计数据，开始迁移...`)

const insertStmt = db.prepare(`
  INSERT INTO anime_play_counts (bangumi_id, play_count, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(bangumi_id) DO UPDATE SET
    play_count = MAX(anime_play_counts.play_count, excluded.play_count),
    updated_at = MAX(anime_play_counts.updated_at, excluded.updated_at);
`)

let totalPlayCountSum = 0
let migratedSubjects = 0

// 4. 批量迁移并写入
for (const row of rows) {
  const bgmId = Number(row.bangumi_id)
  const plays = Number(row.total_plays || 0)
  const updatedAt = Number(row.latest_updated_at || Date.now())

  if (bgmId > 0 && plays > 0) {
    insertStmt.run(bgmId, plays, updatedAt)
    totalPlayCountSum += plays
    migratedSubjects++
  }
}

console.log('='.repeat(60))
console.log(' 迁移完成！统计报告：')
console.log(` - 成功迁移番剧数: ${migratedSubjects} 部`)
console.log(` - 累计观看次数总量: ${totalPlayCountSum} 次`)
console.log('='.repeat(60))
console.log('[tip] 验证无误后，如需清理旧表释放空间，可手动执行：')
console.log('      DROP TABLE anime_play_stats;')
