<div align="center">

  <p><a href="README.md">简体中文</a> · <a href="README.en.md">English</a></p>

  <h1>Animaku</h1>

  <img src="apps/web/public/android-chrome-512x512.png" width="160" alt="Animaku logo" />

  <p>
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 6" />
    <img src="https://img.shields.io/badge/Hono-API-E36002?style=for-the-badge&logo=hono&logoColor=white" alt="Hono API" />
    <img src="https://img.shields.io/badge/WebGPU-Anime4K-9cf?style=for-the-badge&logo=webgpu&logoColor=white" alt="WebGPU Anime4K" />
    <img src="https://img.shields.io/badge/AniBaka-anx--rule/2-10B981?style=for-the-badge" alt="AniBaka Rule" />
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Ready" />
  </p>

  <p>
    现代化自托管二次元番剧流媒体客户端：开箱内置优质 1080P 原画直链视频源，原生集成
    <a href="https://bangumi.tv/">Bangumi</a> 每日放送与维基元数据、
    <b>自研高精物理时钟弹幕引擎</b>、<b>WebGPU Anime4K 实时 4K 超分</b>、<b>智能 OP/ED 跳过与打标贡献</b>、<b>B 站同款番剧推荐流</b> 与 <b>桌面端宽屏模式</b>。<br />
    支持 <b>⭐ AniBaka (34+ 现代直连源)</b> 与 <b>📦 Kazumi</b> 双规则生态，配备 <b>HTML5 / 触控拖拽排序</b> 与 <b>3 色微光多源探活看板</b>。
    SQLite 极速双层持久化缓存、全站 API 频控防刷与 IndexNow 搜索引擎即时收录，纯本地数据隐私，日夜双模态琉璃美学。绝赞开发中 (～￣▽￣)～
  </p>

  <p>
    <img
      src="docs/screenshots/watch-player.png"
      alt="Animaku 播放页：弹幕、宽屏模式、多线路选集与番剧推荐流"
      width="900"
    />
  </p>

</div>

## 这是什么

**Animaku** 是基于 **React 19 SPA + 本地轻量 Hono API** 构建的现代化自托管二次元番剧客户端。

| 核心维度 | 能力说明 |
| :--- | :--- |
| **每日放送与维基** | Bangumi 周更日程 / 全局搜索（动画 + 三次元影视混合） / 详情元数据 / 演职员与分集；支持 Token 追番同步 |
| **双规则生态聚合** | 内置 1080P MP4 原画直链；支持 **AniBaka (anx-rule/2 现代流水线算子规则)** 与 **Kazumi 传统规则** 双仓库一键安装与更新 |
| **高精弹幕生态** | 弹弹play + 多方弹幕库聚合与 XML / Pakku 导入；纯物理时钟驱动 + 分级滤波 + rVFC 硬件帧同步 + 进度条热力图 |
| **旗舰播放与画质** | WebGPU 实时 Anime4K 超分（720p/1080p→4K）、`bangumi-oped` 智能片头片尾跳过与社区打标贡献、M3U8 多维加权智能去广告 |
| **流媒体交互体验** | B 站同款 73.5%:26.5% 视口黄金比例、桌面端「🖥️ 宽屏模式」一屏守恒通栏铺满、3 色流媒体视频源探活看板、B 站同款番剧推荐流 |
| **性能与隐私安全** | SQLite 原生双层持久化缓存、15s 有效播放统计、全站微合批 IP 访问频控、IndexNow 搜索引擎即时收录；历史与配置 100% 本地存储 |

## 支持环境

- **浏览器**：现代 Chromium 内核浏览器 / Firefox / Safari（全功能支持播放、HLS 流媒体、WebGPU 硬件加速超分与触控手势）
- **部署（推荐）**：Docker / Docker Compose 单容器 — **只需 Docker，无需配置 Node / pnpm 环境**
- **本机生产 / 开发**：Node.js ≥ 20（建议 LTS）+ pnpm **9.15.0**

## ✨ 核心特性

