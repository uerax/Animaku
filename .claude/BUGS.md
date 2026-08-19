# Bug / 待办清单

## 📌 待处理清单 (Active TODOs)

*(暂无待处理项，所有已知问题已解决并归档)*

---

## 历史已解决归档 (Recently Resolved)

### [2026-08-19]
1. **修复暂停弹幕时间向后回跳/回弹 Bug (P0)**
   - 解决：排查定位在 `onPause` 执行时，由于浏览器内核已先行将 `video.paused` 标为 `true`，`onPause` 内调用 `this.mediaTime()` 命中 `if (this.media.paused) return this.anchorMediaTime` 提前返回了陈旧锚点（几秒前的基准时间），导致 `anchorMediaTime` 被错误覆盖回历史时间，引发弹幕向后大幅回跳；重构新增 `getInterpolatedTime(now)`，无论暂停与否均基于当前 `now` 精确计算瞬态实际运行时间戳，并在 `onPause` 与 `onWaiting` 中精准定格当前画面，暂停后弹幕 0 像素位移绝对静止。
   - 文件：`apps/web/src/player/media/canvas-danmaku.ts`
2. **Safari / iOS 播放卡顿与弹幕闪烁抽搐深度解耦重构 (P0 - 方案 1)**
   - 解决：
     1. **纯物理墙上时钟驱动**：正常播放下弹幕位移 100% 由 `performance.now()` 单调推进，彻底杜绝每帧因 Safari VideoToolbox PTS 离散抖动导致的时间倒流与文字抽搐；
     2. **分级漂移治理策略（Tiered Drift Policy）**：
        - 死区（0 ~ 0.5s）：完全不修正（Zero Intervention），吸收所有 24fps PTS 抖动与微观丢帧，弹幕保持满帧匀速；
        - 轻微漂移（0.5s ~ 2.0s）：采用一阶低通指数平滑滤波器（EMA，$\alpha = 0.05$）亚像素平滑校准，保证单调不回弹；
        - 硬跳跃（> 2.0s 或显式 Seek）：触发重寻道重新排轨；
     3. **时钟源收敛与隔离**：废除 `timeupdate` 对播放中锚点的暴力覆写；`rVFC` 仅作为 > 2.0s 大漂移看门狗；
     4. **缓冲/暂停优雅定格**：暂停瞬间精准捕获当前视觉时间；`waiting` 增加 200ms 防抖，过滤网络微抖动，超时平滑停滞；
     5. **iOS WebKit 渲染优化**：Canvas 注入 `contain: strict; will-change: transform; transform: translateZ(0);`，DPR 严格钳制 $\le 2.0$。
   - 文件：`apps/web/src/player/media/canvas-danmaku.ts`

### [2026-08-18]
1. **视频源展开卡片候选关键词 Chips 排版与字号精致化 (P2)**
   - 解决：优化 `SourceBoard.tsx` 中视频源卡片展开换词时的候选关键词 Chips；字号从 11px 精炼至 10.5px 微型排版，优化内边距（`px-2 py-0.5`）、圆角（`rounded-md`）与柔和边框，提供悬浮天青高亮微动效；在待选（`needs_pick`）卡片中亦补充候选关键词 Chips，提升换词交互流畅度。
   - 文件：`apps/web/src/pages/watch/SourceBoard.tsx`
2. **全站双模态色彩系统美化与默认白天模式（Light Mode）改造 (P1)**
   - 解决：新用户访问及无缓存时默认启用白天模式；重构 Warm Slate / Paper 灰白分层与柔和阴影体系；夜间模式中和 Deep Charcoal 深灰避免死黑。
   - 文件：`apps/web/index.html`, `apps/web/src/stores/settings.ts`, `apps/web/src/index.css`
2. **切换视频源 HUD 提示位置重构与播放器内联锚定 (P1)**
   - 解决：将 `WatchHudToast` 从网页顶部固定浮层改造为挂载于播放器画面容器内部的轻量浮层（Player HUD Overlay），支持常规窗口、网页全屏与系统全屏始终伴随画面居中提示。
   - 文件：`apps/web/src/player/types.ts`, `apps/web/src/player/VideoPlayer.tsx`, `apps/web/src/pages/watch/WatchHudToast.tsx`, `apps/web/src/pages/WatchPage.tsx`
3. **服务端日志输出结构化与健康检查心跳静默过滤 (P1)**
   - 解决：过滤 Docker/K8s 正常的 `/api/health` 心跳轮询日志（非 200 打印）；实现结构化日志中间件输出 `[YYYY-MM-DD HH:mm:ss] [IP] METHOD PATH -> STATUS (Xms)`；对媒体拉流错误提供 `[MEDIA_FAIL]` 归因标识。
   - 文件：`apps/server/src/index.ts`
4. **修复播放页强依赖代理源（Anime1/LIBVIO）鉴权状态不同步问题 (P0)**
   - 解决：`useWatchSession.ts` 接入 `isProxyUnlocked` 门禁，未解锁或未授权时严禁激活全量代理源，与设置页保持 100% 状态一致。
   - 文件：`apps/web/src/lib/plugin-capabilities.ts`, `apps/web/src/lib/use-watch-session.ts`
5. **混合模式 M3U8 去广告文本解析与 PROXY_TOKEN 媒体流鉴权解耦 (P0)**
   - 解决：纯 M3U8 文本去广告重写（TS 切片直连源站 CDN，耗流 < 10KB）免密放行；全量代理与二进制 TS/M4S/MP4 维持严格鉴权。
   - 文件：`apps/server/src/routes/media.ts`, `apps/server/src/lib/access.ts`
