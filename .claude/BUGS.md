# Bug / 优化清单

## [2026-08-18] 修复桌面端暂停弹幕回退震颤与双击全屏误触手势解耦

### 1. 桌面端 Chrome 暂停播放时弹幕位置后退与微抖动震颤 Bug
- 状态：已完成
- 优先级：P0
- 描述：
  1) **根本原因**：在视频播放期间，弹幕引擎通过 `performance.now()` 高精微秒时钟进行亚像素插值推进，而 `<video>` 的 `currentTime` 属性在 Chromium 中离散低频更新（15Hz~30Hz）且常有 50~100ms 的 PTS 音画延迟；当触发 `pause` 暂停时，旧代码直接调用 `this.syncClock(this.media.currentTime)` 强行将时钟回拨至滞后的 `currentTime`，导致弹幕在暂停瞬间向后回跳几十毫秒；随后 Chrome 解码器完成暂停 PTS 刷新并触发 `timeupdate`，再次修改 `anchorMediaTime` 导致二次绘制，视觉上呈现为“暂停时弹幕先往后退一点，然后震一下”；
  2) **解决方案**：在 `canvas-danmaku.ts` 的 `onPause` 中，捕获暂停瞬间高精时钟插值的真实画面时间戳，在非 Seek 正常暂停（误差 $\le 0.35s$）时直接以当前渲染帧的高精位置作为冻结锚点 `anchorMediaTime`；在 `checkClockDrift` 中对暂停态下的微小 PTS 抖动保持屏蔽，彻底消除回退与震颤；播放恢复（`onPlay`）时无缝衔接推进，体验 100% 丝滑。
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts

### 2. 播放器桌面端双击全屏过敏与单击暂停/继续误触全屏 Bug（对标 B 站标准双击 0 播放干扰）
- 状态：已完成
- 优先级：P0
- 描述：
  1) **根本原因**：
     - 若单击立即触发 `togglePlay()`，在双击过程中第一次点击已经改变了播放器播放状态（如暂停变成播放、播放变成暂停，并触发了中心水滴 Ripple 动效），双击第二击即便再次反转，也会造成明显的画面闪烁和声音瞬开瞬关；
     - 另外 Windows/Chrome 系统原生的 `dblclick` 判定时间窗口长达 500ms，导致用户在 300~500ms 间隔内正常点按暂停与继续时频繁被浏览器判定为双击。
  2) **对标 B 站标准解决方案（`useShellPointerHandlers.ts`）**：
     - 在桌面端引入 **220ms 延时分发定时器**：单次点击等待 220ms，若无第二击才执行 `togglePlay()`；
     - 当发生快速双击（$\le 250\text{ms}$ 且位移 $\le 24\text{px}$）时，立即清除第一击的单发定时器，**`togglePlay()` 完全不被调用**，直接纯净触发 `toggleFs()`；
     - 无论是暂停状态还是播放状态，双击全屏/退出全屏均**绝对不会触发任何播放/暂停状态翻转**，体验 100% 对齐 B 站标准。
- 涉及文件：apps/web/src/player/chrome/useShellPointerHandlers.ts

## [2026-08-13] 代码审查修复清单

### 1. VideoPlayer 自动下一集倒计时 setInterval 卸载未清理泄漏
- 状态：已完成
- 优先级：P1
- 描述：onEnded 开启 4s 倒计时 setInterval，组件卸载或换源时未清理，导致 4s 后触发解绑组件的回调；已在 cleanup 增加 cancelCountdown()
- 涉及文件：apps/web/src/player/VideoPlayer.tsx

### 2. EmbedPlayer "新窗口打开" 按钮 Tailwind 类名格式错误
- 状态：已完成
- 优先级：P2
- 描述：className 中 accent)]与 hover: 之间漏空格，且漏掉内边距与字体样式；已补齐空格与 px-2.5 py-1 text-white
- 涉及文件：apps/web/src/player/EmbedPlayer.tsx

### 3. release.ts 域名发布页 TTL 缓存 key 分隔符不一致
- 状态：已完成
- 优先级：P2
- 描述：cacheKey 拼装用 `:`，但 cacheGet 用 `split('|')` 导致 fetchHour 永远回退 2 小时；现已重构为 CacheEntry 直接存储 fetchHour 字段
- 涉及文件：apps/server/src/lib/release.ts

### 4. plugin.ts 章节接口 cacheKey 与实际 loader 传入 source 不一致
- 状态：已完成
- 优先级：P1
- 描述：key 去掉了尾斜杠，但传递给 chaptersWithRule 的是原始 source.trim()；已统一传入去除尾斜杠后的 source 变量
- 涉及文件：apps/server/src/routes/plugin.ts

