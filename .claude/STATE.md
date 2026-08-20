# Animaku 项目状态快照 (STATE.md)

> 历史已完成状态记录已归档至 [STATE_ARCHIVE.md](./STATE_ARCHIVE.md)

---

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
