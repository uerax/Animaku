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
    浏览器里的现代化番剧应用：基于自定义规则选源播放，集成
    <a href="https://bangumi.tv/">Bangumi</a> 每日放送与元数据、
    <b>B站级自研高精弹幕</b>、<b>WebGPU Anime4K 实时画质超分</b> 与 <b>智能跳过 OP/ED</b>。<br />
    兼容 <a href="https://github.com/Predidit/KazumiRules">KazumiRules</a> 规则生态，支持多源搜索与规则商店。
    本地历史 / 追番进度，暗场琉璃质感。绝赞开发中 (～￣▽￣)～
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

**Animaku** 是 **React 19 SPA + 本地轻量 Hono API** 的现代化自托管二次元番剧客户端。

| 核心维度 | 能力说明 |
|------|------|
| **每日放送与维基** | Bangumi 周更时间表 / 全局搜索 / 番剧详情 / 演职员与分集；支持 Token 同步追番进度 |
| **多源聚合播放** | 兼容 Kazumi 规则（XPath / API）；多规则并发搜索与多线路快速切换 |
| **B站级高精弹幕** | 弹弹play + B站双库聚合；本地 XML 导入；高精时钟微秒插值、防追尾与高能热力图 |
| **画质与智能播放** | WebGPU 实时 Anime4K 超分（720p/1080p→4K）、`bangumi-oped` 智能片头片尾跳过、M3U8 智能去广告 |
| **纯粹本地数据** | 历史、设置、收藏与规则 JSON 均存储于浏览器本地；服务端零落库，隐私纯净 |

## 支持环境

- **浏览器**：现代 Chromium / Firefox / Safari（支持播放、HLS 流媒体、WebGPU 硬件加速超分）
- **部署（推荐）**：Docker / Compose 单容器 — **只需 Docker，无需配置 Node / pnpm 环境**
- **本机生产 / 开发**：Node.js ≥ 20（建议 LTS）+ pnpm **9.15.0**

## ✨ 核心特性

- 🎬 **旗舰级播放与画质引擎**
  - **Anime4K WebGPU 实时超分**：利用客户端 GPU 算力实现实时 2× 纹理重建与线条抗锯齿，低清老番秒变 4K 极清。
  - **智能跳过片头片尾**：集成 `bangumi-oped` 社区时间戳库，在时间轴精准标注 OP/ED 发光标记并支持一键无感跳过。
  - **多画幅比例自由裁切**：快捷键 `W` 一键切换 16:9（默认）、4:3（经典怀旧）、Cover（铺满画面）、Fill（拉伸）。
  - **全格式与拖拽秒播**：支持 HLS (m3u8)、MP4 等在线流媒体，支持直接拖拽本地视频文件入播放器即开即播。

- 💬 **B站级自研弹幕生态系统**
  - **多平台弹幕聚合**：弹弹play + Bilibili 双库匹配，支持自定义关键词、分 P 关联与本地 XML 弹幕导入。
  - **微秒级时钟插值**：基于 `performance.now()` 外推，120Hz/144Hz 满帧亚像素丝滑位移，彻底消除原生低频阶梯抖动。
  - **防追尾与分层渲染**：内置进出场防追尾碰撞分配器，采用原子化分层渲染（滚动 < 底部字幕 < 顶部固定）。
  - **倍速时间轴自适应**：弹幕驻留时长恒定 7.5s 物理标准，无论 0.5x 还是 2.0x 倍速播放，弹幕始终保持舒适阅读节奏。
  - **高能波形热力图**：进度条上方动态渲染全集弹幕密度热力波形，高能名场面与剧情转折一目了然。

- 🔍 **多源聚合与智能去广告**
  - **自定义规则引擎**：兼容 Kazumi 规则（XPath/API），支持多源并发检索、一键换源换线与规则商店。
  - **M3U8 智能去广告**：内置多维度切片加权打分模型，自动精准识别并切除跨域插播广告切片。
  - **直连与代理双模**：优先浏览器直连 CDN 极速起播，支持针对指定规则源或全局开启服务器代理，兼顾高吞吐与播放稳定性。

