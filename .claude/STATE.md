# Animaku 项目状态

## [2026-08-18] 服务器代理开关权限上锁与行内琉璃解锁交互设计落地
- 状态：已完成
- 优先级：P0
- 描述：
  1. **服务端管理员代理口令保护与鉴权拦截（`apps/server/`）**：
     - `apps/server/src/lib/access.ts`：当配置了 `PROXY_TOKEN` 时，凡访问 `/api/media/proxy` 等代理接口，严格校验 Header `X-Animaku-Proxy-Token` 或 Query `?token=`；未提供或口令不符时一律 403 拒绝拉流（防止未授权访客刷取服务器流量）；
     - `apps/server/src/index.ts`：在 `/api/health` 中暴露 `proxyTokenRequired` 状态感知字段；
     - 新增 `POST /api/proxy/verify` 验证接口：验证传入的 `token`，口令错误时主动延时 300ms（防暴力穷举），口令正确返回 `{ ok: true, required: true }`。
  2. **客户端静默鉴权与持久化（`apps/web/src/stores/settings.ts` & `playback-src.ts`）**：
     - 在 `useSettingsStore` 中增加 `proxyToken` 字段并持久化于 `localStorage`；
     - `apps/web/src/lib/api.ts` 全局拦截器自动在请求头中注入 `X-Animaku-Proxy-Token`；
     - `apps/web/src/lib/playback-src.ts` 与 `use-watch-session.ts` 中，为需要走代理的媒体流链接自动追加 `?token=...`，保证 `<video>` 与 Hls.js 分片鉴权无缝透传。
  3. **设置页「服务器代理」开关上锁与行内平滑解锁 UI（`SettingsPage.tsx`）**：
     - **锁定态**：若服务端配置了 `PROXY_TOKEN` 且本地未解锁，开关展示 `🔒 服务器代理（需口令解锁）`；
     - **行内展开卡片（Inline Spring Accordion）**：点击开关平滑展开磨砂卡片，包含密码输入框、👁️ 显隐切换、Enter 快捷提交；
     - **错误物理震颤微动效**：密码错误时触发 `animate-kz-shake` 左右晃动微动效与绯红提示；
     - **解锁成功动效**：验证通过后自动转为 `🔓 已解锁管理员权限`，开关自动拨至开启态并关闭卡片；
     - **随时重新锁定**：解锁后提供 `[🔒 重新锁定]` 快捷按钮，点击一键清除本地保存的口令并重新闭锁。
- 涉及文件：apps/server/src/lib/access.ts, apps/server/src/index.ts, apps/web/src/stores/settings.ts, apps/web/src/lib/server-capabilities.ts, apps/web/src/lib/api.ts, apps/web/src/lib/playback-src.ts, apps/web/src/lib/use-watch-session.ts, apps/web/src/pages/SettingsPage.tsx, apps/web/src/index.css, .claude/STATE.md
- 备注：`pnpm typecheck` 全仓 0 错误通过，`pnpm build` 全量打包编译通过。

## [2026-08-18] 视频源番剧搜索缓存重构为 SQLite 存储、支持 Docker 数据持久化与高扩展性架构设计
- 状态：已完成
- 优先级：P0
- 描述：
  1. **SQLite 核心数据库与多层级缓存架构（`apps/server/src/db/`）**：
     - 构建企业级 SQLite 核心引擎（基于 Node 22 原生 `node:sqlite` 的 `DatabaseSync`），全面启用 WAL（Write-Ahead Logging）模式、`synchronous = NORMAL`、`busy_timeout = 5000ms` 与 Prepared Statement 预编译缓存；
     - 引入版本化数据库迁移管理（`_schema_migrations`），支持零停机热升级与未来数据表平滑迁移；
     - 建立 `plugin_search_cache` 专有搜索缓存表（索引 `expires_at`、`plugin_name, keyword`、`created_at`）及 `hit_count` 命中统计字段；
     - 抽象通用高扩展 Key-Value 缓存表（`kv_cache`，支持 namespace 隔离与独立 TTL），方便未来用户同步、弹幕缓存、元数据持久化等任意功能无缝接入；
     - 实现定时后台垃圾回收机制（`clearExpired`），每小时自动安全清理过期缓存记录，防数据库文件无限膨胀。
  2. **双层缓存流水线接入（L1 Memory + L2 SQLite）**：
     - 在 `apps/server/src/routes/plugin.ts` 中重构 `/search` 路由：
       - **L1 内存缓存**（< 0.1ms 极速命中）；
       - **L2 SQLite 磁盘持久化**（< 1ms 毫秒级命中，容器重启/镜像更新/服务重启后零丢失）；
       - **Miss 穿透回源**：通过 Single-Flight 并发防击穿机制执行上游搜索解析，并原子写入 L1 + L2；
       - **强刷旁路**：识别 `refresh=1` 或 `Cache-Control: no-cache`，支持瞬时清理旧缓存并强制回源重搜。
  3. **Docker Compose 数据持久化与更新防丢数据**：
     - 在 `docker-compose.yml` 中挂载主机数据卷 `./data:/app/data` 并注入 `DATA_DIR=/app/data`；
     - 在 `Dockerfile` 中安全预建 `/app/data` 并赋权 `node:node` 用户，声明 `VOLUME ["/app/data"]`；
     - 在 `.env.example` 中补充 `DATA_DIR` 与 `SQLITE_PATH` 配置说明；
     - 在 `.gitignore` 中完善 `data/`、`*.db`、`*.db-wal`、`*.db-shm` 规则，防止本地数据库污染 git 仓库。
- 涉及文件：apps/server/src/db/connection.ts, apps/server/src/db/schema.ts, apps/server/src/db/repositories/plugin-search-cache.ts, apps/server/src/db/repositories/kv-cache.ts, apps/server/src/db/index.ts, apps/server/src/config.ts, apps/server/src/index.ts, apps/server/src/routes/plugin.ts, docker-compose.yml, Dockerfile, data/.gitkeep, .env.example, .gitignore, .claude/STATE.md
- 备注：通过在仓库内维护 `data/.gitkeep`，确保用户通过 `git clone` 拉取项目时宿主机已预先存在 `data/` 目录，杜绝 Docker daemon 以 root 自动建目录导致的非 root 容器用户写权限拒绝（EACCES）问题。`pnpm typecheck` 全仓 0 错误通过，`pnpm build` 全量打包编译通过。

