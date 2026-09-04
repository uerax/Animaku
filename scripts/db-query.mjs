#!/usr/bin/env node

/**
 * Animaku SQLite 开发者数据库极速查询与交互分析工具
 *
 * 特性：
 * - ⚡ 零依赖：纯 Node.js 原生实现 (node:sqlite + node:readline)，开箱即用；
 * - 🛡️ 只读优先：默认启用 readOnly 安全模式，杜绝意外篡改生产/测试数据（支持 --write 显式开启读写）；
 * - 🎯 丰富预设：一键查看概览、播放榜单、IP 访问日志、Bangumi 映射、多源与 KV 缓存、Schema 与索引；
 * - 📊 终端美化：自适应中英文宽度的 Unicode 框线表格，智能转换时间戳与紧凑展示 JSON；
 * - 💻 双模支持：命令行单次命令管道支持 (支持 --json / --raw) 与全功能交互式 REPL 菜单。
 *
 * 使用方式：
 * - pnpm db                             # 启动交互式菜单 / SQL REPL
 * - pnpm db "SELECT * FROM anime_play_counts LIMIT 5" # 直接执行 SQL 并输出表格
 * - pnpm db -s / --stats / overview     # 查看数据库与所有数据表统计概览
 * - pnpm db -t <table_name> [-l 20]     # 快速浏览指定表的数据
 * - pnpm db --top [-l 15]               # 番剧累计播放量排行
 * - pnpm db --ip [-l 15]                # 全局 IP 访问与 PV 统计
 * - pnpm db --mapping <关键词或ID>       # 检索 Bangumi 跨平台 ID 映射
 * - pnpm db --cache                     # 查看各缓存表命中率与状态
 * - pnpm db --schema [table_name]       # 查看表结构与索引定义
 * - pnpm db --json "SELECT ..."         # 以标准 JSON 输出结果 (便于管道组合)
 * - pnpm db --help                      # 显示完整帮助手册
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import readline from 'node:readline/promises'
import process from 'node:process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// ==========================================
// 1. 终端色彩与格式化工具 (ANSI Colors)
// ==========================================
const isColorSupported =
  !process.env.NO_COLOR &&
  (process.stdout.isTTY || process.env.FORCE_COLOR)

const color = {
  reset: isColorSupported ? '\x1b[0m' : '',
  bold: isColorSupported ? '\x1b[1m' : '',
  dim: isColorSupported ? '\x1b[2m' : '',
  italic: isColorSupported ? '\x1b[3m' : '',
  underline: isColorSupported ? '\x1b[4m' : '',
  cyan: isColorSupported ? '\x1b[36m' : '',
  green: isColorSupported ? '\x1b[32m' : '',
  yellow: isColorSupported ? '\x1b[33m' : '',
  blue: isColorSupported ? '\x1b[34m' : '',
  magenta: isColorSupported ? '\x1b[35m' : '',
  red: isColorSupported ? '\x1b[31m' : '',
  gray: isColorSupported ? '\x1b[90m' : '',
  bgCyan: isColorSupported ? '\x1b[46m\x1b[30m' : '',
  bgBlue: isColorSupported ? '\x1b[44m\x1b[37m' : '',
}

/**
 * 计算字符串在终端中的实际显示宽度 (处理全角中英文混排)
 */
function getDisplayWidth(str) {
  if (!str) return 0
  const clean = String(str).replace(/\x1b\[[0-9;]*m/g, '')
  let width = 0
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i)
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    ) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

/**
 * 宽度对齐补全空格
 */
function padDisplay(str, targetWidth, align = 'left') {
  const currentWidth = getDisplayWidth(str)
  const diff = Math.max(0, targetWidth - currentWidth)
  const spaces = ' '.repeat(diff)
  return align === 'right' ? spaces + str : str + spaces
}

/**
 * 字符串过长智能截断
 */
function truncateString(str, maxLen = 45) {
  if (!str) return ''
  const s = String(str)
  if (getDisplayWidth(s) <= maxLen) return s
  let currentLen = 0
  let cutIndex = 0
  for (let i = 0; i < s.length; i++) {
    const charWidth = getDisplayWidth(s[i])
    if (currentLen + charWidth > maxLen - 3) break
    currentLen += charWidth
    cutIndex = i + 1
  }
  return s.slice(0, cutIndex) + '...'
}

/**
 * 格式化时间戳 (毫秒/秒)
 */
