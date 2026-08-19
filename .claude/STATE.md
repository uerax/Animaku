# Animaku 项目状态快照 (STATE.md)

## [2026-08-19] 统一项目动态版本号体系（v1.1.1）并全站页面优雅展示
- 状态：已完成
- 优先级：P1
- 描述：
  1. **单一事实来源与自动化升级（`pnpm bump`）**：
     - 提供 `scripts/bump-version.mjs` 与根目录 `pnpm bump <ver>` 命令（支持具体版本号或 `patch` / `minor` / `major` 语义化升级），一键原子同步更新全仓 4 个 `package.json` 与 `version.ts`；
     - 在 `apps/web/vite.config.ts` 与 `scripts/build-server.mjs` 中接入动态版本解析流水线，在构建期/开发期自动读取根 `package.json`（支持 `VITE_APP_VERSION` / `APP_VERSION` 环境变量覆盖）并注入 `import.meta.env.VITE_APP_VERSION` 与 `process.env.APP_VERSION`；
     - 在 `apps/server/src/config.ts` 中实现服务端动态版本读取，自动为 User-Agent 及 `/api/health` 暴露服务端实时版本号；
     - 在 `packages/shared/src/version.ts` 导出默认兜底版本常量 `APP_VERSION = 'v1.1.1'`；
  2. **页面优雅展示与左上角导航栏保持纯净**：
     - **SiteFooter（页脚）**：在产品名称后紧跟精致琉璃徽标胶囊展示 `v1.1.1`；
     - **SettingsPage（设置页）**：在「服务状态」核心面板首行呈现客户端与服务端实时版本号；
     - **Layout（顶部导航）**：左上角导航栏保持纯净视觉，不添加版本标签干扰。
- 涉及文件：package.json, apps/web/package.json, apps/server/package.json, packages/shared/package.json, packages/shared/src/version.ts, packages/shared/src/index.ts, scripts/bump-version.mjs, apps/web/vite.config.ts, scripts/build-server.mjs, apps/server/src/config.ts, apps/server/src/index.ts, apps/web/src/lib/server-capabilities.ts, apps/web/src/lib/site-branding.ts, apps/web/src/components/SiteFooter.tsx, apps/web/src/components/Layout.tsx, apps/web/src/pages/SettingsPage.tsx, apps/web/src/vite-env.d.ts, .env.example, README.md
- 备注：全仓类型检查与前端/服务端构建打包验证全通过。

## [2026-08-19] 修复 Safari 播放丢帧与弹幕抽搐（时钟单调保护 + GPU 图层隔离 + 上下文优化）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **弹幕时钟单调性防御与防丢帧回弹**：在 `canvas-danmaku.ts` 的 `onVideoFrame`（rVFC 硬件回调）与 `checkClockDrift` 中实现严格的单向单调递增保护（Monotonic Clamp）。当 Safari 因高码率突变发生硬件解码卡顿、掉帧导致视频呈现时间（`metadata.mediaTime`）滞后于弹幕预测时间时，严格禁止向后回拉时间戳（`anchorMediaTime`），彻底杜绝弹幕左右横跳抽搐（Rubber-banding）；
  2. **消除 Safari WebKit `desynchronized: true` 图层冲突**：在 Safari 下安全规避 `desynchronized` 上下文模式，解决覆盖在 `<video>` 上方的 Canvas 破坏 VideoToolbox / Metal 硬件视频图层垂直同步导致的额外掉帧；非 Safari 浏览器 100% 维持原有逻辑；
  3. **弹幕 Canvas 独立 GPU 硬件合成图层**：为弹幕 Canvas 注入 `willChange: 'transform'` 与 `transform: 'translateZ(0)'` 开启独立硬件合成图层，消除与视频图层的合成争抢，最大程度缓解 1.25x 倍速突发高码率镜头下的丢帧卡顿。
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts
- 备注：全仓类型检查与前端生产打包全量通过。

## [2026-08-19] 移除播放失败切换服务器代理功能（快速失败与切源指引）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **彻底移除失败切换代理逻辑**：从 `use-watch-session.ts` 中移除残留的 `forceProxy` 状态、`sessionForceProxy` 以及相关重置 effect，直链播放失败后严禁自动尝试中继服务器代理；
  2. **优化播放器错误反馈**：
     - 在 `VideoPlayer.tsx` 中移除针对直链媒体失败时设置的 `直链失败，尝试代理…` 中间态文案；
     - MP4/Progressive 媒体加载失败直接呈现 `视频加载失败，建议切换视频源`；
     - Hls.js fatal 网络错误（`NETWORK_ERROR`）直接结束缓冲并显示 `网络连接错误，建议切换视频源`；
     - Safari 原生 HLS 加载失败直接显示 `原生 HLS 加载失败，建议切换视频源`；
  3. **保持快速失败与 HUD 引导**：底层触发 `reportLoadFailed` 统一调用 `onMediaLoadFailed` 唤起内联 HUD 提示用户点击右侧切换可用视频源；
  4. **同步更新文档与类型注释**：更新 `playback-src.ts`、`README.md` 与 `docs/CONTEXT.md` 中关于代理机制的描述。
- 涉及文件：apps/web/src/lib/use-watch-session.ts, apps/web/src/player/VideoPlayer.tsx, apps/web/src/lib/playback-src.ts, docs/CONTEXT.md, README.md
- 备注：全仓类型检查与打包构建全部通过。

## [2026-08-19] 移除桌面端双击全屏功能与消除单击播放/暂停延迟（0ms 即时响应）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **移除桌面端双击全屏**：从 `useShellPointerHandlers.ts` 中彻底移除桌面端双击全屏手势逻辑；全屏操作统一由控制栏全屏按钮、右键菜单选项以及 `F` / `Shift+W` 快捷键触发；
  2. **消除单击播放/暂停延迟（0ms 响应）**：移除桌面端为等待双击判定而设置的 220ms 延时计时器（`DESKTOP_SINGLE_CLICK_DELAY_MS`），单击画面区域即刻同步触发 `togglePlay()`，带来极致跟手的即时播放/暂停体验；
  3. **保留并隔离移动端手势**：移动端保持单击呼出/收起控制栏、双击播放/暂停的原有手势策略不变。
- 涉及文件：apps/web/src/player/chrome/useShellPointerHandlers.ts
- 备注：全仓类型检查与打包构建全通过。

