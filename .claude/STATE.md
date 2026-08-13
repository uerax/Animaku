# Animaku 项目状态

## [2026-08-13] 优化移动端下拉弹出位置与高度限制
- 状态：已完成
- 优先级：P1
- 描述：在保持原始最稳健下拉列表的前提下，精细优化弹出体验：
  1. **贴近按钮**：将 `MobileControls.tsx` 中 `barPopupStyle` 的底部间隔 `marginBottom` 从 `8px` 缩紧至 `4px`，使弹出下拉列表紧贴于控制按钮正上方。
  2. **防止高出播放器**：在 `plyr-overrides.css` 中将 `.kz-mobile-bar-menu` 的最高限高由 `14rem` 紧凑约束为 `min(35dvh, 10.5rem)` (~168px)，并微调按键 padding 为 `0.28rem 0.6rem`，使 6 个倍速按键展开时的自然高度仅约 `148px`，顶部保留足量空隙，100% 限制在播放器高度内部展示。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 恢复最原始移动端倍速与音量下拉列表
- 状态：已完成
- 优先级：P1
- 描述：根据反馈，已将移动端倍速播放、超分及音量面板全量恢复为原本最稳健的原始下拉列表形态 (`MobileControls.tsx` 原代码与 `plyr-overrides.css` 原始 CSS 彻底还原)，消除浮窗压缩及黑框 Bug。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 还原移动端倍速单列精简列表与微缩移动端 Header 导航栏
- 状态：已完成
- 优先级：P1
- 描述：
  - **移动端弹幕面板高度 100% 对齐播放器**：将 `.kz-danmaku-panel--mobile` 的定位改回 `position: absolute; inset: 0; width: 100%; height: 100%;`，使弹幕面板在移动端弹出时的高度 100% 精确等于播放器自身的高度，全量覆盖于播放器区域内，彻底杜绝冲顶遮挡页面 Header 导航栏问题。
  - **倍速播放 PopOver 极简缩紧**：倍速 Popover 面板高度限定在 `calc(100% - 44px)` 播放器可用高度内，单行高度 24px/字号 12px，全套选项自然高度仅 ~125px，小巧简约，完美分布于播放器内部高度。
- 涉及文件：apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 还原移动端倍速单列精简列表与微缩移动端 Header 导航栏
- 状态：已完成
- 优先级：P1
- 描述：
  - **倍速单列精简列表**：将倍速面板由网格改回原本的单列纵向排列，单行高度压缩至 32px，去除多余投影并补充 `0.6rem` 底部 padding，彻底消除 `1x ✓` 卡片切边及溢出 Bug。
  - **微缩移动端 Header 导航栏**：移动端 Header 上下 padding 从 8px 缩减至 6px，Logo 尺寸在移动端缩至 28px，导航标签与图标尺寸精简，为移动端播放区释放更多垂直空间。桌面端（`sm:` 断点以上）完全保持原样，零影响。
- 涉及文件：apps/web/src/components/Layout.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 参考主流移动端播放器思路完成呼出面板精细重构
- 状态：已完成
- 优先级：P1
- 描述：
  - **倍速呼出面板极致优化**：重构为 1 行 3 列 (共 2 行) 的大颗粒 Pill 触控网格，倍速面板总高度缩减至 ~130px，从底部升级浮现，上方留有半个屏幕的巨大空白，绝不可能触顶遮挡 Header。
  - **全面板 Header 安全避让边界**：为 `.kz-mobile-sheet` 和 `.kz-danmaku-panel--mobile` 添加了双重防护（`top: max(4.5rem, calc(env(safe-area-inset-top) + 3.8rem))` 及 `max-height`），保证最顶端的 Handle、标题与关闭按钮 `✕` 100% 完整裸露在 Header 导航栏下方。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 修复移动端弹幕面板被顶部 Header 导航栏遮挡问题
- 状态：已完成
- 优先级：P1
- 描述：针对移动端网页在竖屏弹出弹幕面板时顶部 Handle、Tab 选项卡 (“搜索/弹幕/导入/播放”) 与关闭按钮被固顶 Header 导航栏遮挡的问题，在 `.kz-danmaku-panel--mobile` 中添加了明确的顶部安全避让计算（`top: max(4.5rem, calc(env(safe-area-inset-top) + 3.8rem))` 及 `max-height` 适配），并提升层级至 `z-index: 99999`，确保面板最顶端 100% 完整裸露在 Header 下方。
- 涉及文件：apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 全面重构移动端播放器呼出面板系统 (Mobile Action Sheet System)
- 状态：已完成
- 优先级：P1
- 描述：
  - **彻底摒弃桌面端悬浮 Popover 模式**：移动端完全不再使用桌面端的定位 Popover 小窗口，重构为专为移动触控定制的现代底部抽屉面板 (Mobile Bottom Action Sheet)。
  - **移动端倍速抽屉 (MobileSpeedSheet)**：点击倍速时自底部升起高质感面板，双列展示大字号、高识别度的倍速 Pill 气泡卡片 (`2.0x`, `1.5x`, `1.25x`, `1.0x`, `0.75x`, `0.5x`)，点击大颗粒气泡即可切倍速并平滑收起，100% 解决挤小胶囊及遮挡裁切问题。
  - **移动端超分 & 音量抽屉 (MobileSrSheet / MobileVolumeSheet)**：同样重构为专有移动端底部抽屉，包含高能 Mode 卡片与数字高感音量拉条。
  - **移动端弹幕抽屉 (MobileDanmakuSheet)**：将定位升级为页面/全屏级固定 Bottom Sheet，包含大气舒展的控件高度、高辨识度标签与流畅下滑手势体验。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 优化移动端倍速菜单与弹幕面板展示尺寸
- 状态：已完成
- 优先级：P1
- 描述：
  - **倍速菜单遮挡修复**：限制 `.kz-mobile-bar-menu` 容器最大高度为 `min(50%, 10.5rem)`，压缩项间距与 Padding，确保在移动端竖屏/小尺寸播放器内弹出倍速菜单时顶部 `2x` 选项完整展示，绝不突破播放器边缘被 `overflow: hidden` 切除或遮挡。
  - **弹幕面板尺寸与体验升级**：将移动端 `.kz-danmaku-panel--mobile` 底板最大高度上限从 `72%` 提升至 `90%`（短屏 94%）；全面放大 Tab 选项卡（28px → 32px）、输入框/下拉框 (34px → 38px/14px字号)、标签文字 (11px → 12px) 及辅助说明，显著改善移动端触控与可读体验。
- 涉及文件：apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 系统默认安装规则限制不可删除
- 状态：已完成
- 优先级：P2
- 描述：在 `apps/web/src/stores/plugins.ts` 中新增 `isBuiltinPlugin` 工具函数并在 `removePlugin` 中增加二次保护防截断；在 `SettingsPage` 界面上对系统内置/默认规则源（`source === 'builtin'` 或默认规则集规则）隐去「删除」按钮。
- 涉及文件：apps/web/src/stores/plugins.ts, apps/web/src/pages/SettingsPage.tsx
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 移除设置页面已安装规则的测试功能
- 状态：已完成
- 优先级：P2
- 描述：根据用户要求，从设置页面（SettingsPage）移除已安装规则卡片中的「测试」按钮、运行状态提醒、测试结果面板及说明文案，并清理了已无调用的死代码文件 `apps/web/src/lib/plugin-smoke.ts`。
- 涉及文件：apps/web/src/pages/SettingsPage.tsx, apps/web/src/lib/plugin-smoke.ts
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 更新 bangumi-oped 接入 CDN URL 为 @data
- 状态：已完成
- 优先级：P2
- 描述：根据最新 bangumi-oped 数据仓库接入规范，将 jsDelivr CDN 获取 OP/ED 时间戳数据的 URL 基准路径从 `@master` 分支更新为 `@data`（即 `https://cdn.jsdelivr.net/gh/uerax/bangumi-oped@data/<Subject_ID>/<Subject_ID>.txt`）。
- 涉及文件：apps/web/src/lib/bangumi-oped.ts
- 备注：`pnpm typecheck` 验证通过。

## [2026-08-13] 支持拖拽本地视频文件至播放器播放
- 状态：已完成
- 优先级：P2
- 描述：在 VideoPlayer 中增加对本地视频文件（MP4/MKV/WebM/MOV/AVI/FLV 等）拖拽释放的侦听支持。创建 Blob URL 进行本地播放，自动提取无后缀文件名填充至弹幕搜索框方便弹幕配对，并在切换网络源或组件卸载时自动回收 Blob URL 内存。
- 涉及文件：apps/web/src/player/media/format.ts, apps/web/src/player/VideoPlayer.tsx
- 备注：`pnpm typecheck` 全通过。前端轻量响应，对原播放流程零侵入。

## [2026-08-13] 调整 GitHub 标识位置至页面右上角 Header
- 状态：已完成
- 优先级：P2
- 描述：将原置于页脚右下角（SiteFooter）的 GitHub 仓库图标/链接迁移调整至页面顶部导航栏右上角（Header `<ThemeToggleButton />` 旁边），保证在观看页及常规页面中均可在右上角便捷访问。
- 涉及文件：apps/web/src/components/Layout.tsx, apps/web/src/components/SiteFooter.tsx
- 备注：`pnpm typecheck` 全通过。

## [2026-08-13] 修复视频源选中卡片断裂左边框 Bug
- 状态：已完成
- 优先级：P2
- 描述：移除了 `.kz-bili-source--active` 与 `.kz-bili-source--pick` 卡片上内嵌的 `inset 2px 0 0 0` 左侧暗边框内阴影（该边框在包含搜索命中项列表时被截断导致仅显示半条竖线，极其突兀），改为统一完整清爽的外围 Accent 边框与微弱柔和底色。
- 涉及文件：apps/web/src/index.css
- 备注：`pnpm typecheck` 全通过。

