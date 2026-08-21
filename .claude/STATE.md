# Animaku 项目状态快照 (STATE.md)

> 历史已完成状态记录已归档至 [STATE_ARCHIVE.md](./STATE_ARCHIVE.md)

---

## [2026-08-21] 服务端请求日志体系增强（轻量设备/OS提取 + 业务参数/缓存状态感知 + Pretty/JSON 双模输出）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **User-Agent 与客户端设备轻量解析 (`apps/server/src/lib/logger.ts`)**：
     - 实现 0 外部依赖、带 LRU 缓存的毫秒级 UA 设备解析器 `parseClientDevice`；
     - 自动识别桌面/手机/平板/爬虫类别，并在 Pretty 控制台模式下简化展示核心系统标签（如 `[Win11]`、`[Win10]`、`[iPhone]`、`[Android]`、`[macOS]`、`[iPad]`、`[Linux]`、`[Bot]`）；
     - 支持 Cloudflare `cf-ipcountry` 国家代码提取，在 Pretty 模式下作为独立标签（如 `[IP] [CN]`）渲染，在未接入 CF 或本地直连时自动安全隐去，保证 0 格式污染；
  2. **业务语义参数与缓存状态安全提取**：
     - 智能从请求 Query/JSON Body 中提取关键业务参数（搜索词 `kw`、视频源 `plugin`、集数 `ep`、条目 `bgmId`、年份 `year`、排序 `sort` 等），并自动脱敏过滤 token/password 等敏感凭证；
     - 自动感知响应头 `X-Cache`，输出 `[HIT:L1]`、`[HIT:L2]`、`[MISS]`、`[BYPASS]` 缓存状态；
     - 包含慢请求高亮（`SLOW: >1000ms`）、响应大小（`KB/MB`）以及 4xx/5xx 错误摘要信息；
  3. **Pretty / JSON 双模自适应与环境配置**：
     - 新增 `LOG_FORMAT=pretty|json` 配置（默认为 `pretty`），兼顾终端彩色单行肉眼排错体验与 Loki/ELK 结构化采集；
     - 同步更新 `config.ts`、`docker-compose.yml` 与 `.env.example`；
     - 保持健康检查与媒体分片流量的自动静默过滤。
- 涉及文件：apps/server/src/lib/logger.ts, apps/server/src/index.ts, apps/server/src/config.ts, docker-compose.yml, .env.example, .claude/STATE.md
- 备注：全仓类型检查 `pnpm typecheck` 与全量打包构建 `pnpm build` 0 报错通过。

## [2026-08-21] Docker Compose 接入日志控制器与轮转持久化配置 (LOG_MAX_SIZE & LOG_MAX_FILE)
- 状态：已完成
- 优先级：P2
- 描述：
  1. **Docker 日志控制器配置 (`logging`)**：
     - 在 `docker-compose.yml` 的 `animaku` 服务中接入标准 `json-file` logging driver；
     - 配置默认单文件大小 `max-size: ${LOG_MAX_SIZE:-5m}`，默认历史归档数量 `max-file: ${LOG_MAX_FILE:-10}`，并开启 `compress: "true"` gzip 自动压缩；
     - 限制容器日志总磁盘占用上限（约 $5\text{MB} \times 10 = 50\text{MB}$ 未压缩量，压缩后实际物理占用仅约 $5\sim 10\text{MB}$），杜绝无节制膨胀打满宿主机磁盘；
  2. **环境变量与配置示例同步**：
     - 在 `.env.example` 中补充 `LOG_MAX_SIZE` 与 `LOG_MAX_FILE` 配置项说明。
- 涉及文件：docker-compose.yml, .env.example, .claude/STATE.md
- 备注：配置通过验证。