function formatTimestamp(val) {
  if (typeof val !== 'number' && typeof val !== 'bigint') return String(val)
  let ms = Number(val)
  if (ms < 1e11) ms *= 1000 // 秒转毫秒
  const d = new Date(ms)
  if (isNaN(d.getTime())) return String(val)

  const pad = (n) => String(n).padStart(2, '0')
  const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

  const now = Date.now()
  const diffSec = Math.round((now - ms) / 1000)

  if (Math.abs(diffSec) < 60) {
    return `${formatted} ${color.dim}(刚刚)${color.reset}`
  } else if (diffSec > 0 && diffSec < 86400 * 30) {
    const days = Math.floor(diffSec / 86400)
    const hours = Math.floor((diffSec % 86400) / 3600)
    const agoText = days > 0 ? `${days}天前` : `${hours}小时前`
    return `${formatted} ${color.dim}(${agoText})${color.reset}`
  } else if (diffSec < 0 && Math.abs(diffSec) < 86400 * 30) {
    const absDiff = Math.abs(diffSec)
    const hours = Math.floor(absDiff / 3600)
    return `${formatted} ${color.yellow}(${hours}h后到期)${color.reset}`
  }

  return formatted
}

/**
 * 单元格值格式化
 */
function formatCell(key, val, raw = false) {
  if (raw) return val === null ? 'NULL' : String(val)
  if (val === null || val === undefined) {
    return `${color.dim}NULL${color.reset}`
  }

  const k = key.toLowerCase()

  // 1. 时间戳列处理 (支持中英文列名及典型毫秒时间戳范围识别)
  const isTimeKey =
    k.endsWith('_at') ||
    k.endsWith('_seen') ||
    k.includes('time') ||
    k.includes('date') ||
    k.includes('时间') ||
    k.includes('日期') ||
    k.includes('访问')

  const numVal =
    typeof val === 'number' || typeof val === 'bigint'
      ? Number(val)
      : typeof val === 'string' && /^\d{10,13}$/.test(val)
        ? Number(val)
        : null

  if (numVal !== null) {
    // 典型毫秒范围 (2010年 ~ 2049年)
    const isLikelyTimestamp = numVal >= 1262304000000 && numVal <= 2500000000000
    // 典型秒范围 (2010年 ~ 2049年) 且列名具时间语义
    const isLikelySeconds = isTimeKey && numVal >= 1262304000 && numVal <= 2500000000

    if (isLikelyTimestamp || isLikelySeconds) {
      return formatTimestamp(numVal)
    }
  }

  // 2. 布尔列
  if (typeof val === 'boolean') {
    return val ? `${color.green}true${color.reset}` : `${color.red}false${color.reset}`
  }

  // 3. 数字列
  if (typeof val === 'number' || typeof val === 'bigint') {
    return `${color.cyan}${val.toLocaleString()}${color.reset}`
  }

  // 4. JSON 字符串列处理
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return `${color.magenta}[Array(${parsed.length})]${color.reset} ${truncateString(trimmed, 35)}`
        }
        const keys = Object.keys(parsed)
        const summary = keys.length > 4 ? `${keys.slice(0, 4).join(', ')}... (+${keys.length - 4})` : keys.join(', ')
        return `${color.blue}{${summary}}${color.reset}`
      } catch {
        // 非法 JSON 正常按字符串展示
      }
    }
    return truncateString(val, 50)
  }

  return truncateString(String(val), 50)
}

/**
 * 终端优雅表格渲染器
 */
