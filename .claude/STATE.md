# Animaku 项目状态

## [2026-08-14] 全面统一播放器所有弹出面板与弹窗视觉设计语言 (Dark Glassmorphism)
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查根本原因**：此前弹幕面板（`DanmakuPanel.tsx` 包含桌面端卡片与移动端居中弹窗）直接引用了站点全局主题 CSS 变量（`var(--kz-bg-elevated)`、`var(--kz-bg-soft)`、`var(--kz-fg)`），导致在**白天模式（Light Mode）**下弹幕面板呈现刺眼的纯白底色（`#ffffff`），与播放器内的设置面板、音量面板、倍速菜单、倒计时卡片等暗场深色磨砂玻璃（Dark Glassmorphism）产生强烈的视觉撕裂。
  2. **全面统一为深色暗场磨砂玻璃设计系统**：
     - **弹幕面板容器（桌面卡片 & 移动端弹窗）**：统一为 `bg-[#0f141e]/95` 深黑背景 + `border-white/15` 微光边框 + `backdrop-blur-2xl` 磨砂琉璃质感 + `shadow-black/80` 深度外发光阴影；
     - **Tab 栏与状态栏**：统一为 `bg-black/25 border-b border-white/10`，激活 Tab 统一为高质感天青色 `bg-[#0284c7]`，文字统一为 `text-slate-100` / `text-slate-400`；
     - **表单控件与 CustomSelect**：搜索输入框、分 P 输入框、下拉组件 `CustomSelect` 触发器及弹出菜单、本地 XML 选择框均统一为 `bg-white/10 border-white/15 text-slate-100`，悬浮高亮与激活状态统一为 `border-sky-400` / `text-sky-400`；
     - **CSS 样式统一**：重构 `plyr-overrides.css` 中的 `.kz-dm-*` 系列表单类，使其与 `.kz-settings-popover`、`.kz-vol-popup`、`.kz-speed-menu`、`.kz-countdown-overlay` 风格完全对齐。
- 涉及文件：apps/web/src/player/DanmakuPanel.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

## [2026-08-14] 移动端控制栏移除冗余倍速按钮并恢复网页全屏 (Web FS)
- 状态：已完成
- 优先级：P0
- 描述：
  1. **移动端控制栏移除独立倍速按钮与弹窗**：倍速功能已完全收纳进统一设置齿轮面板（`⚙️`），从 `MobileControls.tsx` 控制栏中移除独立的倍速触发按钮与 `kz-speed-menu` 弹窗逻辑，精简控制栏元素。
  2. **全面恢复移动端网页全屏（浏览器全屏）**：移除 `plyr-overrides.css` 中在窄屏/小屏（`<400px`）下将 `.kz-ctrl-web-fs` 强行设为 `display: none` 的样式规则。在倍速按钮腾出空间后，移动端同时保留「网页全屏（浏览器全屏）」与「系统全屏」两大经典控制能力。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

## [2026-08-14] 移动端设置面板超窄宽度与紧凑间距深度优化
- 状态：已完成
- 优先级：P0
- 描述：
  1. **面板超窄宽度重构**：将移动端 `.kz-settings-popover--mobile` 宽度进一步从 9.75rem（156px）缩减至 **`7.5rem`**（120px），内边距微调为 `0.15rem`，彻底消除标题与右侧选中值/箭头之间过大的空白间距。
  2. **高密精致微型排版**：
     - 菜单项与子菜单头部字号微调为 `9.5px`，内边距压缩为 `0.18rem 0.3rem`；
     - 选中状态属性值字号调整为 `9px`，指示箭头及 Check 标识缩小为 `8.5px~9px`；
     - Switch 开关微缩至 `20px × 11px`（滑块 `7px × 7px`，行程 `9px`）；
     - 子选项文案适配极简（如 `Mode A (轻)`、`Mode B (高)`、`默认 (16:9)`），在 120px 宽度下左右排版紧凑适度，视觉手感更加轻盈精美。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