## [2026-08-21] 修复 Cloudflare CDN 接入后日志 IP 获取被 XFF/X-Real-IP 覆盖问题
- 状态：已完成
- 优先级：P2
- 描述：
  1. **问题排查**：
     - 原 `getClientIp` 函数中优先读取 `x-forwarded-for` 与 `x-real-ip`，而将 Cloudflare 的 `cf-connecting-ip` 置于末尾；
     - 接入 Cloudflare 或经由源站反向代理（如 Nginx/Docker 网络）时，`x-forwarded-for` 或 `x-real-ip` 往往直接拿到上一级 CF 边缘节点 IP，导致 `cf-connecting-ip` 永远无法生效。
  2. **修复落地**：
     - 调整 `apps/server/src/index.ts` 中 `getClientIp` 的提取优先级：`cf-connecting-ip`（CF CDN） > `true-client-ip`（CF Enterprise / Akamai） > `x-real-ip` > `x-forwarded-for` > `127.0.0.1`；
     - 优先获取 Cloudflare 权威注入的真实客户端 IP。
- 涉及文件：apps/server/src/index.ts, .claude/STATE.md
- 备注：`pnpm typecheck` 0 报错通过。

## [2026-08-21] Bangumi API 接口与图片源变量全量接管与免翻反代支持 (BANGUMI_API & BANGUMI_IMAGE)
- 状态：已完成
- 优先级：P0
- 描述：
  1. **极简语义化配置 (`BANGUMI_API` & `BANGUMI_IMAGE`)**：
     - 在 `.env` 中提供 `BANGUMI_API=official|mirror` 和 `BANGUMI_IMAGE=official|mirror` 两个极简环境变量；
     - 自动映射 `official` -> `api.bgm.tv` / `lain.bgm.tv`，`mirror` -> `bgmapi.anibt.net` / `bgmimg.anibt.net`，同时也兼容直接填写自定义域名，彻底消除区分前端 Vite 与后端变量的心智负担；
  2. **跨包统一端点管理 (`@animaku/shared`)**：
     - 新增 `bangumi-endpoint.ts`，定义并集中管理 Bangumi 官方源与镜像反代源（API: `https://api.bgm.tv` <-> `https://bgmapi.anibt.net`，图片: `lain.bgm.tv` <-> `bgmimg.anibt.net`，站点: `https://bgm.tv` <-> `https://bgmmi.anibt.net`）；
     - 提供 `resolveBangumiApiPreset`、`resolveBangumiImagePreset`、`toBangumiApiUrl`、`bangumiSubjectUrl`、`bangumiOAuthUrl` 等标准化解析方法；
  3. **服务端双源无缝适配与智能容灾 (`apps/server`)**：
     - `config.ts` 接入 `BANGUMI_API` / `BANGUMI_IMAGE` 环境变量，默认使用免翻代理 `bgmapi.anibt.net` / `bgmimg.anibt.net`；
     - `routes/bangumi.ts` 支持客户端 `X-Bangumi-Api-Host` 请求头动态覆盖上游；
     - `/calendar` 智能兼容 `next.bgm.tv` 的 `{ "1": [...] }` 对象结构与 `api.bgm.tv` / 反代的 `[{ weekday: { id: 1 }, items: [...] }]` 数组结构，自动双向回退容灾；
     - `/trending` 遇 404/故障时自动回退至 `/v0/search/subjects` 热门排序检索；
  4. **前端全局受控、环境注入与设置页自由切换 (`apps/web`)**：
     - `vite.config.ts` 自动解析 `BANGUMI_API` 与 `BANGUMI_IMAGE` 并注入编译期常量及 preconnect 指令；
     - `stores/settings.ts` 接入 `bangumiApiHost` 状态并持久化至 `localStorage`；
     - `lib/api.ts` 自动为 `/api/bangumi/*` 下发 `X-Bangumi-Api-Host` 请求头；
     - `SettingsPage.tsx` 新增「Bangumi 接口与数据源」配置面板，支持 API 接口源与图片源一键在「反代 (推荐 · 针对国内免翻)」与「官方 (直连 · 需翻墙)」之间无缝切换，Token 生成链接与条目跳转链接动态对齐镜像。
  5. **Docker 与文档体系同步**：
     - 同步更新 `.env.example`、`docker-compose.yml`、`Dockerfile` 与 `docs/CONTEXT.md`。