function renderTable(rows, options = {}) {
  const { raw = false, title = '' } = options

  if (!rows || rows.length === 0) {
    console.log(`${color.dim}(空数据结果集 / 无匹配记录)${color.reset}`)
    return
  }

  if (title) {
    console.log(`\n${color.bold}${color.cyan}▶ ${title}${color.reset}`)
  }

  const columns = Object.keys(rows[0])
  const colWidths = {}
  const alignments = {}

  // 确定列宽与对齐方式
  for (const col of columns) {
    colWidths[col] = getDisplayWidth(col)
    // 探测类型
    const sample = rows.find((r) => r[col] !== null && r[col] !== undefined)?.[col]
    alignments[col] = typeof sample === 'number' || typeof sample === 'bigint' ? 'right' : 'left'
  }

  const formattedRows = rows.map((row) => {
    const fRow = {}
    for (const col of columns) {
      const cellVal = formatCell(col, row[col], raw)
      fRow[col] = cellVal
      const width = getDisplayWidth(cellVal)
      if (width > colWidths[col]) {
        colWidths[col] = width
      }
    }
    return fRow
  })

  // 限制每列最大宽度，防止超宽炸屏
  for (const col of columns) {
    colWidths[col] = Math.min(Math.max(colWidths[col], 4), 65)
  }

  // 构造边框线
  const topBorder = '┌' + columns.map((c) => '─'.repeat(colWidths[c] + 2)).join('┬') + '┐'
  const headerDivider = '├' + columns.map((c) => '─'.repeat(colWidths[c] + 2)).join('┼') + '┤'
  const bottomBorder = '└' + columns.map((c) => '─'.repeat(colWidths[c] + 2)).join('┴') + '┘'

  console.log(color.dim + topBorder + color.reset)

  // 打印表头
  const headerRow =
    '│ ' +
    columns
      .map((c) => color.bold + padDisplay(c, colWidths[c], 'left') + color.reset)
      .join(' │ ') +
    ' │'
  console.log(headerRow)
  console.log(color.dim + headerDivider + color.reset)

  // 打印数据行
  for (const row of formattedRows) {
    const line =
      '│ ' +
      columns
        .map((c) => padDisplay(row[c], colWidths[c], alignments[c]))
        .join(' │ ') +
      ' │'
    console.log(line)
  }

  console.log(color.dim + bottomBorder + color.reset)
}

// ==========================================
// 2. 数据库寻径与安全连接
// ==========================================
function resolveDatabasePath(cliDbPath) {
  const candidates = [
    cliDbPath,
    process.env.SQLITE_PATH,
    process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'animaku.db') : null,
    path.join(process.cwd(), 'data/animaku.db'),
    path.join(rootDir, 'data/animaku.db'),
  ].filter(Boolean)

  for (const p of candidates) {
    const resolved = path.resolve(p)
    if (fs.existsSync(resolved)) {
      return resolved
    }
  }

  return null
}

function getDatabaseConnection(dbPath, readOnly = true) {
  try {
    const db = new DatabaseSync(dbPath, {
      open: true,
      readOnly,
    })
    db.exec('PRAGMA busy_timeout = 5000;')
    return db
  } catch (err) {
    console.error(`${color.red}❌ 无法连接数据库 [${dbPath}]: ${err.message}${color.reset}`)
    process.exit(1)
  }
}

// ==========================================
// 3. 内置预设查询与分析功能
// ==========================================

/**
 * 概览：数据库大小、WAL模式、各表行数与索引统计
 */
function showOverview(db, dbPath) {
  const stat = fs.statSync(dbPath)
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2)
  const journalMode = db.prepare('PRAGMA journal_mode;').get()?.journal_mode || 'unknown'
  const pageSize = db.prepare('PRAGMA page_size;').get()?.page_size || 0
  const pageCount = db.prepare('PRAGMA page_count;').get()?.page_count || 0

  console.log(`\n${color.bold}${color.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${color.reset}`)
  console.log(`  ${color.bold}Animaku SQLite 数据库状态概览${color.reset}`)
  console.log(`${color.bold}${color.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${color.reset}`)
  console.log(` 📁 文件路径:   ${color.green}${dbPath}${color.reset}`)
  console.log(` 💾 文件大小:   ${color.yellow}${sizeMb} MB${color.reset} (${stat.size.toLocaleString()} bytes)`)
  console.log(` ⚙️  日志模式:   ${color.blue}${journalMode.toUpperCase()}${color.reset}`)
  console.log(` 📄 页面统计:   ${pageCount.toLocaleString()} 页 (Page Size: ${pageSize} bytes)`)

  // 检查迁移版本
  const hasMigrations = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_schema_migrations';")
    .get()
  if (hasMigrations) {
    const migrations = db.prepare('SELECT version, name, applied_at FROM _schema_migrations ORDER BY version ASC;').all()
    const maxVer = migrations[migrations.length - 1]?.version || 0
    console.log(` 🏷️  Schema版本: ${color.magenta}v${maxVer}${color.reset} (累计完成 ${migrations.length} 次迁移)`)
  }

  // 汇总所有数据表
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;")
    .all()

  const summary = []
  let totalRows = 0

  for (const t of tables) {
    const rowCount = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get()?.c || 0
    const colCount = db.prepare(`PRAGMA table_info("${t.name}")`).all().length
    const idxCount = db.prepare(`PRAGMA index_list("${t.name}")`).all().length
    totalRows += rowCount

    summary.push({
      表名: t.name,
      记录行数: rowCount,
      字段数: colCount,
      索引数: idxCount,
    })
  }

  renderTable(summary, { title: `所有数据表清单 (共 ${tables.length} 张表, 累计 ${totalRows.toLocaleString()} 条记录)` })
}

