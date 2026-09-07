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
    现代化自托管二次元番剧流媒体客户端。<br />
    开箱内置优质 1080P 原画直链源，原生集成 <b>Bangumi 周更放送与维基数据</b>、
    <b>流畅弹幕系统</b>、<b>WebGPU 实时 4K 超分</b>、<b>智能跳过 OP/ED</b>、
    <b>桌面宽屏模式</b> 与 <b>B 站同款番剧推荐流</b>。<br />
    支持 <b>AniBaka 与 Kazumi 双规则生态</b>，数据 100% 纯本地私有，日夜双模态琉璃美学。开箱即用，专为追番设计。
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

**Animaku** 是基于 **React 19 + 轻量 Hono 服务端** 构建的现代化自托管番剧流媒体 Web 客户端。你可以用 Docker 一键部署在个人 NAS 或轻量云服务器上，随时随地享受沉浸、无干扰的追番体验。

| 维度 | 功能亮点 |
| :--- | :--- |
| **🎬 画质与播放** | 内置 1080P 直链免代理播放、WebGPU 实时 4K 超分、智能跳过片头片尾、M3U8 智能去广告 |
| **💬 弹幕生态** | 弹弹play 海量弹幕聚合、本地 XML / Pakku 弹幕导入、防遮挡降噪、高能进度条热力图 |
| **🔌 规则与片源** | 支持 **AniBaka (34+ 现代直链源)** 与 **Kazumi 传统规则** 在线安装更新，支持多线路探活看板 |
| **📅 维基与追番** | Bangumi 每日周更放送表、番剧/剧场版多重检索、个人追番管理与 Bangumi Token 进度同步 |
| **🖥️ 交互与设计** | 桌面端「🖥️ 宽屏模式」一屏铺满、B 站同款番剧推荐流、手机端触控手势、日夜双模态琉璃质感 |
| **🔒 隐私与性能** | 数据 100% 存储在浏览器本地，零商业数据追踪；轻量内存占用，单容器秒级启动 |

## ✨ 核心特性

- 🎬 **极致播放体验与画质增强**
  - **开箱即播**：内置高质量 1080P 原画直链视频源，客户端直连 CDN 秒开，无需服务端消耗额外中转流量。
  - **WebGPU 实时 4K 超分**：集成 Anime4K 算法，利用本地显卡算力实时重构动画线条，让 720P/1080P 老番秒变 4K 极清，提供多档效果调节。
  - **智能跳过片头片尾**：原生集成社区时间戳，进度条自动标明 OP/ED 范围并支持无感一键跳过；内置打标助手，轻松微调时间轴并可贡献数据。
  - **纯净无干扰**：内置智能切片过滤，自动识别并切除第三方片源的插播广告切片。
  - **灵活屏幕模式**：提供 **「🖥️ 宽屏模式」**（通栏铺满、首屏守恒无纵向滚动）、**「🔲 网页全屏」** 与 **「⛶ 系统全屏」**，支持 16:9、4:3、铺满等多画幅自由裁切。
  - **专业播放信息 (Stats for Nerds)**：右键随时查看实时编解码器、分辨率、丢帧率、缓冲区健康度与下载速率；支持一键高清原画截图、画面翻转与画中画。

- 💬 **流畅弹幕与互动系统**
  - **海量弹幕聚合**：精准匹配弹弹play 与多方弹幕库，支持自定义换源匹配与分集关联。
  - **本地弹幕导入**：支持直接拖拽外部 `.xml` 或 Pakku 弹幕文件进播放器加载。
  - **丝滑不抖动**：弹幕平滑均匀滚动，不遮挡、不横跳，支持同屏弹幕密度过载过滤与重复弹幕聚合。
  - **高能热力波形**：播放器进度条动态呈现高能弹幕波形，名场面与剧情转折一目了然。

- 🔌 **海量片源与双规则生态**
  - **双规则库支持**：设置页一键在线安装 **⭐ AniBaka 规则库 (34+ 现代直连源)** 或 **📦 Kazumi 传统规则库**，也支持导入自定义 JSON 规则。
  - **直观规则管理**：支持鼠标与手机触摸拖拽排序、首位设为主源、状态彩色标签一目了然。
  - **多源探活看板**：播放时自动在右侧展开三色指示看板（🟢 已就绪 / 🟡 备选 / 🔴 异常），线路状态一清二楚。

- 📅 **番剧维基、追番与推荐**
  - **每日放送时间表**：实时同步 Bangumi 周更日历，本季度新番更新状态随时查阅。
  - **海量检索与详情**：支持动画、剧场版与特摄影视混合检索，完整呈现演职员表与分集剧情。
  - **追番同步**：支持「想看/在看/看过」本地标记，填入 Bangumi Token 即可实现双向数据同步。
  - **B 站风格推荐流**：播放页下方精选续作、剧场版与同类型高分佳作，支持一键顺畅换番。