- 涉及文件：packages/shared/src/bangumi-endpoint.ts, packages/shared/src/bangumi-image.ts, packages/shared/src/bangumi.ts, packages/shared/src/index.ts, apps/server/src/config.ts, apps/server/src/routes/bangumi.ts, apps/web/src/lib/bangumi-api-host.ts, apps/web/src/lib/bangumi-image-host.ts, apps/web/src/lib/api.ts, apps/web/src/stores/settings.ts, apps/web/src/pages/SettingsPage.tsx, apps/web/src/pages/watch/WatchMeta.tsx, apps/web/src/vite-env.d.ts, apps/web/vite.config.ts, .env.example, docker-compose.yml, Dockerfile, docs/CONTEXT.md, .claude/STATE.md
- 备注：全仓类型检查 `pnpm typecheck` 与全量构建 `pnpm build` 0 报错通过。

## [2026-08-20] 项目全量文档体系整理、精简重构与 README 同步升级
- 状态：已完成
- 优先级：P1
- 描述：
  1. **README.md 与 README.en.md 同步升级**：
     - 全面更新产品能力矩阵与特性清单：收录 TvTFun、Cycani、xifan-next 1080P MP4 原画直链，选集 50 话智能分页、正/倒序切换与一键强制刷新，B 站级自研物理时钟弹幕引擎（分级漂移滤波 + rVFC 帧同步 + Retina 位图缓存），播放器右键菜单与 Stats for Nerds 详细统计面板；
     - 梳理并精确修正播放控制快捷键表（`Space`/`K`、`←`/`→`、`↑`/`↓`、`F` 全屏、`Shift+W` 网页全屏、`W` 画面比例、`D` 弹幕三态切换、`Alt+M` 弹幕面板、`,`/`.`/`/` 弹幕微调、`P`/`N` 切集、鼠标右键菜单等）；
     - 同步英中文档结构与快速开始指引，精简废弃代理回退文案，补全 SQLite 数据持久化挂载说明。
  2. **docs/CONTEXT.md 架构上下文精简重构**：
     - 重构为清晰的 7 大核心模块（系统定位与代码组织、请求流与多级缓存体系、视频源体系与规则引擎、播放器与画质管线、自研高精弹幕引擎、环境配置与安全边界、关键踩坑记录与开发守则）；
     - 剔除陈旧冗余描述，收敛为高价值事实参考，同步 SQLite L1/L2 持久化与 Single-Flight 并发防击穿设计。
  3. **docs/TODO.md 与 docs/danmaku-perf.md 梳理重构**：
     - `docs/TODO.md`：清理历史已勾选完结的冗长任务，聚焦规划中特性（跨端备份、规则商店探针、PWA 离线优化等）与架构演进备忘；
     - `docs/danmaku-perf.md`：由早期性能笔记提炼升维为自研高精弹幕渲染引擎架构与性能规范（纯物理时钟、分级漂移治理、rVFC 硬件同步、Retina 离屏位图缓存与 Canvas 2D 架构决策）。
  4. **docs/video-source-integration.md 与 .claude/BUGS.md 优化整理**：
     - 保持接入规范与避坑指南精简清晰，去重 `.claude/BUGS.md` 中冗余重复段落并校正条目编号。
- 涉及文件：README.md, README.en.md, docs/CONTEXT.md, docs/TODO.md, docs/danmaku-perf.md, docs/video-source-integration.md, .claude/BUGS.md, .claude/STATE.md
- 备注：`pnpm typecheck` 全仓 3 个 workspace 类型检查 0 报错。

## [2026-08-20] 优化视频源抽屉条目与关键词紧凑排版与纵向中轴精准居中
- 状态：已完成
- 优先级：P2
- 描述：
  1. **条目中轴垂直居中对齐（`items-center`）**：
     - 在 `SourceBoard.tsx` 中将候选条目与候选关键词卡片的弹性容器由 `items-start` 调整为 `items-center`；
     - 消除单行时因右侧胶囊高度差导致的文字偏上问题，单行文本与操作胶囊严格在条目纵向中轴线上居中；
     - 多行长标题或长词换行时，右侧操作胶囊（选用 / 在播 / 重搜 / 搜索中）保持在卡片整体垂直中轴线上；
  2. **紧凑轻量化排版（消除臃肿）**：
     - 将卡片上下内边距由 `py-2` / `py-1.5` 精简为紧凑轻巧的 `py-1 px-2.5`（4px 上下 padding）；
     - 移除右侧胶囊的 `mt-0.5` 偏移，胶囊尺寸调优为 `text-[9.5px] px-1.5 py-[1px] leading-tight`；
     - 文本行高采用紧凑工整的 `leading-snug`，消除多余空白，整体观感精致轻盈。