6. **视频源待选（needs_pick）手动点选后未记录到缓存 Bug (P0)**
   - 解决：引入 `isManual: true`，用户主动点选 100% 信任持久化，不再受机器相似度 $< 0.50$ 拦截。
   - 文件：`apps/web/src/stores/source-bindings.ts`, `apps/web/src/lib/use-watch-session.ts`
7. **续播功能正常解析但显示「续播：未解析到分集」红字报错 Bug (P0)**
   - 解决：续播优先复用当前已就绪的 selection 分集；元数据就绪前不使用占位标题盲搜；仅在无选集时才渲染错误。
   - 文件：`apps/web/src/lib/use-watch-session.ts`, `apps/web/src/pages/watch/MobileEpsSection.tsx`
8. **服务端 PROXY_TOKEN 拦截插件搜索导致新用户全源 🔴 异常 Bug (P0)**
   - 解决：拆分媒体流中继代理与插件搜索鉴权，允许公网访客正常搜索番剧与解析分集。
   - 文件：`apps/server/src/lib/access.ts`, `apps/server/src/routes/plugin.ts`
9. **桌面端 Chrome 暂停时弹幕位置后退与微抖动震颤 Bug (P0)**
   - 解决：捕获暂停瞬时高精渲染时间戳作为冻结锚点，屏蔽暂停态下 PTS 微抖动。
   - 文件：`apps/web/src/player/media/canvas-danmaku.ts`
10. **播放器桌面端双击全屏过敏与单击暂停/继续误触全屏 Bug (P0)**
   - 解决：引入 220ms 延时分发定时器，快速双击清除第一击单击定时器，实现双击与播放/暂停 0 干扰解耦。
   - 文件：`apps/web/src/player/chrome/useShellPointerHandlers.ts`
11. **视频源首屏起播、折叠时机与白天模式适配修复 (P0)**
   - 解决：`sourcesOpen` 默认折叠（起播 0 冗余网络请求），元数据就绪后触发首源起播，SourceBoard 接入双模态 CSS Token。
   - 文件：`apps/web/src/lib/use-watch-session.ts`, `apps/web/src/pages/watch/SourceBoard.tsx`

---

## 历史已解决归档 (Recently Resolved)

### [2026-08-18]
1. **混合模式 M3U8 去广告文本解析与 PROXY_TOKEN 媒体流鉴权解耦 (P0)**
   - 解决：纯 M3U8 文本去广告重写（TS 切片直连源站 CDN，耗流 < 10KB）免密放行；全量代理与二进制 TS/M4S/MP4 维持严格鉴权。
   - 文件：`apps/server/src/routes/media.ts`, `apps/server/src/lib/access.ts`
2. **视频源待选（needs_pick）手动点选后未记录到缓存 Bug (P0)**
   - 解决：引入 `isManual: true`，用户主动点选 100% 信任持久化，不再受机器相似度 $< 0.50$ 拦截。
   - 文件：`apps/web/src/stores/source-bindings.ts`, `apps/web/src/lib/use-watch-session.ts`
3. **续播功能正常解析但显示「续播：未解析到分集」红字报错 Bug (P0)**
   - 解决：续播优先复用当前已就绪的 selection 分集；元数据就绪前不使用占位标题盲搜；仅在无选集时才渲染错误。
   - 文件：`apps/web/src/lib/use-watch-session.ts`, `apps/web/src/pages/watch/MobileEpsSection.tsx`
4. **服务端 PROXY_TOKEN 拦截插件搜索导致新用户全源 🔴 异常 Bug (P0)**
   - 解决：拆分媒体流中继代理与插件搜索鉴权，允许公网访客正常搜索番剧与解析分集。
   - 文件：`apps/server/src/lib/access.ts`, `apps/server/src/routes/plugin.ts`
5. **桌面端 Chrome 暂停时弹幕位置后退与微抖动震颤 Bug (P0)**
   - 解决：捕获暂停瞬时高精渲染时间戳作为冻结锚点，屏蔽暂停态下 PTS 微抖动。
   - 文件：`apps/web/src/player/media/canvas-danmaku.ts`
6. **播放器桌面端双击全屏过敏与单击暂停/继续误触全屏 Bug (P0)**
   - 解决：引入 220ms 延时分发定时器，快速双击清除第一击单击定时器，实现双击与播放/暂停 0 干扰解耦。
   - 文件：`apps/web/src/player/chrome/useShellPointerHandlers.ts`
7. **视频源首屏起播、折叠时机与白天模式适配修复 (P0)**
   - 解决：`sourcesOpen` 默认折叠（起播 0 冗余网络请求），元数据就绪后触发首源起播，SourceBoard 接入双模态 CSS Token。
   - 文件：`apps/web/src/lib/use-watch-session.ts`, `apps/web/src/pages/watch/SourceBoard.tsx`

### [2026-08-12 ~ 2026-08-16]
- **弹幕引擎与交互**：B 站标准「开-精简-关」三态循环、同屏密度限制抛弃、LRU 离屏字形位图 1:1 Retina 对齐、Z 轴原子化渲染、恒定 7.5s 屏幕穿越时长模型与倍速自适应补偿。
- **性能与安全**：Docker 网桥与反代鉴权绕过封堵、单 IP 并发流限制 (<=8)、起播首片预取 (`startFragPrefetch`)、服务端 `hono/compress`、前端路由动态 `lazy()` 分包、VOD 点播 180s 缓存。
- **架构重构**：插件搜索 SQLite 磁盘缓存持久化、URL 深度瘦身（移除冗余 query 改为极简短链）、稀饭 Next 多线路与 `no-referrer` 去防盗链。
- **移动端优化**：Backdrop 透明遮罩 0ms 收起、操作面板中轴对齐与双模态自适应、消除 MobileSafari 300ms 点击延迟。