- 📅 **番剧情报与追番管理**
  - **每日放送时间表**：实时聚合 Bangumi 周更放送日程，新番播出时间与更新状态一手掌握。
  - **番剧维基与收藏**：官方评分、演职员角色阵容与分集剧情，支持「想看 / 在看 / 看过 / 搁置」四态追番管理。

- 🎨 **极致现代设计与多端交互**
  - **Dark Glassmorphism 琉璃美学**：深度磨砂玻璃质感设计语言，播放器所有面板与弹窗白天/夜间双模态自适应。
  - **全端手势与快捷键**：移动端支持双击播放/暂停、长按 2.0x 极速快进（松手平滑恢复）、滑动 Seek 实时时间差 HUD；桌面端支持全套键盘快捷键。

## 快速开始

多数用户 **只装 Docker 即可**；下面的 pnpm 仅用于本机生产或二次开发。

### Docker 一键部署（推荐）

```bash
git clone https://github.com/uerax/Animaku.git animaku
cd animaku

cp .env.example .env    # 按需改 PORT、PUBLIC_PROXY 等
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
docker run --rm -p 8787:8787 --env-file .env -e PORT=8787 -e PUBLIC_PROXY=1 animaku
```

- 健康检查：`GET /api/health`
- 镜像内 `WEB_DIST=public`；进程以非 root（`node`）运行
- `PUBLIC_PROXY` **默认开启**（公网可直接选源/代理）；仅内网可设 `0` 收紧
- 页脚 `VITE_*` 为构建期变量：改完需 `docker compose up -d --build` 才生效

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
`WEB_DIST` 可指定静态目录（相对进程 cwd）；本机可省略，会探测 `public` / `apps/web/dist` 等。

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

请在 **仓库根目录** 使用 pnpm，不要用 npm / yarn 直接装依赖。

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
pnpm typecheck     # 全仓 tsc
pnpm bump <ver>    # 一键升级全仓版本（如 pnpm bump 1.1.2 或 pnpm bump patch）
```

跳过 `pnpm install` 直接 `pnpm dev` 会报找不到 `tsx` / `node_modules missing`。  
日常改代码请用 `pnpm dev`，不要用生产 `start`。

## 使用指南

1. **访问站点**：Docker / 本机生产打开 `http://localhost:$PORT` · 本地开发打开 `http://localhost:$WEB_DEV_PORT`
2. **追番配置**：进入 **设置 → Bangumi Token**（可选，用于同步 Bangumi 收藏与追番列表）
3. **规则管理**：默认内置主流规则源；支持从 **规则仓库** 在线安装或导入自定义 JSON 规则
4. **选源播放**：详情页点击规则源即可一键搜索分集（优先直连源站 CDN，亦可在设置中开启服务器代理）
5. **弹幕与设置**：控制栏提供专属「弹幕设置与搜索」图标（`[弹+⚙️]`）与「弹幕开关」图标（`[弹/斜杠]`）

### 播放控制快捷键

| 快捷键 | 作用 |
|----|------|
| `Space` / `K` | 播放 / 暂停 |
| `←` / `→` | 快退 5s / 快进 5s |
| `↑` / `↓` | 音量调节 ±5% |
| `F` | 播放器全屏 / 退出全屏 |
| `W` | 画面比例切换（16:9 默认 / 4:3 怀旧 / 铺满 Cover / 拉伸 Fill） |
| `D` | 弹幕开关切换 |
| `Alt+M` | 呼出弹幕设置与搜索面板 |
| `,` / `.` / `/` | 弹幕滞后 0.5s / 超前 0.5s / 偏移复位 |
| `P` / `N` | 切换 上一集 / 下一集 |
| 拖入本地文件 | 拖拽视频文件（MP4/MKV/WebM）直接播放；拖入 `.xml` 导入 B 站/pakku 弹幕 |

### 移动端触控手势

