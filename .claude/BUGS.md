# Bug / 优化清单

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

## [2026-08-14] 修复部分大屏手机/浏览器渲染 WebKit 原生 range 步进箭角的 Bug

- 状态：已完成
- 优先级：P0
- 描述：
  - **根本原因**：在 Android / Chromium 大屏或某些设备触控模式下，浏览器为 `<input type="range">` 自动渲染了原生的步进/控件微调 UI（带白底和 `◀ ▶` 箭角的 Stepper Controls）。因为音量滑块被 CSS `transform: rotate(-90deg)` 旋转了 90 度，这个原生的 Stepper 被顺带旋转到了音量面板底部露在外面。
  - **解决方案**：
    1. 给音量胶囊面板 `.kz-vol-popup` 强制加上 `overflow: hidden;`，绝对裁剪任何溢出渲染。
    2. 在 CSS 中为 `.kz-vol-popup-range` 添加 `::-webkit-outer-spin-button`, `::-webkit-inner-spin-button`, `::-webkit-media-controls-container` 等原生控制伪类的 `display: none !important; -webkit-appearance: none !important;` 彻底强制禁用与隐藏。
- 涉及文件：apps/web/src/player/plyr-overrides.css