/**
 * 播放量排行
 */
function showTopAnime(db, limit = 15) {
  const hasCountsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'anime_play_counts';")
    .get()

  const hasStatsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'anime_play_stats';")
    .get()

  const hasMapping = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bangumi_data_mapping';")
    .get()

  let rows = []

  if (hasCountsTable) {
    const joinSql = hasMapping
      ? `
        SELECT
          c.bangumi_id AS ID,
          COALESCE(m.title, '${color.dim}[未映射]${color.reset}') AS 番剧标题,
          c.play_count AS 播放次数,
          c.updated_at AS 最近播放时间
        FROM anime_play_counts c
        LEFT JOIN bangumi_data_mapping m ON m.bangumi_id = c.bangumi_id
        ORDER BY c.play_count DESC
        LIMIT ?;
      `
      : `
        SELECT
          bangumi_id AS ID,
          play_count AS 播放次数,
          updated_at AS 最近播放时间
        FROM anime_play_counts
        ORDER BY play_count DESC
        LIMIT ?;
      `
    rows = db.prepare(joinSql).all(limit)
  } else if (hasStatsTable) {
    console.log(`${color.yellow}[提示] 当前使用旧版表 anime_play_stats (可运行 pnpm db:migrate 升级为 anime_play_counts)${color.reset}`)
    const joinSql = hasMapping
      ? `
        SELECT
          s.bangumi_id AS ID,
          COALESCE(m.title, '${color.dim}[未映射]${color.reset}') AS 番剧标题,
          MAX(s.play_count) AS 播放次数,
          MAX(s.updated_at) AS 最近播放时间
        FROM anime_play_stats s
        LEFT JOIN bangumi_data_mapping m ON m.bangumi_id = s.bangumi_id
        GROUP BY s.bangumi_id
        ORDER BY 播放次数 DESC
        LIMIT ?;
      `
      : `
        SELECT
          bangumi_id AS ID,
          MAX(play_count) AS 播放次数,
          MAX(updated_at) AS 最近播放时间
        FROM anime_play_stats
        GROUP BY bangumi_id
        ORDER BY 播放次数 DESC
        LIMIT ?;
      `
    rows = db.prepare(joinSql).all(limit)
  } else {
    console.log(`${color.yellow}未找到播放量统计数据表。${color.reset}`)
    return
  }

  renderTable(rows, { title: `番剧播放量排行 Top ${limit}` })
}

/**
 * IP 访问日志与 PV 统计
 */
function showIpLogs(db, limit = 15) {
  const hasIpTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ip_access_logs';")
    .get()

  if (!hasIpTable) {
    console.log(`${color.yellow}未检测到表 ip_access_logs${color.reset}`)
    return
  }

  const rows = db.prepare(`
    SELECT
      ip AS IP地址,
      total_hits AS 累计PV,
      today_hits AS 今日PV,
      last_date AS 统计日期,
      first_seen AS 首次访问,
      last_seen AS 最近活跃时间
    FROM ip_access_logs
    ORDER BY total_hits DESC
    LIMIT ?;
  `).all(limit)

  const totalHits = db.prepare('SELECT SUM(total_hits) AS s FROM ip_access_logs;').get()?.s || 0
  const ipCount = db.prepare('SELECT COUNT(*) AS c FROM ip_access_logs;').get()?.c || 0

  renderTable(rows, {
    title: `全局 IP 访问统计 Top ${limit} (独立访客: ${ipCount.toLocaleString()} 个, 累计总 PV: ${totalHits.toLocaleString()})`,
  })
}

/**
 * 检索 Bangumi 跨平台映射
 */
