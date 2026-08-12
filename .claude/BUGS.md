# Bug / 优化清单

## [2026-07-26] iOS Safari 首页继续观看卡片超宽

- 状态：已完成
- 优先级：P1
- 描述：继续观看视频卡片宽度超出热门趋势等其他模块
- 涉及文件：HomePage.tsx、Layout.tsx
- 备注：iOS grid min-width:auto；min-w-0 + truncate 修复

## [2026-07-26] 移动端双击无法暂停

- 状态：已完成
- 优先级：P0
- 描述：双击舞台应 pause，实际像没暂停（或闪一下又继续播）
- 涉及文件：apps/web/src/player/chrome/useShellPointerHandlers.ts
- 备注：click 双击检测 + dblclick 各调一次 togglePlay；PLAY_TOGGLE_DEDUP_MS=420 去重

## [2026-07-26] 播放中瞬间闪「缓冲中…」

- 状态：已完成
- 优先级：P0
- 描述：画面流畅时仍偶尔弹出缓冲提示并瞬间消失 → 改为仅无可播数据时中间转圈，去掉文案
- 涉及文件：apps/web/src/player/VideoPlayer.tsx、plyr-overrides.css
- 备注：能播静默；underrun/seek hole/首载才 spinner；HLS non-fatal 不亮 UI

## [2026-07-26] 桌面端视频源与选集共用 rail 滚动

- 状态：已完成
- 优先级：P1
- 描述：桌面端右侧 rail 对「视频源 + 选集」整体设 max-height + overflow-y，两块高度叠加后出现外层莫名滚动条；应各自独立板块、各自限高滚动
- 涉及文件：apps/web/src/player/plyr-overrides.css, apps/web/src/pages/WatchPage.tsx, apps/web/src/pages/watch/DesktopWatchLayout.tsx
- 备注：去掉 rail 外层 overflow；sources/eps 各自 body 限高；eps 增加 kz-watch-eps class

## [2026-07-26] Anime1 搜索噪声：动画列表 / 季度新番

- 状态：已完成
- 优先级：P2
- 描述：Anime1 内置源搜索结果混入「动画列表」「季度新番」等站点导航/列表页，应过滤
- 涉及文件：apps/server/src/lib/anime1.ts
- 备注：按标题（列表/新番/留言板…）+ 仅保留 /数字 集页 URL 双过滤

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