## [2026-08-13] 还原 BangumiCard 简约纯粹悬浮体验
- 状态：已完成
- 优先级：P2
- 描述：根据反馈，移除了 `BangumiCard` 悬浮时新增的繁复蓝色 Glow 外框/Ring 边框以及卡片外壳形变位移，还原为原版极简流畅的纯图片微缩放 (`scale(1.04)`) 悬浮体验，解决多卡片悬浮时的视觉繁复感与渲染卡顿。
- 涉及文件：apps/web/src/index.css, apps/web/src/components/ui.tsx
- 备注：`pnpm typecheck` 全通过。

## [2026-08-13] 前端视觉 UI/UX 全面美化与极奢升维
- 状态：已完成
- 优先级：P1
- 描述：
  - **CSS Token 与琉璃 Glassmorphism 优化**：优化深色/浅色配色与 CSS 变量（--kz-bg: #0b0e14, --kz-bg-elevated: #131822 等），新增 `.kz-glass-panel` 琉璃磨砂面板类与 `.kz-active-press` 点击弹簧反馈，升级 `.kz-skeleton` 骨架屏为 135deg 复合流光渐变。
  - **通用 UI 组件升维**：重构 `BangumiCard` 封面 Hover 视差与 Glow 光晕、Score 璀璨金黄徽章（`backdrop-blur-md`）、Air Status 渐变胶囊；美化 `Layout` 顶部 Header 导航栏与 `PageHeader` 文字排版。
  - **播放器 UI 交互增强**：播放器控制条遮罩升级为多阶渐变，Seekbar Thumb 增加亮蓝辉光；控制条倍速/超分/音量等 Popovers 面板引入 `kz-popover-in` 平滑缩入动效 (scale 0.93 -> 1.0)；倒计时 Overlay 重构为高质感磨砂玻璃层。
  - **WatchPage 侧边栏与选集 UX 重构**：优化线路选择 Soft Pill 气泡、在播分集卡片 Equalizer 动态跳音浪与呼吸灯、视频源 Mini Cards 悬浮边框。
  - **时间表与设置视图美化**：`TimelinePage` 周一至周日 Tabs 增加 Pill 高亮滑动感与“TODAY”今日闪耀 Dot；`SettingsPage` 重构为 macOS/iOS 风格分组 Container。
- 涉及文件：apps/web/src/index.css, apps/web/src/player/plyr-overrides.css, apps/web/src/components/ui.tsx, apps/web/src/components/Layout.tsx, apps/web/src/pages/watch/MobileEpsSection.tsx, apps/web/src/pages/watch/WatchMeta.tsx, apps/web/src/pages/TimelinePage.tsx, apps/web/src/pages/SettingsPage.tsx
- 备注：`pnpm typecheck` 验证 0 错误，工作区 `packages/shared`、`apps/server`、`apps/web` 均通过编译。