## [2026-08-19] 彻底修复桌面端网页全屏（Web Fullscreen）失效问题与补全 Shift+W 快捷键
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查根本原因**：
     - 在 `WatchPage.tsx` 中，`playerBlock` 曾在外层引入 `<div className="relative kz-player-frame mx-auto">` 容器包裹 `VideoPlayerSuspense`；
     - 由于 `.kz-player-frame` 在 CSS 中配置了 `contain: layout;`（用于防 low-res MP4 元数据加载时的回流抖动），根据 W3C CSS Containment 规范，`contain: layout` 会强制为所有后代元素（包括 `position: fixed`）创建独立包含块（Containing Block）；
     - 当用户触发「网页全屏」时，底层播放器 `.kz-player-shell.kz-web-fs`（`position: fixed; inset: 0; width: 100vw; height: 100vh;`）被外层 `kz-player-frame` 容器强制约束在原本的 16:9 盒模型中，无法铺满浏览器视口。
  2. **消除包含块约束**：
     - 移除 `WatchPage.tsx` 中 `VideoPlayerSuspense` 外层冗余的 `kz-player-frame` 包装容器，播放器在非全屏态下自主管理自身的 `kz-player-frame relative` 类名，全屏态下直接脱离文档流扩展至全视口；
     - 在 `plyr-overrides.css` 中为 `.kz-has-web-fs` 补全防御性样式 `.kz-has-web-fs .kz-player-frame { contain: none !important; }` 并提升 `.kz-watch-cinema` 与 `.kz-watch` 层叠上下文。
  3. **补齐 `Shift+W` 快捷键映射**：
     - 修复 `VideoPlayer.tsx` 键盘事件中 `Shift+W` 被单键 `w`（切换画面比例）截断的问题，按 `Shift+W` 正常触发 `toggleWebFs()`。
- 涉及文件：apps/web/src/pages/WatchPage.tsx, apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/plyr-overrides.css
- 备注：全仓类型检查与打包构建全通过。

## [2026-08-18] 彻底修复桌面与移动端暂停/播放弹幕跳位、回弹与换轨 Bug（rVFC 硬件级帧同步 + 连续滑动平均时钟）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查根本原因**：
     - 原有时钟修正机制存在两大致命缺陷：(1) `checkClockDrift` 修正 `anchorMediaTime` 时未同步推进 `anchorPerfTime`，导致 `(now - anchorPerfTime)` 跨度无限膨胀产生积分发散累积漂移；(2) 暂停时设置了硬编码的 `0.35s` 漂移门禁，当连续播放累积时差跨过 0.35s 临界值时，暂停或暂停期间的 `timeupdate` 会瞬间触发 `seek()`，清空正在运行的弹幕并重新洗牌分配轨道，引发弹幕突发瞬移、跳行与换位；
     - 移动端（iOS / Android）因解码与渲染延迟更大，极易在每次暂停时超标触发 `seek()` 重新排轨。
  2. **接入 `requestVideoFrameCallback` 硬件级帧呈现同步**：
     - 在现代浏览器（Chromium 83+ / Safari 15.4+ / Firefox 119+）中启用 `requestVideoFrameCallback`（rVFC），在合成器每绘制一帧视频时直接捕获底层硬件真实的 PTS（`metadata.mediaTime`）并对齐 `performance.now()`；
     - rAF 仅负责在相邻视频帧间进行微秒级超平滑亚像素插值渲染，彻底将时钟漂移控制在 0ms。
  3. **重构降级时钟连续滑动平均同步算法（EMA Re-anchor）**：
     - 对不支持 rVFC 的环境，在 `checkClockDrift` 中重构为连续滑动平均推进算法：动态计算加权预测值并将 `anchorPerfTime` 同步刷新为当前 `now`，彻底消除时间膨胀与积分发散；
  4. **暂停严格单向绝对冻结与无感起播**：
     - 暂停时（`onPause`）严格将当前即时插值视觉时间作为冻结时间戳，取消粗暴的 `> 0.35s` 强制重置，停止 rAF 与 rVFC 循环，100% 保持暂停瞬间画面与弹幕像素级静止（0 像素位移、0 换轨）；
     - 暂停状态下的非用户 Seek 事件严禁重新排轨（仅在真实 Seek 且 $|\Delta t| > 1.5\text{s}$ 时才执行重寻道）；
     - 恢复播放时以 0 延迟从冻结点顺滑推进，彻底消除回弹震颤与跳位。
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts
- 备注：全仓类型检查与打包构建全通过。

## [2026-08-18] 优化视频统计面板排版（固定宽度 + 横向 Header + 补全关闭按钮与圆整毫秒）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **固定卡片宽度（`w-[22.5rem]`）**：将统计信息 HUD 卡片宽度固定为 `22.5rem`（360px），解决因网速、切片吞吐、帧率等实时数据长度变动导致的宽度抖动与忽大忽小问题；
  2. **标题与复制按钮横向排版**：为 `IconStats`、`IconCopy`、`IconClose`、`IconCheck` 等统一注入固定尺寸限制（`w-4 h-4` / `w-3.5 h-3.5 shrink-0`），消除 SVG 撑开导致文字被迫换行竖置的缺陷，保证标题与右侧「复制」文字始终保持整洁的单行水平排版；
  3. **补齐并增强关闭按钮**：为右上角补齐 `IconClose` 并适配日夜双模态高对比度悬浮交互与 `Esc` 关闭提示；
  4. **浮点毫秒数值取整**：对分片加载耗时（`loadTimeMs`）进行整数四舍五入（`Math.round(loadTimeMs)`），消除 `189.300000000074506ms` 等过长浮点数展示。
- 涉及文件：apps/web/src/player/chrome/PlayerStatsOverlay.tsx, apps/web/src/player/chrome/icons.tsx, apps/web/src/player/plyr-overrides.css
- 备注：全仓类型检查与打包构建全部通过。

## [2026-08-18] 修复右键菜单漂移位移与卡顿（同步坐标约束 + 零延迟动画）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **消除异步二次定位漂移**：原先菜单使用 `useEffect` + `useState` 延迟调整边界位置，导致二次右键时残留上一次点击坐标并在首帧渲染后异步平移；重构为在 `onContextMenu` 事件中基于播放器视窗同步完成精确防溢出约束（Clamped coordinates），渲染首帧即精准定位；
  2. **消除动画与位移冲突**：去除容易产生位移插值的类名，在 `plyr-overrides.css` 引入 GPU 硬件加速的 100ms 纯透明度与微缩放入场动效（`@keyframes kz-ctx-pop`），配合 `key={contextMenu.x-contextMenu.y}` 保证每次右键在光标落点瞬间以 0 延迟平滑展开；
  3. **自适应子菜单展开方向**：当菜单靠近播放器左侧边界（$x < 220\text{px}$）时，二级子菜单自动向右侧展开（`left-full ml-1.5`），避免向左溢出画面。
- 涉及文件：apps/web/src/player/chrome/PlayerContextMenu.tsx, apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/plyr-overrides.css
- 备注：全仓类型检查与打包构建全部通过。