* **全域双击**：屏幕任意区域双击快速切换 播放 / 暂停
* **长按加速**：长按屏幕触发 `2.0X ⚡ 快速倍速`，松开手指平滑恢复原本倍速
* **滑动进度**：滑动进度条实时在屏幕中央显示时间差 HUD（如 `+00:15 (08:30)`）

## 环境变量

完整注释见 [.env.example](.env.example)。服务端从仓库根与 `apps/server` 加载；Vite 读同一份根 `.env`。

### 常用

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | API / 生产单进程监听 |
| `WEB_DEV_PORT` / `WEB_HOST` | `5173` / 代码默认 `127.0.0.1` | **仅本地 Vite**；Docker 生产不用 |
| `DANDAN_APP_ID` / `DANDAN_APP_SECRET` | 空 | 空则用内置 legacy 客户端密钥，开箱可弹幕 |
| `BANGUMI_USER_AGENT` / `PRODUCT_USER_AGENT` | `animaku/0.1` | 上游 UA |

### 页脚 / 项目宣传（可选，Vite `VITE_*`）

非观看页底部展示 GitHub 与可选维护者信息；改后需重新 `pnpm build` / 重启 `pnpm dev`。

| 变量 | 说明 |
|------|------|
| `VITE_GITHUB_URL` | 源码地址（默认 `https://github.com/uerax/Animaku`）；也可写 `owner/repo` |
| `VITE_MAINTAINER_NAME` / `VITE_MAINTAINER_URL` | 维护者显示名与主页链接 |
| `VITE_HOMEPAGE_URL` / `VITE_CONTACT_EMAIL` | 额外主页、联系邮箱 |
| `VITE_SITE_TAGLINE` / `VITE_FOOTER_NOTE` | 标语与附加说明 |

完整列表见 [.env.example](.env.example)。

### SEO（可选）

SPA 默认带 `index.html` meta、客户端按路由改 title/description/OG、以及 `/robots.txt` + `/sitemap.xml`。

| 变量 | 说明 |
|------|------|
| `SITE_URL` | 运行时公网 origin（无尾斜杠），写入 sitemap / robots 的 `Sitemap:` |
| `VITE_SITE_URL` | 构建期写入客户端，供 canonical / `og:url`（Docker 需 rebuild） |

未设置时：服务端用请求 `Host`（含 `X-Forwarded-*`）；客户端用 `window.location.origin`。  
私有页（设置 / 历史 / 追番 / 搜索 / `/play/*`）`noindex`；番剧详情索引在 `/subject/:id`。

### 公网 / 代理访问（重要）

| 变量 | 说明 |
|------|------|
| `PUBLIC_PROXY` | **默认 `1`**：任意客户端可用媒体代理 + 规则 search/chapters/resolve。设 `0` 则仅本机/局域网（或 `PROXY_TOKEN`） |
| `PROXY_TOKEN` | 可选；在 `PUBLIC_PROXY=0` 时可用请求头 `X-Animaku-Proxy-Token` 或 `?proxyToken=` 放行 |
| `CORS_ORIGINS` | 额外允许的浏览器 Origin（逗号分隔）；localhost 始终可用 |

**默认已适合 VPS 公网部署。** 开启后他人也可借你的服务器出口拉流，请知悉带宽风险（仍有内网 SSRF 拦截）。  
仅本机 / 局域网、不希望端口暴露后被公网当出口用时：设 `PUBLIC_PROXY=0`。

## Q&A

<details>
<summary>使用者 Q&A</summary>

#### Q: 为什么少数番剧里有广告？

A: 本项目不插入广告。片源侧广告可能来自 m3u8 分段；可在规则或设置里开启 **广告过滤**（内置多维加权打分模型智能识别，不是通用广告拦截）。无广告特征或 iframe 降级时过滤无效。

#### Q: 为什么启用超分辨率后播放卡顿？

A: Anime4K 走浏览器 **WebGPU**，对 GPU 算力有一定要求。如果显卡负载较高，建议选择 **效率档** 而非质量档，或对低分辨率源使用；不支持 WebGPU 时请关闭超分。