- 🎬 **旗舰级播放引擎与画质增强**
  - **Anime4K WebGPU 实时超分**：利用客户端 GPU WebGPU 算力实现实时 2× 纹理重建与线条抗锯齿，低清老番秒变 4K 极清，提供「效率 / 平衡 / 质量」多档调节。
  - **B 站同款黄金比例视口与桌面端宽屏模式 (Widescreen)**：
    - 桌面控制栏集成 **「🖥️ 宽屏模式」**、**「🔲 网页全屏」** 与 **「⛶ 系统全屏」** 屏幕模式三剑客；
    - 宽屏模式横向 100% 居中通栏铺满，常规模式采用对标 B 站的 **73.5% : 26.5% 黄金比例**（右侧栏 `clamp(360px, 23vw, 420px)` 动态自适应）；
    - 严格遵循**视口一屏守恒**，无论是 13 寸笔记本、1080P、2K 还是 4K 大屏，播放器与控制栏 100% 完整落在首屏，绝不发生纵向溢出滚动；切换番剧智能重置。
  - **原地 Seek 状态机与 4 重事件互锁**：解耦 `playerKey` 彻底杜绝 Late Hydrate 历史续播与切集时的 DOM 暴力卸载重建（Unmount & Remount）；配备权威时长决断器，起播 0ms 瞬间响应。
  - **Safari / WebKit 深度优化**：
    - 动态生成 HTML5 `<source type="...">` 显式注入 MIME 提示，彻底修复 Safari 原生 AVFoundation 将伪装 `.mp3` 的 1080P 视频直链误判为纯音频黑屏的问题；
    - 50ms 微缓冲存量乐观起播，消除 MP4 格式门禁双标，彻底解决 WebKit 节能挂起导致的 8 秒硬等超时。
  - **智能跳过片头片尾与开源打标贡献**：
    - 原生集成 `bangumi-oped` 社区时间戳库，进度条发光标记 OP/ED 区间并支持一键无感秒跳；
    - 内置 **OP/ED 标记助手抽屉**，支持时间轴高精微调打标，并可一键前往 GitHub 提交 PR 贡献数据。
  - **播放器右键菜单与 Stats for Nerds**：对标主流流媒体，实时展示音视频编解码器、分辨率、丢帧率 (FPS)、缓冲区健康度、分片下载速率等详细排错统计；支持原画截图、画面镜像翻转、画中画 (PiP)。
  - **0ms 极速响应与多画幅自由裁切**：消除单击延迟，即点即播；快捷键 `W` 一键切换 16:9（默认）、4:3（怀旧）、Cover（铺满）、Fill（拉伸）。

- 💬 **自研高精物理时钟弹幕生态系统**
  - **多平台弹幕聚合**：弹弹play 与多方弹幕库聚合匹配，支持自定义关键词、分 P 关联与本地 XML / Pakku 弹幕拖拽导入。
  - **纯物理时钟驱动 + 分级漂移治理**：位移严格由 `performance.now()` 单调推进，配合 Zero 死区与 EMA 低通滤波器，彻底杜绝时间抖动与 1~2px 横跳回弹。
  - **rVFC 硬件级帧呈现同步**：支持 `requestVideoFrameCallback`，画面与弹幕像素级绝对同步；配备 1:1 Retina 离屏字形位图缓存池。
  - **三态循环弹幕与智能降噪**：「全量 → 精简 (xN 去重聚合) → 关闭」三态一键切换（快捷键 `D`），同屏过载密度丢弃防遮挡。
  - **恒定 7.5s 屏幕穿越时长**：弹幕飞行时长对标主流弹幕播放器标准，切倍速时动态连续相位重定，保持真实阅读节奏舒适自然。
  - **Seekbar 高能弹幕热力图**：进度条动态绘制蓝光渐变热力波形，高能名场面与剧情转折一目了然。