function searchBangumiMapping(db, keyword, limit = 15) {
  const hasTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bangumi_data_mapping';")
    .get()

  if (!hasTable) {
    console.log(`${color.yellow}未检测到表 bangumi_data_mapping${color.reset}`)
    return
  }

  let rows = []
  const isNumber = /^\d+$/.test(keyword.trim())

  if (isNumber) {
    rows = db.prepare(`
      SELECT bangumi_id, title, sites, updated_at
      FROM bangumi_data_mapping
      WHERE bangumi_id = ?
      LIMIT ?;
    `).all(Number(keyword.trim()), limit)
  } else {
    rows = db.prepare(`
      SELECT bangumi_id, title, sites, updated_at
      FROM bangumi_data_mapping
      WHERE title LIKE ?
      ORDER BY bangumi_id ASC
      LIMIT ?;
    `).all(`%${keyword.trim()}%`, limit)
  }

  if (rows.length === 0) {
    console.log(`${color.yellow}未找到与 "${keyword}" 相关的 Bangumi 映射记录。${color.reset}`)
    return
  }

  const formatted = rows.map((r) => {
    let siteCount = 0
    let siteNames = ''
    try {
      const parsed = JSON.parse(r.sites)
      const keys = Object.keys(parsed)
      siteCount = keys.length
      siteNames = keys.join(', ')
    } catch {
      siteNames = r.sites
    }

    return {
      BGM_ID: r.bangumi_id,
      番剧标题: r.title,
      平台绑定数: siteCount,
      支持站点: truncateString(siteNames, 40),
      更新时间: r.updated_at,
    }
  })

  renderTable(formatted, { title: `Bangumi 映射查询结果: "${keyword}" (共命中 ${rows.length} 部)` })
}

/**
 * 缓存状态与命中分析 (kv_cache, plugin_search_cache, plugin_chapters_cache)
 */
function showCacheStatus(db) {
  const cacheTables = ['kv_cache', 'plugin_search_cache', 'plugin_chapters_cache']
  const now = Date.now()

  console.log(`\n${color.bold}${color.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${color.reset}`)
  console.log(`  ${color.bold}Animaku 服务端缓存表统计${color.reset}`)
  console.log(`${color.bold}${color.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${color.reset}`)

  for (const t of cacheTables) {
    const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?;").get(t)
    if (!exists) {
      console.log(`${color.dim}- 表 ${t}: 不存在${color.reset}`)
      continue
    }

    const total = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get()?.c || 0
    let validCount = total
    let expiredCount = 0

    if (t === 'kv_cache') {
      expiredCount = db.prepare(`SELECT COUNT(*) AS c FROM "${t}" WHERE expires_at IS NOT NULL AND expires_at < ?`).get(now)?.c || 0
      validCount = total - expiredCount
      console.log(`\n📦 ${color.bold}${t}${color.reset} (总项数: ${total}, 有效: ${color.green}${validCount}${color.reset}, 过期: ${color.yellow}${expiredCount}${color.reset})`)
      const samples = db.prepare(`SELECT namespace, key, value, created_at, expires_at FROM "${t}" LIMIT 5`).all()
      renderTable(samples)
    } else {
      expiredCount = db.prepare(`SELECT COUNT(*) AS c FROM "${t}" WHERE expires_at < ?`).get(now)?.c || 0
      validCount = total - expiredCount
      const totalHits = db.prepare(`SELECT SUM(hit_count) AS s FROM "${t}"`).get()?.s || 0
      console.log(`\n⚡ ${color.bold}${t}${color.reset} (总项数: ${total}, 命中总数: ${color.cyan}${totalHits.toLocaleString()}${color.reset}, 有效: ${color.green}${validCount}${color.reset}, 过期: ${color.yellow}${expiredCount}${color.reset})`)
      const samples = db.prepare(`SELECT plugin_name, hit_count, created_at, expires_at, updated_at FROM "${t}" ORDER BY hit_count DESC LIMIT 5`).all()
      renderTable(samples)
    }
  }
}

/**
 * 查看数据表结构 (PRAGMA table_info & index_list)
 */