## [2026-08-14] 补齐移动端设置面板与横屏层级隔离（防止遮盖 Header）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **移动端与横屏控制栏全面补齐设置面板**：在 `MobileControls.tsx` 控制栏右侧及全屏 Top Bar 中补齐 `⚙️` 播放器设置图标与触控 Popover（包含倍速、超分、画面比例、跳过 OP/ED、自动连播等全套子菜单），彻底解决移动端横屏/竖屏无法呼出播放器设置菜单的问题。
  2. **播放器层级堆叠隔离（防止横屏滚动溢出遮挡顶部导航栏）**：
     - 为 `.kz-player-stack` 增加显式的 `position: relative; z-index: 30;` 局部层叠上下文，将播放器内部子元素（控制栏 z-80、进度条提示 z-90、音量弹出层 z-100 等）在非全屏状态下严格限制在 `z-index: 30` 容器内；
     - 彻底解决移动端横屏或常规页面滚动时，播放器内部控制条覆盖在顶部 Header（`z-40`）之上的严重层级穿透 Bug。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

## [2026-08-14] 修复 OP/ED 标记假数据判定、清理弹幕面板播放Tab与设置菜单中轴对齐
- 状态：已完成
- 优先级：P0
- 描述：
  1. **OP/ED 进度条标记严格受 bangumi-oped 选项与真实数据控制**：
     - 在 `bangumi-oped.ts` 的 `useResolvedOpedSkip` 以及 `DesktopControls` / `MobileControls` 的 `opMarker` / `edMarker` 均显式增加 `player.preferBangumiOped !== false` 强卡控；
     - 未开启 bangumi-oped 或仓库中无本集真实有效数据（数据未加载/404/无匹配）时，严格返回 `null` / `enabled: false`，彻底消除假 0~90s 紫色占位标记条。
  2. **弹幕面板职责纯粹化（移除冗余播放设置 Tab）**：从 `DanmakuPanel.tsx` 中彻底移除 `'other'`（播放设置）Tab 及其对应视图组件与属性传参，使弹幕面板纯粹聚焦于「搜索/弹幕/导入」三大弹幕核心功能。
  3. **设置面板中轴精准对齐**：为 `.kz-settings-popover` 补充 `left: 50%; transform: translateX(-50%); transform-origin: bottom center;`，使展开的设置面板 X 轴中心线正对着控制栏上的 `⚙️` 设置按钮，彻底消除右偏不对齐问题。
- 涉及文件：apps/web/src/lib/bangumi-oped.ts, apps/web/src/lib/use-watch-session.ts, apps/web/src/player/DanmakuPanel.tsx, apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

## [2026-08-14] 播放器 UI/UX 现代主流化升维（P0 阶段落地）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **中心水滴涟漪微动效与增强 HUD (Center Spring Ripple & HUD Indicator)**：
     - 在播放器中心引入基于物理弹簧（Spring Motion）的半透明磨砂涟漪动效卡片（`▶` / `❚❚`），在播放/暂停切换时瞬间缩放淡出（500ms），给予极佳的手势与键盘反馈。
     - 升级音量调节（`🔊 音量 85%` / `🔇 静音`）、快进快退（`⏩ +5s (12:34)`）、弹幕开关、倍速等操作为统一的现代圆角磨砂 HUD 药丸指示器。
  2. **统一层级化设置齿轮菜单 (Unified Settings Gear Menu)**：
     - 在桌面端控制栏新增 `⚙️` 播放器设置图标，展开高质感磨砂玻璃 Popover（`.kz-settings-popover`），内置双层平滑子菜单架构：
       - 主层级：`⚡ 播放倍速`、`✨ 超分增强 (Anime4K)`、`📐 画面比例`、`⏭️ 跳过片头片尾 (Switch)`、`🔁 自动连播下一话 (Switch)`、`⌨️ 快捷键指南`；
       - 子层级：点击平滑钻取并提供 `‹ 返回` 与当前激活项 `✓` 勾选反馈；
       - 彻底将弹幕设置（`Alt+M`）与播放器综合设置分层解耦，赋予弹幕设置专属的 `IconDanmaku` 标识。
  3. **高能进度条弹幕热力图与 OP/ED 章节标记 (Seekbar Danmaku Heatmap & Chapter Markers)**：
     - 结合已加载的弹幕数据，按时间轴分桶平滑计算弹幕密度，在进度条上方动态绘制平滑蓝光渐变高能热力曲线（Heatmap Wave），直观呈现高能名场面；
     - 结合 `bangumi-oped` 智能标注片头曲 (OP) 与片尾曲 (ED) 发光标记段；
     - 桌面端 Seekbar 悬停时实时展示带时间码与 OP/ED 标识的悬浮气泡指示卡片（`.kz-seek-tooltip`）。
  4. **沉浸式连播倒计时悬浮卡片 (Floating Next Episode Toast)**：
     - 将原本全屏生硬的暗色遮罩重构为右下角精致的玻璃拟态悬浮卡片，包含环形 SVG 倒计时进度环、话数提示与「立即播放」「取消」按键。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/chrome/icons.tsx, apps/web/src/player/chrome/types.ts, apps/web/src/player/chrome/useShellPointerHandlers.ts, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