- 🔌 **双规则生态与新一代流水线规则引擎 (`anx-rule/2`)**
  - **AniBaka 流水线算子解释器**：完整支持 20+ 核心算子（Fetch, Follow, Template, Regex, Replace, Cheerio CSS, JSONPath, BaseN, AES-CBC/GCM, MD5, SHA1/SHA256, MacCMS/ECPlayer 逆向解密，多线路选集与容错回退）。
  - **开箱内置优质直链源**：内置 xifan-next、cycani、tvtfun、moonci、anime1、omofun 等专有适配器，首屏毫秒级秒开，0 服务端代理带宽消耗。
  - **双规则仓库无缝切换**：设置页集成 **⭐ AniBaka 规则库 (34+ 现代直连源)** 与 **📦 Kazumi 传统规则库 (遗留源)** 切换，支持站点 Favicon、丰富特性标签与一键安装/更新。
  - **状态分色与多维度标签体系**：
    - 规则仓库按状态分色：翡翠绿高光「更新」、黑白中性「安装」、置灰边框「已安装」；
    - 已安装规则精准打标：🔵 **内置直连**、🟣 **内置规则**、🟢 **AniBaka**、🟡 **Kazumi**、⚪ **自定义**。
  - **HTML5 原生与手机 Touch 触摸拖拽排序**：支持卡片平滑光晕拖拽、首位 `⭐ 默认主源` 金黄色角标高光、iOS 风格 Switch 启用滑块与 Pill 胶囊开关，高度紧凑收敛 40%。
  - **M3U8 智能去广告**：内置多维度切片加权打分模型，自动精准识别并切除跨域插播广告切片；混合模式免密直连源站 CDN。

- 📺 **智能播放体验与 B 站风格番剧推荐流**
  - **B 站风格番剧推荐流 (WatchRecommendations)**：
    - **Slot 0 系列接续**：顺承续作/剧场版优先（标记 🟢`续作` / 🟣`剧场版` / 🔵`前作`），带真实年份、评分、集数元数据补全，杜绝伪造「连载中」；
    - **国家 Tag 严格优先级**：`日本 → 国产 → 欧美 → 韩国` 优先级约束 + 2 题材 Tag 组合 + 多阶容灾采样，彻底消除跨国推荐漂移；
    - **自适应多象限分桶抽样算法**：跨年代全域探索 6.0~8.5 优质佳作，动态满额 6 部抽样；
    - **B 站同款 180×101 (16:9) 沉浸大封面**：聚焦主角特写，支持一键折叠/展开；
    - **推荐跳转视频源参数继承**：跳转推荐番剧无缝携带当前视频源偏好（`?plugin=xxx`），首访自动触发搜源与选集闭环。
  - **3 色动态微光视频源看板**：🟢 极速就绪（呼吸绿光） / 🟡 待选条目（琥珀黄展开） / 🔴 未搜到或异常（低噪灰显）；2 并发轻量池按需流式探测，看板与主会话 100% 实时同步。
  - **选集体验升维**：一键强制刷新选集（`onRefreshChapters`，穿透服务端与客户端缓存）；超长番剧 50 话智能区间分页胶囊；正/倒序一键直达；大屏宽侧栏自适应 5 列 / 6 列选集方块矩阵。

- 📅 **番剧维基、周更时间表与追番管理**
  - **全站搜索类型放宽**：支持动画（type: 2）与三次元影视/电影/电视剧（type: 6）混合检索。
  - **首页多板块楼层式浏览**：继续观看、热门番剧、剧场版、OVA/特别篇，12 条公倍数自适应网格，杜绝布局抖动与空缺。
  - **每日放送时间表**：实时聚合 Bangumi 周更放送日程，新番播出时间与更新状态一手掌握。
  - **番剧维基与收藏**：官方评分、演职员角色阵容与分集剧情，支持「想看 / 在看 / 看过 / 搁置」四态追番管理与 Bangumi Token 授权同步。

- ⚙️ **全新折叠式设置中心与多端交互**
  - **智能折叠卡片 (CollapsibleSection)**：全部 8 大配置区块配备收起状态下的「概览摘要胶囊（Glanceable Status Chips）」，0 点击看清全局配置；支持一键全部展开/收起与展开习惯持久化记忆。
  - **移动端窄屏响应式排版**：全面优化移动端窄屏（375px~430px），释放 30px+ 可用宽度，弹幕 4 选框升级为 2x2 触控网格。
  - **移动端触控手势**：全域双击播放/暂停、长按 2.0x 极速快进（松手平滑恢复）、滑动 Seek 实时时间差 HUD。
  - **日夜双模态琉璃美学**：默认清新质感白天模式（Warm Slate），夜间模式接入 ColorsWall 经典深炭灰与天青蓝琉璃设计系统。

