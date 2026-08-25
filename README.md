<div align="center">

  <p><a href="README.md">简体中文</a> · <a href="README.en.md">English</a></p>

  <h1>Animaku</h1>

  <img src="apps/web/public/android-chrome-512x512.png" width="160" alt="Animaku logo" />

  <p>
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/Hono-API-E36002?style=for-the-badge&logo=hono&logoColor=white" alt="Hono" />
    <img src="https://img.shields.io/badge/WebGPU-Anime4K-9cf?style=for-the-badge&logo=webgpu&logoColor=white" alt="WebGPU" />
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  </p>

  <p>
    现代化自托管番剧流媒体客户端：开箱内置优质 1080P 原画直链视频源，集成
    <a href="https://bangumi.tv/">Bangumi</a> 每日放送与维基元数据、
    <b>高精弹幕引擎</b>、<b>WebGPU Anime4K 实时画质超分</b>、<b>智能跳过片头片尾</b> 与 <b>详细统计面板</b>。<br />
    兼容 <a href="https://github.com/Predidit/KazumiRules">KazumiRules</a> 规则生态，支持多源并发检索、一键换源换线与规则商店。
    SQLite 极速双层持久化缓存，纯粹本地数据存储，日夜双模态琉璃质感。绝赞开发中 (～￣▽￣)～
  </p>

  <p>
    <img
      src="docs/screenshots/watch-player.png"
      alt="Animaku 播放页：弹幕、多线路选集与播放器控制栏"
      width="900"
    />
  </p>

</div>

## 这是什么

**Animaku** 是基于 **React 19 SPA + 本地轻量 Hono API** 构建的现代化自托管二次元番剧客户端。

| 核心维度 | 能力说明 |
|------|------|
| **每日放送与维基** | Bangumi 周更日程 / 全局搜索 / 番剧详情 / 演职员与分集；支持 Token 追番同步 |
| **多源聚合播放** | 内置优质 1080P 直链；兼容 KazumiRules 规则生态 |
| **高精弹幕** | 弹弹play + 其他弹幕库聚合与 XML 导入；纯物理时钟驱动 + 分级滤波 + rVFC 硬件同步 + 高能热力图 |
| **画质与极速播放** | WebGPU 实时 Anime4K 超分（720p/1080p→4K）、`bangumi-oped` 智能片头片尾跳过、M3U8 智能去广告 |
| **流媒体交互体验** | 3 色流媒体视频源看板、长番剧 50 话智能分页、正/倒序切换、一键强制刷新、右键详细统计 (Stats for Nerds) |
| **极速与本地安全** | SQLite L1/L2 双层持久化缓存与 Single-Flight 并发防击穿；历史/设置/收藏/规则纯本地存储，服务端零落库 |

## 支持环境

- **浏览器**：现代 Chromium / Firefox / Safari（支持播放、HLS 流媒体、WebGPU 硬件加速超分）
- **部署（推荐）**：Docker / Compose 单容器 — **只需 Docker，无需配置 Node / pnpm 环境**
- **本机生产 / 开发**：Node.js ≥ 20（建议 LTS）+ pnpm **9.15.0**

## ✨ 核心特性

- 🎬 **旗舰级播放与画质引擎**
  - **Anime4K WebGPU 实时超分**：利用客户端 GPU 算力实现实时 2× 纹理重建与线条抗锯齿，低清老番秒变 4K 极清。
  - **智能跳过片头片尾**：集成 `bangumi-oped` 社区时间戳库，在时间轴精准标注 OP/ED 发光标记并支持一键无感跳过。
  - **播放器右键菜单与 Stats for Nerds**：对标主流流媒体，提供实时分辨率、丢帧率 (FPS)、缓冲区、分片下载速率等详细排错统计；支持原画截图、画面镜像翻转、画中画 (PiP)。
  - **0ms 极速响应与多画幅自由裁切**：消除单击延迟，即点即播；快捷键 `W` 一键切换 16:9（默认）、4:3（怀旧）、Cover（铺满）、Fill（拉伸）。
  - **网页全屏与系统全屏**：支持 `Shift+W` 网页全屏（视窗最大化且保留页面交互）与 `F` 原生系统全屏。

- 💬 **旗舰级自研高精弹幕生态系统**
  - **多平台弹幕聚合**：弹弹play 与多方弹幕库聚合匹配，支持自定义关键词、分 P 关联与本地 XML 弹幕导入。
  - **纯物理时钟驱动 + 分级漂移治理**：位移严格由 `performance.now()` 单调推进，配合 Zero 死区与 EMA 低通滤波器，杜绝时间抖动与 1~2px 横跳回弹。
  - **rVFC 硬件级帧呈现同步**：支持 `requestVideoFrameCallback`，画面与弹幕像素级绝对同步；配备 1:1 Retina 离屏字形位图缓存池。
  - **三态循环弹幕与智能降噪**：「全量 → 精简 (xN 去重聚合) → 关闭」三态一键切换（快捷键 `D`），同屏过载密度丢弃防遮挡。
  - **恒定 7.5s 屏幕穿越时长**：弹幕飞行时长对标主流弹幕播放器标准，切倍速时动态连续相位重定，保持真实阅读节奏舒适自然。
  - **Seekbar 高能弹幕热力图**：进度条动态绘制蓝光渐变热力波形，高能名场面与剧情转折一目了然。

