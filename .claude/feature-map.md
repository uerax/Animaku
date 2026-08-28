# 功能实现索引 (feature-map.md)

> 此文件仅供 Claude 快速导航核心模块与文件路径，减少大范围代码搜索。
> 保持精简、路径为主；任务进度与决策记录请查阅 `.claude/STATE.md`。

---

## 1. 播放器与画面渲染 (Player Core & Video Engine)
- 播放器主入口与状态机：`apps/web/src/player/VideoPlayer.tsx`（HLS/MP4、OP/ED跳过、错误自愈与容灾）
- 播放器类型定义：`apps/web/src/player/types.ts`
- 播放器样式覆盖：`apps/web/src/player/plyr-overrides.css`
- Anime4K 画质超分 (WebGL)：`apps/web/src/player/anime4k.ts`
- 全屏控制与屏幕常亮唤醒锁：`apps/web/src/player/media/fullscreen.ts`
- 媒体与时间格式化：`apps/web/src/player/media/format.ts`
- 备用/Iframe 播放器：`apps/web/src/player/EmbedPlayer.tsx`

## 2. 播放器控制栏与交互层 (Player Controls & UI Chrome)
- 桌面端控制栏：`apps/web/src/player/chrome/DesktopControls.tsx`
- 移动端控制栏：`apps/web/src/player/chrome/MobileControls.tsx`
- 播放器右键菜单：`apps/web/src/player/chrome/PlayerContextMenu.tsx`
- 播放统计面板 (Stats for Nerds)：`apps/web/src/player/chrome/PlayerStatsOverlay.tsx`
- 控制栏显示/隐藏状态机：`apps/web/src/player/chrome/useChromeVisibility.ts`
- 指针模式与手势控制：`apps/web/src/player/chrome/usePointerMode.ts`, `apps/web/src/player/chrome/useShellPointerHandlers.ts`
- 图标与控制栏类型：`apps/web/src/player/chrome/icons.tsx`, `apps/web/src/player/chrome/types.ts`

## 3. 高精弹幕渲染与弹幕流引擎 (Danmaku Engine & Streams)
- Canvas 2D 物理时钟弹幕渲染引擎：`apps/web/src/player/media/canvas-danmaku.ts`（rVFC 帧同步、分级漂移滤波、Retina 离屏位图缓存）
- 弹幕控制与设置面板：`apps/web/src/player/DanmakuPanel.tsx`
- 客户端弹幕会话调度：`apps/web/src/lib/use-danmaku-session.ts`（弹弹+B站双源并发拉取、根据数量比智能开闭、切集复用、客户端内存缓存）
- 弹幕过滤与池化转换：`apps/web/src/lib/danmaku-pools.ts`, `apps/web/src/player/media/danmaku-utils.ts`（多源独立控制、B站自动源与bilibili手动源样式区分）
- 弹幕类型与集数正则匹配：`packages/shared/src/danmaku.ts`（弹幕类型定义、O(1)极速发送者哈希+文本增量去重算法、ep/ss/md/bgm/bv/av/b23 智能解析器与分P匹配）
- 跨平台映射服务 (bangumi-data)：`apps/server/src/lib/bangumi-data.ts`, `apps/server/src/db/repositories/bangumi-data.ts`（BGM ID到全网多平台ID映射、SQLite持久化、7天周期异步增量同步与港澳台回退队列）
- 弹弹 API 代理与服务端缓存：`apps/server/src/routes/danmaku.ts`, `apps/server/src/lib/dandan.ts`
- B 站弹幕反代与 Proto 解析：`apps/server/src/routes/bilibili-danmaku.ts`（B 站 PGC/UGC/短链/BGM映射弹幕反代、media_id逆向解析、ep/ss/md/bgm/bv/av 多模态解析与 30m TTL 缓存）

## 4. OP/ED 跳过与标记助手 (OP/ED Markers & Community Contribution)
- OP/ED 标记助手抽屉：`apps/web/src/player/chrome/OpedMarkerDrawer.tsx`
- 本地打标存储与 GitHub PR 合并：`apps/web/src/lib/custom-oped-store.ts`
- bangumi-oped 客户端加载与区间解析：`apps/web/src/lib/bangumi-oped.ts`

