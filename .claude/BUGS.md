# Bug / 待办清单

## 📌 待处理清单 (Active TODOs)

*(暂无待处理项，所有已知问题已解决并归档)*

---

## 历史已解决归档 (Recently Resolved)

> 2026-08-19 及更早的 Bug 修复历史已归档至 [.claude/BUGS_ARCHIVE.md](BUGS_ARCHIVE.md)

### [2026-08-20]
1. **修复视频源候选词与自定义换词点击重搜失效 Bug (P0)**
   - 解决：
     1. **排查定位**：在 `useSourceAggregator.ts` 中，`processQueue` 曾有 `if (binding?.sourceUrl) { continue }` 短路判断，当视频源已有绑定（历史或当前在播）时，用户点击候选关键词或自定义换词触发重搜，出队时被直接跳过，导致 `pluginApi.search` 从未执行；且后台 2 并发自动探活期间手动重搜任务排在队尾且缺乏即时反馈。
     2. **系统修复**：
        - 移除 `binding?.sourceUrl` 拦截，重搜一律触发回源搜索并自动注入 `refresh: true`；
        - 在 `prioritizePlugin` 中实现抢占式调度，当并发满时自动中断低优先级后台自动探活（`activeAutoJobsRef`）让位给用户重搜；
        - `reProbePlugin` 触发瞬间同步置位 `status: 'probing'` 与 `keyword: kw`，自动回填输入框，并在抽屉中展示「正在使用『XX』检索…」琉璃动画横幅，关键词按钮切换为「搜索中」。
   - 文件：`apps/web/src/lib/use-source-aggregator.ts`, `apps/web/src/pages/watch/SourceBoard.tsx`
2. **修复播放器进度条热力图上方与全域点击拖动失效 (P0)**
   - 解决：统一全域 Pointer 事件捕获（PointerCapture），支持在热力图波形与轨道上方 30px 大热区点击拖拽寻道；消除 `<input type="range">` 阻断。
   - 文件：`apps/web/src/player/chrome/DesktopControls.tsx`, `apps/web/src/player/chrome/MobileControls.tsx`, `apps/web/src/player/plyr-overrides.css`
3. **接入全新视频源 Moonci (月之祠 moonci.com) 专有适配器与 1080P MP4 原画直链 (v24)**
   - 解决：逆向分析 MacCMS 模板接口与 RESTful 结构，提取 1080P MP4 原画直链并配置空 Referer 直连。
   - 文件：`apps/server/src/lib/moonci.ts`, `apps/server/src/rule-engine/index.ts`, `apps/web/src/data/default-plugins/moonci.json`, `apps/web/src/stores/plugins.ts`
4. **接入全新视频源 TvTFun (tvtfun.net) 专有适配器与 1080P MP4 原画直链 (P0)**
   - 解决：逆向探查前端 Next.js RSC 并绕过 `disable-devtool` 防调试；分析 RESTful JSON 架构与 `tvt-pt` / `X-Play-Ctx` 鉴权，实现 JIT 凭证抓取与 403 自愈机制；获取火山引擎 BytePlus / TopBuzz CDN 1080P MP4 原画直链，支持 HTTP 206 字节拖拽与 0 代理直连。
   - 文件：`apps/server/src/lib/tvtfun.ts`, `apps/server/src/rule-engine/index.ts`, `apps/web/src/data/default-plugins/tvtfun.json`, `apps/web/src/data/default-plugins/index.ts`, `apps/web/src/stores/plugins.ts`
