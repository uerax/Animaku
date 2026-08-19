# Bug / 待办清单

## 📌 待处理清单 (Active TODOs)

### [2026-08-19] Safari / iOS 播放卡顿与弹幕闪烁抽搐深度解耦重构 (P0)

#### 1. 现状与痛点复盘 (Problem Analysis)
- **现象**：Chrome 下视频与弹幕播放极其流畅，但在 Safari（特别是 iOS Safari / iPadOS）下存在微卡顿感，且弹幕伴随视频掉帧产生肉眼可见的**高频文字闪烁、微回弹、忽快忽慢与抽搐**。
- **上一版改动为何未彻底解决**：
  1. **死区阈值（15ms）被击穿导致微观「时间倒流」**：动画通常为 24fps（两帧间隔 41.6ms），Safari VideoToolbox 汇报的 PTS 存在 5ms~14ms 离散抖动。当 drift 落在 `[-0.015, 0]` 时触发了直接覆盖锚点，导致 `mediaTime` 比上一帧减小，弹幕向后回弹 1px，随后下一帧又前冲 2px，引发剧烈高频震颤。
  2. **双时钟源竞争抢夺**：`rVFC`（硬件视频帧回调）与 `onTimeUpdate`（Safari 下 4~15Hz 粗粒度时钟）以不同频率和精度同时修改同一个 `anchorMediaTime` 锚点变量。
  3. **架构强耦合缺陷**：弹幕运动强行绑定视频硬件帧的瞬时状态。视频在网络分片或软解时的微观 Jitter（抖动）被直接放大为弹幕运动的不均匀。
  4. **iOS 3x Retina 显存与 CoreAnimation 合成开销**：高分屏下全屏 Canvas 物理分辨率过大（如 2556×1179），在 WebKit 中每帧与 `<video>` 进行 Metal Alpha 混合极易引发掉帧。

---

#### 2. 技术方案设计（供多模型综合分析与评估）

##### 🎯 方案 A（核心推荐）：纯物理墙上时钟驱动 + 阻尼低通滤波解耦架构 (Wall-Clock Pacing & Decoupled Filter)
- **核心理念**：人眼对弹幕的感知诉求是**物理空间的绝对匀速连续运动**。弹幕超前或滞后视频 100~200ms 完全不可感知，但速度突变 1 像素会立即被感知为闪烁卡顿。
- **具体实现细节**：
  1. **物理时钟绝对驱动**：正常播放状态下，弹幕渲染位移 $x$ **100% 严格由 `performance.now()` 驱动**（物理单调递增），完全杜绝每帧或每秒内微调 `anchorMediaTime`。
  2. **分级漂移治理策略（Tiered Drift Policy）**：
     - **死区（0 ~ 0.5s）**：完全不修正（Zero Intervention），吸收所有 24fps PTS 抖动、网络微延迟与解码掉帧，弹幕保持 60/120fps 满帧匀速划过；
     - **轻微漂移（0.5s ~ 2.0s）**：使用一阶低通指数平滑滤波器（EMA Filter，$\alpha \approx 0.05$）以每帧微像素级的速度极其缓慢地靠近视频时间，禁止突发瞬移；
     - **硬跳跃（> 2.0s 或显式 Seek）**：判定为用户寻道/切集，触发 `seek()` 清空跑道并重新排轨。
  3. **时钟源收敛与隔离**：
     - 彻底废除 `timeupdate` 对播放中弹幕时钟的写入权限（`timeupdate` 仅用于进度条与播放历史）；
     - `rVFC` 仅作为视频是否真正卡死（Stall）的看门狗（Watchdog），不再直接覆写渲染锚点。
  4. **缓冲/暂停优雅定格**：
     - 收到 `pause` 事件时，捕获当前视觉即时时间精确冻结；
     - 收到 `waiting` 事件且超过 200ms 时，执行线性阻尼平滑减速至停滞，避免生硬刹车。

##### 🎯 方案 B：iOS WebKit 渲染轻量化与显存优化 (iOS Canvas GPU Optimization Pipeline)
- **具体实现细节**：
  1. **DPR 上限钳制**：在移动端/iOS 下，将 Canvas 的物理 `devicePixelRatio` 严格钳制为最大 `2.0`（即使硬件为 3.0x），像素渲染面积减少 55%，显著降低 Metal 合成负载；
  2. **离屏字形位图池生命周期控制**：限制 `MAX_GLYPH_CACHE`，避免频繁 `createElement('canvas')` 触发 iOS WebKit 的激进显存回收与 GC 停顿；
  3. **CSS 独立图层约束**：确保弹幕 Canvas 具备 `contain: strict; will-change: transform; transform: translateZ(0);`，杜绝触发布局重排与图层重构。

##### 🎯 方案 C（备选分析）：Web Worker + OffscreenCanvas 独立线程渲染
- **思路**：将弹幕位移计算与 Canvas 绘制全部移入 Worker 线程，主线程只传递 `play/pause/seek` 指令。
- **风险评估项**：需评估 iOS Safari 老版本对 `canvas.transferControlToOffscreen()` 的支持度，以及 Worker 线程在 iOS 低电量模式下的节流策略。

---

#### 3. 供模型评审的关键决策问题 (Questions for Multi-Model Analysis)
1. 在方案 A 中，将微观漂移容忍死区设定为 `0.5s` 是否足以消除 99% 的视频 Jitter 且不破坏弹幕与视频剧情的对齐感知？
2. 在 Safari 原生 HLS（AVPlayer 黑盒）模式下，如何最优雅地判定视频进入了真实的 Weak-Network Rebuffering（缓冲等待）而不是普通的 PTS 丢帧？
3. 是否需要彻底移除 `requestVideoFrameCallback`（rVFC）在弹幕位移计算中的角色，仅依赖纯 `requestAnimationFrame` + `performance.now()`？

---

- **涉及文件**：
  - `apps/web/src/player/media/canvas-danmaku.ts`
  - `apps/web/src/player/VideoPlayer.tsx`
  - `apps/web/src/player/media/danmaku-utils.ts`

---

## 历史已解决归档 (Recently Resolved)

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