- 🔍 **多源聚合与智能播放体验**
  - **内置高画质直链源**：开箱内置多条优质 1080P MP4 原画直链规则，首屏毫秒级秒开，0 服务端代理带宽消耗。
  - **3 色动态微光流媒体看板**：🟢 极速就绪（呼吸绿光） / 🟡 待选条目（琥珀黄展开） / 🔴 异常熔断（低噪灰显）；2 并发轻量池按需流式探测。
  - **选集体验升维**：一键强制刷新选集（`onRefreshChapters`，穿透服务端与客户端缓存）；超长番剧 50 话智能区间分页胶囊；正/倒序一键直达。
  - **跨源集数对齐与秒级进度继承**：跨源切源时自动解析集数编号并同步当前播放秒数，告别手动重寻。
  - **M3U8 智能去广告**：内置多维度切片加权打分模型，自动精准识别并切除跨域插播广告切片；混合模式免密直连源站 CDN。
  - **SQLite L1+L2 双层持久化缓存**：服务端基于 SQLite 实现搜索与分集持久化缓存与 Single-Flight 并发防击穿，重启服务缓存零丢失。

- 📅 **番剧情报与追番管理**
  - **首页多板块楼层式浏览**：继续观看、热门番剧、剧场版、OVA/特别篇，12 条公倍数自适应网格，杜绝布局抖动与空缺。
  - **每日放送时间表**：实时聚合 Bangumi 周更放送日程，新番播出时间与更新状态一手掌握。
  - **番剧维基与收藏**：官方评分、演职员角色阵容与分集剧情，支持「想看 / 在看 / 看过 / 搁置」四态追番管理。

- 🎨 **极致现代设计与多端交互**
  - **日夜双模态琉璃美学**：默认清新质感白天模式（Warm Slate），夜间模式接入 ColorsWall 经典深炭灰与天青蓝琉璃设计系统。
  - **移动端触控手势**：双击播放/暂停、长按 2.0x 极速快进（松手平滑恢复）、滑动 Seek 实时时间差 HUD。

## 快速开始

多数用户 **只需安装 Docker 即可**；下面的 pnpm 仅用于本机生产或二次开发。

### Docker 一键部署（推荐）

```bash
git clone https://github.com/uerax/Animaku.git animaku
cd animaku

cp .env.example .env    # 按需调整 PORT、PUBLIC_PROXY 等
docker compose up -d --build
```

浏览器打开 **http://localhost:$PORT**（默认 `8787`）。  
单容器同时提供 SPA 与 `/api/*`（同源）。

```bash
docker compose logs -f
docker compose down
```

```bash
# 不用 compose
docker build -t animaku .
docker run --rm -p 8787:8787 --env-file .env -e PORT=8787 -e PUBLIC_PROXY=1 -v ./data:/app/data animaku
```

- 健康检查：`GET /api/health`
- 镜像内 `WEB_DIST=public`；进程以非 root（`node`）运行
- 数据持久化：SQLite 数据库保存在 `./data` 目录
- `PUBLIC_PROXY` **默认开启**（公网可直接选源/播放）；仅内网可设 `0` 收紧
- 页脚 `VITE_*` 为构建期变量：修改后需 `docker compose up -d --build` 生效

### 本机 Node 生产（无 Docker）

一个进程同时提供 `/api/*` 与 SPA（同源，无需 Vite 代理）：

```bash
# 需 Node ≥ 20 + pnpm 9.15.0，在仓库根目录
pnpm install
cp .env.example .env   # 按需修改
pnpm start:prod
# 等价：pnpm build && pnpm start
```

浏览器打开 **http://localhost:$PORT**（默认 `8787`）。  
`WEB_DIST` 可指定静态目录（相对进程 cwd）；本机可省略，会自动探测 `public` / `apps/web/dist`。

### 本地开发（pnpm）

| 工具 | 版本 |
|------|------|
| Node.js | ≥ 20（建议 LTS） |
| pnpm | **9.15.0**（与 `packageManager` 字段一致） |

```bash
# 安装 pnpm（任选）
npm install -g pnpm@9.15.0
# 或：corepack enable && corepack prepare pnpm@9.15.0 --activate
```