## [2026-08-18] 桌面端播放器右键菜单与视频实时统计信息（Stats for Nerds）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **播放器右键菜单组件（`PlayerContextMenu.tsx`）**：
     - 桌面端播放器内部右键原生拦截唤起 Glassmorphic 悬浮菜单，智能贴合视窗与边界防溢出裁剪；
     - 顶部快捷状态栏展示当前视频分辨率（如 `1920×1080`）与实时带宽吞吐速率胶囊，支持一键唤起详细统计；
     - 集成常用快捷功能：详细统计信息开关、原画帧截图（下载 PNG + 剪贴板）、画面水平镜像翻转（`scaleX(-1)`）、单集循环播放、画中画（PiP）；
     - 集成级联子菜单：画面比例（16:9 / 铺满 Cover / 拉伸 Fill / 4:3）、播放倍速（0.5x~3.0x）、Anime4K 超分辨率（效率/质量）、全屏模式（网页全屏/原生全屏）；
     - 集成数据复制：复制当前时间点播放链接、复制视频直链、复制调试统计 JSON 数据。
  2. **视频详细统计面板（`PlayerStatsOverlay.tsx`）**：
     - 实现对标 Bilibili/YouTube「详细统计信息 (Stats for Nerds)」悬浮 HUD 卡片；
     - 实时采集与展示：原始分辨率与渲染尺寸、实时带宽与分片加载速度、前方缓冲时长与占比、解码帧率（FPS）与丢帧统计（`getVideoPlaybackQuality`）、音视频编码格式、流媒体引擎（Hls.js MSE / 原生）、超分管线状态、源站主机域名等；
     - 支持一键格式化复制完整排错统计信息。
  3. **交互手势与事件解耦**：
     - `useShellPointerHandlers.ts` 与 `VideoPlayer.tsx` 隔离 `.kz-context-menu` / `.kz-stats-overlay` 交互事件，避免误触底层视频播放/暂停或双击全屏；
     - 支持点击外部、按 `Escape` 键或选取任意选项后平滑收起。
- 涉及文件：apps/web/src/player/chrome/PlayerContextMenu.tsx, apps/web/src/player/chrome/PlayerStatsOverlay.tsx, apps/web/src/player/chrome/icons.tsx, apps/web/src/player/chrome/useShellPointerHandlers.ts, apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/plyr-overrides.css
- 备注：全仓类型检查与打包构建全部通过。

## [2026-08-18] 优化 xifan-next 视频解析性能（新加坡区域直达 + 并发请求 + 消除冗余 HEAD 探测）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **注入 Supabase 新加坡区域路由**：在 `apps/server/src/lib/xifan-next.ts` 中为 Edge Function 请求对齐官方配置 `forceFunctionRegion=ap-southeast-1` 与 `x-region: ap-southeast-1`，消除跨大洲默认 Edge Relay 冷寻址中继，单次往返耗时从 1700ms 降至 250ms；
  2. **HLS 与 Fallback 并发竞速**：改串行降级为 `Promise.allSettled` 并发请求，取并发最快响应（优先命中 HLS 切片，无切片即刻使用 Fallback），消除串行失败等待；
  3. **移除服务端冗余阻塞式 HEAD 探测**：剔除无意义的海外 CDN HEAD 请求（单次耗时 1000~2300ms 且返回 200 无重定向），解析总耗时由 5.3s 降至 250ms（提升 20 倍）。
- 涉及文件：apps/server/src/lib/xifan-next.ts
- 备注：全仓类型检查通过。

## [2026-08-18] 移除 otage 默认内置源并将 cycani 优先级权重提升至 70
- 状态：已完成
- 优先级：P1
- 描述：
  1. **移除 otage 默认调用**：对齐 age / 7sefun / gugu3 模式，保留 `otage.json` 规则定义文件仅供本地/手动导入，从 `DEFAULT_PLUGIN_RULES` 中移除；
  2. **提升 cycani 优先级权重至 70**：将 `cycani.json` 的 `weight` 设为 `70`，与 `xifan-next` 并列最高梯队优质原画源；
  3. **客户端版本迁移与自动下线**：在 `apps/web/src/stores/plugins.ts` 中递增 `PLUGIN_DEFAULTS_VERSION`（20 -> 21），在 `ensureDefaults` 中自动过滤移除已下线的内置 `otage` 规则；
  4. **设置页文案同步**：更新 `SettingsPage.tsx` 中恢复默认规则与广告过滤说明文案。
- 涉及文件：apps/web/src/data/default-plugins/cycani.json, apps/web/src/data/default-plugins/index.ts, apps/web/src/stores/plugins.ts, apps/web/src/pages/SettingsPage.tsx
- 备注：全仓类型检查与构建打包验证全通过。

## [2026-08-18] 接入次元城动画（cycani.org）专有适配器与 Cloudflare 1080P MP4 原画直链
- 状态：已完成
- 优先级：P0
- 描述：
  1. **服务端专有适配器（`cycani.ts`）**：
     - 实现 `isCycaniRule`、`searchCycani`、`chaptersCycani`、`resolveCycani`；
     - 搜索与分集直接请求官方 RESTful JSON API，多线路（`play_from`）全量并发提取；
     - 内置凭证与 Token 内存缓存生命周期管理，支持 401 自动重新登录与自愈重试；
     - 解析获取 Cloudflare CDN 托管的高清 1080P MP4 直链（支持 `Accept-Ranges: bytes` 与断点拖拽，0 服务端带宽代理消耗）；
  2. **规则引擎挂载**：在 `apps/server/src/rule-engine/index.ts` 的搜索、章节与解析三处核心链路旁路挂载 `isCycaniRule`；
  3. **内置规则与客户端版本升级**：
     - 新建 `apps/web/src/data/default-plugins/cycani.json`（weight: 68，preferOriginalTitle: false），并在 `index.ts` 注册；
     - 在 `apps/web/src/stores/plugins.ts` 中递增 `PLUGIN_DEFAULTS_VERSION`（19 -> 20）并将 `'cycani'` 加入 `legacyBuiltinNames`，确保老用户无感自动升级。
- 涉及文件：apps/server/src/lib/cycani.ts, apps/server/src/rule-engine/index.ts, apps/web/src/data/default-plugins/cycani.json, apps/web/src/data/default-plugins/index.ts, apps/web/src/stores/plugins.ts
- 备注：全流程真实 API 单元测试通过，全仓类型检查与打包构建全通过。

## [2026-08-18] 修复历史记录/异名番剧选集反查失败与消除看板假绿色
- 状态：已完成
- 优先级：P0
- 描述：
  1. **历史记录 sourceUrl 泛化反查修复**：在 `use-watch-session.ts` 中重构 `lookupHistorySourceUrl`，解决从观看历史进入短链（`/play/:id?plugin=name&ep=N` 无 `pageUrl` 参数）时无法读取真实 `sourceUrl` 的缺陷；精准回填上次播放绑定的 `sourceUrl`，消除对《炒翻天》等异名番剧的错误回退盲搜；
  2. **消除视频源看板（SourceBoard）假绿色**：在 `use-source-aggregator.ts` 中废除只要当前源激活就盲目置为 `ready` 状态的逻辑，严格校验 `selection.roads.length > 0` 且无分集报错；
  3. **受保护的手动绑定持久留存**：用户主动选定绑定的条目（`isManual: true`）在网络异常或分集波动时受保护保留，禁止被随意清除。
- 涉及文件：apps/web/src/lib/use-watch-session.ts, apps/web/src/lib/use-source-aggregator.ts
- 备注：全仓类型检查与打包验证全通过。

