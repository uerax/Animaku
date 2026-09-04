# Animaku SQLite 数据库与数据运维指南 (Database Maintenance)

> 本文档汇总了 Animaku 服务端内置 SQLite 数据库的**表结构字典、免安装查询方案、Docker Compose 容器内查询命令与运维排错**。

---

## 1. 数据库基础与架构设计

Animaku 服务端采用 Node.js (>=22) 内置原生模块 `node:sqlite`（`DatabaseSync`），开箱即用，无需额外安装系统级 SQLite 动态链接库或 CLI 工具。

- **默认存储路径**：
  - 宿主机：`data/animaku.db`（可通过环境变量 `SQLITE_PATH` 或 `DATA_DIR` 配置）
  - Docker 容器内：`/app/data/animaku.db`（映射宿主机 `./data`）
- **性能机制**：
  - 默认开启 **WAL (Write-Ahead Logging)** 模式，实现并发读写互不阻塞
  - 采用 **Memory Temp Store** 与 8MB 页面缓存（`PRAGMA cache_size = -8000`）
  - 采用 **Statement 缓存池** 与原子事务保证并发性能与数据一致性

---

## 2. 数据表结构字典 (Schema)

| 表名 | 用途说明 | 核心字段说明 |
| :--- | :--- | :--- |
| **`anime_play_counts`** | 番剧观看次数统计 (解耦单行设计) | `bangumi_id` (条目ID), `play_count` (累计观看次数), `updated_at` (更新时间戳) |
| **`anime_play_stats`** | (旧版归档) 番剧及单集播放量统计 | `bangumi_id`, `episode`, `play_count`, `updated_at` |
| **`ip_access_logs`** | 全局 IP 访问与 PV 统计 | `ip` (访问者IP), `total_hits` (累计PV), `today_hits` (今日PV), `last_date` (日期), `first_seen` (首次访问), `last_seen` (末次访问) |
| **`plugin_search_cache`** | 视频源番剧搜索结果缓存 | `key` (缓存主键), `plugin_name` (规则名), `keyword` (搜索词), `hit_count` (命中数), `data` (JSON数据), `expires_at` (过期时间) |
| **`plugin_chapters_cache`** | 视频源剧集列表缓存 | `key` (缓存主键), `plugin_name` (规则名), `source_url` (详情页URL), `hit_count` (命中数), `data` (JSON数据), `expires_at` (过期时间) |
| **`kv_cache`** | 通用键值缓存 (弹幕/元数据等) | `namespace` (命名空间), `key` (键), `value` (值), `expires_at` (过期时间) |
| **`_schema_migrations`** | 数据库迁移版本控制 | `version` (版本号), `name` (迁移名), `applied_at` (执行时间) |

---

## 3. Docker Compose 容器内直接查询命令

如果使用 Docker Compose 部署，可以在服务器终端直接使用 `docker compose exec` 配合 Node.js 进行免安装查询。

> ⚠️ **避坑提示**：在 Linux Bash 下执行单行命令时，建议**外层使用单引号 `'...'` 包裹 JS 脚本**，并在 JS 内部使用 `new Date().toLocaleString('zh-CN')` 格式化时间，避免 SQL 函数中双引号与单引号冲突（如 `Error: no such column: "unixepoch"`）。

### 3.1 查看 IP 访问与访问量统计 (`ip_access_logs`)

**带格式化本地时间：**
```bash
docker compose exec animaku node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/app/data/animaku.db"); const rows = db.prepare("SELECT * FROM ip_access_logs ORDER BY total_hits DESC LIMIT 10").all(); console.table(rows.map(r => ({ ...r, last_seen: new Date(r.last_seen).toLocaleString("zh-CN") })))'
```

**原始数据快速输出：**
```bash
docker compose exec animaku node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/app/data/animaku.db"); console.table(db.prepare("SELECT * FROM ip_access_logs ORDER BY total_hits DESC LIMIT 10").all())'
```

---

### 3.2 查看播放量排行 (`anime_play_counts`)