请在 **仓库根目录** 使用 pnpm，不要用 npm / yarn 直接安装依赖。

```bash
pnpm install
cp .env.example .env   # 按需修改

pnpm dev
```

| 进程 | 默认地址 | 说明 |
|------|----------|------|
| Web（Vite） | http://localhost:5173（`WEB_DEV_PORT`） | **浏览器只开这个** |
| API（Hono） | http://localhost:8787（`PORT`） | Vite 把 `/api` 代理过来 |

```bash
pnpm dev:web       # 仅前端
pnpm dev:server    # 仅后端
pnpm typecheck     # 全仓 tsc 类型检查
pnpm bump <ver>    # 一键升级全仓版本（如 pnpm bump 1.1.2 或 pnpm bump patch）
```

日常修改代码请使用 `pnpm dev`。

## 使用指南

1. **访问站点**：Docker / 本机生产打开 `http://localhost:$PORT` · 本地开发打开 `http://localhost:$WEB_DEV_PORT`
2. **追番配置**：进入 **设置 → Bangumi Token**（可选，用于同步 Bangumi 收藏与追番列表）
3. **规则管理**：开箱内置优质主流规则源；支持从 **规则仓库** 在线安装或导入自定义 JSON 规则
4. **选源播放**：详情页点击规则源即可一键搜索分集（优先直连 1080P 原画 CDN，亦可在设置中开启服务器代理）
5. **弹幕与设置**：控制栏提供专属「弹幕设置与搜索」图标（`[弹+⚙️]`）与「弹幕三态切换」图标（`[弹/斜杠]`）

### 播放控制快捷键

| 快捷键 | 作用 |
|----|------|
| `Space` / `K` | 播放 / 暂停（0ms 瞬时响应） |
| `←` / `→` | 快退 5s / 快进 5s |
| `↑` / `↓` | 音量调节 ±5% |
| `F` | 播放器全屏 / 退出全屏 |
| `Shift + W` | 网页全屏（Web Fullscreen）切换 |
| `W` | 画面比例切换（16:9 默认 / 4:3 怀旧 / 铺满 Cover / 拉伸 Fill） |
| `D` | 弹幕三态循环切换（全量 → 精简 → 关闭） |
| `Alt + M` | 呼出弹幕设置与搜索面板 |
| `,` / `.` / `/` | 弹幕滞后 0.5s / 超前 0.5s / 偏移复位 |
| `P` / `N` | 切换 上一集 / 下一集 |
| 鼠标右键 | 呼出播放器右键悬浮菜单（详细统计信息 / 截图 / 镜像 / 画中画 / 倍速 / 超分） |
| 拖入本地文件 | 拖拽视频文件（MP4/MKV/WebM）直接播放；拖入 `.xml` 导入外部/pakku 弹幕 |

### 移动端触控手势

* **全域双击**：屏幕任意区域双击快速切换 播放 / 暂停
* **长按加速**：长按屏幕触发 `2.0X ⚡ 快速倍速`，松开手指平滑恢复原本倍速
* **滑动进度**：滑动进度条实时在屏幕中央显示时间差 HUD（如 `+00:15 (08:30)`）

## 环境变量

完整注释见 [.env.example](.env.example)。服务端从仓库根与 `apps/server` 加载；Vite 读同一份根 `.env`。

### 常用变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | API / 生产单进程监听 |
| `WEB_DEV_PORT` / `WEB_HOST` | `5173` / `127.0.0.1` | **仅本地 Vite 开发**；Docker 生产不用 |
| `DANDAN_APP_ID` / `DANDAN_APP_SECRET` | 空 | 留空使用内置 legacy 客户端密钥，开箱即用弹幕 |
| `BANGUMI_USER_AGENT` / `PRODUCT_USER_AGENT` | 自动生成 | 上游 API 规范 UA |

### 页脚 / 项目定制（可选，Vite `VITE_*`）

非观看页底部展示 GitHub 与维护者信息；修改后需重新构建。

| 变量 | 说明 |
|------|------|
| `VITE_GITHUB_URL` | 源码地址（默认 `https://github.com/uerax/Animaku`）；也可写 `owner/repo` |
| `VITE_MAINTAINER_NAME` / `VITE_MAINTAINER_URL` | 维护者显示名与主页链接 |
| `VITE_HOMEPAGE_URL` / `VITE_CONTACT_EMAIL` | 额外主页、联系邮箱 |
| `VITE_SITE_TAGLINE` / `VITE_FOOTER_NOTE` | 标语与附加说明 |

### 公网与安全访问

| 变量 | 默认 | 说明 |
|------|------|------|
| `PUBLIC_PROXY` | `1` | **默认开启**：允许客户端使用媒体代理与规则搜索/解析。设 `0` 则仅限本机/局域网 |
| `PROXY_TOKEN` | 空 | 可选代理密码；在设置页解锁或携带 `X-Animaku-Proxy-Token` 请求头放行 |
| `CORS_ORIGINS` | 空 | 额外允许的浏览器 Origin（逗号分隔）；localhost 始终可用 |