## [2026-08-14] 修复全屏弹幕 Portal 遮盖、闭环画面比例与交互优化
- 状态：已完成
- 优先级：P0-P1
- 描述：
  1. **移动端 DOM 全屏弹幕面板 Portal 目标修复**：`DanmakuPanel` 的 `MobileSheet` 改造为动态挂载到 `document.fullscreenElement || webkitFullscreenElement || document.body`，彻底解决处于原生 DOM 全屏时挂在 `document.body` 被全屏元素遮蔽不可见的 Bug。
  2. **画面比例（Aspect Ratio）功能闭环**：
     - 支持按键 `W` 全局快捷键切换画面比例（`contain` / `cover` / `fill` / `4:3`）并触发屏幕中央 Toast 提示；
     - 在「播放」Tab（`OtherSettingsTab`）中新增「画面比例」自定义下拉选择项；
     - 完善 `4:3` 比例下的几何居中与宽高约束，并同步更新 Anime4K 超分 Canvas 的比例与样式。
  3. **CustomSelect 交互与高度优化**：设置下拉菜单最大高度为 `max-h-36`，并扩展 `onDocDismiss` 同时支持 `click` 与 `pointerdown` 灵敏关闭；清理残留死代码 `formatOptionTitle`。
  4. **MobileControls 遮罩层手势隔离防御**：在 `.kz-player-backdrop` 上补充 `onPointerDown` 与 `onTouchStart` 阻断冒泡，防止移动端触摸穿透到底层手势系统。
- 涉及文件：apps/web/src/player/DanmakuPanel.tsx, apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/chrome/MobileControls.tsx
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

## [2026-08-14] 修复白天（Light）模式下弹幕面板字体/下拉选框白底白字看不清与遮挡 Bug
- 状态：已完成
- 优先级：P0
- 描述：
  - **根本原因**：`DanmakuPanel.tsx` 中的自定义下拉选择框 `CustomSelect` 以及 `plyr-overrides.css` 中的 `.kz-dm-*` 表单控件、标签、按钮等样式硬编码了暗色模式下的 `text-white`、`bg-white/8`、`rgba(255, 255, 255, ...)` 等颜色。当页面处于白天（Light）模式时，弹幕面板底色为纯白（`#ffffff`），导致文字与选框呈现白底白字或无对比度，看起来如同“被空白遮挡/无法看清”。
  - **解决方案**：
    1. **`CustomSelect` 组件全量主题 CSS 变量化**：将按钮背景、边框、文字、下拉菜单背景、选项 Hover/Active 等全量改造为适应主题切换的 CSS Token（`var(--kz-bg-soft)`、`var(--kz-border)`、`var(--kz-fg)`、`var(--kz-fg-muted)`、`var(--kz-bg-elevated)`、`var(--kz-accent)`），实测在白天模式下展现为浅灰底黑字高对比度选框，黑夜模式下自动适配暗色。
    2. **弹幕面板 DOM 容器及子组件 Token 覆盖**：为 `DesktopCard` 和 `MobileSheet` 根节点补充 `text-[var(--kz-fg)]`，并将搜索/设置/导入等 Tab 页面中的 input 输入框、placeholder、标签及按键等样式全量改为主题变量。
    3. **`plyr-overrides.css` 全量重构 `.kz-dm-*`**：全面将 `.kz-dm-input`、`.kz-dm-select`、`.kz-dm-label`、`.kz-dm-toggle-row`、`.kz-dm-filter-rule` 等选择器中的暗色硬编码替换为标准 CSS 变量。
- 涉及文件：apps/web/src/player/DanmakuPanel.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