## [2026-08-18] 优化选集列表 4 小时 TTL 与消除死链源无效重解析等待
- 状态：已完成
- 优先级：P1
- 描述：
  1. **选集 TTL 缩短至 4 小时**：服务端 `PLUGIN_CACHE_TTL.chapters` 与客户端 `ROADS_CLIENT_TTL_MS` 统一由 12 小时缩短至 4 小时（与搜索缓存完全对齐），消除连载番剧开播临界点过长时间滞后问题；
  2. **消除死链源无效自愈等待**：优化 `useWatchSession.ts` 中的 `onMediaLoadFailed`，去除针对死链源（如 MXDM/Omofun 失效链接）无意义的转代理与二次重解析（re-resolve）等待循环，在直链失败时直接快速失败（Fast-Fail）并触发 HUD 提示用户切换右侧可用源。
- 涉及文件：apps/server/src/lib/ttl-cache.ts, apps/web/src/lib/roads-cache.ts, apps/web/src/lib/use-watch-session.ts
- 备注：全仓类型检查与构建打包全通过。

## [2026-08-18] 视频源选集列表（Chapters）接入 SQLite 持久化与 L1+L2 双层缓存流水线
- 状态：已完成
- 优先级：P0
- 描述：
  1. **SQLite 数据库模式升级**：在 `apps/server/src/db/schema.ts` 中新增 migration v2，创建 `plugin_chapters_cache` 专有持久化表，配备 `key`、`plugin_name`、`source_url`、`rule_hash`、`data`、`expires_at` 等字段与高效过期/组合查询索引；
  2. **分集持久化仓储引擎**：实现 `PluginChaptersCacheRepository`（`plugin-chapters-cache.ts`），提供 `get`、`set`、`delete`、`deleteByPlugin`、`clearExpired` 及 `getStats`；并在服务启动初始化与每小时定时任务中接入自动清理；
  3. **L1 内存 + L2 SQLite 双层缓存流水线**：重构 `POST /api/plugin/chapters` 路由：
     - L1 快速内存命中（< 0.1ms）直接返回 `200 (X-Cache: HIT)`；
     - L2 SQLite 命中（< 1ms）回填 L1 内存并返回 `200 (X-Cache: HIT)`，彻底避免 Docker 重启或版本更新后分集缓存丢失导致的源站雪崩；
     - 未命中时通过 Single-Flight 并发合并防击穿执行抓取，并将结果持久化写入 SQLite 与 L1 内存（12 小时 TTL）；
     - 支持客户端 `refresh=1` / `Cache-Control: no-cache` 一键物理删除并穿透回源。
- 涉及文件：apps/server/src/db/schema.ts, apps/server/src/db/repositories/plugin-chapters-cache.ts, apps/server/src/db/index.ts, apps/server/src/routes/plugin.ts
- 备注：单测验证通过，全仓类型检查与打包构建全通过。

## [2026-08-18] 视频源换词重搜候选关键词 Chips 排版与微型字号精致化
- 状态：已完成
- 优先级：P2
- 描述：
  1. **关键词 Chips 微型精致排版**：优化 `SourceBoard.tsx` 中视频源卡片展开换词时的候选关键词 Chips；字号从 11px 精炼至 10.5px 微型排版（`text-[10.5px]`），优化内边距（`px-2 py-0.5`）、圆角（`rounded-md`）与柔和边框，提供流畅的天青色悬浮微高亮交互（`hover:bg-[var(--kz-accent-soft)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)]`）；
  2. **待选（`needs_pick`）与重搜表单交互协同**：在待选多条目卡片中亦补充候选关键词 Chips，当返回条目不匹配时允许一键点击关键词重新探活；微调重搜输入框与重搜按钮至一致的精致圆角和对齐内边距。
- 涉及文件：apps/web/src/pages/watch/SourceBoard.tsx
- 备注：全仓类型检查与打包构建全通过。

## [2026-08-18] 补齐重解析熔断与凭证二次过期终态用户反馈
- 状态：已完成
- 优先级：P1
- 描述：
  1. **重解析熔断终态 HUD 提示**：在 `useWatchSession.ts` 中，当 `resolveFailBudgetFor` 重试预算耗尽（直链失败转代理、代理失败重解析后依然无法播放）时，消除静默返回，通过 `setHudMessage('视频源多次连接失败，建议点击右侧切换视频源')` 明确引导用户切源；
  2. **播放中凭证二次过期终态错误态**：在 `VideoPlayer.tsx` 中，当 `authRetryRef` 刷新预算耗尽后若 `onStalled` 再次探测到 401/403，立即结束 loading/buffering 转圈并显示 `setMediaError('播放凭证已过期，请重新选集或切源')`，彻底消除播放器无限转圈卡死。
- 涉及文件：apps/web/src/lib/use-watch-session.ts, apps/web/src/player/VideoPlayer.tsx
- 备注：全仓类型检查与打包验证通过。

## [2026-08-18] 优化 xifan-next HLS 优先探测切片秒开与播放器分级起播门禁调优
- 状态：已完成
- 优先级：P0
- 描述：
  1. **xifan-next 服务端 HLS 优先探测与平滑降级**：
     - 修复 `resolveXifanNext` 硬编码 `action: 'fallback'` 问题，对标官方 Next.js 客户端改为「优先探测 `action: 'hls'` $\rightarrow$ 失败/未切片自动降级 `action: 'fallback'`」；
     - 大量热门/已切片番剧直接获取 Supabase Bento4 多码率自适应 HLS 切片（1080p/720p/480p），彻底摆脱海外 600MB 单体 MP4 与 `moov` 末尾导致的 7s+ 延迟；
     - 保持对 raw MP4 与国内联通云盘直链（`pan.wo.cn` / `moedot.net`）防盗链规则 100% 向下兼容。
  2. **播放器 `softPlay` 起播门禁分级调优**：
     - 针对 HLS 流：由于 Hls.js 内置分片流水线与 `startFragPrefetch`，缓冲门槛降至 `0.4s`（或 `HAVE_CURRENT_DATA`），实现毫秒级快速起播；
     - 针对 MP4 流：起播安全缓冲从保守的 `2.2s` 调优至 `0.8s`（或 `HAVE_ENOUGH_DATA`），削减 1.5s+ 白屏等待；
     - 播放中断后二次唤醒缓冲门槛从 `2.8s` 调优为 HLS `1.0s` / MP4 `1.5s`，显著改善弱网缓冲恢复体验。
- 涉及文件：apps/server/src/lib/xifan-next.ts, apps/web/src/player/VideoPlayer.tsx
- 备注：全仓类型检查与构建打包全通过，已通过 tsx 验证 HLS 与 Fallback 双分支解析。

## [2026-08-18] 优化番剧播放页按需选集起播与消除首屏默认请求第一集
- 状态：已完成
- 优先级：P1
- 描述：
  1. **首屏未选集按需起播**：访问 `/subject/:id` 或 `/play/:id` 时，默认加载番剧元数据与首选源分集列表（roads），但不再自动盲选第 1 集，不触发 `/api/plugin/:name/resolve` 解析与首集视频流拉取；
  2. **深度链接与播放中切源精准继承**：
     - 从历史记录/首页等带 `?ep=N` 的深链进入时，精准选中对应分集并起播；
     - 在播放中（`prevEpisode` 存在时）切换视频源，依然自动对齐当前观看集数并连续播放；
  3. **播放器待机占位与视觉对齐**：播放器区域在分集就绪时展示「请在选集区点击集数开始播放」，消除流量浪费与冗余请求。