- 🖥️ **现代多端交互与轻量设计**
  - **日夜双模态美学**：精心调校的浅色温润质感与深色琉璃暗黑模式。
  - **折叠式全局设置**：配置项清晰分类，折叠卡片外显实时状态胶囊，直观易懂。
  - **移动端沉浸手势**：全屏双击播放/暂停、长按 2.0x 极速快进、横向滑动屏幕调进度并显示时间差 HUD。

- 🔒 **本地私密与轻量高效**
  - **零隐私上传**：无任何行为追踪与商业分析 SDK，播放记录、配置与密钥 100% 保存在本地浏览器。
  - **极速低资源占用**：轻量后端服务，内存占用低，单核 512MB 轻量云主机也能轻松流畅跑。

## 🚀 快速开始

大多数用户推荐直接使用 **Docker Compose** 一键部署；无需在宿主机配置 Node.js 或前端编译环境。

### Docker 一键部署（推荐）

```bash
# 1. 克隆代码仓库
git clone https://github.com/uerax/Animaku.git animaku
cd animaku

# 2. 准备配置文件（可按需修改端口等）
cp .env.example .env

# 3. 启动容器
docker compose up -d --build
```

启动完成后，使用浏览器访问 **`http://localhost:8787`** 即可开启追番之旅。

<details>
<summary><b>更多 Docker 常用命令</b></summary>

```bash
# 查看运行日志
docker compose logs -f

# 停止容器
docker compose down

# 单命令运行（不使用 compose）
docker build -t animaku .
docker run -d --name animaku --restart unless-stopped -p 8787:8787 --env-file .env -v ./data:/app/data animaku
```

- **数据持久化**：应用数据库默认保存在宿主机的 `./data` 目录中。
- **公网与代理安全**：若暴露到公网，建议在 `.env` 中设置 `PROXY_TOKEN` 保护 VPS 出站流量。
</details>

---

### 本地开发与调试

适合希望参与贡献或二次开发的开发者。

```bash
# 环境要求：Node.js ≥ 20，推荐使用 pnpm 9.15.0
pnpm install
cp .env.example .env

# 启动本地开发服务（前端 Vite 5173 + 后端 Hono 8787）
pnpm dev
```

浏览器打开 `http://localhost:5173` 进行调试。

## 🎮 播放操作与快捷键

### 键盘快捷键

| 快捷键 | 功能 |
| :--- | :--- |
| `Space` / `K` | 播放 / 暂停 |
| `←` / `→` | 后退 5 秒 / 前进 5 秒 |
| `↑` / `↓` | 音量调整 ±5% |
| `F` | 切换播放器全屏 |
| `Shift + W` | 切换网页全屏 (Web Fullscreen) |
| `W` | 切换画面比例（16:9 / 4:3 / 铺满 Cover / 拉伸 Fill） |
| `D` | 弹幕循环切换（开启 → 精简防挡 → 关闭） |
| `Alt + M` | 打开弹幕设置与搜索面板 |
| `,` / `.` / `/` | 弹幕延后 0.5s / 提前 0.5s / 偏移重置 |
| `P` / `N` | 播放 上一集 / 下一集 |
| `鼠标右键` | 唤出播放器高级菜单（Stats for Nerds 统计 / 截图 / 镜像 / 画中画 / 超分） |
| 拖拽本地文件 | 拖入本地视频文件（MP4/MKV/WebM）直接播放；拖入 `.xml` 导入弹幕 |

### 移动端触控手势

* **双击屏幕**：快速切换 播放 / 暂停
* **长按屏幕**：触发 `2.0X ⚡` 快速倍速，松开手指恢复正常速度
* **滑动进度**：在屏幕中央直观显示滑动时间差（例如 `+00:15`）

## ⚙️ 常用环境变量

完整配置项详细字典、生效时机与场景预设模板请参阅 📖 **[配置选项全景参考指南 Wiki (`docs/wiki/Configuration-Guide.md`)](docs/wiki/Configuration-Guide.md)** 与 [.env.example](.env.example)。

| 变量名 | 默认值 | 作用说明 |
| :--- | :--- | :--- |
| `PORT` | `8787` | 服务端与 Web 界面访问端口 |
| `HOST` | `0.0.0.0` | 监听地址（`0.0.0.0` 允许局域网/公网访问，`127.0.0.1` 仅本机） |
| `DATA_DIR` | `./data` | 数据库持久化存储目录 |
| `PUBLIC_PROXY` | `1` | 允许客户端请求第三方流媒体代理；设为 `0` 则仅允许直连或本机访问 |
| `PROXY_TOKEN` | 留空 | 服务端代理访问令牌；配置后可在网页「设置」中输入解锁，防止公网被盗刷 |
| `BANGUMI_API` | `mirror` | Bangumi API 请求线路（`mirror` 国内镜像加速 / `official` 官方直连） |
| `BANGUMI_IMAGE` | `mirror` | 番剧封面图片线路（`mirror` 国内镜像加速 / `official` 官方直连） |