## 5. 视频源体系、规则引擎与适配器 (Video Sources & Custom Adapters)
- 视频源规则引擎调度：`apps/server/src/rule-engine/index.ts`, `apps/server/src/rule-engine/api.ts`
- 专有适配器：
  - xifan-next (稀饭动漫 1080P MP4 竞速/解析)：`apps/server/src/lib/xifan-next.ts`
  - cycani (次元城 1080P MP4 直链与选集)：`apps/server/src/lib/cycani.ts`
  - tvtfun (TvTFun 1080P MP4 直链与鉴权自愈)：`apps/server/src/lib/tvtfun.ts`
  - moonci (月之祠 1080P MP4 直链与分流)：`apps/server/src/lib/moonci.ts`
  - anime1 / omofun：`apps/server/src/lib/anime1.ts`, `apps/server/src/lib/omofun.ts`
  - anibaka-adapter (AniBaka anx-rule/2 流水线算子解释器与解密)：`apps/server/src/lib/anibaka-adapter.ts`
- 视频源路由端点：`apps/server/src/routes/plugin.ts`, `apps/server/src/routes/plugin-catalog.ts`
- 客户端视频源 API 桥接：`apps/web/src/lib/plugin-api.ts`
- 客户端视频源 Store 与版本控制：`apps/web/src/stores/plugins.ts`
- 视频源看板与多源探活组件：`apps/web/src/pages/watch/SourceBoard.tsx`
- 视频源探活聚合器 Hook：`apps/web/src/lib/use-source-aggregator.ts`
- 视频源历史绑定 Store：`apps/web/src/stores/source-bindings.ts`
- 内置默认视频源 JSON 规则：`apps/web/src/data/default-plugins/index.ts`
- 视频源契约与共享类型：`packages/shared/src/plugin.ts`

## 6. 播放会话与页面布局 (Watch Page & Session)
- 播放页主控制器：`apps/web/src/pages/WatchPage.tsx`
- 播放会话调度器 (选集/选源/解析核心 Hook)：`apps/web/src/lib/use-watch-session.ts`
- 桌面端播放页布局：`apps/web/src/pages/watch/DesktopWatchLayout.tsx`
- 移动端播放页布局：`apps/web/src/pages/watch/MobileWatchLayout.tsx`
- 移动端选集抽屉：`apps/web/src/pages/watch/MobileEpsSection.tsx`
- 播放页番剧推荐列表 / 相关推荐 (WatchRecommendations)：`apps/web/src/pages/watch/WatchRecommendations.tsx`
- 播放页元信息与简介：`apps/web/src/pages/watch/WatchMeta.tsx`
- 播放页 HUD 悬浮提示：`apps/web/src/pages/watch/WatchHudToast.tsx`
- 播放页布局响应式 Hook：`apps/web/src/pages/watch/useWatchLayoutMode.ts`
- 历史兼容路由 (/play/:id & /subject/:id)：`apps/web/src/pages/PlayPage.tsx`, `apps/web/src/pages/SubjectPage.tsx`

## 7. 媒体流代理与广告过滤 (Media Proxy & M3U8 Ad Filter)
- 服务端媒体流代理路由：`apps/server/src/routes/media.ts`
- M3U8 切片广告过滤器：`packages/shared/src/m3u8-ad-filter.ts`
- 播放源 URL 协议判断与代理包装：`apps/web/src/lib/playback-src.ts`

## 8. Bangumi 数据交互与元数据管线 (Bangumi API & Metadata)
- 统一 Bangumi 端点解析与反代映射：`packages/shared/src/bangumi-endpoint.ts`
- Bangumi 图片 CDN 优化与反代：`packages/shared/src/bangumi-image.ts`, `apps/web/src/lib/bangumi-image-host.ts`
- Bangumi 类型定义与工具：`packages/shared/src/bangumi.ts`
- 服务端 Bangumi API 代理与推荐聚合路由 (POST /api/bangumi/recommendations)：`apps/server/src/routes/bangumi.ts`
- 客户端 Bangumi API 请求层：`apps/web/src/lib/bangumi.ts`, `apps/web/src/lib/api.ts`