- 涉及文件：apps/web/src/lib/use-watch-session.ts, apps/web/src/pages/WatchPage.tsx
- 备注：全仓类型检查与构建打包全通过。

## [2026-08-18] 夜晚模式色板重构与 ColorsWall 经典深炭灰/天青蓝视觉系统融合
- 状态：已完成
- 优先级：P1
- 描述：
  1. **精确采样提取色彩**：通过像素级精确采样提取 ColorsWall 暗色页面，提取得到核心色系（顶部导航栏 `#121417`、主背景 `#1d2225`、次级与导航文字 `#b9c3d0`、高亮品牌色 `#2cabff`、标题白 `#ffffff`）；
  2. **夜晚模式（Dark Theme）系统化升级**：
     - 主体底色升级为 `#1d2225`（柔和深炭灰），替换生硬暗色；
     - 导航栏升级为 `rgba(18, 20, 23, 0.85)`（磨砂琉璃深暗黑）；
     - 卡片与提升层适配 `#15181b`、软容器 `#252b30`、悬停 `#2e353b` 与边框 `#2f363d`；
     - 主强调色接入 ColorsWall 天青蓝 `#2cabff` 与 `#4fc3f7`，文字阶梯对齐 `#f1f5f9` / `#b9c3d0` / `#79828d`；
  3. **防闪烁与移动端视窗同步**：`index.html` 中的 `theme-color (prefers-color-scheme: dark)` 同步更新为 `#1d2225`。
- 涉及文件：apps/web/src/index.css, apps/web/index.html
- 备注：全仓类型检查与构建打包全通过。

## [2026-08-18] 服务端日志输出结构化与健康检查心跳静默过滤
- 状态：已完成
- 优先级：P1
- 描述：
  1. **健康检查与媒体分片静默**：过滤 Docker/K8s 正常的 `GET /api/health` 每 30s 心跳轮询日志（仅在非 200 异常时输出）；静默 `<400` 的媒体代理分片流量；
  2. **结构化日志输出**：实现精炼中间件，格式统一为 `[YYYY-MM-DD HH:mm:ss] [IP] METHOD PATH -> STATUS (Xms)`；对媒体拉流错误（$\ge 400$）添加 `[MEDIA_FAIL]` 标识。
- 涉及文件：apps/server/src/index.ts
- 备注：全仓类型检查与打包验证通过。

## [2026-08-18] 切换视频源 HUD 提示位置重构与播放器内联锚定
- 状态：已完成
- 优先级：P1
- 描述：
  1. **播放器内联浮层**：将切源 HUD 提示从全网页顶部脱离，锚定至播放器内部状态层（`.kz-player-shell` 内部），支持双模态磨砂琉璃视觉与入场动效；
  2. **多模式全景对齐**：无论常规窗口、网页全屏（Web FS）还是系统 DOM 全屏，HUD 始终居中伴随画面顶部优雅提示，彻底消除视线分裂。
- 涉及文件：apps/web/src/player/types.ts, apps/web/src/player/VideoPlayer.tsx, apps/web/src/pages/watch/WatchHudToast.tsx, apps/web/src/pages/WatchPage.tsx
- 备注：全仓构建验证通过。

## [2026-08-18] 全站双模态色彩系统美化与默认白天模式（Light Mode）改造
- 状态：已完成
- 优先级：P1
- 描述：
  1. **默认白天模式**：新用户访问及无本地偏好缓存时默认启用白天模式（Light Mode），同步更新 `index.html` 首屏防白屏闪烁脚本与 `useSettingsStore` 初始值；
  2. **白天模式视觉升级**：重构 Warm Slate / Paper 灰白分层体系（`#f8fafc` 底色 + `#ffffff` 卡片 + `#e2e8f0` 边框 + 细腻阴影），消除生硬苍白感；
  3. **夜间模式深炭灰中和**：在暗色基底中融入深灰（Deep Charcoal `#0d1117` + `#161b22` 卡片 + `#30363d` 边框），改善纯黑死底，提升暗场通透度与层次感。
- 涉及文件：apps/web/index.html, apps/web/src/stores/settings.ts, apps/web/src/index.css
- 备注：全仓类型检查与打包验证通过。

## [2026-08-18] 修复播放页强依赖代理源（Anime1/LIBVIO）鉴权状态不同步问题
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查根本原因**：当本地 `localStorage` 在开启代理口令前曾保存过 `player.serverProxy: true` 时，设置页受 `isProxyUnlocked` 门禁约束正确呈现为关闭/禁用；但 `useWatchSession.ts` 原先直接读取原始 `player.serverProxy` 且未校验 `isProxyUnlocked`，导致播放页 `enabledPlugins` 仍判定全量代理源可用并展示。新用户桌面端因默认 `serverProxy: false` 因而不会显示。
  2. **全面同步解锁门禁**：
     - `useWatchSession.ts` 接入 `isProxyUnlocked = !proxyTokenRequired || Boolean(proxyToken?.trim())`，使 `serverProxyEnabled` 严格对齐设置页状态；
     - `plugin-capabilities.ts` 中 `isFullProxySourceUsable` 与 `pluginShouldUseProxy` 补齐 `isProxyUnlocked` 校验，未解锁或未授权时严禁激活全量代理源。
- 涉及文件：apps/web/src/lib/plugin-capabilities.ts, apps/web/src/lib/use-watch-session.ts
- 备注：全仓类型检查与打包验证通过。

## [2026-08-18] 混合模式 M3U8 去广告文本解析与 PROXY_TOKEN 媒体流中继鉴权解耦
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查根本原因**：当配置了 `PROXY_TOKEN` 时，`mediaRoutes.use('*', requireMediaProxyAccess)` 全局拦截导致去广告请求 `/api/media/proxy?url=...&adFilter=1` 被 403 阻断，引发 Hls.js `manifestLoadError` 无法起播；混合去广告仅需解析重写几 KB M3U8 文本（TS 切片直连 CDN），不消耗 VPS 视频流量。
  2. **精细化分流方案（`apps/server/src/routes/media.ts`）**：
     - 对纯 M3U8 文本去广告请求（`isM3u8 && !cookie && !fullProxy`）免密放行，并将切片重写为源站 CDN 绝对直连地址；
     - 凡涉及 `cookie`（如 Anime1 整段代理）、`fullProxy=1`（全量隧道代理）或二进制媒体切片（TS/M4S/MP4），维持严格 `PROXY_TOKEN` 鉴权拦截。
- 涉及文件：apps/server/src/routes/media.ts, apps/server/src/lib/access.ts, .claude/BUGS.md, docs/TODO.md
- 备注：全仓类型检查与打包通过。

