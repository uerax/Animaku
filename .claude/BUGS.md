# Bug / 待办清单

## 📌 待处理清单 (Active TODOs)

### 1. [待处理] [P1] 推荐番剧过滤未放送条目并去除「连载中」状态
- **目标**：推荐列表中排除未来尚未开播/未定档的番剧，同时彻底移除「连载中」伪造状态，只展示真实上映年份与总集数（如 `2023 · 全12话` 或 `2024`）。
- **涉及文件**：`apps/server/src/routes/bangumi.ts`, `apps/web/src/pages/watch/WatchRecommendations.tsx`

---

### 2. [待处理] [P2] 服务端番剧与分集播放量统计 (Play Count Metrics)
- **目标**：统计全剧与各分集真实播放量，沉淀站内热度数据（用于后续热门榜/推荐加权）。
- **数据库设计 (`apps/server/src/db/schema.ts`)**：
  ```sql
  -- Migration v3: 播放量统计表
  CREATE TABLE IF NOT EXISTS anime_play_stats (
    bangumi_id INTEGER NOT NULL,
    episode INTEGER NOT NULL,            -- 0 为全剧汇总，>=1 为分集
    play_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (bangumi_id, episode)
  );
  CREATE INDEX IF NOT EXISTS idx_play_stats_bgm ON anime_play_stats(bangumi_id);
  ```
- **服务端接口 (`apps/server/src/routes/stats.ts`)**：
  - `POST /api/stats/view`：接收 `{ bangumiId: number, episode: number }`，递增分集与全剧 (ep 0) 计数，返回 `{ success: true, playCount: number }`。
  - `GET /api/stats/subject/:id`（可选）：查询指定番剧播放量。
- **防刷机制**：
  - 前端触发：`VideoPlayer.tsx` 连续播放满 15 秒上报一次（避免秒退误计）。
  - 服务端去重：内存 Map 缓存 `ip::bangumiId::episode`，10 分钟内重复请求返回 200 但不重复递增 DB。
- **涉及文件**：
  - `apps/server/src/db/schema.ts`
  - `apps/server/src/routes/stats.ts`
  - `apps/server/src/index.ts`
  - `apps/web/src/player/VideoPlayer.tsx`
  - `packages/shared/src/` (共享类型定义)

---

### 3. [待处理] [P2] 服务端 IP 访问统计与全站 API 频控防刷 (IP Access & Anti-Abuse)
- **目标**：记录独立 IP 的 PV/访问频次/活跃时间，并通过滑动窗口拦截高频恶意刷量与爬虫轰炸。
- **数据库设计 (`apps/server/src/db/schema.ts`)**：
  ```sql
  -- Migration v3: IP 访问记录表
  CREATE TABLE IF NOT EXISTS ip_access_logs (
    ip TEXT PRIMARY KEY,
    total_hits INTEGER NOT NULL DEFAULT 1,  -- 累计访问总请求数 (PV)
    today_hits INTEGER NOT NULL DEFAULT 1,  -- 今日访问次数
    last_date TEXT NOT NULL,                -- YYYY-MM-DD，用于跨天重置 today_hits
    first_seen INTEGER NOT NULL,           -- 首次访问时间戳
    last_seen INTEGER NOT NULL             -- 最后活跃时间戳
  );
  CREATE INDEX IF NOT EXISTS idx_ip_last_seen ON ip_access_logs(last_seen);
  ```
- **IP 统计机制**：
  - 优先提取 `CF-Connecting-IP` -> `X-Forwarded-For` -> `req.socket.remoteAddress`；
  - 内存计数 + 5 秒定时/防抖批量写入 SQLite，0 阻塞正常请求。
- **全局 Rate Limit 频控中间件**：
  - 内存滑动窗口计数器；
  - 常规 API（`/api/*`）：单 IP 最大 30 req/s，超限返回 `429 Too Many Requests`；
  - 密集接口（`/api/plugin/*`, `/api/media/*`）：单 IP 最大 10 req/s。
- **涉及文件**：
  - `apps/server/src/db/schema.ts`
  - `apps/server/src/lib/ip-rate-limit.ts`
  - `apps/server/src/index.ts`