- 🚀 **全栈性能、服务端架构与安全防御**
  - **SQLite L1+L2 双层持久化缓存**：服务端基于 SQLite 原生模块实现搜索与分集持久化缓存与 Single-Flight 并发防击穿，重启服务缓存零丢失。
  - **有效播放量统计体系 (`anime_play_stats`)**：客户端连续平稳播放满 15 秒精准上报，服务端配备 10 分钟滑动窗口内存去重防刷与原子事务聚合。
  - **全局 IP 访问统计与 Rate Limit 频控 (`ip_access_logs`)**：`setImmediate` 事件循环微任务合批写入（减少 90% IO），1 秒滑动窗口限流（普通 API 30 req/s，高负载 10 req/s），自动过滤 `127.0.0.1` / `::1` 本地回环与健康检查。
  - **IndexNow 搜索引擎即时收录协议**：支持 Bing、Yandex、Naver 等搜索引擎差量自动推送，配备管理员批量端点与 `/subject/:id` 服务端轻量 SSR 预渲染。
  - **全栈路由预加载体系**：空闲预热 + 鼠标悬停意图预取（`preloadRoute` / `preloadVideoPlayer`）+ 服务端 24h 强缓存，实现毫秒级页面秒开。

## 快速开始

多数用户 **只需安装 Docker 即可**；下面的 pnpm 仅用于本机生产或二次开发。

### Docker 一键部署（推荐）

```bash
git clone https://github.com/uerax/Animaku.git animaku
cd animaku

cp .env.example .env    # 按需调整 PORT、PUBLIC_PROXY 等配置
docker compose up -d --build
```

浏览器打开 **http://localhost:$PORT**（默认 `8787`）。  
单容器同时提供 SPA 前端与 `/api/*` 服务端接口（同源）。

```bash
docker compose logs -f
docker compose down
```

```bash
# 不使用 compose，单命令运行
docker build -t animaku .
docker run -d --name animaku --restart unless-stopped -p 8787:8787 --env-file .env -v ./data:/app/data animaku
```

- **健康检查**：`GET /api/health`
- **数据持久化**：SQLite 数据库保存在容器 `/app/data` 目录（映射宿主机 `./data`）
- **安全与代理**：`PUBLIC_PROXY` **默认开启**（公网可直接选源/播放）；若配置在公网，强烈建议配置 `PROXY_TOKEN` 保护 VPS 出站带宽
- **页脚定制**：`VITE_*` 为构建期变量，修改后需 `docker compose up -d --build` 重新构建生效

### 本机 Node 生产运行（无 Docker）

一个进程同时提供 `/api/*` 与 SPA 静态资源（同源，无需额外 Nginx/Vite 代理）：

```bash
# 需 Node.js ≥ 20 + pnpm 9.15.0，在仓库根目录执行
pnpm install
cp .env.example .env   # 按需修改配置
pnpm start:prod
# 等价于：pnpm build && pnpm start
```

浏览器打开 **http://localhost:$PORT**（默认 `8787`）。  
`WEB_DIST` 可指定静态目录（相对进程 cwd）；本机省略时会自动探测 `public` / `apps/web/dist`。

### 本地开发调试（pnpm）

| 工具 | 版本要求 |
| :--- | :--- |
| Node.js | ≥ 20（建议 LTS 版本） |
| pnpm | **9.15.0**（与 `packageManager` 字段一致） |

```bash
# 安装 pnpm（任选其一）
npm install -g pnpm@9.15.0
# 或：corepack enable && corepack prepare pnpm@9.15.0 --activate
```

请在 **仓库根目录** 使用 pnpm，不要使用 npm / yarn 直接安装依赖。

```bash
pnpm install
cp .env.example .env   # 按需修改

pnpm dev
```

| 进程 | 默认访问地址 | 说明 |
| :--- | :--- | :--- |
| **Web（Vite）** | http://localhost:5173（`WEB_DEV_PORT`） | **浏览器日常开发请访问此地址** |
| **API（Hono）** | http://localhost:8787（`PORT`） | Vite 会将 `/api` 请求自动反向代理过来 |

```bash
pnpm dev:web       # 仅启动前端 Vite
pnpm dev:server    # 仅启动后端 Hono
pnpm typecheck     # 全仓 TypeScript 类型检查
pnpm bump <ver>    # 一键升级全仓版本（如 pnpm bump 1.1.3 或 pnpm bump patch）
```

日常修改代码请直接使用 `pnpm dev`。

## 使用指南