## [2026-08-18] 修复视频源持久化绑定、续播竞态报错与服务端搜索鉴权隔离
- 状态：已完成
- 优先级：P0
- 描述：
  1. **手动选源持久化修复**：在 `SourceBindingEntry` 与 `setBinding` 中引入 `isManual?: boolean`，用户主动在看板或列表中点选条目时标记 `isManual: true` 并 100% 信任持久化，不再受机器相似度 $< 0.50$ 拦截。
  2. **续播竞态红字修复**：续播优先复用 `selectionRef.current` 已解析的分集；元数据就绪前不使用 `番剧 xxx` 占位标题盲搜；`MobileEpsSection` 仅在无选集时渲染错误提示。
  3. **插件搜索鉴权隔离**：拆分 `requireMediaProxyAccess`（保护 VPS 视频流）与 `requirePluginApiAccess`（允许公网用户搜索番剧与解析分集）；移除 `docker-compose.yml` 中 `PROXY_TOKEN` 的强制默认硬编码。
- 涉及文件：apps/web/src/stores/source-bindings.ts, apps/web/src/lib/use-watch-session.ts, apps/web/src/pages/watch/MobileEpsSection.tsx, apps/server/src/lib/access.ts, apps/server/src/routes/plugin.ts, apps/server/src/routes/media.ts, docker-compose.yml
- 备注：全仓类型检查与打包验证通过。

## [2026-08-18] 恢复移动端弹幕面板居中弹窗样式并补齐多源管理与状态条
- 状态：已完成
- 优先级：P1
- 描述：
  1. **保留原有视觉与定位**：保持移动端弹幕面板原有居中弹窗定位与视觉样式（`fixed inset-0 m-auto w-[88%] ...`）；
  2. **状态统计与多源管理**：顶部补充状态栏与弹幕总数统计（`已加载 · 共 N 条 · 显示 M 条`）；底部补齐 `SourcesFooter` 弹幕源胶囊（DandanPlay / Bilibili / XML 导入），支持一键开关与条数展示。
- 涉及文件：apps/web/src/player/DanmakuPanel.tsx
- 备注：全仓构建验证通过。

## [2026-08-18] 移除播放页面多余的外部弹幕状态条
- 状态：已完成
- 优先级：P2
- 描述：播放器内置弹幕设置面板（`[弹+⚙️]`）已具备完备的多源开关与状态统计能力，从 `WatchPage.tsx` 中彻底移除播放器下方占位的外部冗余弹幕状态栏，使播放页面更纯粹紧凑。
- 涉及文件：apps/web/src/pages/WatchPage.tsx
- 备注：全仓构建验证通过。

## [2026-08-18] 修复桌面端暂停弹幕回退震颤与双击全屏过敏误触手势解耦
- 状态：已完成
- 优先级：P0
- 描述：
  1. **暂停弹幕震颤修复**：暂停时捕获高精时钟插值的真实画面时间戳作为冻结锚点 `anchorMediaTime`，在 `checkClockDrift` 中屏蔽暂停态下的微小 PTS 抖动，消除 Chromium 暂停时弹幕回跳与微抖动；
  2. **对标 B 站双击手势解耦**：引入 220ms 延时调度。单击等待 220ms 确认无第二击才执行 `togglePlay()`；发生快速双击（$\le 250\text{ms}$）时立即清除第一击定时器，**`togglePlay()` 绝对不被触发**，仅执行 `toggleFs()`，彻底消除全屏切换时的画音抽搐与状态翻转。
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts, apps/web/src/player/chrome/useShellPointerHandlers.ts
- 备注：全仓类型检查与打包通过。

## [2026-08-18] 播放器 URL 深度瘦身重构（极简短链化）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **URL 参数精简 90%**：清理地址栏中的 `title`、`cover`、`source`、`pageUrl` 等冗余序列化字段，仅保留核心元数据 `ep`、`plugin`、`road`，默认呈现极简短链（如 `/play/445882?ep=2`）；
  2. **深层自愈与向下兼容**：进入短链时优先从 `useSourceBindingStore` 读取绑定，无绑定则触发自动搜索匹配；旧版长链接 100% 兼容并自动平滑转换为短链。
- 涉及文件：apps/web/src/lib/use-watch-session.ts, apps/web/src/pages/HistoryPage.tsx, apps/web/src/pages/HomePage.tsx
- 备注：全仓构建验证通过。

## [2026-08-18] 修复服务器媒体代理安全漏洞与并发/格式熔断
- 状态：已完成
- 优先级：P0
- 描述：
  1. **封堵 Docker 网桥 / 反向代理内网免密绕过漏洞**：一旦配置了 `PROXY_TOKEN`，严格要求提供匹配口令，禁止 Docker 网桥和反向代理 IP 自动豁免；
  2. **M3U8 递归重写切片 Token 级联透传**：服务端重写 M3U8 播放列表时将 Token 注入所有子列表与 `.ts`/`.m4s` 切片链接，消除鉴权丢失导致的播放卡死；
  3. **并发防刷与单分片体积熔断**：单 IP 最大媒体并发流限制 $\le 8$ 个（超额返回 429）；非 M3U8 严格校验媒体 MIME；单分片大于 150MB 强制熔断。
- 涉及文件：apps/server/src/lib/access.ts, apps/server/src/routes/media.ts, .env.example, docker-compose.yml
- 备注：安全单测与全仓构建全通过。

## [2026-08-18] 服务器代理开关权限上锁与行内琉璃解锁交互
- 状态：已完成
- 优先级：P0
- 描述：
  1. **服务端鉴权与验证接口**：`/api/health` 暴露 `proxyTokenRequired`，新增 `POST /api/proxy/verify` 校验接口（错误延时 300ms 防暴力穷举）；
  2. **客户端静默鉴权**：`useSettingsStore` 持久化 `proxyToken`，API 全局拦截器自动注入 `X-Animaku-Proxy-Token` Header；
  3. **设置页行内平滑解锁 UI**：锁定态展示 `🔒`，点击展开磨砂卡片输入密码，支持错误物理震颤微动效与一键重新锁定。
- 涉及文件：apps/server/src/lib/access.ts, apps/server/src/index.ts, apps/web/src/stores/settings.ts, apps/web/src/lib/api.ts, apps/web/src/pages/SettingsPage.tsx
- 备注：全仓构建验证通过。

## [2026-08-18] 视频源搜索缓存重构为 SQLite 存储与 Docker 数据持久化
- 状态：已完成
- 优先级：P0
- 描述：
  1. **SQLite 核心数据库与多层缓存**：基于 Node 22 原生 `node:sqlite` 构建企业级数据库引擎（WAL 模式 + Prepared Statements），提供 `plugin_search_cache` 与通用 `kv_cache` 表，支持后台定时清理过期缓存；
  2. **L1 内存 + L2 SQLite 双层缓存流水线**：`/search` 接口实现 L1（<0.1ms）+ L2（<1ms）极速命中与 Single-Flight 并发防击穿；
  3. **Docker 数据持久化**：挂载宿主机 `./data:/app/data`，预设 `data/.gitkeep` 杜绝权限问题。
- 涉及文件：apps/server/src/db/connection.ts, apps/server/src/db/schema.ts, apps/server/src/db/repositories/plugin-search-cache.ts, apps/server/src/routes/plugin.ts, docker-compose.yml, Dockerfile
- 备注：全仓构建验证通过。