### 5. media.ts cancelBody 异步 cancel 未捕获 rejection
- 状态：已完成
- 优先级：P2
- 描述：void res?.body?.cancel() 未捕获 reject 可能会引发 unhandledRejection；已补齐 .catch(() => {})
- 涉及文件：apps/server/src/routes/media.ts

### 6. use-watch-session.ts 引用频繁重建与 pickSource 防重入优化
- 状态：已完成
- 优先级：P1-P2
- 描述：resolvedPlayerSettings 已用 useMemo 包裹；onProgress 已用 useCallback 包裹；pickSource 防重入已改用 roadLoadingRef 锁
- 涉及文件：apps/web/src/lib/use-watch-session.ts

### 7. 清理 async-pool.ts 死代码与 onEnded 冗余字段
- 状态：已完成
- 优先级：P3
- 描述：已删除死代码文件 async-pool.ts，清理了 VideoPlayerProps.onEnded 从未使用过的冗余接口与引用
- 涉及文件：apps/web/src/lib/async-pool.ts, apps/web/src/player/types.ts, apps/web/src/player/VideoPlayer.tsx

## [2026-08-13] 播放页加载中导航离开被拉回播放页的 Bug

- 状态：已完成
- 优先级：P1
- 描述：在播放页加载分集或资源时点击顶部导航栏离开，异步请求成功后无组件挂载/路由守卫盲目执行 setParams，导致 URL 被污染或被拉回播放页；已引入 mountedRef 与 safeSetParams 防御
- 涉及文件：apps/web/src/lib/use-watch-session.ts

## [2026-08-14] 修复全屏弹幕 Portal 遮盖与画面比例闭环

### 1. 移动端 DOM 全屏模式下弹幕面板被遮盖不可见 Bug
- 状态：已完成
- 优先级：P0
- 描述：DanmakuPanel 的 MobileSheet 使用 createPortal 挂载在 document.body 上，在触发原生 DOM Fullscreen 时处于全屏元素外层，被浏览器 Top Layer 遮盖；现已改造为动态挂载至 document.fullscreenElement || document.body。
- 涉及文件：apps/web/src/player/DanmakuPanel.tsx

### 2. 画面比例（Aspect Ratio）功能闭环
- 状态：已完成
- 优先级：P1
- 描述：画面比例 toggleAspectRatio 已绑定键盘 W 快捷键切换，并在「播放」设置 Tab 增加下拉切换项；完善了 4:3 比例的几何居中约束，并为 Anime4K 超分 Canvas 同步了 objectFit 与比例样式。
- 涉及文件：apps/web/src/player/DanmakuPanel.tsx, apps/web/src/player/VideoPlayer.tsx

### 3. CustomSelect 体验与死代码清理
- 状态：已完成
- 优先级：P2
- 描述：限制 CustomSelect 展开最大高度为 max-h-36，支持 pointerdown 灵敏收起；清理了未被调用的死代码 formatOptionTitle。
- 涉及文件：apps/web/src/player/DanmakuPanel.tsx

### 4. MobileControls 遮罩层触摸穿透防御
- 状态：已完成
- 优先级：P1
- 描述：在 .kz-player-backdrop 补充 onPointerDown / onTouchStart 阻断冒泡，避免轻触遮罩关闭菜单时事件透传到底层视频手势层。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx

## [2026-08-14] 重构移动端播放器 Backdrop 透明遮罩与手势解耦

- 状态：已完成
- 优先级：P0
- 描述：参考 Bilibili Web/YouTube Web/DPlayer 移动端标准实践，引入 kz-player-backdrop 透明遮罩机制。当音量条/倍速/超分菜单开启时，点击遮罩 0 毫秒瞬间收起面板并隔离手势，解决关闭延迟与双击判定的冲突。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/chrome/useShellPointerHandlers.ts, apps/web/src/player/plyr-overrides.css

## [2026-08-18] 视频源多源聚合交互与主题适配问题修复

### 1. 首次打开播放页未自动获取默认源且源面板全部呈现 Rose 状态
- 状态：已完成
- 优先级：P0
- 描述：
  1) `useWatchSession` 修复为仅在解析到有效番剧关键词后才锁定 `defaultSearchDoneFor.current = bangumiId`，确保元数据异步到达后立即自动触发首源搜索并起播；
  2) `WatchPage` 中将 `sourcesOpen` 初始值调整为 `false`（默认折叠），彻底杜绝首屏打开时自动展开并对所有源发起探测，严格遵循「起播零等待、正常播放 0 冗余请求」原则；
  3) 探活超时从 3s 调整为 5s 避免慢速/爬虫源假超时。
- 涉及文件：apps/web/src/lib/use-watch-session.ts, apps/web/src/pages/WatchPage.tsx, apps/web/src/lib/use-source-aggregator.ts