## 9. 业务页面与前端核心路由 (Pages & App Shell)
- 应用主入口与路由注册：`apps/web/src/App.tsx`, `apps/web/src/main.tsx`
- 全局主布局 (导航栏、搜索框、底部栏)：`apps/web/src/components/Layout.tsx`, `apps/web/src/components/SiteFooter.tsx`
- 路由预加载与意图预取中心：`apps/web/src/lib/route-preload.ts`
- 首页 (热门番剧、分类板块、继续观看)：`apps/web/src/pages/HomePage.tsx`
- 每日放送时间表页：`apps/web/src/pages/TimelinePage.tsx`
- 番剧索引与分类筛选页：`apps/web/src/pages/AnimePage.tsx`
- 搜索结果页：`apps/web/src/pages/SearchPage.tsx`
- 收藏/追番页：`apps/web/src/pages/CollectPage.tsx`
- 播放历史页：`apps/web/src/pages/HistoryPage.tsx`
- 设置与功能中心页：`apps/web/src/pages/SettingsPage.tsx`
- 公共 UI 基础组件 (番剧卡片、骨架屏、状态容器)：`apps/web/src/components/ui.tsx`
- 全局错误边界：`apps/web/src/components/ErrorBoundary.tsx`

## 10. 用户状态管理与本地持久化 (Stores & Storage)
- 播放历史状态管理：`apps/web/src/stores/history.ts`, `packages/shared/src/history.ts`
- 全局用户偏好与设置 Store：`apps/web/src/stores/settings.ts`
- 视频源历史绑定 Store：`apps/web/src/stores/source-bindings.ts`
- 视频源规则插件 Store：`apps/web/src/stores/plugins.ts`
- 防抖存储与安全 Storage 封装：`apps/web/src/lib/debounced-storage.ts`, `apps/web/src/lib/storage.ts`

## 11. 服务端核心、数据库与缓存架构 (Server Core, DB & Cache)
- 服务端主入口与中间件：`apps/server/src/index.ts`
- 服务端配置解析：`apps/server/src/config.ts`
- 请求日志记录器 (时区格式化、设备解析、Pretty/JSON 双模)：`apps/server/src/lib/logger.ts`
- 全局 IP 访问统计与 Rate Limit 频控中间件：`apps/server/src/lib/ip-rate-limit.ts`
- 播放量与指标统计路由：`apps/server/src/routes/stats.ts`
- 访问控制与 Token 校验：`apps/server/src/lib/access.ts`
- 私有 IP 拦截与内网熔断：`apps/server/src/lib/private-host.ts`
- 数据库维护与免安装查询指南文档：`docs/database-maintenance.md`
- SQLite 数据库连接与初始化：`apps/server/src/db/connection.ts`, `apps/server/src/db/schema.ts`, `apps/server/src/db/index.ts`
- SQLite KV 缓存仓储：`apps/server/src/db/repositories/kv-cache.ts`
- SQLite 播放量与热度统计仓储：`apps/server/src/db/repositories/play-stats.ts`
- SQLite IP 访问与 PV 异步批量仓储：`apps/server/src/db/repositories/ip-access.ts`
- 视频源搜索与章节 SQLite 缓存：`apps/server/src/db/repositories/plugin-search-cache.ts`, `apps/server/src/db/repositories/plugin-chapters-cache.ts`
- 内存 TTL 缓存 (Single-Flight 防击穿)：`apps/server/src/lib/ttl-cache.ts`
- CDN 边缘缓存响应头配置：`apps/server/src/lib/cdn-cache-headers.ts`
- Cloudflare CDN 接入与 WAF/Cache 规则指南：`docs/cloudflare-cdn-rules.md`

## 12. SEO 搜索引擎优化与收录协议 (SEO & Indexing)
- 服务端轻量 SSR 预渲染与 Meta 注入：`apps/server/src/lib/seo-prerender.ts`
- 动态多源 Sitemap XML 生成与 Google Image 扩展：`apps/server/src/lib/seo-static.ts`
- IndexNow 即时收录协议引擎：`apps/server/src/lib/indexnow.ts`
- 前端客户端 SEO 与 JSON-LD 结构化数据：`apps/web/src/components/DocumentSeo.tsx`, `apps/web/src/lib/seo.ts`
- 静态 robots.txt 与 webmanifest：`apps/web/public/robots.txt`, `apps/web/public/site.webmanifest`

## 13. 辅助工具与公共库 (Utilities & Shared)
- 简繁转换 (OpenCC S2T)：`apps/server/src/lib/opencc-s2t.ts`
- HTTP 请求封装与伪装头：`apps/server/src/lib/http.ts`
- 版本检查与发版信息：`apps/server/src/lib/release.ts`, `packages/shared/src/version.ts`
- 剧集解析与处理工具：`packages/shared/src/episode.ts`
- 站点品牌与文案配置：`apps/web/src/lib/site-branding.ts`