- 涉及文件：apps/web/src/pages/watch/SourceBoard.tsx
- 备注：全仓 TypeScript 类型检查与全量打包构建全量通过。

## [2026-08-20] 首页热门类型展示扩充至 3 行（18 部）与板块标题字阶视觉强化
- 状态：已完成
- 优先级：P2
- 描述：
  1. **热门类型展示扩充至 3 行（`SECTION_LIMIT = 18`）**：
     - 在 `HomePage.tsx` 中将各分类板块展示数量由 12 部提升为 `SECTION_LIMIT = 18`；
     - 桌面端 6 列网格正好整齐铺满 **3 整行**（$18 \div 6 = 3$），消除空缺；
     - 同步更新 `BangumiGridSkeleton` 与 `DEFAULT_EAGER_COVERS` 为 18 条，保持骨架屏高度与内容一致，杜绝布局抖动（CLS）；
  2. **板块标题（热门番剧/剧场版/OVA/继续观看）字阶加大加粗（900 Heavy / Black）**：
     - 在 `index.css` 与 `HomePage.tsx` 中重构 `.kz-section-title` 与标题字阶；
     - 移动端字号升级为 `1.625rem`（26px）、字重强制注入 `font-weight: 900 !important;`（Heavy / Black）；
     - 桌面/平板端（`sm:` 640px+）字号升级为 `2.0rem`（32px）、字重 `font-weight: 900 !important;`、`letter-spacing: -0.04em` 与 `line-height: 1.15`；
     - 接入 `font-black`，完全对齐参考图中大字报式极粗、极具冲击力的视觉效果。
- 涉及文件：apps/web/src/pages/HomePage.tsx, apps/web/src/components/ui.tsx, apps/web/src/index.css
- 备注：全仓 TypeScript 类型检查与前端打包构建全量通过。

## [2026-08-20] 视频源抽屉排版优化（精简候选条目与失败提示文案 + 移除悬浮气泡 + 支持条目与关键词多行自适应）
- 状态：已完成
- 优先级：P2
- 描述：
  1. **精简候选与失败提示文案**：
     - 去掉「点选切换绑定」，将文案由 `搜到 N 条候选条目，点选切换绑定：` 收敛为精炼的 `搜到 N 条候选条目：`；
     - 将卡片副标题与抽屉内的绝对化表述 `未收录此番剧` 重构为更加准确客观的 `未搜到结果`（抽屉内提示为 `未搜到结果，尝试换词：`，错误提示统一为 `{errorMsg}，尝试换词：` / `请求失败`）；
  2. **删除指针停留气泡展示**：
     - 彻底移除 `SourceBoard.tsx` 中的 `hoverTip`、`showHoverTip` / `hideHoverTip` 定时器与 DOM 悬浮气泡浮层，精简组件逻辑并释放无用 React hooks；
  3. **允许候选条目与关键词多行自动换行**：
     - 移除候选条目名称与候选关键词按钮的 `truncate` 强制单行截断；
     - 接入 `break-words leading-snug` 与 `items-start` 弹性排版，长标题/长关键词在不同屏幕与侧栏宽度下自然舒适换行，操作胶囊（在播/选用/重搜/搜索中）顶部对齐。
- 涉及文件：apps/web/src/pages/watch/SourceBoard.tsx
- 备注：全仓 TypeScript 类型检查（`pnpm typecheck`）与全量打包构建（`pnpm build`）全量通过。

