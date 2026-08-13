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

## [2026-08-13] 播放器控制条设计与视觉统一重构

- 状态：已完成
- 优先级：P1
- 描述：重构 SVG 矢量图标（网页全屏图标 IconWebFs/IconWebFsExit），统一底栏遮罩多阶渐变、按钮 Hover/Active 胶囊 Token、Seeking 动态进度条及全量统一磨砂玻璃弹窗系统
- 涉及文件：apps/web/src/player/chrome/icons.tsx, apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