function showSchema(db, specificTable = null) {
  const tables = specificTable
    ? [{ name: specificTable }]
    : db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;").all()

  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all()
    if (!cols || cols.length === 0) {
      console.log(`${color.red}数据表 "${t.name}" 不存在。${color.reset}`)
      continue
    }

    const ddl = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?;").get(t.name)?.sql

    const formattedCols = cols.map((c) => ({
      CID: c.cid,
      列名: c.name,
      类型: c.type || 'ANY',
      非空: c.notnull ? `${color.red}NOT NULL${color.reset}` : 'NULL',
      默认值: c.dflt_value ?? `${color.dim}-${color.reset}`,
      主键: c.pk ? `${color.yellow}PK (${c.pk})${color.reset}` : '',
    }))

    renderTable(formattedCols, { title: `表结构: ${t.name}` })

    // 索引信息
    const indexes = db.prepare(`PRAGMA index_list("${t.name}")`).all()
    if (indexes && indexes.length > 0) {
      const idxRows = indexes.map((idx) => {
        const info = db.prepare(`PRAGMA index_info("${idx.name}")`).all()
        const colNames = info.map((i) => i.name).join(', ')
        return {
          索引名: idx.name,
          唯一性: idx.unique ? `${color.green}UNIQUE${color.reset}` : 'NORMAL',
          覆盖列: colNames,
        }
      })
      renderTable(idxRows, { title: `表索引: ${t.name}` })
    }

    if (ddl) {
      console.log(`${color.dim}DDL: ${ddl.replace(/\s+/g, ' ')}${color.reset}\n`)
    }
  }
}

/**
 * 浏览指定表内容
 */
function browseTable(db, tableName, limit = 20, offset = 0, orderCol = null, desc = true) {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?;").get(tableName)
  if (!exists) {
    console.log(`${color.red}表 "${tableName}" 不存在！${color.reset}`)
    return
  }

  const count = db.prepare(`SELECT COUNT(*) as c FROM "${tableName}"`).get()?.c || 0

  let sql = `SELECT * FROM "${tableName}"`
  if (orderCol) {
    sql += ` ORDER BY "${orderCol}" ${desc ? 'DESC' : 'ASC'}`
  }
  sql += ` LIMIT ${Number(limit)} OFFSET ${Number(offset)};`

  const start = performance.now()
  const rows = db.prepare(sql).all()
  const elapsed = (performance.now() - start).toFixed(2)

  renderTable(rows, {
    title: `表 "${tableName}" 数据 (第 ${offset + 1} - ${offset + rows.length} 条，全表共 ${count.toLocaleString()} 条，耗时 ${elapsed}ms)`,
  })
}

/**
 * 执行通用 SQL
 */
function executeSql(db, sql, isJson = false, isRaw = false) {
  const trimmed = sql.trim()
  if (!trimmed) return

  const isQuery = /^(SELECT|PRAGMA|EXPLAIN)\b/i.test(trimmed)
  const start = performance.now()

  try {
    if (isQuery) {
      const rows = db.prepare(trimmed).all()
      const elapsed = (performance.now() - start).toFixed(2)

      if (isJson) {
        console.log(JSON.stringify(rows, null, 2))
      } else {
        renderTable(rows, { raw: isRaw })
        console.log(`${color.dim}执行完成: 共返回 ${rows.length.toLocaleString()} 行记录 (耗时 ${elapsed}ms)${color.reset}\n`)
      }
    } else {
      const info = db.prepare(trimmed).run()
      const elapsed = (performance.now() - start).toFixed(2)
      console.log(`${color.green}✓ 执行成功 (耗时 ${elapsed}ms): 影响行数 changes=${info.changes}, lastInsertRowid=${info.lastInsertRowid}${color.reset}\n`)
    }
  } catch (err) {
    console.error(`${color.red}❌ SQL 执行失败: ${err.message}${color.reset}\n`)
  }
}