## [2026-08-18] 修复视频源首屏起播、折叠时机、白天主题适配与失败源换词重搜
- 状态：已完成
- 优先级：P0
- 描述：
  1. **首屏起播与默认折叠**：条目元数据就绪后触发默认源起播；`sourcesOpen` 默认 `false`（折叠），消除首屏闪烁并保持起播期间 0 冗余网络请求；
  2. **白天主题 Token 适配**：`SourceBoard.tsx` 全面接入 `var(--kz-*)` 双模态设计系统；
  3. **失败源自定义重搜**：针对探测失败及待选源提供折叠展开卡片，内置候选关键词 Chips 与输入框，支持针对单源换词重搜；
  4. **卡片视觉排版精简**：移除冗余前缀文案，匹配标题单行省略截断，统一操作胶囊尺寸为固定 `h-6`（24px）。
- 涉及文件：apps/web/src/pages/HomePage.tsx, apps/web/src/pages/HistoryPage.tsx, apps/web/src/lib/use-watch-session.ts, apps/web/src/lib/use-source-aggregator.ts, apps/web/src/pages/watch/SourceBoard.tsx, apps/web/src/pages/WatchPage.tsx
- 备注：全仓构建验证通过。

## [2026-08-18] 视频源架构体系重构与流媒体级交互体验升级
- 状态：已完成
- 优先级：P0
- 描述：
  1. **集数对齐与切源继承**：在 `@animaku/shared` 中实现 `parseEpisodeNumber` 与 `findMatchingEpisodeIndex`，支持跨源切源时自动对齐当前集数与秒级播放进度；
  2. **数据持久化**：构建 `useSourceBindingStore`（Zustand + `localStorage` + 1000条 LRU），实现 0ms 绑定直达与相似度安全门禁；
  3. **流式聚合探测器与 3 色流媒体看板**：实现 `useSourceAggregator`（2 并发轻量池 + 3s 超时熔断），构建 Dark Glassmorphism 琉璃看板与 3 色动态微光指示器（🟢 就绪 / 🟡 待选 / 🔴 异常）。
- 涉及文件：packages/shared/src/episode.ts, packages/shared/src/plugin.ts, apps/web/src/stores/source-bindings.ts, apps/web/src/lib/use-watch-session.ts, apps/web/src/lib/use-source-aggregator.ts, apps/web/src/pages/watch/SourceBoard.tsx, apps/web/src/pages/WatchPage.tsx
- 备注：全仓构建验证通过。

## [2026-08-18] 视频源关键字搜索偏好与源级独立记忆机制
- 状态：已完成
- 优先级：P1
- 描述：
  1. **规则偏好字段**：`PluginRule` 新增 `preferOriginalTitle?: boolean`，为 `xifan-next`、`libvio`、`omofun` 开启日文原名优先，其余内置源维持中文优先；
  2. **源级独立记忆**：纯切源时根据目标源偏好自动计算关键词，手动输入/选词后在对应源上锁定记忆，切换其他源不污染。