1. **访问站点**：Docker / 本机生产访问 `http://localhost:$PORT` · 本地开发访问 `http://localhost:$WEB_DEV_PORT`
2. **追番同步**：进入 **设置 → Bangumi 账号**（可选，填入 Personal Access Token 同步追番进度与收藏）
3. **规则管理**：开箱内置优质 1080P 原画直链规则；进入 **设置 → 规则仓库** 可一键在线安装 **AniBaka (34+ 现代源)** 或 **Kazumi 传统源**，支持导入自定义 JSON 规则
4. **选源播放**：详情页点击视频源即可极速检索分集（优先直连原画 CDN，亦可在设置中开启服务器代理）
5. **宽屏与弹幕**：桌面端控制栏支持一键切换「🖥️ 宽屏模式」、「🔲 网页全屏」、「⛶ 全屏」，专属图标支持弹幕设置面板与三态切换

### 播放控制快捷键

| 快捷键 | 作用 |
| :--- | :--- |
| `Space` / `K` | 播放 / 暂停（0ms 瞬时响应） |
| `←` / `→` | 快退 5s / 快进 5s |
| `↑` / `↓` | 音量调节 ±5% |
| `F` | 播放器全屏 / 退出全屏 |
| `Shift + W` | 网页全屏（Web Fullscreen）切换 |
| `W` | 画面比例切换（16:9 默认 / 4:3 怀旧 / 铺满 Cover / 拉伸 Fill） |
| `D` | 弹幕三态循环切换（全量 → 精简 xN 去重 → 关闭） |
| `Alt + M` | 呼出弹幕设置与搜索面板 |
| `,` / `.` / `/` | 弹幕滞后 0.5s / 超前 0.5s / 偏移复位 |
| `P` / `N` | 切换 上一集 / 下一集 |
| 鼠标右键 | 呼出播放器右键悬浮菜单（Stats for Nerds 详细统计 / 截图 / 镜像 / 画中画 / 倍速 / Anime4K 超分） |
| 拖入本地文件 | 拖拽视频文件（MP4/MKV/WebM）直接播放；拖入 `.xml` 导入外部 / pakku 弹幕 |

### 移动端触控手势

* **全域双击**：屏幕任意区域双击快速切换 播放 / 暂停
* **长按加速**：长按屏幕触发 `2.0X ⚡ 快速倍速`，松开手指平滑恢复原本倍速
* **滑动进度**：滑动进度条实时在屏幕中央显示时间差 HUD（如 `+00:15 (08:30)`）

## 环境变量说明

完整注释请参考 [.env.example](.env.example)。服务端从仓库根目录与 `apps/server` 加载；Vite 读取同一份根 `.env`。

### 核心基础配置

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | API 服务与单进程 / Docker 监听端口与地址（`0.0.0.0` 开放公网，`127.0.0.1` 仅限本机/反代） |
| `DATA_DIR` / `SQLITE_PATH` | `./data` / `./data/animaku.db` | SQLite 数据库持久化目录与文件路径 |
| `WEB_DEV_PORT` / `WEB_HOST` | `5173` / `127.0.0.1` | **仅本地 Vite 开发使用**；Docker 生产环境忽略 |
| `TZ` | `Asia/Shanghai` | 服务端日志与跨天统计时区（支持 IANA 标准时区） |
| `LOG_FORMAT` | `pretty` | 服务端日志格式：`pretty`（带色彩高可读单行） / `json`（单行 JSONL） |
| `DANDAN_APP_ID` / `DANDAN_APP_SECRET` | 留空 | 留空时使用内置客户端密钥；生产环境建议申请官方开放平台密钥 |

### 公网与访问安全

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PUBLIC_PROXY` | `1` | **默认开启 (1)**：允许客户端使用媒体代理与规则检索。设为 `0` 则仅限本机/局域网 |
| `PROXY_TOKEN` | 空 | 管理员服务器代理授权口令；配置后需在设置页解锁或携带 `X-Animaku-Proxy-Token` 请求头 |
| `ADMIN_SECRET` | 空 | 管理员管理端点密钥（用于调用 IndexNow 手动提交等接口，未配置时回退到 `PROXY_TOKEN`） |
| `CORS_ORIGINS` | 空 | 额外允许的跨域 Origin 列表（逗号分隔）；localhost 始终放行 |

### Bangumi 与封面图片源配置

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `BANGUMI_API` | `mirror` | Bangumi API 请求源：`mirror`（免翻代理，默认） / `official`（官方直连） / 自定义域名 |
| `BANGUMI_IMAGE` | `mirror` | 番剧封面图片源：`mirror`（代理优化，默认） / `official`（官方直连） / 自定义域名 |

### SEO、Sitemap 与 IndexNow 即时收录

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SITE_URL` | 空 | 生产环境公网根地址（如 `https://anime.example.com`），用于生成 Sitemap 与 Canonical URL |
| `VITE_SITE_URL` | 空 | 前端构建期站点根地址，用于客户端首屏 OpenGraph 标签 |
| `INDEXNOW_ENABLED` | `0` | 是否开启 IndexNow 搜索引擎即时收录协议（`1` 开启，`0` 关闭） |
| `INDEXNOW_KEY` | 空 | IndexNow API Key（32 位十六进制字符串） |