// ==========================================
// 4. 交互式菜单与 REPL
// ==========================================
async function startInteractiveMenu(db, dbPath) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  while (true) {
    console.log(`\n${color.bold}${color.cyan}╔════════════════════════════════════════════════════════════╗${color.reset}`)
    console.log(`${color.bold}${color.cyan}║              Animaku 数据库快速查询交互终端                ║${color.reset}`)
    console.log(`${color.bold}${color.cyan}╚════════════════════════════════════════════════════════════╝${color.reset}`)
    console.log(` 当前数据库: ${color.green}${dbPath}${color.reset} (只读模式)\n`)
    console.log(`  ${color.bold}[1]${color.reset} 📊 数据库概览与各表统计 (Overview)`)
    console.log(`  ${color.bold}[2]${color.reset} 🔥 番剧播放量排行 (anime_play_counts)`)
    console.log(`  ${color.bold}[3]${color.reset} 🌐 全局 IP 访问与 PV 统计 (ip_access_logs)`)
    console.log(`  ${color.bold}[4]${color.reset} 🗺️ Bangumi 跨平台映射检索 (bangumi_data_mapping)`)
    console.log(`  ${color.bold}[5]${color.reset} ⚡ 视频源与 KV 缓存状态 (Cache inspection)`)
    console.log(`  ${color.bold}[6]${color.reset} 📋 查看数据表结构与索引 (Schema)`)
    console.log(`  ${color.bold}[7]${color.reset} 📑 浏览指定表数据 (Browse Table)`)
    console.log(`  ${color.bold}[8]${color.reset} 💻 自定义 SQL 查询 (Interactive SQL REPL)`)
    console.log(`  ${color.bold}[0]${color.reset} 🚪 退出终端 (Exit)`)

    const choice = (await rl.question(`\n${color.yellow}请输入选项编号 [0-8]: ${color.reset}`)).trim()

    if (choice === '0' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
      console.log(`\n${color.cyan}感谢使用，再见！${color.reset}`)
      break
    }

    switch (choice) {
      case '1':
        showOverview(db, dbPath)
        break
      case '2': {
        const numStr = await rl.question(`${color.dim}展示前多少条？(默认 15): ${color.reset}`)
        const limit = parseInt(numStr, 10) || 15
        showTopAnime(db, limit)
        break
      }
      case '3': {
        const numStr = await rl.question(`${color.dim}展示前多少条？(默认 15): ${color.reset}`)
        const limit = parseInt(numStr, 10) || 15
        showIpLogs(db, limit)
        break
      }
      case '4': {
        const kw = (await rl.question(`${color.yellow}请输入番剧名称关键词或 Bangumi ID: ${color.reset}`)).trim()
        if (kw) {
          searchBangumiMapping(db, kw)
        }
        break
      }
      case '5':
        showCacheStatus(db)
        break
      case '6': {
        const tableName = (await rl.question(`${color.dim}输入表名 (直接回车查看全部表结构): ${color.reset}`)).trim()
        showSchema(db, tableName || null)
        break
      }
      case '7': {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';").all()
        console.log(`可用数据表: ${color.cyan}${tables.map((t) => t.name).join(', ')}${color.reset}`)
        const tbl = (await rl.question(`${color.yellow}请输入要浏览的表名: ${color.reset}`)).trim()
        if (tbl) {
          const lStr = await rl.question(`${color.dim}读取条数 (默认 20): ${color.reset}`)
          browseTable(db, tbl, parseInt(lStr, 10) || 20)
        }
        break
      }
      case '8': {
        console.log(`\n${color.cyan}进入交互式 SQL REPL 模式 (输入 SQL 直接运行，输入 exit 或回车空行返回主菜单)${color.reset}`)
        while (true) {
          const sql = (await rl.question(`${color.green}SQL > ${color.reset}`)).trim()
          if (!sql || sql.toLowerCase() === 'exit' || sql.toLowerCase() === 'q') {
            break
          }
          executeSql(db, sql)
        }
        break
      }
      default:
        console.log(`${color.red}无效选项，请输入 0-8 之间的数字。${color.reset}`)
        break
    }

    if (choice !== '0') {
      await rl.question(`\n${color.dim}按回车键继续...${color.reset}`)
    }
  }

  rl.close()
}

// ==========================================
// 5. 帮助说明手册
// ==========================================
function printHelp() {
  console.log(`
${color.bold}${color.cyan}Animaku SQLite 数据库查询工具使用指南${color.reset}

${color.bold}用法:${color.reset}
  node scripts/db-query.mjs [选项/SQL]

${color.bold}常用快捷命令:${color.reset}
  pnpm db                                # 启动全功能交互式菜单与 REPL
  pnpm db "SELECT * FROM ... LIMIT 10"  # 快速执行任意 SQL 语句并表格展示
  pnpm db -s, --stats, overview          # 查看数据库与所有表的统计概览
  pnpm db -t, --table <表名> [-l 20]      # 查看指定数据表内容
  pnpm db -p, --top [条数]               # 查看番剧累计播放量 Top 排行
  pnpm db --ip [条数]                    # 查看全局 IP 访问与 PV 日志统计
  pnpm db -m, --mapping <关键词/ID>       # 检索 Bangumi 跨平台站点映射
  pnpm db --cache                        # 查看视频源与 KV 缓存状态
  pnpm db --schema [表名]                # 查看数据表结构定义与索引

${color.bold}通用参数选项:${color.reset}
  --db <路径>                            # 指定 SQLite 数据库文件路径
  --limit, -l <数量>                     # 限制输出记录行数 (默认 15 或 20)
  --json                                 # 强制输出格式化 JSON (适合管道对接 jq)
  --raw                                  # 输出原始值，禁用时间戳自动格式化
  --write                                # 开启读写模式 (允许执行 INSERT/UPDATE/DDL)
  -h, --help                             # 显示本帮助手册

${color.bold}示例:${color.reset}
  pnpm db "SELECT ip, total_hits FROM ip_access_logs ORDER BY total_hits DESC LIMIT 5"
  pnpm db --mapping "葬送的芙莉莲"
  pnpm db -t anime_play_counts -l 10
  pnpm db --schema anime_play_counts
  pnpm db --json "SELECT * FROM kv_cache"
`)
}