## [2026-08-14] 修复部分大屏手机/浏览器渲染 WebKit 原生 range 步进箭角的 Bug
- 状态：已完成
- 优先级：P0
- 描述：
  - **根本原因**：分析出大屏手机/Chromium 触控模式下浏览器会自动为 `<input type="range">` 渲染原生的 Stepper 步进调节图标（带白底和 `◀ ▶` 箭角）。因滑块被旋转了 -90deg，该原生 Stepper 控件被旋转露到了音量胶囊底部。
  - **解决方案**：为音量胶囊 `.kz-vol-popup` 强制加上 `overflow: hidden;`，并在 CSS 中为 `.kz-vol-popup-range` 补充全套 WebKit media controls 伪类 `display: none !important; -webkit-appearance: none !important;` 彻底清除了原生箭角。
- 涉及文件：apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

## [2026-08-14] 全面升级播放器与播放页移动端交互体验（对齐 Bilibili/DPlayer 标准）
- 状态：已完成
- 优先级：P0-P1
- 描述：
  - **移动端双击与长按**：撤回左右分域快进/快退逻辑（恢复为移动端全域双击统一播放/暂停，防止误触）；长按触发 `2.0X ⚡ 快速倍速中` 提示，并在松开手掌后精准恢复至长按前的自定义倍速（如原本 1.25x/1.5x）。
  - **Seek 时间差实时 Toast**：滑动/拖拽 Seek 时屏幕中央 Toast 实时显示时间变幅与目标时间（如 `+00:15 (08:30)`）。
  - **画面比例/填充模式**：增加 `contain (16:9)` / `cover (铺满)` / `fill (拉伸)` / `4:3` 画面比例模式支持。
  - **移动端竖屏播放器吸顶**：WatchPage 移动端竖屏向下滑动页面时播放器 `sticky top-0 z-40` 固顶展示。
  - **UI 纯粹精简**：去除了移动端全屏右上角多余的发弹幕胶囊与选集正倒序冗余按钮，还原极简沉浸的移动端播放器体验。
- 涉及文件：apps/web/src/player/chrome/useShellPointerHandlers.ts, apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/pages/WatchPage.tsx, apps/web/src/pages/watch/MobileEpsSection.tsx
- 备注：`pnpm typecheck` 全仓 4 个 Workspace 项目验证 0 错误编译通过。

## [2026-08-14] 重构移动端播放器 Backdrop 透明遮罩与手势解耦
- 状态：已完成
- 优先级：P0
- 描述：
  - **对齐 Bilibili/DPlayer/YouTube 业界标准**：在移动端倍速菜单、超分菜单或音量面板展开时，引入覆盖播放器全域的 `.kz-player-backdrop` 透明遮罩层（`z-index: 75`）。
  - **0 毫秒极速响应与手势解耦**：点击或触碰遮罩层时 **0 毫秒瞬间收起面板**，并通过 `e.stopPropagation()` 阻断事件向底层视频舞台透传；彻底解耦了 `useShellPointerHandlers.ts` 的手势逻辑，解决了此前将关闭面板混在舞台 `onShellClick` 导致的“延时关闭”与“双击判定失效”互斥冲突。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/chrome/useShellPointerHandlers.ts, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-14] 简化移动端音量面板展示层级（撤回多余事件与极简修复）
- 状态：已完成
- 优先级：P1
- 描述：
  - **撤回多余拦截逻辑**：根据要求撤回了此前增加的动态 `pointer-events: none` 隔离与冗余 touch 阻止冒泡逻辑，解决了点击外部关菜单延迟滞后的问题。
  - **极简展示层级提升**：仅在 CSS 中保留最干净纯粹的展示层级修复，将移动端音量面板 Popover (`.kz-vol-popup`) 与移动端下拉菜单的 `z-index` 设置为 `100 !important`，确保其在 DOM 视觉展示上置于进度条 (`.kz-seek`) 上方。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-14] 修复弹幕面板展示截断与桌面端三大面板中轴精确对齐