### 页脚与品牌自定义（Vite 构建期 `VITE_*`）

非播放页面底部展示 GitHub 与维护者信息；修改后需重新执行 `pnpm build` 或 `docker compose up -d --build`。

| 变量名 | 说明 |
| :--- | :--- |
| `VITE_GITHUB_URL` | 源码仓库地址（默认 `https://github.com/uerax/Animaku`） |
| `VITE_MAINTAINER_NAME` / `VITE_MAINTAINER_URL` | 维护者显示名称与个人主页链接 |
| `VITE_HOMEPAGE_URL` / `VITE_CONTACT_EMAIL` | 额外主页链接、联系邮箱 |
| `VITE_SITE_TAGLINE` / `VITE_FOOTER_NOTE` | 站点标语与页脚附加声明文案 |

## 配套运维与架构文档

为了方便开发者二次开发与生产环境运维加固，本项目沉淀了完整的架构与运维指南：

- 🗄️ [SQLite 数据库字典与 Docker 免安装查询指南 (`docs/database-maintenance.md`)](docs/database-maintenance.md)：数据表 Schema 字典、单行命令免安装查询 PV 与播放量、时区避坑说明。
- 🛡️ [Cloudflare CDN 接入、WAF 防爆破与边缘缓存指南 (`docs/cloudflare-cdn-rules.md`)](docs/cloudflare-cdn-rules.md)：DNS 接入、工业级 WAF 防御表达式、多级 Cache Rules 边缘缓存策略与源站加固。
- 🔌 [视频源接入规范与专有适配器实战指南 (`docs/video-source-integration.md`)](docs/video-source-integration.md)：规则引擎架构、专有适配器 SOP、版本控制与防盗链避坑准则。
- ⚡ [弹幕渲染引擎性能报告 (`docs/danmaku-perf.md`)](docs/danmaku-perf.md)：物理时钟算法、分级漂移滤波与 rVFC 帧同步基准测试。

## Q&A 常见问题

<details>
<summary><b>使用者 Q&A</b></summary>

#### Q: 为什么少数番剧里有广告？

A: 本项目完全开源且承诺不插入任何广告。片源侧广告可能来自第三方源站的 M3U8 切片；可在设置或规则卡片中开启 **广告过滤**（内置多维加权打分模型智能识别并切除）。若源站未带 DISCONTINUITY 标签或降级为 iframe 嵌入则无法过滤。

#### Q: 为什么启用 Anime4K 超分后播放卡顿？

A: Anime4K 依赖浏览器的 **WebGPU** 硬件着色器计算。如果设备显卡负载较高，建议在播放器右键菜单或设置中切换为 **效率档**，或针对 720P 及以下低分辨率番剧开启；若设备不支持 WebGPU 请关闭超分。

#### Q: 为什么有的视频源能搜到却无法播放？

A: Web 客户端受限于浏览器跨域与防盗链安全机制，依靠服务端静态抽链与直连解析。若源站临时增加了复杂 Cloudflare 5 秒盾或图形验证码，建议点击右侧视频源看板切换其他内置或自定义视频源。

#### Q: 公网打开页面后无法选源或播放？

A: 请检查 `.env` 中是否将 `PUBLIC_PROXY` 误设为了 `0`（默认为 `1`）。若配置了 `PROXY_TOKEN`，请在前端「设置」页输入口令进行解锁。

#### Q: 弹幕显示「未配置」或无法拉取？