## [2026-08-13] 播放器控制条视觉与交互统一重构
- 状态：已完成
- 优先级：P1
- 描述：
  - 重构 SVG 矢量图标：网页全屏图标 IconWebFs 和 IconWebFsExit 替换为现代网页窗口标准的矢图标，并清理内联 width/height。
  - 统一 CSS 视觉 Token：底栏遮罩升级为多阶黑色渐变，按钮 Hover/Active 引入现代亮蓝 (#38bdf8) 胶囊渐变。
  - 动态 Seeking 进度条：平时 4px，Hover/拖拽时平滑延伸至 6px，Thumb 增加亮蓝辉光 feedback。
  - 统一面板系统：桌面与移动端倍速、超分、音量弹窗 100% 统一下沉为暗色磨砂玻璃系统 (backdrop-filter: blur(16px))。
  - 微调桌面/移动端按钮 tooltip 与快捷键提示。
- 涉及文件：apps/web/src/player/chrome/icons.tsx, apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：pnpm typecheck 验证 0 错误，工作区 packages/shared、apps/server、apps/web 均编译通过。

## [2026-08-13] 播放器全屏与网页全屏按钮调整
- 状态：已完成
- 优先级：P2
- 描述：调整控制条按钮顺序与图标样式：将「网页全屏」调至「全屏」按钮之前；移除按钮内的固定文案 `<span>` 标签，改为纯图标按钮展现，并通过鼠标悬停/聚焦 `title` / `aria-label` 提供纯文案提示。
- 涉及文件：apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全通过。

## [2026-08-13] 修复播放页加载中导航离开被拉回播放页的 Bug
- 状态：已完成
- 优先级：P1
- 描述：
  - **根本原因**：用户在播放页加载分集或资源请求中点击导航栏离开，异步请求完成后无组件挂载及路由有效性校验，依然盲目执行 `setParams(q, { replace: true })` 将播放 Query 写入目标页面 URL，引发路由重定向或被拉回播放页。
  - **解决方案**：在 `apps/web/src/lib/use-watch-session.ts` 引入 `mountedRef` 生命周期跟踪及 `isWatchPage` 校验，封装 `safeSetParams` 安全函数。在 `pickSource`、`pickEpisode` 及自动续播完成回调处增加离场判断，若组件已卸载或当前页面不再是播放页则截断后续状态更新与 URL 参数写入。
- 涉及文件：apps/web/src/lib/use-watch-session.ts
- 备注：`pnpm typecheck` 全通过。

## [2026-08-13] 全仓代码审查缺陷修复落地
- 状态：已完成
- 优先级：P1-P3
- 描述：分析并修复了 2026-08-05 全仓审查中记录的真实代码缺陷与泄漏：
  1. `apps/web/src/player/VideoPlayer.tsx`：在 cleanup 增加 `cancelCountdown()` 调用，修复自动下一集倒计时 `setInterval` 组件卸载后残留泄漏的问题；并删除了从未使用的 `onEnded` 属性与其关联 ref。
  2. `apps/web/src/player/EmbedPlayer.tsx`：修复“新窗口打开”按钮 `className` 缺失空格导致 Tailwind 样式失效的问题，补齐 `px-2.5 py-1 text-white` 等正常样式。
  3. `apps/server/src/lib/release.ts`：改造 `CacheEntry` 直接存储 `fetchHour` 字段，解决 `cacheKey` 使用 `:` 但 `cacheGet` 用 `split('|')` 导致 `fetchHour` 无法解析固定回退 2 小时的 Bug。
  4. `apps/server/src/routes/plugin.ts`：将 `/chapters` 路由中传递给 `chaptersWithRule` 的参数统一修正为去除尾斜杠后的 `source` 变量，与 Cache Key 保持一致。
  5. `apps/server/src/routes/media.ts`：在 `cancelBody` 中为 `res?.body?.cancel()` 添加 `.catch(() => {})`，防止上游连接断开时产生 unhandledRejection。
  6. `apps/web/src/lib/use-watch-session.ts`：用 `useMemo` 稳定 `resolvedPlayerSettings` 引用；用 `useCallback` 稳定 `onProgress` 闭包；并用 `roadLoadingRef` 替代组件 state 锁解决 `pickSource` 快速连击防重入绕过的问题。
  7. 清理死代码：移除了全仓无任何调用的 `apps/web/src/lib/async-pool.ts` 死代码文件。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/EmbedPlayer.tsx, apps/server/src/lib/release.ts, apps/server/src/routes/plugin.ts, apps/server/src/routes/media.ts, apps/web/src/lib/use-watch-session.ts, apps/web/src/player/types.ts
- 备注：`pnpm typecheck` 全通过。所有修改已同步更新至 `.claude/BUGS.md` 与 `.claude/STATE.md`。

## [2026-08-12] 修复 LIBVIO 旧客户端/浏览器缓存规则 403 无法自动更新
- 状态：已完成
- 优先级：P1
- 描述：分析 LIBVIO 403 原因及 Safari/Chrome 表现差异。
  - **根本原因**：LIBVIO 源站针对 `/index.php/ajax/suggest` 接口开启了 WAF 拦截（返回 403），8-05 虽然已将内置 `libvio.json` 改为静态 HTML 搜索（`searchMode: xpath`），但未递增 `PLUGIN_DEFAULTS_VERSION`，且 `plugins.ts` 的 `ensureDefaults()` 迁移逻辑仅更新 `adBlocker` 和 `proxy` 标志，未将新规则定义覆盖至已缓存的内置规则。导致之前在本地保存过旧规则的浏览器（如 Safari）持续发送 API 模式规则，报 403 错误。
  - **解决方案**：
    1. `apps/web/src/stores/plugins.ts`：递增 `PLUGIN_DEFAULTS_VERSION` 至 12。
    2. 重构 `ensureDefaults()` 的内置规则同步逻辑：当 `defaultsVersion` 提升时，对 `source: 'builtin'` 的规则更新全量规则定义（如 `searchMode`、`searchURL` 等），同时保留用户自定义的 `enabled`/`adBlocker`/`proxy` 偏好设置。
    3. 补充 `libvio` 至 `legacyBuiltinNames` 集合。
    4. 更新 `apps/web/src/data/default-plugins/index.ts` 中的注释。
- 涉及文件：apps/web/src/stores/plugins.ts, apps/web/src/data/default-plugins/index.ts
- 备注：`pnpm typecheck` 全通过。用户在 Safari 下无需手动清除 localStorage 即可自动升级为最新 XPath 搜索规则。

## [2026-08-12] M3U8 去广告算法多维打分模型升级

- 状态：已完成
- 优先级：P1
- 描述：升级 `packages/shared/src/m3u8-ad-filter.ts` 中的 `filterAds` 算法，从硬编码二元规则迁移至多维度加权打分模型。
  - **核心改进**：
    1. **URI 全路径规范化**：修改 `parseOriginAndDir` 精确提取完整的 URL 目录路径（包含深层子路径），提升地理位置特征区分度。
    2. **动态 Query 与文件名归一化（`normalizeUriForSignature`）**：去除 URI 中的 Query 参数（如 `token`, `t`, `sign`）并将数字和哈希换为通配符，能有效召回带动态随机参数的同款广告模板。
    3. **正片签名保护与异构重复判定**：提取全片累积时长最大的 `mainSig`，仅对非正片主签名的重复短组计算 `isRepeatedSig`，避免误将正片转码分组判为广告。
    4. **KEY 不一致与切片时长异动判定**：整合 `#EXT-X-KEY`（加密与未加密/密钥更换）及切片偏离均值的异常程度。
    5. **多维打分引擎与收紧 Safeguard**：综合计算 Location、Signature、Key 突变、时长偏离等风险得分；结合真实场景（24-25 min 视频中广告一般 <= 1 min），将 Safeguard 防误杀熔断保护阈值从原 35% 严格收紧至 8% (2/25)，并收紧短组时长阈值（<= 90s/60s）。
    6. **切片模长离群检测 (`isSegCountAnomaly`)**：成功破解隐蔽同 Host/Path 的形态 B 广告（如 `cnvod.jimxtc.com` 实测案例）。通过分析全片 52 组切片分布，自动捕获偏离主导转码模数（如 5/10/15 切片/组）的孤立插播短组（如 2/3/4 切片/组），经 ffprobe 探查准确判定并切除 34.87s 的 30fps 中插广告（占全片 2.43% < 8%）。
    7. **智能 Referer 识别与自动回退 baseURL 机制**：重构 `apps/server/src/routes/media.ts` 中的 `resolveEffectiveReferer`。规则无显式 `referer` 时自动取 `rule.baseURL` 平台目标域名发给 CDN，插件无需手写 `referer`；仅当客户端 Referer 为本地回环（`localhost` / `127.0.0.1`）且无 `baseURL` 时自动回退伪装为 `target.origin/`。
  - **验证**：单测覆盖跨域名广告（100% 切除）、MXdm 多组同 Location 0 误杀、动态带参广告模板命中切除；全仓 `pnpm typecheck` 通过。
- 涉及文件：packages/shared/src/m3u8-ad-filter.ts

## [2026-08-11] M3U8 去广告算法重构（防误杀与多维度特征识别）

- 状态：已完成
- 优先级：P1
- 描述：基于 MXdm (`cnvod.jimxtc.com`) 和 omofun (`bfikuncdn.com`) 真实 m3u8 数据分析，重构 `packages/shared/src/m3u8-ad-filter.ts` 中的 `filterAds` 去广告算法。
  - **问题根源**：旧算法纯靠 Group 时长硬编码判定（`duration < maxDuration * 0.3`），在 MXdm 等转码切片源（61 个 discontinuity group，全部同一 host / 同一路径）上把 73.3% 的正片错当广告删除。
  - **核心改进**：
    1. **Origin + Directory 路径特征**：按 `(origin, directoryPath)` 维度计算全片主时长的 Content 路径。非主 Content 路径且时长短于 120s 的 group 才标记为广告。
    2. **重复模板检测**：对不同 group 中片段 URI 序列完全相同的重复短 group（如首尾/中途插播的同款广告模板）进行自动标记剔除。
    3. ** Safeguard 熔断**：尝试删除的总时长 > 35% 时触发保护，原样保留播放列表。
  - **验证**：实测 omofun 精准删除 2 组广告（35.3s），保留全部正片；MXdm 61 组全同路径 0 误杀（100% 保留 23.9 min 正片）。`pnpm typecheck` 全项目通过。
- 涉及文件：packages/shared/src/m3u8-ad-filter.ts

## [2026-08-05] 全仓代码审查（bug / 优化 / 设计）

- 状态：审查完成，未改代码（待用户点名要修哪些）
- 优先级：P1-P3 混合
- 描述：对 98 个 TS/TSX 文件做分区域审查（4 子代理 + 亲自逐行核实关键发现 + `pnpm typecheck` 全通过 + git 工作区 clean）。剔除代理误报约 8 条（见备注）。下面仅列经亲自读码确认的发现，按严重度排序。
- 涉及文件：见下方清单
- 经确认的真实发现：
  - **P1-1** `apps/server/src/routes/plugin.ts:102-109` — chapters cache key 用 `source`（去尾斜杠），loader 传 `body.source.trim()`（未去尾斜杠），key 与执行 URL 脱节。建议行 109 改 `chaptersWithRule(rule, source)`。
  - **P1-2** `apps/web/src/player/VideoPlayer.tsx:1171-1228` — src 切换/unmount 的 cleanup 未清理 `countdownIntervalRef`（行 835 创建）。倒计时进行中换源/离开会导致 interval 泄漏，到 0 误触发 `onNextRef`。建议 cleanup 加 `cancelCountdown()`。
  - **P1-3** `apps/web/src/lib/use-watch-session.ts:954-968` — `onProgress` 未 memo，高频 timeupdate→upsertHistory→父重渲染→新闭包→播放器重渲染。建议 useCallback + ref。
  - **P2-1** `use-watch-session.ts:1059-1068` — `resolvedPlayerSettings` 未 useMemo，每次 render 新引用突破播放器 memo。
  - **P2-2** `apps/web/src/lib/async-pool.ts` — `mapPool` Promise.all 并发异常处理不彻底（其余 worker 不取消）；且全仓无调用方（死代码）。
  - **P2-3** `apps/server/src/routes/bangumi.ts:202,271` — search/subject 用 cacheGet+cacheSet 非 single-flight（plugin 路由已用 cacheGetOrSet）。高并发 stampede 风险（低）。
  - **P2-4** `apps/server/src/routes/media.ts:51-57` — `cancelBody` 的 `void res?.body?.cancel()` 未 catch，reject 成 unhandledRejection（全局兜底）。建议 `.catch(()=>{})`。
  - **P2-5** `apps/server/src/routes/media.ts:267-289` — body 流阶段无超时（connectTimeoutSignal 在 headers 后 clear）。慢 body 可挂起。
  - **P2-6** `apps/web/src/pages/CollectPage.tsx:46` — 硬编码 limit=50 无分页，收藏 >50 看不全。
  - **P2-7** `apps/web/src/player/EmbedPlayer.tsx:53` — className `bg-[var(--kz-accent)]hover:...` 缺空格，Tailwind 当成单类名 → "新窗口打开"按钮无背景/圆角/hover（对照行 44 正确写法）。真实 UI 缺陷。
  - **P2-8** `apps/server/src/lib/anime1.ts:461` — resolve 用原生 fetch 而非 fetchPublic，绕过 SSRF/重定向逐跳检查（URL 是硬编码常量，风险低，但与全仓不一致）。
  - **P3-1** `debounced-storage.ts:25-30` — pagehide/visibilitychange 每实例注册一次（现 2 实例）。
  - **P3-2** `SiteFooter.tsx:66` — 无 React.memo，`getSiteBranding()` 每次渲染调用（可移模块级）。
  - **P3-3** `default-plugins/*.json`（除 Anime1/libvio）缺显式 `requiresFullMediaProxy:false`，靠 name/baseURL 字符串回退。
  - **P3-4** `packages/shared/src/plugin.ts:425` — `type` 字段不校验，libvio `"type":"release"` 无 release 块，字段仅展示用易误导。
  - **P3-5** `useWatchLayoutMode.ts:24-25` — effect 内 apply() 冗余（同值不重渲染，无害）。
  - **P3-6** `format.ts:4` — isM3u8 条件冗余（`.m3u8` 被 `m3u8` 涵盖，可简化）。
  - **P3-7** `HistoryPage.tsx:53` — `cover: h.cover||''` 空值塞进 URLSearchParams（URL 不优雅，非 bug）。
  - **P3-8** `roads-cache.ts:96-101` — Object.keys 不反映 LRU（覆盖旧 key 位置不变），当前源受 `k!==sourceUrl` 保护，影响小。
  - **P3-9** `VideoPlayer.tsx:835-845` — 倒计时 interval 与"立即播放"按钮在 tick 恰好已入队的极窄窗口可能重复触发 onNextRef（概率极低，建议加 called flag 防护）。
  - **设计建议**：缓存层（ttl-cache 与 release.ts 自带 Map）可收敛；错误响应格式不统一（{error,message} vs {ok:false,message}，注意 api.ts 已定义 ApiErrorBody 但路由未全用）；player_aaaa resolve 串行两段超时可 Promise.allSettled 并行；vite manualChunks 用字符串匹配 pnpm 路径较脆。
  - **P2-9** `apps/server/src/lib/release.ts:34` — cacheGet 用 `key.split('|')[1]` 反推 fetchHour，但 cacheKey 格式是 `${pageUrl}:${fetchHour}:${domainIndex}`（用 `:` 分隔，行 109/121）。split 分隔符不匹配 → fetchHour 永远回退默认 2，用户配的 fetchHour（如 12h）在 TTL 判断时被忽略。且 CacheEntry（行 22-25）只存 url+fetchedAt 没存 fetchHour。正确修复：CacheEntry 加 fetchHour 字段，cacheSet 时存入，cacheGet 直接读 entry.fetchHour。当前无内置插件带 release 块（libvio 的 `"type":"release"` 是孤立字段无 release 配置），仅影响自定义 release 规则。
  - **P3-10** `apps/web/src/main.tsx` 未显式 import `./lib/bangumi-image-host`（副作用：setBangumiImageHost）。当前靠 App.tsx→Layout→settings.ts 传递触发，时序上正确但脆弱（依赖 import 顺序）。建议 main.tsx 顶部显式 import。
  - **P3-11** `packages/shared/src/plugin.ts:425` + 各 JSON — `api`/`type` 字段 rule-engine 从不读取（grep 确认无 `.api`/`rule.type` 引用），纯遗留兼容。libvio `"type":"release"` 是孤立字段（无 release 块），`isReleaseRule` 返回 false，字段误导维护者。
  - **P2-10** `apps/web/src/player/media/canvas-danmaku.ts:533-541` — seek 到密集段时，`trySpawn(p,retro=true)` 车道满返回 false 仍 `cursor++` 跳过，该弹幕永久丢失显示机会。属弹幕引擎取舍（优先保当前可见性而非补全历史），影响有限，可选优化。
  - **P3-12（死接口）** `apps/web/src/player/types.ts` VideoPlayerProps.onEnded — WatchPage 从未传 onEnded（行 205-212 只传 onProgress/onPrev/onNext/onMediaAuthExpired/onMediaLoadFailed），onEndedRef.current 恒 undefined。代理 P0-1/P1-3 称"autoNext 不调 onEnded 致历史不存"系误报：历史走 onProgress（timeupdate 高频），不依赖 onEnded。onEnded 是冗余字段，可清理。
  - **P3-13** canvas-danmaku `durationFor`（行 485）用 `settings.speed`（弹幕速度倍率），不含视频 `playbackRate`。2x 播放时弹幕 age 增长 2x 但 duration 不缩放 → 车道更易满 → 丢弹幕。属设计取舍（弹幕速度独立于视频倍速），非 bug，改它需重定义速度语义。
  - **P2-11** `apps/web/src/lib/use-watch-session.ts` `pickSource`（行 445）用 `roadLoading` state 做重入判断，state 在 async 闭包里是快照值，快速双击同源可能并发两次 chapters 请求（第二次 abort 第一次）。建议改用 ref 跟踪进行中状态。
- 已知非 bug（无需修）：m3u8-ad-filter 对"同 host 57-group 无 DISCONTINUITY 广告"无法识别——设计限制，STATE 07-03 已记录。`parseBangumiInfoMeta`/`estimateAirProgress`/`dateToWeekday` 等解析均健壮（含 NaN/空值守卫）。`bangumiImageUrl` host 改写幂等（REWRITABLE_HOSTS 集合 + currentHost 判断）。`preferResizedCover` 已修（已有 /r/N/ 也换 host）。
- 已剔除的代理误报：media.ts cookie 分支非死代码；release.ts pageUrl 含 `|` 臆测（但 release.ts:34 的 split('|') vs key 用 ':' 是真实 bug，见 P2-9）；useWatchLayoutMode 首屏闪烁不存在；anime1 fetch 判 P0 SSRF 偏重；bangumi single-flight 判 P0 偏重；isPrivateHost 重复检查是防御深度。
- 备注：共享包/构建配置子代理（ad42fd3c）多次催促未返回报告，已停掉，该区域由本人独立核实补全（plugin.ts 校验、m3u8-ad-filter、bangumi.ts/bangumi-image.ts/history.ts/danmaku.ts/player.ts/api.ts、default-plugins 全部 JSON、Dockerfile/vite.config/docker-compose/env/tsconfig）。typecheck 全通过。

## [2026-08-05] LIBVIO 搜索：api(suggest) → 静态 html 搜索

- 状态：已完成
- 优先级：P1
- 描述：`www.libvio.in` 的 `searchApiConfig` 接口 `/index.php/ajax/suggest` 被站点 WAF 拦截（所有姿态返回 `Blocked by WAF rule`，响应 403，x-frame-options: DENY）。改为走 MacCMS/stui 静态搜索页 `/search/-------------.html?wd=@keyword`，XPath 解析 `div.stui-vodlist__box > h4 > a`。实测可解析 6 条结果。
- 涉及文件：apps/web/src/data/default-plugins/libvio.json
- 备注：
  - 改：searchURL/searchList/searchName/searchResult 填实；searchMode api→xpath（删 searchApiConfig）；referer 改 @baseURL
  - searchMode 只有 'xpath' | 'api' 两种值（为 'html' 时 plugin.ts 解析为 xpath，兜底同义，已直接写 xpath）
  - 验证：curl 抓 libvio.in 搜索页 + cheerio→xml→xpath 全链路解析出 6 条；server tsc 通过
  - baseURL 已由库主手动改为 www.libvio.in（release 未删，但搜索走静态走后端完整代理，watched）
  - 遗留：VARNAME="sites" 配错、release 无换线遍历 —— 未做，避免破坏当前可用状态
  - 【2026-08-05 修复】"源站 无效"：xpath/html 搜索的 searchURL 不做 @baseURL 展开（只有 api 模式的 executeApiRequest 会展开），之前写的 @baseURL/search/... 会保留字面量导致 assertPublicHttpUrl 抛"源站 URL 无效"。已改为字面量 https://www.libvio.in/... 全链路复现验证通过
  - 【2026-08-05 修复2】统一 xpath/html 搜索的 @baseURL 展开：index.ts searchWithRule 的 xpath 分支新增安全 replacer（rule.baseURL 去尾斜杠），与 api.ts 行为一致。此后 xpath 搜索的 searchURL 可用 @baseURL，libvio.json 的 searchURL 已改回 @baseURL 形态。验证：展开→校验→解析 6 条全通；server tsc 通过

## [2026-08-03] M3U8 去广告算法分析

- 状态：分析完成，待实现
- 优先级：P1
- 描述：对 tmp/ 下 9 个 m3u8 采样文件做了完整分析，发现两个源有两种截然不同的 playlist 结构：

### 数据源
| 文件 | 来源 | Groups | Segs | 总时长 |
|------|------|--------|------|--------|
| omofun-1.txt | bfikuncdn.com（实时拉取） | 4 | 485 | ~24min |
| omofuns.txt | OMOFUN（旧） | 57 | 359 | ~24min |
| mxdm.txt | MXDM（旧） | 4 | 485 | ~24min |
| mxdm-1.txt | jimxtc.com（实时拉取） | 57 | 359 | ~24min |

### 类型 A：明朗模式（4-group）
- 结构：正片(host A) → 广告(host B 或相对路径) → 正片(host A) → 广告(host B)
- 广告 group 特征：不同 host，时长短（~17.6s），出现两次（G1==G3 重复）
- 实例：omofun-1.txt（G0/G2 在 bfikuncdn.com，G1/G3 用相对路径 /10128kb/hls）、mxdm.txt（G0/G2 在 kkzycdn.com，G1/G3 用相对路径 /FxLgovfH）
- ✅ 可通过 host 变化 + 重复检测精确过滤

### 类型 B — 深度隐藏模式（57-group）
- 结构：57 个 group，45 个为 5-seg 固定分块，少数 10/15/20-seg group
- 所有 segment 在同一 host，相同 duration 范围（4–7s），无 host 差异
- 广告 < 80s 隐藏在 24min 全长中，无法通过 m3u8 静态分析区分
- ❌ 当前无法识别。5 次独立拉取（间隔数分钟）diff 全部一致，广告无轮换

### 关键结论
1. 同一个视频在不同时间请求可能返回不同结构（4-group vs 57-group）
2. 不能按平台区分 → 需要自适应检测（host 差异 / 无差异二选一）
3. 类型 B（广告和第到 5-seg 块中）需要外部数据（多次轮换 diff、base-media、编码器识别等）才能真正解决

## [2026-08-02] auto-next 倒计时覆盖层

- 状态：已完成
- 优先级：P2
- 描述：
  - 自动下一集不再立即跳转，改为 5 秒倒计时覆盖层（"下一集 N"）
  - 覆盖层有"立即播放"（立即跳转）和"取消"（停止倒计时）按钮
  - 用户拖动进度条自动取消倒计时（onSeeking 时 cancelCountdown）
  - 纯 VideoPlayer 内部实现，无需改动 WatchPage / use-watch-session
- 涉及文件：
  - apps/web/src/player/VideoPlayer.tsx — countdown state/ref、cancelCountdown/doNext 辅助函数、onEndedHandler 改倒计时、onSeeking 取消、覆盖层 JSX
  - apps/web/src/player/plyr-overrides.css — kz-countdown-layer/overlay/info/btn 样式（z-index: 7，半透明黑底）
- 备注：web typecheck 通过

## [2026-08-02] bangumi-oped 片头片尾跳过：默认关闭 + 面板开关 + 时长校验

- 状态：已完成
- 优先级：P2
- 描述：
  - `preferBangumiOped` 默认值从 `true` 改为 `false`
  - 弹幕面板新增「其他」tab，提供播放器内开关
  - Bangumi episodes API 接入 `duration_seconds` 字段校验集数时长
  - OP/ED 时间戳超过实际时长 4 秒以上时回退到手动设置
- 涉及文件：
  - packages/shared/src/player.ts — preferBangumiOped 默认 false
  - packages/shared/src/bangumi.ts — BangumiEpisode 加 duration_seconds
  - apps/server/src/routes/bangumi.ts — episodes 端点透传 duration_seconds
  - apps/web/src/lib/bangumi-oped.ts — useBangumiEpisodesDuration hook + 4s 校验阈值
  - apps/web/src/lib/use-watch-session.ts — 接入 episodes duration + useResolvedOpedSkip 传参
  - apps/web/src/player/DanmakuPanel.tsx — 新增「其他」tab + OtherSettingsTab 组件
  - apps/web/src/player/VideoPlayer.tsx — 透传 preferBangumiOped 给面板
  - apps/web/src/pages/SettingsPage.tsx — 文案「默认开启」→「默认关闭」
- 备注：web/server/shared typecheck 全通过；弹幕面板「设置」tab 改名弹幕以区分；开关与设置页同步

## [2026-08-02] bangumi-oped 片头片尾自动跳过接入

- 状态：已完成
- 优先级：P2
- 描述：接入 bangumi-oped 项目数据，按 Bangumi Subject ID + 集数获取精确 OP/ED 时间戳，覆盖手动 skipOp/skipEd 设置。纯客户端实现，通过 jsDelivr CDN 获取 GitHub 原始文件。默认开启（`preferBangumiOped: true`），无数据时静默回退到手动设置。
- 涉及文件：
  - apps/web/src/lib/bangumi-oped.ts（新）— 解析/获取/hooks
  - packages/shared/src/player.ts — PlayerSettings 加 preferBangumiOped 字段
  - apps/web/src/lib/use-watch-session.ts — 集成 useBangumiOpedData + useResolvedOpedSkip
  - apps/web/src/pages/SettingsPage.tsx — 设置页 toggle
  - apps/web/src/stores/settings.ts — mergePlayer 补 preferBangumiOped
- 备注：web/server/shared typecheck 全通过；CDN URL 已切换为 jsdelivr.net（国内友好）；VideoPlayer 未改（playerRef sync 驱动）

## [2026-08-01] review 修复 slider onBlur 抢焦点回归

- 状态：已完成
- 优先级：P1
- 描述：`releaseSliderFocus` 用 `document.activeElement` + `onBlur`，但 React 17+ 合成 blur 触发时 activeElement 已是新焦点元素（如弹幕面板筛选输入框）→ 会把它 blur 掉，点输入框/Tab 导航都被抢焦点。且 onBlur 对"焦点仍留滑块"场景本无修复作用（焦点一离开 onKey 即恢复）。改为：删掉全部 4 处 onBlur；releaseSliderFocus 只认 `e.currentTarget`（滑块自身）并只挂 onPointerUp。
- 涉及文件：apps/web/src/player/chrome/DesktopControls.tsx、apps/web/src/player/chrome/MobileControls.tsx
- 备注：web typecheck 通过；上一版 onBlur 实现已移除，勿再引入 activeElement 全局判断

## [2026-08-01] review 修复 toggleWebFs unhandled rejection

- 状态：已完成
- 优先级：P2
- 描述：`toggleWebFs` 改 async 后非全屏分支的 `exitDomFullscreen()` 未包 try/catch，DOM 已非全屏时 reject → unhandled promise rejection。已对齐 `togglePlayerFs`/`exitAnyFs` 的写法包上 try/catch。其余按钮状态改动与 slider 失焦改动核对无其它回归。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx
- 备注：web typecheck 通过

## [2026-08-01] 拖进度条/音量后快捷键失效

- 状态：已完成
- 优先级：P1
- 描述：进度条、音量条为 `<input type=range>`，`onKey` 忽略 INPUT/TEXTAREA/SELECT 上的按键。拖动后焦点留在滑块，Space/方向键/f 等快捷键被吞，需点外部失焦才恢复。修复：4 处 range 控件加 `onPointerUp` + `onBlur` → `releaseSliderFocus()`（主动 blur 当前 INPUT/TEXTAREA），拖动结束立即恢复快捷键。
- 涉及文件：apps/web/src/player/chrome/DesktopControls.tsx、apps/web/src/player/chrome/MobileControls.tsx
- 备注：web typecheck 通过；建议手测桌面/移动拖动进度条、音量后按空格/左右键是否立即生效

## [2026-08-01] 修复全屏/网页全屏按钮状态互污染

- 状态：已完成
- 优先级：P1
- 描述：两个全屏按钮状态用 `playerFs || webFs` 判断 → 任意一种全屏生效时，「全屏」按钮误显示为「退出」（反之亦然）。改为全屏按钮只认 `playerFs`（DOM Fullscreen / iOS 原生），网页全屏按钮只认 `webFs`；`toggleWebFs` 在真全屏下点击时退出真全屏并进入网页全屏，两按钮成为可切换的对偶。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx、apps/web/src/player/chrome/DesktopControls.tsx、apps/web/src/player/chrome/MobileControls.tsx
- 备注：web typecheck 通过；建议手测桌面/移动全屏按钮文案随状态正确切换、F 键与双击全屏正常


- 状态：已完成
- 优先级：P2
- 描述：域名仅保留在运行所需配置/常量中；注释和文档不重复展示镜像域名；设置项显示为「镜像」与「Bangumi」。
- 涉及文件：封面源相关 shared/web/config/docs 文件
- 备注：web typecheck 与 git diff --check 通过；Markdown 和示例配置中已无图片源域名

## [2026-07-29] 修复刷新后封面图片源回退

- 状态：已完成
- 优先级：P1
- 描述：`preferResizedCover` 遇到已有 `/r/{edge}/` 的 URL 时曾直接返回，绕过 `bangumiImageUrl`，导致刷新后缩放封面继续使用旧 host。改为已有缩放路径也执行 host 替换。
- 涉及文件：packages/shared/src/bangumi.ts
- 备注：web typecheck 通过；git diff --check 通过

## [2026-07-29] 封面图片源可切换

- 状态：已完成
- 优先级：P2
- 描述：Bangumi 图片 URL 仅替换 host，保留原 path 和缩放路径。
  - shared 新增图片 host 改写工具，仅改写已知图片源，其它 URL 原样返回
  - `preferResizedCover` 先补 `/r/N/` 再换 host，双向切换幂等
  - 默认源来自构建期 `VITE_BANGUMI_IMAGE_HOST`；设置选择由 settings store 持久化
  - `index.html` preconnect 按构建期默认源注入
  - Home/History 的历史记录封面会按当前设置改写
- 涉及文件：packages/shared/src/bangumi-image.ts（新）、bangumi.ts、index.ts、apps/web/src/lib/bangumi-image-host.ts（新）、stores/settings.ts、pages/SettingsPage.tsx、pages/HomePage.tsx、pages/HistoryPage.tsx、vite.config.ts、vite-env.d.ts、index.html、.env、.env.example、Dockerfile、docker-compose.yml、docs/CONTEXT.md
- 备注：web/server typecheck + web build 通过；两个源的原图与缩放路径均已验证可用；切源后浏览器需重新下载图片（不同域名缓存不共享）

## [2026-07-28] 轻量页取消路由 lazy

- 状态：已完成
- 优先级：P1
- 描述：Home/Anime/Timeline/Search/Collect/History/Settings 改为静态 import，避免导航 RTT。仅 subject/play 保留 lazy + 局部 Suspense。播放器/hls/anime4k 仍按原 lazy。
- 涉及文件：apps/web/src/App.tsx
- 备注：typecheck + build 通过；主 index ~92KB / gzip ~30KB（原 ~49/17）；无独立 HomePage 等小 chunk

## [2026-07-28] 弹幕改为 CDN 头、撤销源站内存缓存

- 状态：已完成
- 优先级：P1
- 描述：撤销 danmaku 进程内 cacheGetOrSet；成功响应设
  `Cache-Control: public, max-age=0, s-maxage=1800` +
  `CDN-Cache-Control` / `Cloudflare-CDN-Cache-Control: max-age=1800`（30min 边缘）。
  `?refresh=1` → no-store。浏览器 max-age=0 不囤大 body。
  **仅改头不够**：CF 默认不缓存 /api，需 Cache Rule 允许这些路径。
- 涉及文件：cdn-cache-headers.ts（新）、routes/danmaku.ts、bilibili-danmaku.ts、ttl-cache 去掉 DANMAKU_*
- 备注：server typecheck 通过；/status 仍无缓存头

## [2026-07-28] 弹幕/Anime4K 延后初始化（A+B）

- 状态：已完成
- 优先级：P1
- 描述：仅 VideoPlayer 热路径时序，不改选源/接口。
  - A：`danmakuMediaReadyRef`；无引擎时需 canplay / HAVE_CURRENT_DATA / noteDanmakuMediaReady 才 `new CanvasDanmaku`；src 切换重置；settings 仍走 ref，就绪后一次 apply
  - B：超分在 metadata 之后若仍 paused，等 `playing`（或 cancel）再 `startAnime4K`；off 不加载；提示「将在开始播放后启动」
- 涉及文件：apps/web/src/player/VideoPlayer.tsx
- 备注：web typecheck 通过；建议手测：开播弹幕出现、开播前改弹幕设置、续播/seek、换集、超分开着暂停首帧再播

## [2026-07-28] P1 CLS 骨架 + 播放器 chunk 预取

- 状态：已完成
- 优先级：P1
- 描述：对照 CWV 报告 CLS/INP；不碰选源/播放业务逻辑。
  1. `BangumiGridSkeleton` + `.kz-skeleton`：与网格同列距/3:4 占位；Home/Anime/Timeline/Search/Collect 加载态替换 LoadingState
  2. Watch 条目加载中：用 `kz-player-placeholder`（已有 16:9）+ meta 骨架，避免 main 从空文案暴涨
  3. `preloadVideoPlayer`：仅 dynamic import，卡片 hover/focus + Watch mount 预拉；不 new Hls/弹幕
- 涉及文件：ui.tsx、index.css、lazy.tsx、HomePage/AnimePage/TimelinePage/SearchPage/CollectPage、WatchPage
- 备注：web typecheck 通过；未改 focusAfterSelection / sourcesOpen / eps 行为

## [2026-07-28] P0 LCP 封面优化（Cloudflare CWV）

- 状态：已完成
- 优先级：P0
- 描述：对照 Cloudflare Web Analytics 报告，LCP Poor 主因是封面加载较晚且原图过大。
  1. `index.html` 添加图片源 preconnect + dns-prefetch
  2. `BangumiGrid` 前 12 张 eager，第 1 张 `fetchPriority=high`，其余 lazy 用 low
  3. `coverOf` 经 `preferResizedCover`：无 `/r/N/` 的 bgm `/pic/` 补 `/r/400`（thumb）或 `/r/800`（large）
  4. WatchMeta 桌面/移动简介图改 thumb，不再 large
- 涉及文件：apps/web/index.html、components/ui.tsx、pages/watch/WatchMeta.tsx、packages/shared/src/bangumi.ts
- 备注：shared/web tsc 通过；未做 CLS 骨架 / 播放器 INP（P1）

## [2026-07-28] SEO 实用层优化（无 SSR）

- 状态：已完成
- 优先级：P2
- 描述：
  1. `index.html` 补 description / robots / theme-color / OG / Twitter 默认；`site.webmanifest` 补 description/lang/start_url
  2. 客户端 `DocumentSeo` + `lib/seo.ts`：按路由 title/description/robots/canonical/OG/JSON-LD；`/subject/:id` 用 Bangumi 元数据；`/play` noindex 且 canonical 到 subject
  3. 服务端 Host 感知 `/robots.txt` + `/sitemap.xml`（`SITE_URL` 或请求 Host）；public 静态副本作 fallback
  4. `VITE_SITE_URL` / `SITE_URL` 写入 .env.example、Docker ARG/compose、README、CONTEXT
- 涉及文件：
  - apps/web：index.html、public/robots.txt、public/sitemap.xml、site.webmanifest、src/lib/seo.ts、components/DocumentSeo.tsx、Layout.tsx、vite-env.d.ts
  - apps/server：index.ts、config.ts、lib/seo-static.ts
  - Dockerfile、docker-compose.yml、.env.example、README.md、docs/CONTEXT.md
- 备注：web/server typecheck 通过；未做 SSR/预渲染；详情页对不执行 JS 的爬虫仍只有壳

## [2026-07-28] PUBLIC_PROXY 默认改为 1

- 状态：已完成
- 优先级：P1
- 描述：公网 VPS 部署实质必须开；默认 0 会导致「能开页不能选源」。`config.publicProxy` 默认 true；compose 已是 :-1；同步 .env.example / README / CONTEXT / access 403 文案 / 设置页展示。
- 涉及文件：apps/server/src/config.ts、lib/access.ts、.env.example、docker-compose.yml、README.md、docs/CONTEXT.md、SettingsPage.tsx
- 备注：MEDIA_FULL_PROXY 仍默认 0；设 PUBLIC_PROXY=0 可收紧为局域网

## [2026-07-28] Docker 部署文件优化

- 状态：已完成
- 优先级：P2
- 描述：
  1. compose：去掉错误 UA 默认 `animaku/0.1`（空则走 config.ts 正式 Bangumi UA）；显式透传 PUBLIC_PROXY / MEDIA_FULL_PROXY / PROXY_TOKEN / CORS_ORIGINS
  2. Dockerfile：修正 $WEB_PORT 注释；runner 只拷 index.js（无 map）；USER node + chown；health start_period 对齐 20s；VITE_* ARG/ENV 构建期注入
  3. compose build.args 透传 VITE_*；.env.example / README 补 Docker 公网与页脚 rebuild 说明
- 涉及文件：Dockerfile、docker-compose.yml、.env.example、README.md
- 备注：未改应用代码；未实测 docker build（环境若无 daemon 需用户本地验证）

## [2026-07-28] README 部署指南：Docker 前置

- 状态：已完成
- 优先级：P3
- 描述：避免用户只看前半段以为必须 pnpm。支持环境把 Docker 标为推荐；快速开始改为 Docker → 本机 Node 生产 → 本地开发；删独立「生产运行」节（内容并入快速开始）；部署 Q&A 把 Docker 404 提前，pnpm 说明改为「仅本机/开发需要」。
- 涉及文件：README.md
- 备注：内容未改命令本身，只调顺序与引导文案

## [2026-07-28] Bangumi API User-Agent 规范

- 状态：已完成
- 优先级：P3
- 描述：非浏览器调 Bangumi 须带「开发者 ID + 应用名」；开源附主页。默认 UA：`uerax/Animaku/0.1.0 (https://github.com/uerax/Animaku)`（项目已改名 Animaku，与 footer branding 一致）。`bangumiFetch` 始终注入。
- 涉及文件：apps/server/src/config.ts、.env.example、.env
- 备注：勿用 database / 仅 Bangumi/x.y；

## [2026-07-28] README 播放页截图

- 状态：已完成
- 优先级：P3
- 描述：将用户提供的播放页截图放入 `docs/screenshots/watch-player.png`，并在 README 居中头图区 logo/徽章/简介之后展示（width=900）。
- 涉及文件：docs/screenshots/watch-player.png、README.md
- 备注：命名 watch-player，与后续可能的 home/timeline 截图统一前缀风格

## [2026-07-28] 线路 tab 横滑修复

- 状态：已完成
- 优先级：P0
- 描述：>5 条线路时同 ep strip：flex min-content 撑开 + panel overflow-hidden 裁切，无法点后排。`.kz-bili-roads` 加 min-width:0 / width:100% / overflow-x:auto + 细滚动条；active 路 `scrollIntoView`。
- 涉及文件：index.css、MobileEpsSection.tsx
- 备注：与选集折叠横滑同根因

## [2026-07-28] 视频源卡现代化

- 状态：已完成
- 优先级：P2
- 描述：去掉大片浅蓝底。源行改为 elevated 小卡（细边框+轻阴影）；当前/待选仅 5–6% accent 淡底 + 2px 左边条；标签改 outline pill（当前非实心蓝块）；首字母 avatar；搜索钮实心 accent；命中行中性字色 + 播放中绿点式 live dot。逻辑未改。
- 涉及文件：index.css、WatchPage.tsx
- 备注：行为钩子不变

## [2026-07-28] 选集展开网格统一 4 列

- 状态：已完成
- 优先级：P2
- 描述：折叠横条约 4 卡观感确认合适；展开网格去掉桌面 3 列，统一 `repeat(4, minmax(0,1fr))`，与折叠密度一致。
- 涉及文件：index.css、MobileEpsSection.tsx
- 备注：行为钩子未改

## [2026-07-28] 选集折叠横滑修复 + 约 4 卡可视

- 状态：已完成
- 优先级：P0
- 描述：折叠条 flex min-content 撑满所有集卡，父 overflow-hidden 裁切 → 无法 overflow-x 滚动、后集不可达。修：strip/body `min-width:0`+`width:100%`+`overflow-x:auto`；卡 `flex-basis: calc((100% - 1.2rem)/4)`；细横滚动条可见。
- 涉及文件：index.css、MobileEpsSection.tsx、plyr-overrides.css
- 备注：展开已统一 4 列

## [2026-07-28] 视频源/选集 bilibili 正片侧栏重设计

- 状态：已完成
- 优先级：P2
- 描述：对照 bangumi play（ss44777）侧栏。共享 `.kz-bili-sec-*` 头栏；源为圆角 soft 行+左边条；关键词输入条。选集 soft pill 线路；横向圆角集卡；在播 accent-soft + 音浪。**未改** focusAfterSelection / sourcesOpen / epsListExpanded / 滚动 class / 4·3 列 / kz-kw 高度 / pick。
- 涉及文件：WatchPage.tsx、MobileEpsSection.tsx、index.css、plyr-overrides.css
- 备注：web tsc 通过；方格版已否决

## [2026-07-28] 首页滚动图片卡顿

- 状态：已完成
- 优先级：P0
- 描述：往下滚封面填充卡顿、往上滚上方图消失再加载。根因：`img { content-visibility: auto }` + `.bangumi-card` 的 content-visibility 滚出视口跳过绘制、滚回重绘；网格还用 `coverOf(..., 'large')` 加重解码。
- 改动：去掉全局/卡片 content-visibility；BangumiCard 改用 thumb（common/medium）；续播小图补 lazy/decoding/尺寸。
- 涉及文件：apps/web/src/index.css、components/ui.tsx、pages/HomePage.tsx
- 备注：未上虚拟列表（24–50 条不必）

## [2026-07-28] 观看页 W1–W3 面板美化

- 状态：已完成
- 优先级：P2
- 描述：简介/视频源/选集套 kz-watch-panel；meta chip（评分/更新至/标签）；源头栏字阶 + 源卡左边条；线路 pill tab；在播集卡 accent-soft；空态 step。**未改** focusAfterSelection / sourcesOpen / epsListExpanded / kz-watch-focus / 桌面 body 滚动 class / 4·3 列密度 / kw 高度 / 集名逻辑。
- 涉及文件：WatchMeta.tsx、MobileEpsSection.tsx、WatchPage.tsx、index.css、plyr-overrides.css
- 备注：web typecheck 通过；行为钩子 checklist 全 OK

## [2026-07-28] 分析 share.acgnx.se 资源接入可行性

- 状态：已完成（分析，未改代码）
- 优先级：P3
- 描述：评估 AcgnX（末日動漫資源庫）能否接入。结论：站点是 BT/magnet 索引，不是流媒体；与现有 Kazumi 插件管线（search→chapters→resolve→m3u8/mp4）模型不兼容。HTML 全站 Cloudflare 挑战；RSS（`/rss.xml?keyword=`、`/rss-N.xml`）可直拉且带 magnet enclosure。若要接，只能做「新表面」：RSS 搜索 + magnet 外抛/复制，不能当内置视频源播放。
- 涉及文件：无代码改动；架构见 packages/shared/src/plugin.ts、rule-engine、docs/CONTEXT.md
- 备注：详见本次对话分析

## [2026-07-28] P0 视觉抛光 1–4

- 状态：已完成
- 优先级：P2
- 描述：字体 Inter（Bunny CDN）+ 中文系统 fallback；深色离开纯黑、浅色暖灰底；kz-surface 阴影层级 + interactive hover；PageHeader 字阶加大、首页区块 kz-section-title、续播卡 surface、空/载/错态套 surface。
- 涉及文件：apps/web/index.html、index.css、components/ui.tsx、pages/HomePage.tsx
- 备注：web typecheck 通过；未引 UI 库；P1 未做

## [2026-07-28] 卡片「更新至N集 / 已完结」

- 状态：已完成
- 优先级：P2
- 描述：Bangumi 无官方播出状态枚举。解析并缓存 `eps`/`totalEpisodes`（v0 字段 + next `info` 的 `N话`/`YYYY年M月D日`）；卡片用首播日按周更估算进度。文案左下角徽章（右下仍为评分）。进度在渲染时算，不把「更新至」冻进 list TTL。
- 涉及文件：packages/shared/src/bangumi.ts、apps/web/src/components/ui.tsx
- 备注：typecheck shared/web/server 通过；不精确于非周更/延期；未接 episodes 精算

## [2026-07-28] 页脚 GitHub + 可配置维护者信息

- 状态：已完成
- 优先级：P2
- 描述：非观看页 SiteFooter — 参考 48.club 单行（产品·©·维护者 | 图标链），去掉免责/数据来源描述；VITE_*；默认 uerax/Animaku。观看页隐藏。
- 涉及文件：SiteFooter.tsx、site-branding.ts、Layout.tsx、vite-env.d.ts、.env.example、README、CONTEXT
- 备注：web typecheck

## [2026-07-28] 缓存小补丁 1+2+3

- 状态：已完成
- 优先级：P2
- 描述：
  1. SearchPage RQ staleTime 30m / gcTime 2h（对齐 browse）
  2. useWatchSession subject RQ staleTime 30m / gcTime 6h
  3. 服务端 GET /subjects/:id 进程内 TTL 6h + X-Cache + refresh 绕过；缓存完整 parseBangumiItem（非 slim）
- 涉及文件：ttl-cache.ts、routes/bangumi.ts、SearchPage.tsx、use-watch-session.ts、docs/CONTEXT.md、docs/TODO.md
- 备注：未做 episodes 缓存、未做 hover prefetch

## [2026-07-28] 基础页面功能/性能再评估（未改代码）

- 状态：已完成（分析）
- 优先级：P2
- 描述：首页/时间表/番剧/搜索/追番/历史/设置/观看壳。列表双层缓存、路由与播放器 lazy、卡片 memo+lazy img、历史 debounce 已到位。剩余多为 subject 详情缓存、追番分页、搜索 staleTime、预取等中低收益；不建议为 24–50 条网格上虚拟列表。功能缺口见 docs/TODO OP/ED。
- 涉及文件：pages/*、Layout、ui、bangumi routes、use-watch-session、stores
- 备注：见对话分析

## [2026-07-28] 弹幕性能再评估（未改代码）

- 状态：已完成（分析）
- 优先级：P2
- 描述：相对 07-26 桌面密集优化后的现状再评估。热路径（glyph atlas + lazy measure + in-place prune + soft cap + DPR clamp）仍在，不宜回退。尚有优化空间但多为次要/需 benchmark；高风险项（WebGL 重写、去掉 media-time、去掉 cap、全量 measure、每帧 filter）明确不碰。
- 涉及文件：canvas-danmaku.ts、danmaku-utils.ts、VideoPlayer.tsx、danmaku-pools.ts、use-danmaku-session.ts
- 备注：见对话分析；若落地优先低风险：contentKey 误触、glyph LRU 按字节、reload 时对象复用、clear 脏区/跳帧、cap 旁路 spawn 不推进 cursor

## [2026-07-28] 选集卡片缩小 + 只显示源站集名

- 状态：已完成
- 优先级：P1
- 描述：去掉「第 N 话」双行；卡片只显示 identifier 源站名（空则序号）。网格移动 4 列 / 桌面 rail 3 列；min-height 与 padding 压紧。
- 涉及文件：MobileEpsSection.tsx、plyr-overrides.css
- 备注：typecheck 通过；与「选源默认展开」一并体验

## [2026-07-28] 选源后选集默认「全 N 话」展开

- 状态：已完成
- 优先级：P1
- 描述：选中视频源后折叠视频源、选集默认网格展开（任意集数）；每源只自动展开一次，用户可再点「全N话」收起。避免长列表横滑条过长。
- 涉及文件：apps/web/src/pages/WatchPage.tsx
- 备注：typecheck 通过

## [2026-07-28] 设置面板 + MEDIA_FULL_PROXY 部署安全

- 状态：已完成
- 优先级：P0–P1
- 描述：TODO 2 — 规则本地校验；MEDIA_FULL_PROXY 默认 0（仅 m3u8）；fullProxy/cookie mp4 否决；Anime1 内置最后且 mediaFullProxy=0 时禁用；health/设置页只读展示；设置不可提权。
- 涉及文件：
  - apps/server/src/config.ts、index.ts、routes/media.ts、lib/anime1.ts
  - apps/web：SettingsPage、use-watch-session、plugins store、default-plugins
  - plugin-validate.ts、plugin-capabilities.ts、server-capabilities.ts（新）
  - .env.example、docs/TODO.md、docs/CONTEXT.md
- 备注：typecheck 通过

## [2026-07-28] 插件 search/chapters/resolve 结果缓存

- 状态：已完成
- 优先级：P1
- 描述：TODO 3 — 服务端 TTL（search 4h / chapters 12h / resolve 按 URL 分类）；single-flight；客户端 search memory+session、roads-cache 补 TTL；播放失败与鉴权过期 refresh 重解析；smoke 强制 refresh。
- 涉及文件：
  - apps/server/src/lib/ttl-cache.ts
  - apps/server/src/routes/plugin.ts
  - apps/web/src/lib/plugin-api.ts
  - apps/web/src/lib/plugin-result-cache.ts（新）
  - apps/web/src/lib/roads-cache.ts
  - apps/web/src/lib/use-watch-session.ts
  - apps/web/src/lib/plugin-smoke.ts
  - docs/TODO.md、docs/CONTEXT.md
- 备注：typecheck 通过

## [2026-07-28] Bangumi 公开列表双层缓存

- 状态：已完成
- 优先级：P1
- 描述：任务 1 — 首页/番剧/时间表列表缓存。服务端进程内 TTL Map（calendar 24h / trending 12h / browse 2h）；客户端 RQ staleTime（12h / 2h / 30m）。`?refresh=1` 或 Cache-Control: no-cache 绕过。封面直连图片源 CDN，已有长 max-age，不做图片代理。
- 涉及文件：
  - apps/server/src/lib/ttl-cache.ts（新）
  - apps/server/src/routes/bangumi.ts
  - apps/web/src/pages/HomePage.tsx
  - apps/web/src/pages/TimelinePage.tsx
  - apps/web/src/pages/AnimePage.tsx
  - docs/TODO.md、docs/CONTEXT.md
- 备注：typecheck 通过；未做 UI 刷新按钮（可后续）

## [2026-07-27] 重设计 README

- 状态：已完成
- 优先级：P2
- 描述：结构重写 `README.md`：居中标题/徽章/简介、「这是什么」、支持环境、功能 checklist、快速开始、使用流程、生产/Docker、环境变量、贡献、折叠 Q&A、免责/隐私、致谢。保留自托管必需的 dev/prod 与 `PUBLIC_PROXY` 说明；开发者细节仍指向 `docs/CONTEXT.md`。API 全表从 README 挪走（避免喧宾夺主）。
- 涉及文件：README.md
- 备注：logo 暂用 `apps/web/public/android-chrome-512x512.png`；仓库根无 LICENSE，免责声明未写 GPL

## [2026-07-26] 倍速记忆 + 桌面音量静音图标

- 状态：已完成
- 优先级：P0
- 描述：
  1. 选 1.25x 设置已存，新视频仍 1x：load/src/MSE 重置 playbackRate；ratechange 曾把 1 写回设置。现设 defaultPlaybackRate + 媒体 ready 再 apply；不再用 ratechange 写设置；设置页档位对齐 PLAYER_SPEEDS
  2. 桌面控制条音量旁加扬声器图标：点静音 / 再点恢复上次音量
- 涉及文件：
  - apps/web/src/player/VideoPlayer.tsx
  - apps/web/src/player/chrome/DesktopControls.tsx
  - apps/web/src/player/chrome/types.ts
  - apps/web/src/player/plyr-overrides.css
  - apps/web/src/pages/SettingsPage.tsx
- 备注：typecheck 通过

## [2026-07-26] iOS 首页「继续观看」卡片超宽

- 状态：已完成
- 优先级：P1
- 描述：iOS Safari 首页继续观看卡片宽于热门趋势等模块。Grid 子项 min-width:auto + 横向 flex 副标题未 truncate 撑破轨道。
- 涉及文件：apps/web/src/pages/HomePage.tsx、apps/web/src/components/Layout.tsx
- 备注：grid/item min-w-0 + max-w-full overflow-hidden；封面 shrink-0；副标题 truncate；main min-w-0

## [2026-07-26] 移动端双击暂停 + stall UI 策略

- 状态：已完成
- 优先级：P0
- 描述：
  1. 双击无法暂停：click 计时双击与 dblclick 各调一次 togglePlay → PLAY_TOGGLE_DEDUP_MS 去重
  2. stall 策略（用户规则）：能继续播 → 完全无提示；只有无可播数据（underrun / seek hole / 首载）→ 屏幕中间转圈，无「缓冲中…」等文案
- 涉及文件：
  - apps/web/src/player/chrome/useShellPointerHandlers.ts
  - apps/web/src/player/VideoPlayer.tsx
  - apps/web/src/player/plyr-overrides.css
- 备注：waiting 有 buffer 静默；isUnplayable 才 arm 转圈；HLS non-fatal 不亮 UI

## [2026-07-26] 产品改名 aniku → animaku

- 状态：已完成
- 优先级：P1
- 描述：全仓产品名/包名从 Aniku/`aniku`/`@aniku/*` 改为 Animaku/`animaku`/`@animaku/*`。含 package.json、import、Docker、UA、localStorage key（`animaku-*`，迁移兼容 `aniku-*` 与 `kazumi-web-*`）、`X-Animaku-Proxy-Token`（仍接受旧 `X-Aniku-Proxy-Token`）。
- 涉及文件：package.json、apps/*、packages/shared、scripts、docker-compose、Dockerfile、README、docs/CONTEXT.md、pnpm-lock.yaml 等

## [2026-07-26] 桌面密集弹幕卡顿优化

- 状态：已完成
- 优先级：P0
- 描述：桌面弹幕一多卡顿、移动端流畅。根因：大画布 + 大字号 + 每帧 80×(strokeText+fillText)。优化 CanvasDanmaku：
  1. 字形 atlas：stroke/fill 只做一次，热路径 drawImage
  2. measureText 懒测（spawn 时），reload 不再全量测量
  3. running 原地 prune，去掉每帧 filter 分配
  4. 桌面同屏 soft cap（lane×3，≤64）+ 大舞台 DPR soft-clamp
  5. getContext({ desynchronized: true })
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts
- 备注：typecheck 通过；移动端路径保持原有上限与字号曲线

## [2026-07-26] 去广告混合代理（playlist-only）

- 状态：已完成
- 优先级：P1
- 描述：
  1. adFilter 且无 cookie/fullProxy 时，m3u8 rewrite 只代理嵌套 .m3u8；.ts 保持 CDN 绝对地址
  2. forceMediaProxy / 直连失败降级 → fullProxy=1，恢复全量代理
  3. KEY/MAP URI= 仍代理；简介条区分「列表代理·分片直连」/「经服务器代理」/「直连源站」
- 涉及文件：media.ts、playback-src.ts、use-watch-session.ts、WatchPage.tsx、SettingsPage.tsx、docs/CONTEXT.md
- 备注：MXdm 默认 adBlocker 开 → 入口仍是 proxy（滤列表），但文案不再误报「全量代理」

## [2026-07-26] 移动端播放器与下方模块同宽 + 日志精简

- 状态：已完成
- 优先级：P1
- 描述：
  1. 移动端播放器不再按 max-h 反推变窄居中；与弹幕/简介/视频源同宽，固定 16:9（宽驱动，无 max-height）
  2. 控制条仍按 @container 播放器宽度压缩
  3. 去掉例行 console.info：`[player] load` / `manifest ok` / `[anime4k] started`
- 涉及文件：apps/web/src/player/plyr-overrides.css、VideoPlayer.tsx、anime4k.ts
- 备注：真错误路径 console.warn 保留

## [2026-07-26] 桌面同步视频源/选集设计

- 状态：已完成
- 优先级：P2
- 描述：桌面 rail 与移动端共用：
  1. 视频源折叠头 = 弹幕/简介条（text-xs · 展开/收起）
  2. 选集 = MobileEpsSection（线路 tab + 横向卡 / 全N话网格）
  移除桌面旧折叠 chevron + 数字网格 + epsOpen
- 涉及文件：WatchPage.tsx、MobileEpsSection.tsx、plyr-overrides.css
- 备注：typecheck 通过；桌面 body 仍有 max-height 独立滚动

## [2026-07-26] 移动端 B 站式选集

- 状态：已完成
- 优先级：P2
- 描述：MobileEpsSection — 「选集 / 全N话」标题行、文字线路 tab、横向集数卡
- 涉及文件：MobileEpsSection.tsx、WatchPage.tsx、plyr-overrides.css

## [2026-07-26] 移动端观看页重制 + 横屏比例

- 状态：已完成
- 优先级：P1
- 描述：
  1. 横屏：短轴高度反推宽度，16:9 自适应（不再竖屏比例卡死）
  2. 竖屏：播放器 sticky 顶栏下；栈序 player → meta → 视频源 → 选集
  3. meta 默认对齐弹幕条；展开后紧凑封面/标签/简介/收藏
  4. 横屏不 sticky；桌面 DesktopWatchLayout 不动
- 涉及文件：
  - apps/web/src/player/plyr-overrides.css
  - apps/web/src/pages/watch/MobileWatchLayout.tsx
  - apps/web/src/pages/watch/WatchMeta.tsx
  - apps/web/src/pages/WatchPage.tsx
- 备注：focus scroll 改为 block:nearest；--kz-header-offset 3.5rem

## [2026-07-26] 移动/桌面弹幕字号分轨 + 全屏压小

- 状态：已完成
- 优先级：P1
- 描述：弹幕原先只按容器宽度缩放，手机全屏宽≈桌面中档 → 字号过大遮画面。现按 pointerMode + fullscreen 分轨：
  - desktop：仍 width/720，[0.48, 1.1]
  - mobile 窗内：按 stage 高度 ~4.2%，约 12–18px
  - mobile 全屏：按高度 ~3.2%，约 11–14.5px（横屏 844×390 从 ~28px → ~12px）
  - 移动全屏同屏上限 48、行距略紧、速度略慢
- 涉及文件：
  - apps/web/src/player/media/danmaku-utils.ts
  - apps/web/src/player/media/canvas-danmaku.ts
  - apps/web/src/player/VideoPlayer.tsx
- 备注：typecheck 通过；布局经 ref 避免 src effect 闭包过期

## [2026-07-26] P0 完整弹幕：Canvas + 媒体时间 + 恒速

- 状态：已完成
- 优先级：P0
- 描述：替换 @ironkinoko/danmaku DOM/CSS transition 为自研 Canvas 引擎
  - 每帧 x = f(video.currentTime)，卡顿与画面同相
  - duration = (stageW + textW) / speed，长短句视觉匀速
  - strokeText 轻描边；同屏上限 80；暂停停 rAF
  - 移除 ironkinoko 依赖
- 涉及文件：
  - apps/web/src/player/media/canvas-danmaku.ts（新）
  - apps/web/src/player/media/danmaku-utils.ts
  - apps/web/src/player/VideoPlayer.tsx
  - apps/web/src/player/plyr-overrides.css
  - apps/web/package.json / vite.config.ts
- 备注：typecheck 通过

## [2026-07-26] 选集面板视觉 + 选源后聚焦 UX

- 状态：已完成
- 优先级：P2
- 描述：
  1. 选集：线路（紫描边 chip）与集数（蓝实心）分色；移动端更密更小
  2. 有分集后自动折叠视频源；手动点选结果同样折叠
  3. 移动端点选后 scrollIntoView 到 #kz-watch-focus（选集+播放器）
- 涉及文件：
  - apps/web/src/pages/WatchPage.tsx
  - apps/web/src/pages/watch/MobileWatchLayout.tsx
  - apps/web/src/player/plyr-overrides.css
- 备注：无自动命中时视频源保持展开

## [2026-07-26] 视频源搜索结果引导

- 状态：已完成
- 优先级：P2
- 描述：点规则源后用户不知还需点搜索条目；强化「点选条目」引导与结果可点击感
- 涉及文件：apps/web/src/pages/WatchPage.tsx
- 备注：needsPick 态高亮卡片 + 列表「选用」标签 + 选集空态两步文案

## [2026-07-26] 桌面 rail 分板 + Anime1 搜索过滤

- 状态：已完成
- 优先级：P1–P2
- 描述：
  1. 桌面观看页右侧「视频源 / 选集」不再共用外层滚动，各自独立限高
  2. Anime1 搜索过滤「動畫列表 / 季度新番」等导航页
- 涉及文件：
  - apps/web/src/player/plyr-overrides.css
  - apps/web/src/pages/WatchPage.tsx
  - apps/web/src/pages/watch/DesktopWatchLayout.tsx
  - apps/server/src/lib/anime1.ts
- 备注：见 `.claude/BUGS.md`

## [2026-07-26] 性能审计 P0/P1 落地

- 状态：已完成（待 push）
- 优先级：P0–P1
- 描述：续播正确性、播放热路径、Anime4K 超分可见差异、媒体/上游超时与 AbortSignal
- 涉及文件：见下方 commits
- 备注：CLAUDE.md 为用户协作规则改动，未纳入产品 commit

### P0 完成
- 续播 resumePosition state + sourceUrl + resumeDone 成功后标记
- auto-pick 相似度阈值 0.55
- timeupdate 节流、弹幕条件 reload、settings debounce
- Anime4K 2× target / 更高 maxDimension / canvas contain
- plugins defaultsVersion merge 保留

### P1 完成
- media m3u8 限长 + cancel body
- bangumi/dandan/bilibili 超时
- 规则搜索仅首词 retry
- 客户端 AbortSignal 贯穿 api/RQ/弹幕 match

### 待处理（P2+）
- 反代 / Docker 开放代理门禁
- cookie 不下 query / 会话化
- soft-fail 契约统一
- DNS-safe fetchPublic

## [2026-08-04] 修复 release 动态域名回归问题
- 状态：已完成
- 优先级：P1
- 描述：API 章节请求补齐 baseURL 模板变量；@baseURL 使用安全 replacer；动态 release 域名同步更新 referer；release 数值配置非法值回退默认并整数化；release 页面检查非 2xx，解码域名经过公网 HTTP(S) 校验。
- 涉及文件：apps/server/src/rule-engine/api.ts、apps/server/src/rule-engine/index.ts、apps/server/src/lib/release.ts、packages/shared/src/plugin.ts
- 备注：typecheck 通过；git diff --check 仅提示文件末尾多余空行，待清理