**带格式化本地时间：**
```bash
docker compose exec animaku node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/app/data/animaku.db"); const rows = db.prepare("SELECT * FROM anime_play_counts ORDER BY play_count DESC LIMIT 10").all(); console.table(rows.map(r => ({ ...r, updated_at: new Date(r.updated_at).toLocaleString("zh-CN") })))'
```

**原始数据快速输出：**
```bash
docker compose exec animaku node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/app/data/animaku.db"); console.table(db.prepare("SELECT * FROM anime_play_counts ORDER BY play_count DESC LIMIT 10").all())'
```

**历史数据迁移工具 (`anime_play_stats` -> `anime_play_counts`)：**
```bash
# Docker 容器内执行：
docker compose exec animaku node scripts/migrate-play-stats.mjs

# 宿主机直接执行：
node scripts/migrate-play-stats.mjs
```

---

### 3.3 查看所有数据表与元数据
```bash
docker compose exec animaku node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/app/data/animaku.db"); console.table(db.prepare("SELECT name FROM sqlite_master WHERE type=\x27table\x27").all())'
```

---

### 3.4 通用 SQL 查询模板
只需将模板中的 `SELECT ...` 替换为自定义 SQL：
```bash
docker compose exec animaku node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/app/data/animaku.db"); console.table(db.prepare("SELECT * FROM <表名> LIMIT 10").all())'
```

---

## 4. 开发者快速查询工具 (`scripts/db-query.mjs` / `pnpm db`)

项目内置了零依赖、原生 `node:sqlite` 驱动的极速数据库查询与分析脚本，默认开启只读保护，支持命令行参数与交互式 REPL 菜单。

### 4.1 常用快捷命令
```bash
# 启动交互式控制台与 SQL REPL
pnpm db

# 数据库与所有表统计概览 (文件大小、WAL模式、各表行数、迁移版本)
pnpm db --stats
# 或
pnpm db -s

# 执行任意自定义 SQL (自适应中文宽度的美化表格输出)
pnpm db "SELECT * FROM anime_play_counts LIMIT 10"

# 以标准 JSON 输出 (方便配合 jq 管道处理)
pnpm db --json "SELECT * FROM kv_cache"

# 快速浏览指定表数据 (支持 -l 条数限制)
pnpm db -t anime_play_counts -l 20

# 查看番剧累计播放量 Top 榜单 (自动关联番剧中文名称)
pnpm db --top 10

# 查看全局独立访客 IP 与 PV 日志排行
pnpm db --ip 10

# 检索 Bangumi 跨平台 ID 映射 (支持输入番剧名关键词或 Bangumi ID)
pnpm db --mapping "葬送的芙莉莲"

# 查看缓存表 (kv_cache, plugin_search_cache, plugin_chapters_cache) 命中率与状态
pnpm db --cache

# 查看数据表结构定义与索引
pnpm db --schema anime_play_counts
```

### 4.2 Docker 容器内运行方式
```bash
docker compose exec animaku node scripts/db-query.mjs --stats
docker compose exec animaku node scripts/db-query.mjs --top 10
docker compose exec animaku node scripts/db-query.mjs "SELECT * FROM ip_access_logs"
```

---

## 5. 传统免安装单行命令与工具替代方案

### 方式 1：宿主机 Node.js 单行脚本
在项目根目录运行：
```bash
node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("data/animaku.db"); console.table(db.prepare("SELECT * FROM anime_play_stats ORDER BY play_count DESC LIMIT 10").all())'
```

### 方式 2：使用 SQLite3 命令行 CLI（若宿主机已装）
```bash
# 查看所有表
sqlite3 data/animaku.db ".tables"

# 格式化输出查询结果
sqlite3 -header -column data/animaku.db "SELECT * FROM anime_play_stats ORDER BY play_count DESC LIMIT 10;"
```

### 方式 3：VS Code 扩展可视化查看
1. 在 VS Code 安装 **`SQLite Viewer`** 扩展插件。
2. 在左侧资源管理器中直接点击 `data/animaku.db`，即可在图形界面中查看和筛选所有数据表。