A: 本地开发或私有部署可留空 `DANDAN_*` 使用内置客户端密钥。若仍拉取失败可检查 `/api/danmaku/status` 与服务端日志；生产环境建议前往 [弹弹play 开放平台](https://www.dandanplay.com/) 免费申请专属 API 密钥。

</details>

<details>
<summary><b>运维与开发 Q&A</b></summary>

#### Q: Docker 部署后首页访问显示 404？

A: 请确认 Docker 构建阶段包含前端 SPA 编译产物；容器内环境变量为 `WEB_DIST=public`，并确认请求 `GET /api/health` 能正常返回 200。

#### Q: 数据库如何持久化备份与直接查询？

A: 服务端 SQLite 缓存数据库保存在容器 `/app/data/animaku.db`（挂载于宿主机 `./data`）。无需在宿主机安装 SQLite CLI，可通过 `docker compose exec animaku node -e '...'` 一键免安装查询，详见 [数据库运维指南 (docs/database-maintenance.md)](docs/database-maintenance.md)。

#### Q: 如何接入 Cloudflare CDN 加速并防止恶意扫描？

A: 本项目针对 Cloudflare 提供了完整的 WAF 防爆破/防敏感文件嗅探规则以及多级 Edge Cache 最佳实践配置清单，详见 [Cloudflare CDN 与 WAF 规则指南 (docs/cloudflare-cdn-rules.md)](docs/cloudflare-cdn-rules.md)。

#### Q: 提示 `pnpm: command not found` 或 `node_modules missing`？

A: 仅本机 Node.js 运行或二次开发需要 pnpm。请确保安装了 pnpm 9.15.0 并在 **仓库根目录** 执行 `pnpm install`。纯部署用户推荐直接使用 Docker 一键启动。

</details>

## 免责声明

本软件按「现状」提供，作者与贡献者不对适用性、可靠性或准确性作任何明示或暗示保证。在法律允许的最大范围内，不承担因使用本软件产生的任何直接或间接损害责任。

使用本项目须遵守所在地法律法规，不得侵犯第三方知识产权。因使用产生的数据与缓存建议及时清理；长时间缓存或传播他人内容需自行取得权利人授权。

默认仅内置少量示例规则；更多规则请从 [AniBakaRule](https://github.com/AniBakaBaka/AniBakaRule) 或 [KazumiRules](https://github.com/Predidit/KazumiRules) 安装或自行导入。部分源站存在反爬 / 验证码 / 防盗链机制，Web 端可能存在解析失效情况。

## 隐私保护

- **零数据遥测**：不收集任何用户使用行为与隐私数据，无任何内置商业分析 SDK。
- **纯本地存储**：Bangumi Token、视频源规则 JSON、播放历史与个性化设置仅保存在用户 **浏览器本地**（`localStorage`）。
- **可控代理通道**：服务端仅在用户请求时按规则访问第三方视频源与媒体 CDN；`PUBLIC_PROXY` 默认开启，支持配置 `PROXY_TOKEN` 保护 VPS 出站流量。

## 特别致谢

特别感谢以下优秀的开源项目与平台为 Animaku 提供的灵感、算法、元数据与生态支持：

- [AniBaka](https://github.com/AniBakaBaka/AniBaka) 与 [AniBakaRule](https://github.com/AniBakaBaka/AniBakaRule) —— 现代化流水线视频源规则引擎（`anx-rule/2`）与高质量开源规则生态。
- [Kazumi](https://github.com/Predidit/Kazumi) 与 [KazumiRules](https://github.com/Predidit/KazumiRules) —— 规则模型、选源与产品形态的重要参考。
- [agefans-enhance](https://github.com/IronKinoko/agefans-enhance) 与 [@ironkinoko/danmaku](https://github.com/IronKinoko/danmaku) —— 弹幕交互与播放器面板的重要参考。
- [Bangumi 番组计划](https://bangumi.tv/) 开放 API —— 丰富详尽的二次元番剧元数据与每日放送日程。
- [弹弹play](https://www.dandanplay.com/) 开放平台 —— 庞大精准的番剧高能弹幕数据库。
- [Anime4K](https://github.com/bloc97/Anime4K) —— 优秀的动漫实时超分辨率着色器算法。
- [bangumi-oped](https://github.com/uerax/bangumi-oped) —— 开源番剧片头片尾时间戳数据。
- [hls.js](https://github.com/video-dev/hls.js/)、[Hono](https://hono.dev/)、[Vite](https://vitejs.dev/) 与 [React](https://react.dev/) 生态。