## Q&A

<details>
<summary>使用者 Q&A</summary>

#### Q: 为什么少数番剧里有广告？

A: 本项目不插入任何广告。片源侧广告可能来自 m3u8 分段；可在规则或设置里开启 **广告过滤**（内置多维加权打分模型智能识别）。若源站未带 DISCONTINUITY 标签或降级为 iframe 嵌入则无法过滤。

#### Q: 为什么启用超分辨率后播放卡顿？

A: Anime4K 走浏览器 **WebGPU**，对 GPU 算力有一定要求。如果显卡负载较高，建议在右键菜单或设置中选择 **效率档**，或对低分辨率源使用；若设备不支持 WebGPU 请关闭超分。

#### Q: 为什么有的源能搜到却播不了？

A: Web 端无原生 WebView 拦截能力，依靠服务端静态抽链。若源站增加复杂反爬或验证码，建议点击右侧切换其他可用内置或自定义视频源。

#### Q: 公网能打开页面但不能选源 / 播放？

A: 检查 `.env` 中是否将 `PUBLIC_PROXY` 误设为了 `0`。默认应为 `1`；若设定了 `PROXY_TOKEN`，请在设置页中输入密码解锁。

#### Q: 弹幕显示「未配置」？

A: 本地可留空 `DANDAN_*` 使用内置密钥。若仍失败可检查 `/api/danmaku/status` 与服务端日志；生产环境建议申请[弹弹开放平台](https://www.dandanplay.com/)密钥。

</details>

<details>
<summary>运维与开发 Q&A</summary>

#### Q: Docker 首页 404？

A: 确认镜像构建包含前端 SPA；`WEB_DIST=public`，并确认 `GET /api/health` 响应正常。

#### Q: 数据如何持久化备份？

A: 服务端 SQLite 缓存数据库保存在容器 `/app/data`。使用 Docker 部署时请挂载 `-v ./data:/app/data`。

#### Q: `pnpm: command not found` / `node_modules missing`？

A: 仅本机 Node / 开发需要 pnpm。请安装 pnpm 9.15.0 并在 **仓库根目录** 执行 `pnpm install`。只想部署请直接使用 Docker。

</details>

## 免责声明

本软件按「现状」提供，作者与贡献者不对适用性、可靠性或准确性作任何明示或暗示保证。在法律允许的最大范围内，不承担因使用本软件产生的任何直接或间接损害责任。

使用本项目须遵守所在地法律法规，不得侵犯第三方知识产权。因使用产生的数据与缓存建议及时清理；长时间缓存或传播他人内容需自行取得权利人授权。

默认仅内置少量示例规则；更多请从 [KazumiRules](https://github.com/Predidit/KazumiRules) 安装或自行导入。部分站点有反爬 / 验证码 / 防盗链，Web 端可能解析失败。

## 隐私

- 不收集任何用户遥测；无内置分析 SDK。  
- Bangumi Token、规则 JSON、观看历史与设置仅保存在 **浏览器本地**（`localStorage`）。  
- 服务端代理请求会按规则访问第三方站点与媒体 CDN；`PUBLIC_PROXY` 默认开启，请注意出口流量与访问控制。

## 致谢

特别感谢 [Kazumi](https://github.com/Predidit/Kazumi) 与 [KazumiRules](https://github.com/Predidit/KazumiRules)——规则模型、选源与产品形态的重要参考。

特别感谢 [AniBaka](https://github.com/AniBakaBaka/AniBaka) 与 [AniBakaRule](https://github.com/AniBakaBaka/AniBakaRule)——现代化流水线视频源规则引擎（`anx-rule/2`）与高质量开源规则生态的重要参考。

特别感谢 [agefans-enhance](https://github.com/IronKinoko/agefans-enhance) 与 [@ironkinoko/danmaku](https://github.com/IronKinoko/danmaku)——弹幕交互与播放器面板的重要参考。

特别感谢 [弹弹play](https://www.dandanplay.com/) 开放平台提供弹幕能力。

特别感谢 [Bangumi](https://bangumi.tv/) 开放 API 提供番剧元数据。

特别感谢 [Anime4K](https://github.com/bloc97/Anime4K) 提供实时超分算法思路与实现参考。

特别感谢 [bangumi-oped](https://github.com/uerax/bangumi-oped) 提供番剧 OP/ED 时间戳数据。

感谢 [hls.js](https://github.com/video-dev/hls.js/)、[Hono](https://hono.dev/)、[Vite](https://vitejs.dev/) 与 React 生态，以及所有为本项目与上游生态贡献的人。