## 📚 进阶架构与运维指南

深入的技术原理与运维部署方案已沉淀在专门的文档中：

- ⚙️ [配置选项全景参考指南 Wiki (`docs/wiki/Configuration-Guide.md`)](docs/wiki/Configuration-Guide.md)：所有环境变量详尽字典、运行时与构建期生效机理、安全避坑与预设模板。
- 🏛️ [系统架构与核心技术设计 (`docs/architecture.md`)](docs/architecture.md)：原地 Seek 状态机、弹幕物理时钟算法、规则引擎流水线模型与高并发服务端架构。
- ⚡ [弹幕渲染引擎性能报告 (`docs/danmaku-perf.md`)](docs/danmaku-perf.md)：弹幕物理引擎算法解析与 rVFC 硬件帧同步性能基准。
- 🔌 [视频源接入规范与专有适配器实战 (`docs/video-source-integration.md`)](docs/video-source-integration.md)：规则引擎算子接入 SOP、专有适配器编写与防盗链规范。
- 🛡️ [Cloudflare CDN 接入与 WAF 防护指南 (`docs/cloudflare-cdn-rules.md`)](docs/cloudflare-cdn-rules.md)：边缘缓存规则、工业级 WAF 表达式与源站防御。
- 🗄️ [数据库字典与 Docker 免安装运维 (`docs/database-maintenance.md`)](docs/database-maintenance.md)：数据表 Schema 字典与单行免安装快速查询指南。

## ❓ 常见问题 (FAQ)

<details>
<summary><b>为什么少数番剧播放时会有广告？</b></summary>
本项目完全开源，自身绝无任何广告。广告来自部分第三方片源切片中自带的广告切片。可在设置中开启「广告过滤」（内置智能算法自动识别并切除）。若该源广告切片过于隐蔽，可切换右侧其他视频源播放。
</details>

<details>
<summary><b>为什么开启 Anime4K 超分后画面有点卡顿？</b></summary>
Anime4K 依赖本地浏览器的 WebGPU 显卡硬件计算。如果设备显卡负载较高，建议在设置或右键菜单中选择「效率档」，或仅针对 720P 及以下分辨率的番剧开启。
</details>

<details>
<summary><b>公网部署后页面打开能加载，但无法选源播放？</b></summary>
请检查 `.env` 中的 `PUBLIC_PROXY` 是否保持为 `1`。如果配置了 `PROXY_TOKEN`，请在前端「设置」页面中输入口令进行解锁。
</details>

<details>
<summary><b>弹幕提示「未配置」或获取失败？</b></summary>
默认情况下系统会使用内置通道自动获取。若想获得最稳定的体验，可在 [弹弹play 开放平台](https://www.dandanplay.com/) 免费申请自己的专属 API 密钥并配置到 `.env`。
</details>

## 声明与致谢

### 免责声明
本软件按「现状」提供，仅供学习交流与自托管使用。本项目不存储、不分发任何音视频文件，所有视频均索引自互联网第三方公开源。用户需自行遵守所在地法律法规并尊重版权方的知识产权。

### 隐私保护
* **零数据遥测**：绝不收集任何用户使用行为与隐私数据。
* **纯本地存储**：播放记录、收藏夹与个性化配置仅保存在使用者浏览器本地（`localStorage`）。

### 特别致谢
感谢以下优秀的开源项目与平台为 Animaku 提供的灵感与生态支持：
* [AniBaka](https://github.com/AniBakaBaka/AniBaka) 与 [AniBakaRule](https://github.com/AniBakaBaka/AniBakaRule) —— 现代流水线规则生态
* [Kazumi](https://github.com/Predidit/Kazumi) 与 [KazumiRules](https://github.com/Predidit/KazumiRules) —— 规则模型与灵感参考
* [Bangumi 番组计划](https://bangumi.tv/) 开放平台 —— 丰富的二次元番剧元数据与时间表
* [弹弹play](https://www.dandanplay.com/) 开放平台 —— 详尽的番剧弹幕库支持
* [Anime4K](https://github.com/bloc97/Anime4K) —— 优秀的动画实时超分辨率算法
* [bangumi-oped](https://github.com/uerax/bangumi-oped) —— 开源番剧片头片尾时间戳数据