## [2026-08-20] 修复视频源候选词与自定义换词点击重搜失效 Bug（移除绑定拦截 + 抢占式并发 + 0ms 探活视觉反馈）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查根本原因**：
     - 在 `useSourceAggregator.ts` 的 `processQueue` 中，曾存在 `if (binding?.sourceUrl) { continue }` 逻辑；当视频源已有历史绑定或当前在播时，用户点击候选关键词或输入自定义关键词触发 `reProbePlugin`，任务出队时被该判断无条件拦截并直接跳过，导致 `pluginApi.search` 从未执行；
     - 当后台正在进行前 6 个高权重源自动探测（`activeJobsRef >= 2`）时，用户手动点击的重搜任务被压入队列末尾且未提供状态即时反馈，导致用户感知为「点击无反应」；
     - 展开抽屉在 `state.items.length > 0` 时未渲染 `probing` 提示，重新搜索过程中抽屉内部无加载动效。
  2. **全面修复与重构**：
     - **解除绑定短路拦截**：从 `processQueue` 中移除 `binding?.sourceUrl` 拦截逻辑，确保用户显式触发的重搜/探活一律穿透回源搜索并自动注入 `refresh: true` 穿透服务端缓存；
     - **用户主动操作抢占式并发调度**：在 `prioritizePlugin` 中实现后台自动探测抢占逻辑，当并发池满（$\ge 2$）时自动中断当前低优先级的后台自动探测任务（`activeAutoJobsRef`）并让位给用户的重搜点击，实现 0 延迟即时发起请求；
     - **0ms 即时视觉反馈与搜索中状态**：
       - `reProbePlugin` 被触发瞬间同步置位 `status: 'probing'` 与 `keyword: kw`，并在抽屉中自动填入当前重搜词；
       - 在 `SourceBoard.tsx` 抽屉中新增醒目的「正在使用『XX』检索…」琉璃动画横幅；
       - 候选关键词列表联动高亮当前选中的关键词，并将按钮文案动态切换为「搜索中」，搜索框重搜按钮同步进入 loading 禁用态。
- 涉及文件：apps/web/src/lib/use-source-aggregator.ts, apps/web/src/pages/watch/SourceBoard.tsx
- 备注：全仓 TypeScript 类型检查与全量打包构建（`pnpm build`）全量通过。

## [2026-08-20] 视频源看板交互重构（卡片主体保持一键切源 + 点击胶囊展开候选条目与换词）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **卡片主体与胶囊交互分工明确**：
     - **点击卡片主体**：100% 保持原有快捷体验，`ready` 就绪卡片点击即刻选中当前最佳匹配条目起播，`needs_pick`/`empty`/`error` 点击展开抽屉，当前在播卡片点击防重入；
     - **点击右侧胶囊**：`ready` 的「切换」胶囊与在播的「当前」胶囊点击时展开/折叠候选条目列表抽屉，供用户查看所有候选条目或换词；
  2. **双字极简胶囊（在播/选用/重搜）与 120ms 淡粉色琉璃气泡**：
     - 将操作状态文案统一收敛至 **2 个字**（当前在播标注「在播」，其余备选项标注「选用」，关键词标注「重搜」），为左侧标题多释放了近 40px 空间；
     - **废除浏览器原生 `title` 的 1000ms 冷启动卡顿**，接入受控 120ms 极速响应的 Dark/Light Glassmorphism 磨砂琉璃 Tooltip，消除忽快忽慢问题；
     - 浮层字体与微边框适配温润优雅的**淡粉色调（`text-pink-600 dark:text-pink-300` / `border-pink-500/30`）**，高对比度清晰易读；
     - 采用 `fixed` 定位与视窗边界自适应，彻底避免被局部 `overflow` 容器截断；
  3. **候选条目与关键词纵向清单规整排版**：
     - 候选条目与关键词均采用清晰的纵向列表布局，单行安全截断，彻底消除多行挤占与折叠杂乱；
     - 底部继续保留单源自定义换词输入框与「重搜」按钮。
  4. **微交互与双模态样式对齐**：
     - 在 `index.css` 中为 `.kz-source-pill--active` 补齐 `cursor: pointer` 与悬浮微动效。
