# Animaku 开发者架构上下文 (CONTEXT)

> 本文档面向维护者、贡献者与开发协作，汇总了系统的**核心架构设计、数据流向、关键技术选型与避坑准则**。  
> 快速上手请参阅根目录 [README.md](../README.md)；视频源接入规范请参阅 [docs/video-source-integration.md](./video-source-integration.md)。

---

## 1. 系统定位与核心架构

**Animaku** 是一套基于 **React 19 SPA + 本地轻量 Hono API + SQLite 持久化** 的现代化自托管番剧客户端。

### Monorepo 代码组织

```
animaku/
├── apps/
│   ├── web/            # @animaku/web (React 19, Vite 6, Tailwind 4, TanStack Query, Zustand)
│   └── server/         # @animaku/server (Hono, @hono/node-server, node:sqlite, cheerio)
├── packages/
│   └── shared/         # @animaku/shared (跨端共享类型、解析器、算法；源码直引零构建)
├── docs/               # 架构与开发文档
├── data/               # Docker 挂载目录 (SQLite 数据库持久化)
└── scripts/            # 工具脚本 (probe-source, bump-version 等)
```

- **包管理器**：`pnpm@9.15.0`，Node.js ≥ 20（建议 LTS）。
- **用户数据边界**：观看历史、播放设置、收藏、Bangumi Token 及插件规则 **100% 存储于客户端本地**（`localStorage` 等），服务端绝不持久化任何用户隐私数据。

---

## 2. 请求流与多级缓存体系

```
Browser Client (Vite 5173 / Production Web)
  ├── Bangumi 元数据  ──► /api/bangumi/*  ──► api.bgm.tv (服务端 TTL 内存缓存)
  ├── 弹幕聚合与匹配  ──► /api/danmaku/*  ──► api.dandanplay.net + Bilibili
  ├── 规则搜索与分集  ──► /api/plugin/*   ──► L1 内存 + L2 SQLite 持久化 ──► 源站
  └── 媒体直连 / 代理 ──► /api/media/*    ──► 优先 CDN 直连，M3U8 去广告混合代理
```

### 多级缓存策略

| 模块 / 接口 | 服务端缓存机制 | 客户端缓存机制 | 穿透与失效机制 |
|---|---|---|---|
| **Bangumi 日程 / 热门** | 进程内 TTL 内存缓存（24h / 12h） | RQ staleTime（12h / 2h） | `?refresh=1` 或 `no-cache` 回源 |
| **Bangumi 搜索 / 详情** | 进程内 TTL 内存缓存（2h / 6h） | RQ staleTime（30m） | 详情页支持全量元数据缓存 |
| **插件搜索 (`/search`)** | **L1 内存 + L2 SQLite 持久化** (4h TTL) | memory 30m + sessionStorage 2h | Single-Flight 并发防击穿 |
| **插件分集 (`/chapters`)** | **L1 内存 + L2 SQLite 持久化** (30m TTL) | `roads-cache` (30m TTL) | 一键刷新（`onRefreshChapters`）物理清空 |
| **播放直链 (`/resolve`)** | 分级内存 TTL（m3u8 30m / 签名凭证 60s / mp4 2m） | RQ stale 60s | 播放失败/403 自动标记 refresh 重试 |

> **提示**：所有公共缓存均支持 `?refresh=1` 或请求头 `Cache-Control: no-cache` 一键绕过并回源拉取最新数据。

---

## 3. 视频源体系与规则引擎

### 3.1 视频源接入形态

1. **专有适配器（形态 C，推荐）**：针对现代 SPA/RESTful 站点（如 `tvtfun`、`cycani`、`xifan-next`、`anime1`），在 `apps/server/src/lib/` 编写专有 TypeScript 模块，并在 `rule-engine/index.ts` 挂载。
2. **纯 JSON 规则（形态 A/B）**：兼容 Kazumi XPath 与 API 规则生态，支持规则商店与本地自定义导入。

### 3.2 极速流媒体交互管线

- **起播 0 网络请求**：首屏仅请求首个高权重视频源，对其他备选源保持 0 网络请求；
- **2 并发按需流式探测**：展开视频源看板时，启动 2 并发轻量池探测各备选源（3s 熔断），各源独立返回并呈现 3 色动态指示器（🟢 极速就绪 / 🟡 待选多条目 / 🔴 异常熔断）；
- **绑定持久化 (`useSourceBindingStore`)**：客户端持久化 `BangumiID <-> 目标源详情页` 映射（1000 条 LRU），再次进入 0ms 直达跳过搜索；
- **跨源集数归一化与进度继承**：跨源切换时通过 `parseEpisodeNumber` 自动解析集数，秒级继承当前播放位置。

---

## 4. 播放器与画质管线

### 4.1 核心组件分层架构（自底向上）