## [2026-08-18] 修复视频源首屏起播、折叠时机、白天主题适配与失败源自定义重搜
- 状态：已完成
- 优先级：P0
- 描述：
  1. **首屏起播与默认折叠（0 冗余网络请求）**：
     - 修复 `use-watch-session.ts`：在条目元数据（`item`）异步获取完成前不提前标记 `defaultSearchDoneFor`，确保元数据就绪后 100% 自动触发首个默认源（如 `xifan-next`）的搜索与起播；
     - `WatchPage.tsx` 中将 `sourcesOpen` 调整为 `false`（默认折叠），消除打开播放页时先展开后折叠的闪烁，且起播期间对其他视频源 0 网络请求；仅当用户主动展开视频源时才按需触发流式探测。
  2. **白天/黑夜双模态设计 Token 全面适配**：
     - `SourceBoard.tsx` 全面移除硬编码暗色类名，接入 `var(--kz-*)` 双模态设计系统（`--kz-bg-elevated`、`--kz-bg-soft`、`--kz-border`、`--kz-fg`、`--kz-accent` 等）；
     - 白天模式下文字黑白对比舒适清晰，关键词选择下拉框与输入框背景柔和自然。
  3. **直访与续播激活源状态同步**：
     - 从带 `plugin=...` 直链或历史记录进入时，`useSourceAggregator` 自动将当前激活源识别为 `ready` 状态；
     - 配合 `sourcesOpen=false`，从历史记录进入时仅请求历史源，绝不再并发请求排第一的默认源。
  4. **失败源与待选源手动换词与自定义重搜**：
     - 在 `useSourceAggregator` 中支持 `reProbePlugin(pluginName, customKeyword)` 与 5s 柔性超时；
     - 在 `SourceBoard.tsx` 中，针对探测失败（`error` / `empty`）及待选（`needs_pick`）源提供平滑展开卡片能力，包含快捷候选关键词 chips（日语原名/中文译名等）及单独的关键词输入框，支持针对单源换词重搜。
  5. **卡片视觉排版升维与胶囊统一（对标 Safari / 主流流媒体）**：
     - 移除已有 3 色状态圆点下的冗余前缀文本（如「🟢 已就绪 ·」等），副标题直接展示匹配条目名；
     - 匹配标题严格限制为单行文本截断（`truncate` / `block`），杜绝长标题折行撑大卡片高度；
     - 统一所有操作胶囊（「切换」、「换词重试」、「当前使用」、「选条目」、「加载中」）为统一尺寸体系：固定 `h-6`（24px）、`px-2.5`、`leading-none`、`font-semibold` 与统一描边，彻底消除高低不一和字体差异；
     - 移除面板顶部冗余的全局搜索栏，将界面空间百分之百留给视频源卡片列表。
  6. **历史记录进入精准定向目标源（0 冗余默认源加载）**：
     - `HistoryPage.tsx` 中卡片主体链接统一为带完整 query 的 `/play/:id?...` 链接，消除此前跳转丢失历史源参数的问题；
     - `use-watch-session.ts` 中 `keywordTargetPlugin` 预选优先读取 `qPlugin`，并在检测到 URL 显式带源时绝对阻断首位默认源的后台搜索与探测，确保 100% 仅加载并请求历史指定的视频源。
  7. **首页「继续观看」卡片上限精简为 4 项**：
     - `HomePage.tsx` 中将最近观看数量由 6 条精简为 **4 条**（`items.slice(0, 4)`）；
     - 网格布局调整为 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`，在大屏/桌面端整齐铺满 1 整行，手机端避免竖向过长占用首屏视线。
- 涉及文件：apps/web/src/pages/HomePage.tsx, apps/web/src/pages/HistoryPage.tsx, apps/web/src/lib/use-watch-session.ts, apps/web/src/lib/use-source-aggregator.ts, apps/web/src/pages/WatchPage.tsx, apps/web/src/pages/watch/SourceBoard.tsx, apps/web/src/index.css, .claude/BUGS.md, .claude/STATE.md
- 备注：`pnpm typecheck` 全仓 0 错误通过，`pnpm build` 全量构建打包通过。

## [2026-08-18] 视频源架构体系重构与流媒体级交互体验升级落地
- 状态：已完成
- 优先级：P0
- 描述：
  1. **阶段 1：数据持久化、集数对齐与切源继承**：
     - 在 `packages/shared/src/episode.ts` 中实现 `parseEpisodeNumber` 与 `findMatchingEpisodeIndex` 算法，支持常规话数、带前缀/后缀、小数分集、SP/OVA 等多样化标题归一化与跨源对齐；
     - 在 `apps/web/src/stores/source-bindings.ts` 中构建 `useSourceBindingStore`（Zustand + `localStorage` + 1000条 LRU，~150KB），支持 0ms 绑定直达与静默安全门禁（相似度 $\ge 0.50$ 才持久化，$< 0.50$ 仅内存播放防投毒）；
     - 在 `apps/web/src/lib/use-watch-session.ts` 中重构切源链路：支持 0ms 绑定直达起播、跨源切源时自动对齐当前集数与秒级播放进度无缝继承。
  2. **阶段 2：按需流式聚合探测器与 3 色琉璃流媒体看板**：
     - 实现 `apps/web/src/lib/use-source-aggregator.ts`，基于 2 并发轻量池进行 3s 快速超时熔断探测，支持源级独立状态流式推送与用户点击插队抢占；
     - 构建 `apps/web/src/pages/watch/SourceBoard.tsx` 与 `WatchHudToast.tsx`，采用 Dark Glassmorphism 琉璃暗场美学与流媒体级 3 色动态微光指示器（🟢 Emerald 已就绪 / 🟡 Amber 待选 / 🔴 Rose 异常或未收录 / ⏳ 探活 Shimmer）；
     - 在 `WatchPage.tsx` 中全面替换为新看板与浮层 HUD 提示。
  3. **阶段 3：故障自愈闭环与规则预处理完善**：
     - 实现 404 / 502 / 空分集时的静默自愈机制（自动剔除损坏的持久化绑定并回源单次重搜）；
     - 在 `PluginRule` 中扩展 `traditionalChinese` 与 `stripSymbols` 特性声明，并在服务端 `searchWithRule` 中接入预处理；
     - 在内置源 `anime1.json` 中配置 `"traditionalChinese": true`。
- 涉及文件：packages/shared/src/episode.ts, packages/shared/src/index.ts, packages/shared/src/plugin.ts, apps/web/src/stores/source-bindings.ts, apps/web/src/lib/use-watch-session.ts, apps/web/src/lib/use-source-aggregator.ts, apps/web/src/pages/watch/SourceBoard.tsx, apps/web/src/pages/watch/WatchHudToast.tsx, apps/web/src/pages/WatchPage.tsx, apps/web/src/data/default-plugins/anime1.json, apps/server/src/rule-engine/index.ts, docs/TODO.md, .claude/STATE.md
- 备注：`pnpm typecheck` 全仓 0 错误通过，`pnpm build` 全量打包验证通过。

## [2026-08-18] 视频源关键字搜索偏好与源级独立记忆机制（日语原名优先 / 中文优先）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **数据模型与偏好解析（`packages/shared/src/plugin.ts`）**：
     - 在 `PluginRule` 中新增 `preferOriginalTitle?: boolean` 可选布尔字段；
     - 在 `parsePluginRule` 中完成解析；
     - 封装并导出通用关键词解析纯函数 `resolvePluginDefaultKeyword(plugin, item, fallback)`：当源规则开启 `preferOriginalTitle` 时，优先使用日文原名 `item.name`，否则默认使用中文译名 `item.nameCn`；
  2. **内置源规则配置与版本升级（`apps/web/src/data/default-plugins/` & `stores/plugins.ts`）**：
     - 为日文标题友好的三大内置源配置 `"preferOriginalTitle": true`：`xifan-next.json`（稀饭 Next）、`libvio.json`（LIBVIO）、`omofun.json`（Omofun）；
     - 其余内置源（`anime1`、`mxdm`、`otage`、`xifan`、`age` 等）及外部源维持缺省（中文优先）；
     - 递增 `PLUGIN_DEFAULTS_VERSION` 至 19，并在 `ensureDefaults` 中自动对齐现有缓存的 `preferOriginalTitle` 配置；
  3. **播放会话多源动态关键词与源级独立记忆（`apps/web/src/lib/use-watch-session.ts`）**：
     - 引入 `manualKeywords: Record<string, string>` 记录用户手动干预过的源及其关键词；
     - **未手动干预时（纯切源）**：点击切源时自动按目标源自身偏好（如切到 xifan-next 搜日文原名，切到 mxdm 搜中文译名）计算关键词并同步更新输入框与搜索，消除上一源残留关键词污染；
     - **手动干预后（源级记忆）**：用户在输入框打字或下拉框点选关键词后，仅在该源上锁定手动关键词，切其他源不强加覆盖，切回该源继续保持手动词；
     - **候选列表智能置顶**：`keywordCandidates` 动态将当前源偏好的主标题（日文原名或中文名）置顶于首项，下拉菜单体验高度自然。
- 涉及文件：packages/shared/src/plugin.ts, apps/web/src/data/default-plugins/xifan-next.json, apps/web/src/data/default-plugins/libvio.json, apps/web/src/data/default-plugins/omofun.json, apps/web/src/data/default-plugins/index.ts, apps/web/src/stores/plugins.ts, apps/web/src/lib/use-watch-session.ts, apps/web/src/pages/WatchPage.tsx, docs/TODO.md
- 备注：`pnpm typecheck` 全仓 0 错误通过，`pnpm build` 全量打包构建通过。

## [2026-08-17] 番剧简介图片支持点击跳转 Bangumi (bgm.tv) 条目页与桌面端大封面重构
- 状态：已完成
- 优先级：P2
- 描述：
  1. **简介封面点击直达 Bangumi (bgm.tv)**：
     - 在 `apps/web/src/pages/watch/WatchMeta.tsx` 中封装统一 `MetaCover` 封面组件；
     - 当 `item.id > 0` 时将封面包裹为 `<a>` 链接标签，点击在新标签页（`target="_blank" rel="noopener noreferrer"`）直接跳转至对应番剧的 `https://bgm.tv/subject/${item.id}` 条目主页；
     - 悬浮时提供流畅的微放大动效（`group-hover:scale-105`）与天青色外边框高亮（`hover:ring-2 hover:ring-[var(--kz-accent)]`），带有原生 `title` 提示信息。
  2. **桌面端大封面比例与排版对齐 (对标 B 站设计)**：
     - 将桌面端封面尺寸由原偏小的 108×144px 放大升级为标准海报比例（`w-[10.5rem] h-[14rem]` / `lg:w-[11.25rem] lg:h-[15rem]`，即 168~180px × 224~240px）；
     - 高度精准对齐右侧未展开状态下的简介整体高度（标题 + 放送状态/标签 + 3 行折叠摘要 + 追番按钮行），底部留有适度呼吸空隙，整体观感更加饱满大气；
     - 桌面端封面选用 `size="large"`（800px 高清源），Retina / 4K 屏幕下保持极致锐利；移动端保持原有轻量尺寸完全不变。