- 涉及文件：apps/web/src/pages/watch/SourceBoard.tsx, apps/web/src/index.css
- 备注：全仓 TypeScript 类型检查与前端打包构建全量通过。

## [2026-08-20] 接入老番智能选源加权机制（`oldAnimePriority` 声明式规则 + 动态年份 `currentYear - 5` 判定）(v26)
- 状态：已完成
- 优先级：P1
- 描述：
  1. **声明式老番优先规则支持（`oldAnimePriority`）**：
     - 在 `@animaku/shared` 的 `PluginRule` 接口中新增 `oldAnimePriority?: boolean`；
     - 在 `cycani.json` 与 `tvtfun.json` 规则中配置 `"oldAnimePriority": true`，声明其为全量经典老番优化大库源；
  2. **动态年份计算与上下文加权排序**：
     - 在 `bangumi.ts` 中实现动态老番判定 `isOldAnime(airDate, yearsAgo = 5)`，基于当前年份自动计算（`airYear <= currentYear - 5`），消除固定年份硬编码；
     - 在 `comparePluginOrder` 中支持 `isOldAnime` 上下文参数：当识别到当前番剧为经典老番时，带有 `oldAnimePriority: true` 的视频源自动获得 `+12` 动态权重加成（`cycani` 70 + 12 = 82，`tvtfun` 65 + 12 = 77，自然前置于 `xifan-next` 的 75）；
     - 当播放当期新番（$\ge \text{currentYear} - 4$）时，100% 维持标准内置源梯队（`xifan-next` 75 > `cycani` 70 > `tvtfun` 65）；
  3. **选源决策树与客户端无感升级**：
     - 在 `use-watch-session.ts` 的 `findDefaultSourcePlugin` 与 `orderSearchRows` 中接入 `isOld` 计算与排序分流；
     - 在 `stores/plugins.ts` 中递增 `PLUGIN_DEFAULTS_VERSION`（`25 -> 26`），确保老用户客户端无感自动平滑升级。
- 涉及文件：packages/shared/src/plugin.ts, packages/shared/src/bangumi.ts, apps/web/src/data/default-plugins/cycani.json, apps/web/src/data/default-plugins/tvtfun.json, apps/web/src/stores/plugins.ts, apps/web/src/lib/use-watch-session.ts
- 备注：全仓类型检查与打包构建全量通过。

## [2026-08-20] 修复播放器进度条热力图上方与全域点击拖动失效（统一 Pointer 事件流与 30px 大热区捕获）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查根本原因**：
     - 原先进度条仅由 12px 高度的原生 `<input type="range">` 单独监听点击与拖拽；
     - 外层 `.kz-seek-wrap` 包含 22px 的弹幕热力图波形与 OP/ED 标记，光标移至热力图波形区域或进度条上方内边距时，外层容器因配置了 `cursor: pointer` 呈现手型光标并展示浮动时间 Tooltip；
     - 但用户点击该区域时事件被外层 `div` 拦截，未能下发给底层小尺寸 `<input>`，导致点击和拖拽操作完全无响应；
  2. **统一全域 Pointer 事件捕获与拖拽（`PointerCapture`）**：
     - 在 `DesktopControls.tsx` 与 `MobileControls.tsx` 中为 `.kz-seek-wrap` 接入统一的 `onPointerDown`、`onPointerMove`、`onPointerUp` 与 `onPointerCancel` 事件流；
     - 命中指针按下（`pointerdown`）即刻触发 `setPointerCapture(pointerId)` 锁定指针，无论在热力图波形、章节标记还是轨道上点击，均毫秒级同步计算精确横向比例并执行 `onSeekRatio(ratio)`；
     - 拖拽期间（即使光标移出播放器控制栏视窗）依托 Pointer Capture 机制依然平滑持续拖拽寻道，松开指针即刻无缝释放；
  3. **样式与布局热区升维**：
     - 在 `plyr-overrides.css` 中将 `.kz-seek-wrap` 优化为 30px 高度的大交互热区（`padding: 14px 0 4px; touch-action: none; user-select: none;`），将热力图波形完全囊括在容器点击热区内；
     - 为 `<input className="kz-seek">` 注入 `pointer-events: none;`，消除原生 range shadow DOM 对鼠标点击的阻断，同时保留键盘 Tab 聚焦与方向键微调（`onChange`）无障碍支持；
     - 精确对齐 OP/ED 标记 `.kz-seek-marker`（`bottom: 8px`，Hover `bottom: 7px`）与 Tooltip 浮层高度。