#### Q: 为什么有的源能搜到却播不了？

A: Web 端没 WebView 拦截能力，只能静态抽链。大量 `resolve` 失败多半是源站反爬限制，可切换其他规则 / 线路，或接受 iframe 降级（弹幕与部分播放增强不可用）。

#### Q: 公网能开页面但不能选源 / 播放？

A: 检查 `.env` / 环境变量是否把 `PUBLIC_PROXY` 设成了 `0`。默认应为 `1`；若刻意收紧，可改回 `1` 或配置 `PROXY_TOKEN`。

#### Q: 弹幕显示「未配置」？

A: 本地可留空 `DANDAN_*` 使用内置密钥。仍失败时查 `/api/danmaku/status` 与服务端日志；生产环境建议申请[弹弹开放平台](https://www.dandanplay.com/)密钥。

#### Q: 有声无画？

A: 多为布局 / 合成问题（例如父级 `overflow` + 圆角与硬解视频叠加）。详见 [docs/CONTEXT.md](docs/CONTEXT.md)。

</details>

<details>
<summary>规则与部署 Q&A</summary>

#### Q: Docker 首页 404？

A: 确认镜像构建包含前端 SPA；`WEB_DIST=public`，并确认 `GET /api/health` 正常。

#### Q: `pnpm: command not found` / `node_modules missing`？

A: 仅本机 Node / 开发需要 pnpm。安装 pnpm 9.15.0 并保证在 **仓库根** 执行 `pnpm install`。只想部署时用上面的 Docker 即可。不要只开 `dev:web` 却期望 `/api` 可用。

#### Q: 自定义规则能搜不能看？

A: 部分站反爬 / 验证码 / 防盗链会导致静态解析失败。可换线路，或依赖 iframe 降级提高兼容（体验弱于直链播放）。

</details>

## 免责声明

本软件按「现状」提供，作者与贡献者不对适用性、可靠性或准确性作任何明示或暗示保证。在法律允许的最大范围内，不承担因使用本软件产生的任何直接或间接损害责任。

使用本项目须遵守所在地法律法规，不得侵犯第三方知识产权。因使用产生的数据与缓存建议及时清理；长时间缓存或传播他人内容需自行取得权利人授权。

默认仅内置少量示例规则；更多请从 [KazumiRules](https://github.com/Predidit/KazumiRules) 安装或自行导入。部分站点有反爬 / 验证码 / 防盗链，Web 端可能解析失败。

## 隐私

- 不收集用户遥测；无内置分析 SDK。  
- Bangumi Token、规则 JSON、历史与设置仅保存在 **浏览器本地**（`localStorage` 等）。  
- 服务端代理请求会按规则访问第三方站点与媒体 CDN；`PUBLIC_PROXY` 默认开启，请注意出口流量与访问控制（可设 `0` 限制为局域网）。

## 致谢

特别感谢 [Kazumi](https://github.com/Predidit/Kazumi) 与 [KazumiRules](https://github.com/Predidit/KazumiRules)——规则模型、选源与产品形态的重要参考。

特别感谢 [agefans-enhance](https://github.com/IronKinoko/agefans-enhance) 与 [@ironkinoko/danmaku](https://github.com/IronKinoko/danmaku)——弹幕交互与播放器面板的重要参考。

特别感谢 [弹弹play](https://www.dandanplay.com/) 开放平台提供弹幕能力。

特别感谢 [Bangumi](https://bangumi.tv/) 开放 API 提供番剧元数据。

特别感谢 [Anime4K](https://github.com/bloc97/Anime4K) 提供实时超分算法思路与实现参考。

特别感谢 [bangumi-oped](https://github.com/uerax/bangumi-oped) 提供番剧 OP/ED 时间戳数据。

感谢 [hls.js](https://github.com/video-dev/hls.js/)、[Hono](https://hono.dev/)、[Vite](https://vitejs.dev/) 与 React 生态，以及所有为本项目与上游生态贡献的人。