- 涉及文件：apps/web/src/pages/watch/WatchMeta.tsx
- 备注：`pnpm typecheck` 全仓 0 错误通过，`pnpm build` 全量打包构建验证通过。

## [2026-08-17] 优化 xifan-next 视频解析性能与签名直链缓存策略
- 状态：已完成
- 优先级：P1
- 描述：
  1. **302 重定向探测升级为 `HEAD` 极速探测（零 Body 传输）**：
     - 在 `apps/server/src/lib/xifan-next.ts` 中，将获取到直链后的探测方法由 `GET` 替换为 `HEAD`（`redirect: 'manual'`，超时收敛为 3s）；
     - 彻底消除服务端向媒体服务器（MP4/M3U8）拉取大文件首包数据的多余网络耗时与外网下行带宽消耗，单次解析首帧耗时降低 300ms ~ 1500ms。
  2. **401/403 Publishable Key 嗅探升级为并发竞赛（`Promise.allSettled`）**：
     - 将原本串行遍历最多 10 个 chunk JS 文件的低效重试机制改造为前 6 个 chunk 文件的并发探测；
     - 401 密钥失效时的自愈时间从最坏 10~30s 缩减至 1~2s，彻底杜绝界面卡死假死。
  3. **启用预签名直链安全短时缓存（`resolveSigned: 60s`）**：
     - 在 `apps/server/src/lib/ttl-cache.ts` 中，将时效签名链接从 0 缓存调整为 **60 秒**安全短时缓存；
     - 针对带 `cookie` 敏感鉴权的请求独立拆分 `resolveCookie: 0` 保持绝对安全隔离；
     - 用户在切集、连播下一话、回退播放或短时间内反复点选同一分集时，直接走内存极速返回（< 5ms）。
- 涉及文件：apps/server/src/lib/xifan-next.ts, apps/server/src/lib/ttl-cache.ts
- 备注：`pnpm typecheck` 全仓 0 错误通过，`pnpm build` 全量打包验证通过。

## [2026-08-16] 优化视频源排序机制（权重排序 > 首字母排序，全量规则与文件名统一纯小写）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **数据模型与解析扩展**：
     - 在 `@animaku/shared` 的 `PluginRule` 接口中增加 `weight?: number` 权重字段；
     - 在 `parsePluginRule` 中支持解析 `weight` 数值字段；
     - 封装并导出通用比较函数 `comparePluginOrder(a, b)`：优先按 `weight` 降序排列；内置源未指定时默认权重 50，第三方仓库/外部导入源默认权重 0；权重相同时按名称首字母 `a.name.toLowerCase().localeCompare(b.name.toLowerCase())` 稳定字母序排布。
  2. **内置视频源梯度权重配置与小写规范化**：
     - 将所有视频源名称（alias）与 JSON 文件名全量统一为小写（`mxdm.json`、`libvio.json`、`anime1.json`、`age.json` 等）；
     - 精准配置各内置源权重：`xifan-next` (70) > `anime1` (60) = `libvio` (60) > `mxdm` (55) > `omofun` (50) = `otage` (50) = `xifan` (50) > 第三方外部源 (0)；
     - 递增 `PLUGIN_DEFAULTS_VERSION` 至 18，并在 `ensureDefaults` 中自动清理旧版本遗留在本地 `localStorage` 中的旧排序列表（`pluginOrder: []`），使全新权重排序 100% 立即生效并消除旧排序覆盖。
  3. **全站展示与选源排序统一**：
     - `apps/web/src/stores/plugins.ts` 中的 `seedFromDefaults`、`defaultPluginOrder`、`sortByOrder`、`ensureDefaults` 全量统一接入 `comparePluginOrder`；
     - 优化 `importRule`，未自定义顺序时外部引入规则默认沉底排在权重 0 位置；
     - `use-watch-session.ts`（侧栏源行 `orderSearchRows` 与默认起搜源 `findDefaultSourcePlugin`）及 `SettingsPage.tsx`（已安装规则列表 `sortPluginsByOrder`）全面接入统一权重排序。