- 状态：已完成
- 优先级：P0-P1
- 描述：
  - **恢复弹幕面板根级渲染防截断**：将 `DanmakuPanel` 恢复在播放器 `.kz-player-shell` 根容器（`.kz-danmaku-panel-root`）层级中渲染，彻底解决了若放入 `DesktopControls` 子 DOM 被控制栏 `.kz-bar-row` 的 `overflow-y: hidden` 强制剪切导致“弹幕面板无法展示”的致命 Bug。
  - **桌面端面板中轴精确定位**：
    1. **倍速与超分面板**：`.kz-speed-menu` 采用 `left: 50%; transform: translateX(-50%)`，使其基于「倍速」和「超分」按钮 X 轴中心正上方精确居中展开，并配合独立的 `kz-menu-popover-in` 放大动效。
    2. **弹幕设置面板**：桌面端 `.kz-danmaku-panel--desktop` 采用基于控制栏高度的右偏移中轴定位，使 352px 宽的面板底部中心线正对着控制栏上的「弹幕设置」图标按钮，实现三面板统一的精密视觉中轴对齐。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/chrome/types.ts, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 修复移动端全屏点击无效与窗口全屏无法退出问题
- 状态：已完成
- 优先级：P0
- 描述：
  1. **移动端全屏 Top Bar 导航栏**：为移动端在窗口全屏 (webFs) 及 DOM 全屏模式下打造了置顶 Header (`.kz-mobile-top-bar`)，包含醒目的左上角 `←` 退出全屏图标按钮与标题显示，使用户在任何移动设备窗口全屏下呼出控制栏均可 100% 一键退出全屏。
  2. **全屏响应与 Screen Orientation 屏幕旋转**：重构全屏降级与退出机制，全屏时联动 `Screen Orientation API` (`landscape` 锁定与解锁)，修复移动端多端全屏点击由于缺失 API 或限制引发无响应的问题；重构统一退出逻辑，保证在 DOM 全屏、iOS video 全屏和 CSS 网页全屏模式下均可稳定恢复。
  3. **底部控制条 Safe Area 避让**：在 `.kz-bar` 中引入 `max(0.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.35rem))` 底部安全区避让，解决 iOS/Android 全屏下底部手势导航条遮挡控制条按钮导致的点击无效问题。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/chrome/types.ts, apps/web/src/player/chrome/icons.tsx, apps/web/src/player/types.ts, apps/web/src/player/plyr-overrides.css, apps/web/src/pages/WatchPage.tsx
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 修复视频源点击抢跑折叠与选集不同步 Bug
- 状态：已完成
- 优先级：P0
- 描述：
  - 核心修复：移除了 `WatchPage.tsx` 中搜索结果条目 `onClick` 里抢跑调用的 `focusAfterSelection`。
  - 逻辑对齐：让视频源折叠与页面自动聚焦统一交由 `useEffect` 监听 `w.selection` 驱动。只有当 B 源分集真正成功拉取并更新后，才触发折叠与平滑滚动；拉取失败时保持视频源展开，并在对应源下方提示错误，彻底消除了“已点击 B 源折叠跳转但选集未切换/停留在原源”的假折叠不同步 Bug。
- 涉及文件：apps/web/src/pages/WatchPage.tsx
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 精简倍速菜单字号与间距避免出现滚动条
- 状态：已完成
- 优先级：P1
- 描述：将倍速面板按键字号由 `12px` 微调缩减为 `11px`，内边距 `padding` 紧凑调整为 `0.2rem 0.55rem`，内边距框间距归零，使 6 个倍速选项自然高度压缩至 ~116px 完美展开，彻底杜绝需要出现滚轮的情况。
- 涉及文件：apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

## [2026-08-13] 修复移动端倍速弹出偏右、悬空间隔及弹幕面板等高
- 状态：已完成
- 优先级：P0
- 描述：针对反馈的 3 个问题进行了精确修复：
  1. **消除点击瞬间偏右**：新增 `@keyframes kz-mobile-popover-in` keyframe 动画，在 `from` 和 `to` 关键帧中均显式包含 `transform: translateX(-50%)`，彻底解决动画播放期间 CSS 覆盖内联 `translateX(-50%)` 导致的点击瞬间在右边、动画结束后才弹回正上方的问题。
  2. **消除控制按钮上方悬空**：将 `.kz-mobile-bar-menu` 的底部定位修改为 `bottom: calc(var(--kz-ctrl-h, 32px) + 0.35rem + 2px)`，避开控制栏内进度条和 padding 造成的断层，使倍速、超分及音量面板精准贴合在控制按钮行的正上方 2px 处。
  3. **弹幕面板 100% 播放器高度**：将移动端弹幕面板 `.kz-danmaku-panel--mobile` 的定位与尺寸调整为 `position: absolute; inset: 0; width: 100%; height: 100%;`，使其展开时高度 100% 精确与播放器同高。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 验证全通过。

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