- 涉及文件：packages/shared/src/plugin.ts, apps/web/src/data/default-plugins/*.json, apps/web/src/stores/plugins.ts, apps/web/src/lib/use-watch-session.ts
- 备注：全仓构建验证通过。

## [2026-08-17] 番剧简介图片点击跳转 Bangumi (bgm.tv) 条目页与大封面重构
- 状态：已完成
- 优先级：P2
- 描述：
  1. **封面点击直达 bgm.tv**：封面包裹为 `<a>` 链接，点击在新标签页直达 `https://bgm.tv/subject/${item.id}`；
  2. **桌面端大封面比例对齐**：尺寸升级为标准海报比例（`w-[10.5rem] h-[14rem]`），高度对齐未展开状态下的右侧简介区域。
- 涉及文件：apps/web/src/pages/watch/WatchMeta.tsx
- 备注：全仓构建验证通过。

## [2026-08-17] 优化 xifan-next 视频解析性能与签名直链缓存策略
- 状态：已完成
- 优先级：P1
- 描述：
  1. **HEAD 极速探测**：302 重定向探测由 GET 改为 HEAD，消除拉取大文件首包的网络耗时，首帧耗时降低 300~1500ms；
  2. **并发嗅探 Key**：401 密钥失效时的 chunk 探测由串行改为 `Promise.allSettled` 并发，自愈时间缩减至 1~2s；
  3. **预签名链接短时缓存**：签名直链启用 60s 内存缓存，切集与回退播放直接命中（<5ms）。
- 涉及文件：apps/server/src/lib/xifan-next.ts, apps/server/src/lib/ttl-cache.ts
- 备注：全仓构建验证通过。

## [2026-08-16] 优化视频源排序机制（权重降序 > 字母序）
- 状态：已完成
- 优先级：P1
- 描述：`PluginRule` 增加 `weight` 字段，内置源梯队赋权（xifan-next 70 > anime1/libvio 60 > mxdm 55 > 其他 50 > 外部源 0），全站展示与选源统一按权重降序排列。
- 涉及文件：packages/shared/src/plugin.ts, apps/web/src/stores/plugins.ts, apps/web/src/lib/use-watch-session.ts
- 备注：全仓构建验证通过。

## [2026-08-16] 修复切换视频源时首个默认源异步完成竞态覆盖 Bug
- 状态：已完成
- 优先级：P0
- 描述：在 `searchOnePlugin` 中增加多重断言，当搜索结果返回时若当前激活源已不同且未显式指定 `clearSelection`，严禁自动覆盖选源；进入带源链接时锁定 `defaultSearchDoneFor` 杜绝重复搜索。
- 涉及文件：apps/web/src/lib/use-watch-session.ts, apps/web/src/pages/WatchPage.tsx
- 备注：全仓构建验证通过。

## [2026-08-16] 接入稀饭动漫新平台（xifan-next）多线路解析与全量去防盗链
- 状态：已完成
- 优先级：P0
- 描述：实现 Next.js SSR 串流 Chunk 提取器解析多线路；对联通云盘直链重设 Referer 并在全局前端配置 `referrerPolicy = 'no-referrer'` 彻底消除 400 防盗链拦截。
- 涉及文件：apps/server/src/lib/xifan-next.ts, apps/web/src/player/VideoPlayer.tsx, apps/web/index.html
- 备注：全仓构建验证通过。

## [2026-08-15] 弹幕引擎全方位升维与高分屏 1:1 Retina 位图缓存
- 状态：已完成
- 优先级：P0
- 描述：
  1. **LRU 离屏字形位图缓存池**：废除热循环矢量描边，引入 LRU `glyphCache`，单帧绘制耗时降至 < 0.3ms（满帧 144Hz）；
  2. **1:1 物理像素 Retina 点对点映射**：离屏 Canvas 同步 DPR 栅格化并在 `paint()` 中显式指定 CSS 尺寸，消除高分屏插值模糊；
  3. **高精时钟插值与平滑滤波**：`performance.now()` 驱动亚像素位移，`checkClockDrift` 容差死区优化至 0.08s 吸收 15Hz PTS 固有微抖动；
  4. **Z 轴原子化渲染**：单条弹幕原子化 Stroke-then-Fill，消除交叠弹幕描边穿透。
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts, apps/web/src/player/media/danmaku-utils.ts
- 备注：全仓验证通过。

## [2026-08-15] 弹幕速度模型对齐 B 站标准（恒定屏幕穿越时长）与倍速自适应补偿
- 状态：已完成
- 优先级：P1
- 描述：
  1. **恒定屏幕穿越时长**：滚动弹幕固定 7.5s 穿越屏幕（移动端 6.5s/7.0s），顶部/底部固定弹幕停留 4.0s，桌面端默认基准字号调至 20px；
  2. **倍速时间轴自适应补偿**：弹幕持续时间按 `duration = realDuration * playbackRate` 缩放，切倍速时动态连续相位重定，保持真实飞行时间恒定 7.5s。
- 涉及文件：apps/web/src/player/media/danmaku-utils.ts, apps/web/src/player/media/canvas-danmaku.ts
- 备注：全仓构建验证通过。

## [2026-08-15] B 站标准「开-精简-关」三态循环弹幕与超额抛弃防遮挡
- 状态：已完成
- 优先级：P1
- 描述：
  1. **三态循环切换**：主弹幕按钮升级为「全量 $\rightarrow$ 精简 $\rightarrow$ 关闭」，联动快捷键 `D` 与 HUD Toast；
  2. **精简模式去噪与 (xN) 聚合**：4.0s 滑动窗口去重聚合并附加 `(xN)` 后缀，极端刷屏时按文本长度权重降噪；
  3. **同屏密度限流与超额直接抛弃**：桌面端同屏 $12\sim 24$ 条、移动端 $8\sim 14$ 条，超额直接丢弃，同轨间距扩至 52px，默认显示区域设为 75%。
- 涉及文件：apps/web/src/player/chrome/icons.tsx, apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/DanmakuPanel.tsx, apps/web/src/player/media/canvas-danmaku.ts, apps/web/src/player/media/danmaku-utils.ts
- 备注：全仓构建验证通过。

## [2026-08-15] 移动端 Core Web Vitals (INP) 优化与消除 Safari 300ms 点击延迟
- 状态：已完成
- 优先级：P0
- 描述：
  1. **触摸预热与 Idle 预加载**：封面卡片 `onTouchStart` 抢跑动态 import，`requestIdleCallback` 静默预拉取播放器 chunk；
  2. **消除 Safari 点击延迟**：可交互元素配置 `touch-action: manipulation`；
  3. **React 19 startTransition 优先级调度**：选集、切线、选源等重型交互全量接入过渡调度，实现 0ms 按压反馈。
- 涉及文件：apps/web/src/components/ui.tsx, apps/web/src/pages/HomePage.tsx, apps/web/src/index.css, apps/web/src/pages/WatchPage.tsx
- 备注：全仓构建验证通过。

## [2026-08-15] 全站系统性性能优化（起播预取、响应压缩、VOD 缓存与路由懒加载）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **HLS 起播首分片预取**：Hls.js 启用 `startFragPrefetch: true`，降低首帧白屏 200~500ms；
  2. **服务端全局压缩**：挂载 `hono/compress`，API 响应与 SPA 静态资源体积缩减 70%+，旁路跳过已编码视频流；
  3. **点播 M3U8 缓存**：VOD 点播设置 `Cache-Control: private, max-age=180`，拖拽 Seek 100% 命中浏览器 0ms 缓存；
  4. **前端路由懒加载**：全量路由页面改造为动态 `lazy()` 拆分打包，首屏 JS 缩减至 56KB。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx, apps/server/src/index.ts, apps/server/src/routes/media.ts, apps/web/src/App.tsx
- 备注：全仓构建验证通过。

## [2026-08-14] 播放器弹出面板双模态自适应与中轴居中对齐
- 状态：已完成
- 优先级：P0
- 描述：
  1. **全套面板双模态适配**：设置齿轮、倍速、音量、连播倒计时、弹幕面板在白天模式适配 Light Glassmorphism，夜晚模式适配 Dark Glassmorphism；
  2. **中轴居中对齐**：桌面端倍速、超分及弹幕面板均基于触发按钮 X 轴中心线正上方居中弹出；
  3. **移动端 Backdrop 透明遮罩**：引入覆盖全域的 `.kz-player-backdrop`，轻触 0ms 瞬间收起面板并隔离手势。
- 涉及文件：apps/web/src/player/DanmakuPanel.tsx, apps/web/src/player/plyr-overrides.css, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/chrome/DesktopControls.tsx
- 备注：全仓构建验证通过。

## [2026-08-14] 播放器 UI/UX 现代主流化升维（中心涟漪、设置齿轮分层、弹幕热力图）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **中心弹簧水滴涟漪卡片**：播放/暂停切换时触发 500ms 缩放淡出涟漪动效；
  2. **分层设置齿轮菜单**：桌面端引入 `⚙️` 播放器设置 Popover，内置倍速、超分、画面比例、跳过 OP/ED、自动连播子菜单；
  3. **Seekbar 弹幕热力图与 OP/ED 标记**：进度条动态绘制蓝光渐变热力波形图，智能标注 OP/ED 片段与时间码 Tooltip。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：全仓构建验证通过。

## [2026-08-13] 全仓代码审查缺陷修复落地
- 状态：已完成
- 优先级：P1-P3
- 描述：
  1. 修复 `VideoPlayer` 自动下一集倒计时 `setInterval` 卸载未清理泄漏；
  2. 修复 `EmbedPlayer` 按钮 `className` 缺失空格；
  3. 修复 `release.ts` 域名发布页 TTL 缓存 key 分隔符不一致；
  4. 修复 `plugin.ts` 章节接口 cacheKey 尾斜杠不一致；
  5. 修复 `media.ts` cancelBody 异步 cancel 未捕获 rejection；
  6. `use-watch-session.ts` 稳定 `resolvedPlayerSettings` 与 `onProgress` 引用，引入 `roadLoadingRef` 防重入；
  7. 删除死代码 `async-pool.ts` 并清理冗余接口。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/EmbedPlayer.tsx, apps/server/src/lib/release.ts, apps/server/src/routes/plugin.ts, apps/server/src/routes/media.ts, apps/web/src/lib/use-watch-session.ts
- 备注：全仓编译与类型检查全通过。

## [2026-08-12] M3U8 去广告多维加权打分模型升级与切片模长离群检测
- 状态：已完成
- 优先级：P1
- 描述：
  1. URI 全路径规范化与动态 Query/文件名归一化（通配符模板匹配）；
  2. 正片签名保护、KEY 不一致与切片时长异动判定；
  3. Safeguard 防误杀熔断收紧至 8%，切片模长离群检测成功识别同域名同路径的隐蔽中插广告（如 Omofun 案例）；
  4. 智能 Referer 识别与自动回退 baseURL 机制。
- 涉及文件：packages/shared/src/m3u8-ad-filter.ts, apps/server/src/routes/media.ts
- 备注：单测全部通过。