```
1. <video class="kz-native-video">        # 硬件解码容器与音视频主时钟
2. <canvas class="kz-sr-canvas">          # Anime4K WebGPU 实时超分层 (z-index: 1, 默认关)
3. <canvas class="kz-danmaku-canvas">      # 自研 2D 弹幕渲染层 (z-index: 2, pointer-events: none)
4. .kz-player-chrome                      # 状态层、控制栏、弹幕面板与右键菜单
```

### 4.2 核心特性与技术规范

- **0ms 单击响应**：桌面端彻底移除单击延迟计时器，单击画面即刻触发播放/暂停；
- **画幅比例自由裁切**：快捷键 `W` 循环切换 16:9 / 4:3 / Cover / Fill；
- **网页全屏解耦 (`Shift+W`)**：播放器独立管理视窗定位，避免外部容器 `contain: layout` 导致的视口约束失效；
- **M3U8 智能去广告（混合模式）**：
  - 无 `cookie` 且无 `fullProxy=1` 时，仅重写并代理 `.m3u8` 文本列表切除广告，`.ts` 切片保持源站 CDN 绝对地址，0 服务端视频带宽消耗；
  - 遇到播放失败时采用快速失败（Fast-Fail）策略，唤起 HUD 引导用户切换右侧可用视频源。

---

## 5. 自研高精弹幕引擎

位于 `apps/web/src/player/media/canvas-danmaku.ts`。

### 核心设计原则

1. **纯物理墙上时钟驱动**：弹幕位移 100% 由 `performance.now()` 单调推进，彻底杜绝视频 PTS 抖动导致的时间倒流与文字抽搐。
2. **分级漂移治理（Tiered Drift Policy）**：
   - **死区（0 ~ 0.5s）**：完全不修正（Zero Intervention），吸收 24fps/30fps 帧率波动；
   - **轻微漂移（0.5s ~ 2.0s）**：采用一阶低通指数平滑滤波器（EMA，$\alpha = 0.05$）亚像素平滑校准，强制单调保底；
   - **硬跳跃（> 2.0s 或 Seek）**：重新排轨并对齐时间戳。
3. **rVFC 硬件级帧同步**：现代浏览器启用 `requestVideoFrameCallback`，在视频每一帧合成时捕获硬件 PTS。
4. **1:1 Retina 离屏字形位图缓存池**：同一弹幕文本仅描边/填充一次并缓存为 Offscreen Bitmap，热路径每帧仅执行 `drawImage`，单帧绘制耗时 $<0.3\text{ms}$。
5. **三态循环与过载丢弃**：「全量 → 精简 (4s 窗口 xN 聚合去噪) → 关闭」一键切换；同屏超额密度直接丢弃防遮挡。

---

## 6. 环境配置与安全边界

详细注释见 [.env.example](../.env.example)。

| 变量 | 默认值 | 作用与安全边界 |
|---|---|---|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | API / 生产环境监听地址 |
| `PUBLIC_PROXY` | `1` | **默认开启**：允许客户端使用媒体代理与插件 API。仅内网私有部署可设为 `0` |
| `PROXY_TOKEN` | 空 | 代理鉴权密码；`PUBLIC_PROXY=0` 时通过 `X-Animaku-Proxy-Token` 或设置页解锁 |
| `MEDIA_FULL_PROXY` | `0` | **默认关闭**：媒体代理仅允许 M3U8 列表（切片直连 CDN）；禁止 VPS 转发全量二进制大文件 |

- **SSRF 防御**：服务端所有发往第三方的请求必须使用 `fetchPublic`，严格拦截私有网段与内网 Host。
- **权限不可提权**：客户端设置项保存在本地，服务器始终依据环境变量强制执行安全策略。

---

## 7. 关键踩坑记录与开发守则

1. **视频有声无画 / 画面纯黑**：
   - 严禁在 `<video>` 的父级容器上添加 `overflow: hidden` + `border-radius`（Chrome 硬件解码与圆角合成图层冲突）；
   - 严禁在视频宿主层添加 `isolation: isolate`。
2. **禁止在开发模式启用 React StrictMode**：
   - 双重挂载（Double Mount）会撕毁 HLS MSE 实例导致视频无法起播。
3. **播放失败快速失败与切源指引**：
   - 直链播放失败直接唤起 HUD 提示用户切源，严禁无意义地自动尝试中继服务器代理。
4. **长番剧选集与内存防抖**：
   - 超长番剧（$>40$ 集）统一使用 50 话区间分页，避免一次性渲染数百上千 DOM 节点导致滚动掉帧。
5. **视频源规则版本号递增**：
   - 新增内置规则或调整内置源时，**必须递增 `PLUGIN_DEFAULTS_VERSION`**（`apps/web/src/stores/plugins.ts`），否则老用户因本地缓存无法获取新规则。