// ==========================================
// 6. 命令行解析与主程序入口
// ==========================================
async function main() {
  const args = process.argv.slice(2)

  // 1. 帮助说明
  if (args.includes('-h') || args.includes('--help')) {
    printHelp()
    process.exit(0)
  }

  // 2. 解析公共选项
  let customDbPath = null
  let isReadOnly = true
  let isJson = false
  let isRaw = false
  let limit = 15

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) {
      customDbPath = args[i + 1]
      args.splice(i, 2)
      i--
    } else if (args[i] === '--write') {
      isReadOnly = false
      args.splice(i, 1)
      i--
    } else if (args[i] === '--json') {
      isJson = true
      args.splice(i, 1)
      i--
    } else if (args[i] === '--raw') {
      isRaw = true
      args.splice(i, 1)
      i--
    } else if ((args[i] === '-l' || args[i] === '--limit') && args[i + 1]) {
      limit = parseInt(args[i + 1], 10) || 15
      args.splice(i, 2)
      i--
    }
  }

  // 3. 寻址并连接数据库
  const dbPath = resolveDatabasePath(customDbPath)
  if (!dbPath) {
    console.error(`
${color.red}❌ 未找到 Animaku SQLite 数据库文件！${color.reset}

已探测的位置:
  - 命令行指定: ${customDbPath || '(未指定)'}
  - SQLITE_PATH: ${process.env.SQLITE_PATH || '(未设置)'}
  - DATA_DIR:    ${process.env.DATA_DIR || '(未设置)'}
  - 当前目录:     ${path.join(process.cwd(), 'data/animaku.db')}
  - 根目录:       ${path.join(rootDir, 'data/animaku.db')}

${color.yellow}解决方案:${color.reset}
  1. 可通过 --db 参数指定数据库路径: node scripts/db-query.mjs --db /path/to/animaku.db
  2. 启动过服务端服务后会自动在 data/ 目录下生成 animaku.db 数据库文件。
`)
    process.exit(1)
  }

  const db = getDatabaseConnection(dbPath, isReadOnly)

  // 4. 无参数时进入交互菜单
  if (args.length === 0) {
    await startInteractiveMenu(db, dbPath)
    db.close()
    process.exit(0)
  }

  // 5. 命令行单次分流处理
  const firstArg = args[0]

  if (firstArg === '-s' || firstArg === '--stats' || firstArg === 'overview') {
    showOverview(db, dbPath)
  } else if (firstArg === '-p' || firstArg === '--top') {
    const customLimit = parseInt(args[1], 10) || limit
    showTopAnime(db, customLimit)
  } else if (firstArg === '--ip') {
    const customLimit = parseInt(args[1], 10) || limit
    showIpLogs(db, customLimit)
  } else if (firstArg === '-m' || firstArg === '--mapping') {
    const kw = args[1]
    if (!kw) {
      console.error(`${color.red}错误: 请提供搜索关键词或 ID，例如: pnpm db --mapping "芙莉莲"${color.reset}`)
      process.exit(1)
    }
    searchBangumiMapping(db, kw, limit)
  } else if (firstArg === '--cache') {
    showCacheStatus(db)
  } else if (firstArg === '--schema') {
    showSchema(db, args[1] || null)
  } else if (firstArg === '-t' || firstArg === '--table') {
    const tableName = args[1]
    if (!tableName) {
      console.error(`${color.red}错误: 请指定表名，例如: pnpm db -t anime_play_counts${color.reset}`)
      process.exit(1)
    }
    browseTable(db, tableName, limit)
  } else {
    // 作为直接 SQL 语句执行
    const sql = args.join(' ')
    executeSql(db, sql, isJson, isRaw)
  }

  db.close()
}

main().catch((err) => {
  console.error(`${color.red}未捕获异常:${color.reset}`, err)
  process.exit(1)
})