### 2. 视频源在白天主题下字体看不清与搜索背景突兀
- 状态：已完成
- 优先级：P0
- 描述：`SourceBoard.tsx` 全面移除硬编码暗黑类名，全量接入站点 `var(--kz-*)` 双模态设计 Token，使白天模式下底色清爽、字体黑白对比适度、关键词选择/输入栏自然和谐。
- 涉及文件：apps/web/src/pages/watch/SourceBoard.tsx

### 3. 带 query 参数直访链接时选中源显示排队等待且请求其他源
- 状态：已完成
- 优先级：P0
- 描述：在 `useSourceAggregator` 中接入 `selection` 监听，当前激活源（activePlugin）自动同步为 `ready` 状态；配合 `sourcesOpen=false`，带参直访或从历史记录进入时不会触发多余源的请求。
- 涉及文件：apps/web/src/lib/use-source-aggregator.ts, apps/web/src/pages/WatchPage.tsx, apps/web/src/lib/use-watch-session.ts

### 4. 针对请求失败的源无法手动切换关键词或输入关键词重搜
- 状态：已完成
- 优先级：P1
- 描述：为探测失败（`error` / `empty`）及待选（`needs_pick`）的源提供展开卡片能力，内置候选关键词快速点选 chips 及自定义关键词输入框，支持针对单源换词重搜与重新探活。
- 涉及文件：apps/web/src/pages/watch/SourceBoard.tsx, apps/web/src/lib/use-source-aggregator.ts, apps/web/src/lib/use-watch-session.ts

### 5. 精简视频源卡片状态文案、Safari字号紧凑化与单行省略截断
- 状态：已完成
- 优先级：P1
- 描述：
  1) 移除已有 3 色状态圆点下的冗余「🟢 已就绪 ·」等前缀文字，直接展示匹配条目名；
  2) 针对匹配条目名称设置严格单行截断（`truncate` / `block`），彻底防止长标题换行撑大卡片高度；
  3) 优化 Safari / 桌面端整体排版字号与内边距（avatar 7x7，字号 11~13px，card padding 2px）；
  4) 统一「切换」、「换词重试」、「当前使用」、「选条目」等操作胶囊的尺寸（固定 `h-6`、`px-2.5`、`leading-none`、`font-semibold` 与统一描边），彻底解决大小不一致和字体不统一问题；
  5) 移除面板顶部冗余的全局搜索下拉框与输入框，全面收敛至单卡内展开式精准操作。
- 涉及文件：apps/web/src/pages/watch/SourceBoard.tsx, apps/web/src/pages/WatchPage.tsx

### 6. 从历史记录进入时误触发默认首源搜索与链接不一致修复
- 状态：已完成
- 优先级：P0
- 描述：
  1) `HistoryPage.tsx` 中卡片主体链接此前为 `/subject/:id`（漏传 `plugin` 与 `pageUrl` 参数），导致点击卡片进入时丢失历史源并触发默认首源搜索；现已与「续播」按钮完全统一为带完整 query 的 `/play/:id?...` 链接；
  2) `use-watch-session.ts` 中修复了 `keywordTargetPlugin` 预选逻辑：优先从 URL query 中获取 `qPlugin` 作为目标源，并在带有 `qPlugin` 时严格切断首源的默认搜索与自动探活，确保从历史播放点击进入时 100% 仅加载并请求历史指定的视频源。
- 涉及文件：apps/web/src/pages/HistoryPage.tsx, apps/web/src/lib/use-watch-session.ts

## [2026-08-14] 修复部分大屏手机/浏览器渲染 WebKit 原生 range 步进箭角的 Bug

- 状态：已完成
- 优先级：P0
- 描述：
  - **根本原因**：在 Android / Chromium 大屏或某些设备触控模式下，浏览器为 `<input type="range">` 自动渲染了原生的步进/控件微调 UI（带白底和 `◀ ▶` 箭角的 Stepper Controls）。因为音量滑块被 CSS `transform: rotate(-90deg)` 旋转了 90 度，这个原生的 Stepper 被顺带旋转到了音量面板底部露在外面。
  - **解决方案**：
    1. 给音量胶囊面板 `.kz-vol-popup` 强制加上 `overflow: hidden;`，绝对裁剪任何溢出渲染。
    2. 在 CSS 中为 `.kz-vol-popup-range` 添加 `::-webkit-outer-spin-button`, `::-webkit-inner-spin-button`, `::-webkit-media-controls-container` 等原生控制伪类的 `display: none !important; -webkit-appearance: none !important;` 彻底强制禁用与隐藏。
- 涉及文件：apps/web/src/player/plyr-overrides.css