- 涉及文件：apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：全仓类型检查与前端生产构建打包验证全量通过。

## [2026-08-20] 调优内置视频源默认权重梯队（xifan-next: 75, cycani: 70, moonci: 65, tvtfun: 65）(v25)
- 状态：已完成
- 优先级：P1
- 描述：
  1. **首屏选集加载关键路径（Critical Path）体验调优**：
     - 用户进入播放页的首要体验在于集数列表的呈现速度；`xifan-next` 与 `cycani` 拥有 200~400ms 的极速毫秒级检索能力，能在进页面 700ms 内瞬间刷出完整选集列表，彻底消除首屏转圈等待感；
  2. **内置源权重与默认排序更新**：
     - `xifan-next.json`: 权重提升至 `75`（首选默认源，日文原名优先，Supabase 毫秒级检索）；
     - `cycani.json`: 权重提升至 `70`（次选默认源，Go API 极速出选集，1080P Cloudflare 原画 MP4 直链与全量大库）；
     - `moonci.json`: 权重调优为 `65`（12,000+ 部全量大库，切集 340ms 极速，日文原名优先）；
     - `tvtfun.json`: 权重调优为 `65`（1080P MP4 原画备用源）；
  3. **客户端版本热升级**：
     - 在 `apps/web/src/stores/plugins.ts` 中递增 `PLUGIN_DEFAULTS_VERSION`（`24 -> 25`），确保老用户客户端无感自动平滑升级为最新权重顺序。
- 涉及文件：apps/web/src/data/default-plugins/xifan-next.json, apps/web/src/data/default-plugins/cycani.json, apps/web/src/data/default-plugins/moonci.json, apps/web/src/data/default-plugins/tvtfun.json, apps/web/src/data/default-plugins/index.ts, apps/web/src/stores/plugins.ts
- 备注：全仓类型检查 `pnpm typecheck` 全部通过。

## [2026-08-20] 优化多视频源自动探测限制为前 6 个高权重源并支持按需即时探活
- 状态：已完成
- 优先级：P1
- 描述：
  1. **多源自动探测上限收敛（`AUTO_PROBE_LIMIT = 6`）**：
     - 在 `useSourceAggregator.ts` 中设定默认仅自动排队探测排名前 6 个高权重优质视频源（如 `xifan-next`、`tvtfun`、`moonci`、`cycani`、`anime1`、`libvio`）；
     - 将展开面板时的后台请求峰值削减 35%~50%，避免对低权重/冷门备用源发起无意义的并发请求；
  2. **轻量待机（`idle`）与按需即时探活**：
     - 排名 6 名之后的视频源默认保持 `待探活`（`idle`）状态，呈现 `.kz-source-pill--idle`（「探活」胶囊按钮）；
     - 用户点击任意待机卡片或点击「探活」按钮时，通过 `prioritizePlugin` 瞬间插队到队列首位触发即时探测；
  3. **视觉与交互对齐**：
     - `index.css` 补齐 `.kz-source-pill--idle` 双模态样式与天青色悬浮微高亮。
- 涉及文件：apps/web/src/lib/use-source-aggregator.ts, apps/web/src/pages/watch/SourceBoard.tsx, apps/web/src/index.css
- 备注：全仓类型检查与打包构建全量通过。