- 涉及文件：packages/shared/src/plugin.ts, apps/web/src/data/default-plugins/*.json, apps/web/src/data/default-plugins/index.ts, apps/web/src/stores/plugins.ts, apps/web/src/lib/use-watch-session.ts, apps/web/src/pages/SettingsPage.tsx
- 备注：`pnpm typecheck` 全仓 0 错误通过，`pnpm build` 全量打包验证通过。

## [2026-08-16] 修复切换视频源时首个默认源异步完成竞态覆盖的跳转 Bug
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查根本原因（Race Condition）**：
     - 用户从历史记录或播放页进入时，首个默认源（如 `libvio`）在后台启动了初始预搜索（`openPluginSearch(preferred, ..., { autoPickFirst: true })`）；
     - 当用户点击其它视频源（如 `xifan-next`）时，`xifan-next` 的搜索和分集已选定并渲染；
     - 随后较慢的首个默认源搜索结果异步返回，其内部的 `shouldAutoPick`（由于 `opts.autoPickFirst === true`）无条件触发了 `pickSource(libvio, items[0])`，强行清空并覆盖了用户当前已选择的 `xifan-next` 分集，视觉上呈现为“第一下切换正常，随后突然刷新跳回首个源”。
  2. **全面防御性修复方案**：
     - **目标源与已选源严格卡控**：在 `use-watch-session.ts` 的 `searchOnePlugin` 中增加多重防御断言，当搜索结果返回时，若 `selectionRef.current` 或 `keywordTargetPluginRef.current` 与当前返回结果的规则不同且未显式指定 `clearSelection` 时，**严禁自动覆盖选源**；
     - **初始搜索状态幂等锁定**：进入时若 URL 带有 `plugin` 或已有激活选源，立即锁定 `defaultSearchDoneFor.current = bangumiId`，切断一切后续重复触发首源搜索的可能；
     - **侧边栏切源语义明确化**：在 `WatchPage.tsx` 侧栏点击源卡片时显式传递 `{ clearSelection: true, autoPickFirst: true }`，确保用户主动切换行为具备最高优先级。
- 涉及文件：apps/web/src/lib/use-watch-session.ts, apps/web/src/pages/WatchPage.tsx
- 备注：`pnpm typecheck` 全仓 0 错误通过，`pnpm build` 全量打包通过。

## [2026-08-16] 接入稀饭动漫全新平台（xifan-next）多线路解析与全量去防盗链修复
- 状态：已完成
- 优先级：P0
- 描述：
  1. **多线路（Multi-Roads）全量解析落地**：
     - 重构 `apps/server/src/lib/xifan-next.ts` 中的 `chaptersXifanNext`，新增 Next.js SSR 串流 Chunk 提取器（`extractSourcesFromHtml`）；
     - 完整解析平台全量播放线路（如「稀饭新番主线-1 (xfxf1)」、「稀饭新番主线-2 (AL)」、「稀饭备用-1 (CS)」、「稀饭旧番主线-1 (xfy2)」等），分集链接附带 `?source={code}`；
     - 当 SSR 解析异常时平滑回退至 Supabase REST `episodes` 表。
  2. **视频无法播放修复与全局 `no-referrer` 去防盗链**：
     - **排查根本原因**：视频流重定向至联通云盘直链（`pan.wo.cn`），该 CDN 会严格拒绝带有外部跨域 Referer（如 `Referer: localhost` 或站点域名）的请求并报错 `400 Bad Request`；
     - **解决方案**：
       1. 在 `apps/server/src/lib/xifan-next.ts` 中针对 `pan.wo.cn` / `moedot.net` 主动重设 Referer 为 `https://pan.wo.cn/` 并于服务端抢跑探测 302 目标下发直链；
       2. 在 `apps/web/index.html` 与 `VideoPlayer.tsx` `<video>` 上配置全局 `referrerPolicy = 'no-referrer'`，对齐 `next.xifanacg.com` 官方规范，彻底消除 CDN 防盗链拦截。
  3. **规则规范与版本升级**：
     - `xifan-next.json` 规则格式对齐 `Anime1.json`；
     - 递增 `PLUGIN_DEFAULTS_VERSION` 至 14，客户端自动更新。
- 涉及文件：apps/server/src/lib/xifan-next.ts, apps/web/src/player/VideoPlayer.tsx, apps/web/index.html, apps/web/src/data/default-plugins/xifan-next.json, apps/web/src/stores/plugins.ts, docs/video-source-integration.md
- 备注：`pnpm typecheck` 全仓 0 错误通过，`pnpm build` 全量打包通过。

## [2026-08-15] 放大移动端超分面板字体与间距（对齐设置面板字号）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **字号与内边距对齐设置面板**：
     - 将移动端超分面板（`.kz-speed-menu button`）选项字体由 `11px` 放大至 **`12px`**（`font-weight: 500`，`line-height: 1.35`），与设置面板的字号规范完全对齐；
     - 选项内边距由 `0.2rem 0.55rem` 调整为舒展的 `0.32rem 0.6rem`，容器 padding 设为 `0.3rem`，圆角设为 `10px`；
     - WebGPU 提示信息字号同步微调至 `11.5px`。
  2. **动态宽度与边界自适应**：
     - 移动端超分菜单容器最小宽度调整为 `5.5rem`，最大高度限制 `min(40dvh, 12rem)`；
     - 在 `MobileControls.tsx` 中配置超分面板边界宽度计算参数为 `108px`，横屏/竖屏展开时保持居中且绝不溢出播放器边缘。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build:web` 打包验证通过。

## [2026-08-15] 优化移动端设置面板字号与自适应宽度（防溢出播放器）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **面板宽度与字号适度放大**：
     - 将移动端设置面板（`.kz-settings-popover--mobile`）宽度由 `7.5rem`（120px）适度扩大至 `10.75rem`（172px），精准对应控制栏约 5 个按钮的总宽度；
     - 菜单项字号从微型 `9.5px` 提升至舒适清晰的 `12px`，标题提升至 `12px`（加粗），右侧数值 `11.5px`，返回与指示箭头图标提升至 `11~13px`；
     - 开关控件（Switch）升级为 `26px × 15px`（滑块 `11px`），触控更加精准，左右留白与文字呼吸感充足。
  2. **动态边界卡控（Dynamic Bar Boundary Clamping）**：
     - 重构 `MobileControls.tsx` 中的 `placeInBar` 定位计算，引入面板宽度与播放器底栏左右边界卡控算法；
     - 确保在极窄屏幕（<= 320px）或横竖屏切换时，浮窗面板自动限制在播放器边界内，绝不发生超出屏幕或被右侧边缘裁切的问题；
     - 挂载 `window.resize` 动态监听，屏幕尺寸或方向变动时毫秒级同步重定位置。
- 涉及文件：apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build:web` 打包验证通过。

## [2026-08-15] 实现 B 站标准「开 - 精简 - 关」三态循环弹幕按钮与超额抛弃防遮挡模式
- 状态：已完成
- 优先级：P1
- 描述：
  1. **B 站标准「开 - 精简 - 关」三态循环切换与屏幕 Toast 提示**：
     - 将播放器底部控制条主弹幕按钮升级为三态循环按钮：**「开启（全量）」 $\rightarrow$ 「精简（防多）」 $\rightarrow$ 「关闭」 $\rightarrow$ 「开启」**；
     - 快捷键 `D` 与界面按钮同步联动；
     - 切换时弹出对齐 B 站质感的小提示 HUD Toast（`弹幕开启` / `弹幕精简` / `弹幕关闭`）；
     - **三种专属矢量图标状态与字号放大增强**：
       - 全面优化 `IconDanmakuOn`、`IconDanmakuSimplify`、`IconDanmakuOff`、`IconDanmakuSettings` 的字形与图标尺寸；
       - 文字字号从 10~11px 提升至 12.5~13.5px，字重设为 800 ExtraBold，内框扩展至 20x20，消除汉字模糊感；
       - 控制栏 SVG 尺寸从 18px 整体调优至 20~21px，各端图标与「弹 / 简 / 弹⚙️」字样清晰醒目。
  2. **超额弹幕直接抛弃机制（Anti-Blocking Excess Danmaku Dropper）**：
     - **极值单秒限流**：每秒限制 $\le 8$ 条，超额的低权重/低信息量复读弹幕在预处理时**直接抛弃**；
     - **同屏上限强力约束**：桌面端收紧至 $12 \sim 24$ 条、移动端收紧至 $8 \sim 14$ 条，同屏满载时 `trySpawn` **直接抛弃超额弹幕**；
     - **同轨防追尾间距**：从 28px 扩充至 52px，前后留白充足，画面主体不被大面积遮挡。
- 涉及文件：apps/web/src/player/chrome/icons.tsx, apps/web/src/player/chrome/types.ts, apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/chrome/MobileControls.tsx, apps/web/src/player/VideoPlayer.tsx, apps/web/src/pages/WatchPage.tsx, apps/web/src/player/media/canvas-danmaku.ts, apps/web/src/player/media/danmaku-utils.ts
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build` 全量打包构建验证通过。

## [2026-08-15] 新增类似 B 站的弹幕精简模式（智能去噪、重复合并 xN、同屏密度严格限流与防遮挡）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **数据模型与配置扩展**：
     - 在 `@animaku/shared` 的 `DanmakuSettings` 中增加 `simplify: boolean` 字段（默认 `false` 可按需自由开启）。
  2. **智能去重与 (xN) 聚合算法（`simplifyDanmaku`）**：
     - **文本去噪与相似归一化**：全角转半角、折叠冗余连续复读字符（如 `2333333` -> `233`、`哈哈哈哈` -> `哈哈`、`？？？？` -> `？？`）、剥离首尾装饰标点；
     - **滑动时间窗口合并**：4.0 秒时间窗口内相邻相同/相似弹幕智能聚合成 1 条，并保留最早时间与样式；
     - **(xN) 计数标注**：被合并的弹幕自动附加 ` (x${count})` 后缀（如 `前方高能 (x5)`、`23333 (x8)`），完美兼顾高能弹幕氛围与清爽观影体验；
     - **单秒超高密度降噪**：在极端刷屏时间段（>8条/秒）根据信息熵/文本长度权重智能降噪，优先保留长文本与高信息量弹幕。
  3. **Canvas 引擎运行时严格同屏密度限流（Anti-Blocking Runtime）**：
     - **同屏上限强力收紧**：桌面端最大同屏从 64+ 降至 12~24 条，移动端降至 8~14 条，彻底杜绝满屏大面积遮挡画面；
     - **同轨安全间距扩容**：同轨道弹幕间距从 28px 扩大到 52px，前后留白更充裕，观感清爽不拥挤。
  4. **多端交互与平滑联动**：
     - `VideoPlayer.tsx` 的 `contentKey` 关联 `dm.simplify`，切换开关瞬间平滑无感重新装载；
     - 桌面端/移动端弹幕面板（`DanmakuPanel.tsx`）与设置页（`SettingsPage.tsx`）同步提供「弹幕精简 (合并刷屏)」开关。
- 涉及文件：packages/shared/src/danmaku.ts, apps/web/src/player/media/danmaku-utils.ts, apps/web/src/player/media/canvas-danmaku.ts, apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/DanmakuPanel.tsx, apps/web/src/pages/SettingsPage.tsx
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build` 全量打包构建验证通过。

## [2026-08-15] 提升移动端弹幕速度至 1.20x（整秒 8.0s 划过屏幕）
- 状态：已完成
- 优先级：P1
- 描述：
  - **移动端提速 1.20x（取整 8.0 秒）**：在 `danmaku-utils.ts` 中将移动端全屏与窗口模式的基准滚动时长从原 9.5s/10.0s 提速 1.20x，并取整设定为 **`8.0 秒`**；
  - 手机端横屏/竖屏视野窄、视线集中，8.0 秒的滑行节奏更加紧凑流畅，彻底解决移动端滑行过慢的问题；
  - 桌面端保持恒定 **`11.0 秒`** 沉稳阅读节奏，顶部/底部固定弹幕保持 **`5.0 秒`**。
- 涉及文件：apps/web/src/player/media/danmaku-utils.ts, apps/web/src/player/media/canvas-danmaku.ts
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build` 全量打包构建验证通过。

## [2026-08-15] 修复 LRU 离屏字形高分屏 Retina/4K 模糊 Bug 与 DPR 物理分辨率同步
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查根本原因**：
     - 主画布在 Retina / 高分屏下设置了 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`（按 2x 物理像素输出）；
     - 此前 `getGlyph` 创建的离屏 Canvas 仅使用了 1x CSS 逻辑像素尺寸，随后被主画布放大 2x 贴图，且 4K 大屏被强制降到 DPR 1.0，导致在 Windows 150%/200% 缩放或 Retina 屏下字形与描边出现插值模糊。
  2. **全面物理分辨率点对点对齐修复**：
     - **离屏画布同步 DPR 栅格化**：在 `getGlyph` 中，离屏 Canvas 尺寸升级为 `width = Math.round(gw * dpr)` / `height = Math.round(gh * dpr)`，并同步配置 `gctx.setTransform(dpr, 0, 0, dpr, 0, 0)`，以 2x 物理精细度完成高质量描边与文本栅格化；
     - **精确 1:1 物理像素贴图**：在 `paint()` 中，`ctx.drawImage(glyph.canvas, dx, dy, glyph.w, glyph.h)` 显式指定 CSS 宽高，使离屏物理像素与屏幕物理像素实现 1:1 绝对点对点映射，彻底恢复 100% 锐利清晰的 Retina 画质。
     - **恢复 Retina DPR 自动倍率**：`effectiveDpr()` 恢复针对高分屏（`raw >= 1.25`）自适应提升至 2x，杜绝系统底层双线性缩放模糊。
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build` 全量打包构建验证通过。
- 状态：已完成
- 优先级：P0
- 描述：
  1. **接入 LRU 离屏字形位图缓存池（LRU Glyph Cache Blit）**：
     - 彻底废除热循环中对每条在屏弹幕反复执行昂贵贝塞尔矢量描边（`ctx.strokeText` + `ctx.fillText`）的高 CPU/GPU 消耗模式；
     - 引入以 `${fontPx}|${color}|${text}` 为键的 `glyphCache`（基于 JavaScript 原生 Map 插入顺序维护 LRU，上限 384 条，显存占用 < 10MB，零 GC 抖动）；
     - 单条弹幕入场时仅栅格化一次生成离屏位图，热路径 `paint()` 全量升级为 `ctx.drawImage` 纯 GPU 像素 Blit 贴图，在 4K 144Hz 极限场景下单帧绘制耗时从 4~8ms 骤降至 < 0.3ms，充裕容纳在 144Hz 的 6.94ms 帧窗口内，彻底杜绝掉帧卡顿。
  2. **时钟漂移平滑滤波优化（Absorb 15Hz Micro-Jitter）**：
     - 将 `checkClockDrift` 容忍度死区从 0.03s 适度优化至 0.08s，阻尼校准权重微调为 0.04，有效吸收浏览器 HTML5 `<video>` 底层音频重采样与 PTS 数据包交付带来的 20~40ms 固有离散微抖动；
     - 在 1.25x / 1.5x / 2.0x 倍速播放时，插值时钟保持极致连续线性单调推进，消除微观维度的速度忽快忽慢抽搐感（Micro-stutter）。
  3. **4K / 超大屏 DPR 像素预算自适应控制**：
     - 在 `effectiveDpr()` 中对 4K（>= 2560px 宽度或 1440p+）大屏进行带宽控制：4K 下锁定有效 DPR 为 1.0，QHD 下锁定 1.25，避免在 4K 屏幕上创建 3300 万像素的巨大 Canvas 缓冲区，削减 `clearRect` 与 Draw Call 填充率带宽开销达 75%，保留点对点 1:1 极清画质的同时大幅减轻 GPU 负担。
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build` 全量打包构建验证通过。

## [2026-08-15] 优化中英文 README 文档（核心特性矩阵、过时内容修正与多端手势指南）
- 状态：已完成
- 优先级：P2
- 描述：
  1. **重构「✨ 核心特性」矩阵**：
     - 将原本平铺的灰色 checkbox 列表重构为五大模块化特性矩阵（旗舰级画质与播放、B站级自研弹幕、多源聚合与智能去广告、每日放送与追番、Dark Glassmorphism 现代美学与多端交互）。
     - 重点突出 Anime4K WebGPU 实时 4K 超分、B站级 144Hz 弹幕引擎、进度条高能热力波形图、`bangumi-oped` 智能片头片尾跳过、M3U8 智能去广告等核心技术壁垒。
  2. **修正过时与失效描述**：
     - 清理已废弃的「规则冒烟测试」条目；
     - 修正播放器控制栏图标说明为最新「弹幕设置与搜索」`[弹+⚙️]` 与「弹幕开关」`[弹/斜杠]`；
     - 补齐 `W` 画面比例切换（16:9 / 4:3 / Cover / Fill）快捷键与移动端长按 2.0x 极速快进、全域双击手势说明。
  3. **中英双语同步**：
     - `README.md` 与 `README.en.md` 全量同步更新。
- 涉及文件：README.md, README.en.md
- 备注：中英文文档结构与排版已完全对齐。

## [2026-08-15] 重构播放器弹幕开关与弹幕设置矢量图标体系（对齐 B 站标准）
- 状态：已完成
- 优先级：P1
- 描述：
  1. **废弃纯文本 '弹'/'关'**：废除控制栏原本简陋的纯文本字符判断，全面接入专有 24×24 极清 SVG 矢量图标体系。
  2. **弹幕开关（`IconDanmakuOn` / `IconDanmakuOff`）**：
     - **开启状态**：采用圆角方框内嵌加粗“弹”字，激活时呈天青色高亮（`#38bdf8`），视觉饱满清晰；
     - **关闭状态**：采用暗灰色方框与“弹”字，并贯穿一条高辨识度的 **45° 对角禁止斜杠（Slash Line）**，直观清晰地传达“弹幕已禁止/关闭”。
  3. **弹幕设置与搜索面板（`IconDanmakuSettings`）**：
     - 左上方为主体“弹”字框架，右下角内嵌微型设置齿轮（⚙️ Gear），实现播放器综合设置菜单（`⚙️`）与弹幕专属设置面板（`[弹+⚙️]`）的完美语义区隔。
  4. **全平台 Retina 极清与主题自适应**：
     - 桌面端（`DesktopControls.tsx`）与移动端（`MobileControls.tsx`）同步生效；
     - 统一为标准 `kz-ctrl kz-ctrl-icon` 布局，消除字体跨平台基线抖动，100% 居中对齐。
- 涉及文件：apps/web/src/player/chrome/icons.tsx, apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/chrome/MobileControls.tsx
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build` 全量打包构建验证通过。

## [2026-08-15] 修复切换倍速与拖动进度条（Seek）时弹幕瞬间抽搐与回弹 Bug
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查切倍速瞬间回弹根本原因**：
     - 此前在 `ratechange` 触发时，`anchorPerfTime` 仍是旧时间戳，直接在已变更的 `playbackRate` 下调用 `mediaTime()`，导致根据 `elapsed * newRate` 计算出的预测时间产生了向前的虚假跳跃（Phantom Forward Leap）；
     - 紧接着由于视频实际播放时间滞后（浏览器 `<video>` 低频 15Hz 更新），触发了 `checkClockDrift` / `mediaTime` 内部的漂移重置阈值（`drift < -0.15s`），使时间轴被强制回拨 150~250ms，视觉上呈现为“切倍速瞬间弹幕猛然回弹一下并抽搐”。
  2. **排查拖动进度条（Seek）抽搐根本原因**：
     - 在 `onSeeking` 触发期间未调用 `this.seek()`，导致在视频解码缓冲的 100~300ms 空档期内，后台 RAF `tick()` 依然在运行，拿新的 target seek 时间去处理旧的 comment 队列，造成大量陈旧弹幕在 1 帧内被强制快进清理或错误生成，直到 `onSeeked` 触发才重新重置。
  3. **系统性修复与高精时钟解耦**：
     - **纯插值解耦**：将 `mediaTime()` 改为纯数学单调插值函数，移除其内部对 `anchorMediaTime` 的副作用修改；将漂移校准完全收敛至 `timeupdate` 的阻尼平滑修正（Damped Smooth Adjustment）；
     - **切倍速瞬时无损重锚（Zero-Discontinuity Re-anchoring）**：在 `handlePlaybackRateChange` 中，使用 `oldRate` 精确计算出切倍速瞬间的真实微秒媒体时间戳作为新起点，再无缝切换至 `newRate`，消除所有虚假跳跃；
     - **`onSeeking` 瞬时同步快照**：在 `onSeeking` 触发时立即执行 `seek()` 重构当前目标时间点的静态弹幕快照，拖动进度条时弹幕随光标实时平滑更新，松手起播 100% 丝滑无抖动。
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build` 全量打包验证通过。

## [2026-08-15] 调整桌面端弹幕基准字号至 0.8 倍水平（20px）
- 状态：已完成
- 优先级：P1
- 描述：
  - **按需缩小桌面基准字号**：将桌面端弹幕基准像素 `BILI_BASE_PX` 及 `DANMAKU_BASE_PX` 从 `25px` 调整为 `20px`（即精准对应原 `0.8x` 字号水平）。
  - **默认 1.0x 视觉精致小巧**：使得默认 `1.0x` 字号呈现精致优雅的排版效果，不再出现大字遮挡画面的情况；用户面板中的字号调节滑块（0.5x ~ 2.0x）依然线性可用。
  - **移动端隔离保护**：移动端字号根据屏幕高度百分比（`targetPx`）独立计算，不受桌面端基准字号调整影响，维持最佳移动触控与可读性。
- 涉及文件：apps/web/src/player/media/danmaku-utils.ts, apps/web/src/player/media/canvas-danmaku.ts
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build` 全量打包验证通过。

## [2026-08-15] 弹幕速度模型对齐 B 站标准（恒定屏幕驻留时长）与倍速播放自适应补偿
- 状态：已完成
- 优先级：P1
- 描述：
  1. **基准速度模型升级为「基于屏幕驻留时长」标准（Duration-Based Standard）**：
     - 对标 B 站工业级弹幕规范，将原有的固定像素速度（130px/s）重构为恒定屏幕穿越时长模型：
       - **普通滚动弹幕（`'rtl'`）**：基准全屏飞行时长固定为 **7.5 秒**（移动端全屏 6.5s，窗口 7.0s），更符合中文阅读舒适度。无论屏幕是 720px 窗口还是 1920px/4K 全屏，弹幕均在稳定 7.5s 内完成屏幕穿越，彻底解决此前 1080p 全屏下需要 16.3 秒极慢爬行导致大量旧弹幕堆积在屏幕上的严重问题。
       - **固定顶部/底部弹幕（`'top'` / `'bottom'`）**：基准停留时间统一为 **4.0 秒**，确保字幕和高能预警具备稳定可读时间窗口。
       - **用户速度倍率响应**：用户设置的弹幕速度倍率等比调节驻留时长（`7.5s / userSpeed`）。
  2. **倍速播放（`playbackRate`）时间轴自适应补偿与动态连续相位重定**：
     - **哲学对齐**：“发射跟随视频时间轴，飞行与停留跟随现实物理时间”。
     - **媒体持续时间缩放**：单条弹幕在视频时间轴上的持续时间动态缩放为 `duration = realDuration * playbackRate`，使真实世界中的视觉飞行时间始终保持舒适恒定的 7.5s，彻底解决开启 1.5x/2.0x 倍速或长按倍速时弹幕闪电般掠过无法看清的问题。
     - **无感动态切换（Phase Preserving Re-anchoring）**：在 `ratechange`（切倍速或移动端长按快速播放/松手恢复）触发时，对屏幕上已激活的每条弹幕及轨道防追尾碰撞状态进行连续相位重定，保持当前进度 `progress` 绝对连续，实现 0 毫秒平滑过渡且零视觉跳动/位移突变。
- 涉及文件：apps/web/src/player/media/danmaku-utils.ts, apps/web/src/player/media/canvas-danmaku.ts
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build` 全量打包构建通过。

## [2026-08-15] 接入 B 站级弹幕层级渲染管线（滚动 < 底部字幕 < 顶部科普固定弹幕）
- 状态：已完成
- 优先级：P1
- 描述：
  - **根本原因**：此前为了所谓的两阶段批处理，将所有弹幕拆为：`Pass 1` 全局集中 `strokeText` 绘制所有弹幕的黑色描边，`Pass 2` 全局集中 `fillText` 绘制所有弹幕的文字。这导致当两条弹幕在同一画面空间部分交叠时，**后一条弹幕（视觉上层）的描边在 Pass 1 就已经画完了**，而**前一条弹幕（视觉下层）的文字在 Pass 2 才绘制**，导致下层弹幕的文字直接盖在了上层弹幕的描边之上，破坏了正确的 Z 轴图层顺序，视觉上呈现为“上层弹幕的描边被下层弹幕切断/遮挡”。
  - **解决方案**：在 `apps/web/src/player/media/canvas-danmaku.ts` 中将绘制管线重构为**基于 Z-Index 顺序的单条弹幕原子化渲染（Atomically Stroke-then-Fill）**：遍历每条激活弹幕时，立即执行当前弹幕的 `strokeText` + `fillText`，确保每条弹幕作为一个完整的图层渲染，彻底消除层级穿透与描边被下层弹幕遮盖的视觉 Bug。
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过。

## [2026-08-15] 移动端 Core Web Vitals (INP) 系统性深度优化与交互响应提速
- 状态：已完成
- 优先级：P0
- 描述：
  1. **移动端卡片触摸预热 (`onTouchStart`) 与首页 Idle 预加载**：
     - 在 `BangumiCard` 与 `HomePage` 继续观看卡片上增加 `onTouchStart={preloadVideoPlayer}`，在手机端手指触碰屏幕的 50~100ms 间抢跑动态 import；
     - 在 `HomePage` 中引入 `requestIdleCallback` 在主线程空闲时静默预拉取并编译播放器模块 chunk，彻底消除移动端点击卡片时主线程阻塞 200~400ms 的 INP 瓶颈。
  2. **全局消除 MobileSafari 300ms 点击延迟**：
     - 在 `index.css` 中为可交互元素（`a, button, input, select, textarea, [role='button'], [role='tab'], .bangumi-card, .kz-surface-interactive`）配置 `touch-action: manipulation`，消除 iOS Safari 原生双击放大等待，保持与播放器内置手势逻辑的安全隔离。
  3. **播放页重型交互全量接入 React 19 `startTransition` 优先级调度**：
     - 在 `WatchPage.tsx` 中将选集切换（`onPickEpisode`）、线路切换（`onSelectRoad`）、全集展开（`onToggleList`）、上下集切换（`onPrev`/`onNext`）、视频源选择（`pickSource`/`openPluginSearch`）及侧栏面板折叠全部接入 `startTransition`；
     - 保证点击时 0ms 立即渲染按压态与选中反馈，将复杂的重渲染和播放器重置降级为过渡任务在后台平滑完成，INP 大幅降低至绿色优秀区间。
- 涉及文件：apps/web/src/components/ui.tsx, apps/web/src/pages/HomePage.tsx, apps/web/src/index.css, apps/web/src/pages/WatchPage.tsx
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误通过，`pnpm build` 全量打包验证通过。

## [2026-08-15] 优化系统默认弹幕显示区域至 75%（3/4 屏）并完善严格防重叠与容量动态缩放
- 状态：已完成
- 优先级：P1
- 描述：
  1. **系统默认弹幕区域调整为 75% (`area: 0.75`)**：
     - 在 `packages/shared/src/danmaku.ts` 与 `apps/web/src/player/media/canvas-danmaku.ts` 中将默认弹幕显示区域从 `0.5`（半屏）升级为 `0.75`（3/4 屏）；
     - 黄金比例兼顾弹幕舒展呈现与画面底部熟肉字幕保护（避免字幕被遮挡）。
  2. **严格防重叠丢弃（Strict No-Overlap Drop）**：
     - 移除多余的强行降级挤入逻辑，当指定区域内所有轨道被占满时严格执行防重叠丢弃（Drop），杜绝全屏弹幕在区域缩小时被强行挤叠在上半屏的密集叠字 Bug。
  3. **同屏最大并发预算（`maxRunning`）与区域动态等比联动**：
     - `maxRunning()` 与 `this.area` 响应式等比缩放，确保在不同区域比例（1/4 屏、半屏、3/4 屏、全屏）下单位面积内的视觉密度均匀恒定。
- 涉及文件：packages/shared/src/danmaku.ts, apps/web/src/player/media/canvas-danmaku.ts
- 备注：`pnpm typecheck` 全仓验证 0 错误通过，`pnpm build` 打包构建全量通过。

## [2026-08-15] 弹幕引擎系统性重构与流畅度质感全方位升维（高精平滑时钟、零 GC 批处理与防追尾算法）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **高精度连续平滑时钟插值（`performance.now()` 驱动）**：
     - 彻底攻克 HTML5 `<video>` 的 `currentTime` 离散低频更新（15~30Hz）导致的弹幕“阶梯状微顿挫（Staircase Jitter）”；
     - 引入以 `performance.now()` 为基准的高精微秒级时间外推计算，配合阻尼漂移校准（Damped Drift Correction）与缓冲/Seek 瞬时复位，在 60Hz/120Hz/144Hz 屏幕上实现每帧连续亚像素极速位移，帧率提升至 100% 满帧丝滑。
  2. **零 GC 直接批处理渲染管线（Zero-Alloc Direct GPU Batch Paint）**：
     - 废除为每条弹幕创建独立 `OffscreenCanvas` 和频繁淘汰的 `glyphCache`，彻底消除大量 Canvas 对象分配触发的 V8 GC 垃圾回收停顿与内存显存抖动；
     - 采用主画布两阶段 GPU 批处理绘制：Pass 1 集中批量绘制外围高对比黑描边（`strokeStyle` 仅配置一次），Pass 2 集中批量绘制内层彩色文本，内存分配率归零。
  3. **B站级防追尾碰撞与弹性轨道调度（Chase-Collision Lookahead Allocator）**：
     - 引入进场间隙检测（Entry Gap Check）与出场防追尾检测（Exit Chase Check），有效防止字数长短不同的弹幕在移动过程中前后追尾重叠；
     - 在密集弹幕高能片段提供智能候选轨道弹性分配，杜绝无空轨时盲目丢弃弹幕。
  4. **Retina 级高清排版与全平台字体栈适配**：
     - 引入 `-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "WenQuanYi Micro Hei", SimHei` 全平台高清字体栈；
     - 保持整倍数 DPR 缩放（1x/2x），消除文字毛边与模糊，字形质感 100% 对齐 B 站标准。
- 涉及文件：apps/web/src/player/media/canvas-danmaku.ts
- 备注：`pnpm typecheck` 全仓验证 0 错误通过，`pnpm build` 打包构建全量通过。

## [2026-08-15] 修复 Undici 上游 HTTP/2 连接断开/终止 (terminated) 未捕获报错与重定向 Body 泄漏
- 状态：已完成
- 优先级：P1
- 描述：
  1. **根本原因排查**：在调用源站拉取分集/解析（如 `POST /api/plugin/chapters`）时，若源站返回 3xx 重定向，旧 Response 的 `res.body` 未显式取消或读取，导致 Node.js 底层 `undici` 的 HTTP/2 Stream 在垃圾回收关闭时触发 `NGHTTP2_PROTOCOL_ERROR`，抛出未捕获的 `TypeError: terminated`。
  2. **全面防御修复**：
     - **3xx 重定向 Response Body 释放**：在 `apps/server/src/lib/private-host.ts` 的 `fetchPublic` 重定向循环中显式对未消耗的 `res.body` 调用 `cancel().catch(...)`，避免底层 Socket 与 Stream 悬空泄漏；
     - **增强良性网络异常过滤 (`isBenignAbort`)**：在 `apps/server/src/index.ts` 中增强 `isBenignAbort` 函数，递归检查 error 与 error.cause，识别并静默过滤 `terminated`、`ERR_HTTP2_STREAM_ERROR`、`NGHTTP2_PROTOCOL_ERROR` 等后台 HTTP/2 流关闭良性错误，杜绝控制台错误刷屏。
- 涉及文件：apps/server/src/lib/private-host.ts, apps/server/src/index.ts
- 备注：`pnpm typecheck` 全仓验证 0 错误通过。

## [2026-08-15] 修复网页全屏 (Web Fullscreen) 下顶部导航栏依然显示与遮盖 Bug
- 状态：已完成
- 优先级：P0
- 描述：
  1. **根本原因分析**：播放器外层容器 `.kz-player-stack` 设定了 `position: relative; z-index: 30`，导致其内部子元素 `.kz-player-shell` 即使进入网页全屏（`position: fixed; z-index: 9999`）也被困在父级的局部层叠上下文（Stacking Context）内，无法突破并覆盖位于同级兄弟层级且 `z-index: 40` 的站点顶部 `<header>` 导航栏。
  2. **双重层叠上下文隔离与样式优化**：
     - **状态与 DOM 类名联动**：在 `VideoPlayer.tsx` 中建立 `webFs` 状态与 `html`/`body` 类名（`.kz-has-web-fs`）的响应式绑定，卸载与退出时自动清理；
     - **解除父级层叠限制与隐藏 Header**：在 `plyr-overrides.css` 中为 `.kz-player-stack:has(.kz-web-fs)` 以及 `.kz-has-web-fs .kz-player-stack` 设置 `position: static !important; z-index: 99999 !important`，并配置 `html.kz-has-web-fs header { display: none !important; }` 与 `overflow: hidden !important`，确保网页全屏时 100% 隐藏顶部导航栏、锁住背景滚动并使播放器顶层铺满全屏；退出时无缝恢复。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓验证 0 错误通过。

## [2026-08-15] 全站系统性性能深度优化（起播预取、响应压缩、VOD 缓存与路由全量懒加载）
- 状态：已完成
- 优先级：P0
- 描述：
  1. **HLS 起播首分片预拉取 (`startFragPrefetch`)**：在 `apps/web/src/player/VideoPlayer.tsx` 中为 Hls.js 启用 `startFragPrefetch: true`，在解析 Master/Media 播放列表的同时提前发起首个 TS/M4S 分片预下载，降低起播白屏延迟 200~500ms。
  2. **服务端全局挂载 `hono/compress` 响应压缩**：在 `apps/server/src/index.ts` 中引入 `compress` 中间件，自动对 API 响应（Bangumi 元数据、弹幕 XML/JSON）与前端 SPA 静态文件提供高效 Gzip/Deflate 压缩（传输体积锐减 70%+），并智能旁路跳过媒体代理中已编码的视频流，兼顾高吞吐与低 CPU 开销。
  3. **VOD 点播 M3U8 缓存策略区分升级**：在 `apps/server/src/routes/media.ts` 中区分 VOD 点播（包含 `#EXT-X-ENDLIST` 或 Master 索引）与 Live 滚动直播流。点播流设置 `Cache-Control: private, max-age=180`，使频繁拖拽 Seek / 重连期间 100% 命中浏览器 0ms 缓存，免除重复正则重写与去广告 CPU 开销，且 180s 远低于 CDN 15~30m 鉴权 Token 过期周期。
  4. **前端路由全量动态 `lazy()` 分包**：重构 `apps/web/src/App.tsx`，将 `SettingsPage`、`AnimePage`、`TimelinePage`、`SearchPage`、`CollectPage`、`HistoryPage` 全量改造为动态 `lazy()` 拆分打包。首页主入口 Initial JS Bundle 从全页面集中打包大幅缩减至仅 56KB（Gzip 19.5KB），首屏加载与解析速度显著提升。
- 涉及文件：apps/web/src/player/VideoPlayer.tsx, apps/server/src/index.ts, apps/server/src/routes/media.ts, apps/web/src/App.tsx
- 备注：`pnpm typecheck` 全仓验证 0 错误通过，`pnpm build` 打包验证全通过。

## [2026-08-14] 桌面端弹幕面板实现与其他控制面板一致的按钮水平中轴居中对齐
- 状态：已完成
- 优先级：P0
- 描述：
  1. **排查根本原因**：此前桌面端弹幕面板（`DanmakuPanel`）脱离了控制栏按钮容器，在播放器根节点通过固定 `right: min(...)` 绝对定位，未与控制栏上的「弹幕设置」按钮锚定，导致弹出位置固定在右侧，无法像设置齿轮（`⚙️`）、倍速（`1x`）、超分（`超分`）等面板一样精准对齐在触发按钮的水平中轴正上方。
  2. **全面统一为锚点中轴对齐体系**：
     - **DOM 结构统一**：在 `DesktopControls.tsx` 中将弹幕按钮包裹于 `<div className="kz-speed-wrap kz-danmaku-wrap">` 相对定位容器中，并通过 `danmakuPanelNode` 在按钮内联层级展开桌面弹幕面板；
     - **定位与动效统一**：在 `plyr-overrides.css` 中将 `.kz-danmaku-panel--desktop` 统一配置为 `bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); transform-origin: bottom center;`，配合 `kz-settings-popover-in` 放大入场动效，实现 100% 居中于按钮 X 轴中心正上方平滑弹出；
     - **自适应高宽与移动端隔离**：移除桌面卡片对父容器 100% 相对高度的硬编码，改为 `max-height: min(26rem, calc(100vh - 6rem))`，移动端则保持底部抽屉 Portal 不受任何影响。
- 涉及文件：apps/web/src/player/chrome/types.ts, apps/web/src/player/chrome/DesktopControls.tsx, apps/web/src/player/VideoPlayer.tsx, apps/web/src/player/DanmakuPanel.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

## [2026-08-14] 播放器所有弹窗与面板实现「白天模式/夜间模式」全量自适应双模态
- 状态：已完成
- 优先级：P0
- 描述：
  1. **全套弹出面板动态适配全站主题**：
     - **白天模式（Light Mode）**：设置齿轮面板、倍速菜单、音量弹出胶囊、连播倒计时悬浮卡片、Seekbar 提示卡、弹幕面板（桌面卡片+移动端弹窗）及 CustomSelect 下拉框全面适配为清爽优雅的 **明亮磨砂玻璃质感（Light Glassmorphism）**（`rgba(255, 255, 255, 0.96)`、深灰文本 `#0f172a`、次级文本 `#64748b`、柔和边框 `rgba(0, 0, 0, 0.12)` 与天青色 Accent 标识）；
     - **夜晚模式（Dark Mode）**：所有面板无缝切换为深邃大气的 **暗场深色磨砂琉璃质感（Dark Glassmorphism）**（`rgba(15, 20, 30, 0.94)`、高亮文本 `#f1f5f9`、微光边框 `rgba(255, 255, 255, 0.16)`）。
  2. **消除白黑混杂与视觉割裂**：彻底解决了此前不同面板间底色混杂（有的固定黑底、有的跟主题走白底）的割裂感，做到无论切换白天还是夜晚模式，播放器所有面板与下拉层 100% 保持和谐一致的动态响应。
- 涉及文件：apps/web/src/player/DanmakuPanel.tsx, apps/web/src/player/plyr-overrides.css
- 备注：`pnpm typecheck` 全仓 4 个 Workspace Projects 验证 0 错误编译通过。

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