## [2026-08-20] 接入全新视频源 Moonci (月之祠 moonci.com) 专有适配器与 1080P MP4 原画直链 (v24)
- 状态：已完成
- 优先级：P0
- 描述：
  1. **逆向探查与协议分析**：
     - 探查了 Moonci (月之祠) 的 MacCMS 模板架构与 RESTful 接口；
     - 提取出其毫秒级联想搜索接口 `/index.php/ajax/suggest?mid=1&wd=...` 及 Web 搜索备用回退；
     - 逆向分析其多线路结构（`X.1`, `X.2`, `X.3`, `X.4`）与播放配置 `player_aaaa`（`encrypt: 1`，`unescape` 解码）；
  2. **媒体流与画质表现**：
     - 下发联通云盘 / moedot CDN / xfvod 等高清 1080P MP4 原画直链，实测响应 `HTTP 206 Partial Content`，支持字节范围拖拽；
     - 针对源站 CDN 特性配置空 Referer（`no-referrer`），浏览器端直连播放，0 代理带宽消耗；
  3. **架构与工程落地**：
     - 新建专有适配器 `apps/server/src/lib/moonci.ts`，实现搜索、章节多线路与直链解析；
     - 在 `apps/server/src/rule-engine/index.ts` 中完成 `search`、`chapters`、`resolve` 挂载；
     - 新建默认规则 `apps/web/src/data/default-plugins/moonci.json`，配置权重 `70` 与 `preferOriginalTitle: true`（日文原名优先），并在 `default-plugins/index.ts` 中注册；
     - 调整 `cycani.json` 权重至 `65`；
     - 在 `apps/web/src/stores/plugins.ts` 中递增 `PLUGIN_DEFAULTS_VERSION`（`23 -> 24`）并追加 `moonci` 到 `legacyBuiltinNames`。
- 涉及文件：apps/server/src/lib/moonci.ts, apps/server/src/rule-engine/index.ts, apps/web/src/data/default-plugins/moonci.json, apps/web/src/data/default-plugins/cycani.json, apps/web/src/data/default-plugins/index.ts, apps/web/src/stores/plugins.ts
- 备注：集成测试全通过，`pnpm typecheck` 与 `pnpm build` 全仓 0 报错。

## [2026-08-20] 接入全新视频源 TvTFun (tvtfun.net) 专有适配器与 1080P MP4 原画直链
- 状态：已完成
- 优先级：P0
- 描述：
  1. **逆向探查与协议分析**：
     - 排查了 tvtfun 前端 Next.js RSC 内置的 F12 防调试重定向组件（`disable-devtool` 跳转百度）；
     - 逆向分析出其标准 RESTful JSON 后端架构，包括搜索接口 `/api/videos/search?q=...`、分集接口 `/api/videos/:id` 以及播放发流接口 `/api/videos/resolve-play-url`；
     - 突破了其 `tvt-pt`（6小时 HMAC 时间戳 Cookie）与 `X-Play-Ctx`（手势上下文）鉴权，并实现了 403 自动重新抓取凭证无感自愈机制；
  2. **媒体流与画质表现**：
     - 下发火山引擎 BytePlus CDN / TopBuzz CDN / Akamai 高清 1080P MP4 原画直链，实测响应 `HTTP 206 Partial Content`，支持字节范围拖拽；
     - 兼容 Animaku 的 `no-referrer` 直连策略，浏览器端 0 代理消耗直接播放；
  3. **架构与工程落地**：
     - 新建专有适配器 `apps/server/src/lib/tvtfun.ts`；
     - 在 `apps/server/src/rule-engine/index.ts` 中完成 `search`、`chapters`、`resolve` 挂载；
     - 新建默认规则 `apps/web/src/data/default-plugins/tvtfun.json`，配置权重 `70`，并在 `default-plugins/index.ts` 中注册；
     - 在 `apps/web/src/stores/plugins.ts` 中递增 `PLUGIN_DEFAULTS_VERSION`（`21 -> 22`）并追加 `tvtfun` 到 `legacyBuiltinNames`。
- 涉及文件：apps/server/src/lib/tvtfun.ts, apps/server/src/rule-engine/index.ts, apps/web/src/data/default-plugins/tvtfun.json, apps/web/src/data/default-plugins/index.ts, apps/web/src/stores/plugins.ts
- 备注：集成测试全通过，`pnpm typecheck` 与 `pnpm build` 全仓 0 报错。
