# ⚙️ 配置选项全景参考指南 (Configuration Guide)

> 适用于 Animaku 全版本。本文档为 GitHub Wiki 标准页面格式，详细说明所有环境变量、生效时机、默认值及生产最佳实践。

---

## 📑 目录

- [一、配置加载机制与生效时机](#一配置加载机制与生效时机)
- [二、极速上手：新手必看核心配置](#二极速上手新手必看核心配置)
- [三、网络与服务监听配置](#三网络与服务监听配置)
- [四、数据持久化与 SQLite 数据库](#四数据持久化与-sqlite-数据库)
- [五、安全防护、访问控制与代理隧道 (重要)](#五安全防护访问控制与代理隧道-重要)
- [六、Bangumi 与外部 API 线路配置](#六bangumi-与外部-api-线路配置)
- [七、SEO、Sitemap 与 IndexNow 搜索引擎收录](#七seositemap-与-indexnow-搜索引擎收录)
- [八、前端品牌定制与导航栏外观 (Vite 构建期)](#八前端品牌定制与导航栏外观-vite-构建期)
- [九、时区与日志系统](#九时区与日志系统)
- [十、典型部署场景预设配置模板](#十典型部署场景预设配置模板)

---

## 一、配置加载机制与生效时机

Animaku 支持两类不同生命周期的环境变量，配置时请特别注意生效时机：

| 类型 | 变量前缀示例 | 生效时机 | Docker 容器中如何使其生效 |
| :--- | :--- | :--- | :--- |
| **运行时变量 (Runtime)** | `PORT`, `BANGUMI_API`, `ADMIN_SECRET` 等 | 服务端进程启动时动态读取 | 修改 `.env` 后执行 `docker compose restart` 即可热生效 |
| **构建期变量 (Build-time)** | 以 **`VITE_*`** 开头的所有变量 | 前端 SPA 打包构建时硬编码编译进静态 JS/HTML | 修改 `.env` 后**必须重新构建镜像**：<br>`docker compose up -d --build` |

---

## 二、极速上手：新手必看核心配置

如果你是第一次使用 Docker 部署，大多数选项留空使用默认值即可。以下是最核心配置项：

```env
# 1. 宿主机访问端口（默认 8787，若被占用可修改，如 9000）
PORT=8787

# 2. 国内网络优化（默认 mirror 即可，无需翻墙畅享 Bangumi 数据）
BANGUMI_API=mirror
BANGUMI_IMAGE=mirror
```

---

## 三、网络与服务监听配置

控制服务绑定的网卡与端口。

### `HOST`
- **默认值**：`0.0.0.0`
- **类型**：IP 地址
- **生效时机**：运行时
- **说明**：API 服务与生产单进程监听绑定的主机网卡。
  - `0.0.0.0`（推荐）：监听全网卡，允许局域网设备或公网访客直接连接；
  - `127.0.0.1`：仅监听本机回环地址，适合前端前面挂有宿主机 Nginx / Caddy 反向代理的场景。

### `PORT`
- **默认值**：`8787`
- **类型**：整数端口
- **生效时机**：运行时
- **说明**：API 服务端监听端口。在 Docker Compose 模式下，同时对应宿主机对外映射的端口。

### `WEB_HOST` / `WEB_DEV_PORT`
- **默认值**：`0.0.0.0` / `5173`
- **生效时机**：仅本地 Vite 开发环境 (`pnpm dev`)
- **说明**：前端开发热更新调试服务器的监听地址与端口。在 Docker 镜像或 `pnpm start` 生产环境下自动忽略此选项。

---

## 四、数据持久化与 SQLite 数据库

Animaku 采用零运维的高性能 SQLite 数据库存储播放记录、统计与元数据缓存。

### `DATA_DIR`
- **默认值**：本机运行为 `./data`；Docker 容器内为 `/app/data`
- **类型**：文件系统路径
- **生效时机**：运行时
- **说明**：持久化数据存放根目录。使用 Docker 时，必须映射宿主机目录（如 `-v ./data:/app/data`），防止容器销毁后历史数据丢失。

### `SQLITE_PATH`
- **默认值**：`$DATA_DIR/animaku.db`
- **类型**：文件系统绝对/相对路径
- **生效时机**：运行时
- **说明**：主 SQLite 数据库文件的具体存储路径。通常不需单独配置，系统会自动在 `DATA_DIR` 下创建 `animaku.db`。

### `SQLITE_WAL`
- **默认值**：`true` (1)
- **类型**：布尔值 (`true` / `false` / `1` / `0`)
- **生效时机**：运行时
- **说明**：是否开启 SQLite WAL (Write-Ahead Logging) 预写日志并发增强。开启后可大幅提升高并发读写的吞吐量，极大减少数据库加锁冲突。非极特殊文件系统强烈建议保持开启。

### `SQLITE_BUSY_TIMEOUT`
- **默认值**：`5000` (毫秒)
- **类型**：正整数
- **生效时机**：运行时
- **说明**：高并发写入等待锁定的最长时间。默认 5 秒，超过后抛出 `SQLITE_BUSY`。

---

## 五、安全防护、访问控制与代理隧道 (重要)

> 🛡️ **架构说明**：当前架构下，内置默认视频源均为**客户端浏览器直连源站 CDN**，服务端仅负责解析轻量元数据并签发短期 AES-256-GCM Opaque Ticket，**零消耗 VPS 媒体流量**。出站网络由 SafeConnector 物理层防 SSRF 熔断与 IP 频控全面护航。

### `ADMIN_SECRET`
- **默认值**：留空
- **类型**：字符串密码
- **生效时机**：运行时
- **说明**：高危管理员 API 鉴权密钥（如手动触发全站 IndexNow 差量提交、主动清除系统缓存等管理端点）。配置后，调用管理端点必须携带 `X-Admin-Secret` 头或 `?secret=` 参数（未配置时仅允许本机回环 127.0.0.1 调用）。

### `CORS_ORIGINS`
- **默认值**：留空
- **类型**：以逗号分隔的 URL 列表，或 `*`
- **生效时机**：运行时
- **说明**：跨域请求放行列表。默认情况下同源请求及本地 `localhost` 始终放行。如果你将前端网页部署在 `https://anime.yourdomain.com`，而 API 服务部署在 `https://api.yourdomain.com`，则需在此填入 `https://anime.yourdomain.com`。

---

## 六、Bangumi 与外部 API 线路配置

控制番剧元数据、演职员表、每日放送与封面图的拉取网络通道。

### `BANGUMI_API`
- **默认值**：`mirror`
- **类型**：预设标识符 (`mirror` / `official`) 或 自定义域名
- **生效时机**：运行时
- **说明**：Bangumi 接口服务路线：
  - `mirror`（国内推荐）：走内置免翻镜像反代 (`https://bgmapi.anibt.net`)，国内网络环境下无需代理即可秒开；
  - `official`（海外 VPS 推荐）：直连 Bangumi 官方接口 (`https://api.bgm.tv`)；
  - 自定义：可直接填写第三方自建镜像地址（如 `https://my-bgm-proxy.com`）。

### `BANGUMI_IMAGE`
- **默认值**：`mirror`
- **类型**：预设标识符 (`mirror` / `official`) 或 自定义域名
- **生效时机**：运行时
- **说明**：番剧封面图片 CDN 线路。
  - `mirror`：走经过 WebP 压缩与网络优化的图片镜像缓存，国内加载飞快；
  - `official`：直连 Bangumi 官方图片域名（`lain.bgm.tv`）。

### `DANDAN_APP_ID` 与 `DANDAN_APP_SECRET`
- **默认值**：留空
- **类型**：字符串密钥
- **生效时机**：运行时
- **说明**：弹弹play 开放平台应用凭据。
  - 留空时系统将自动使用内置的客户端通用密钥（开箱即用，已满足大多数个人自用场景）；
  - 若你部署在公共社区，建议前往 [弹弹play 开放平台](https://www.dandanplay.com/) 免费申请独立的开发者密钥，以获得更高的 API 速率上限。

### `DEFAULT_USER_AGENT` / `BANGUMI_USER_AGENT`
- **默认值**：内置标准化现代浏览器与客户端标识
- **说明**：向第三方数据源发起请求时的 `User-Agent` 标头。通常无需配置，系统已严格遵循 Bangumi 开放平台非浏览器规范。

---

## 七、SEO、Sitemap 与 IndexNow 搜索引擎收录

适用于将 Animaku 部署为公开站点并希望被 Bing、Google、Yandex 等搜索引擎快速收录的站长。

### `SITE_URL` / `VITE_SITE_URL`
- **默认值**：留空
- **类型**：绝对根 URL（末尾**不要**带斜杠，如 `https://anime.example.com`）
- **生效时机**：`SITE_URL` 为运行时（服务端生成 Sitemap/Robots）；`VITE_SITE_URL` 为构建期（注入前端 OpenGraph 标签）
- **说明**：公开站点的规范公网访问根地址。如果不配置，服务端将根据请求的 Host 头动态猜测。

### `INDEXNOW_ENABLED`
- **默认值**：`0` (关闭)
- **类型**：布尔值 (`1` / `0`)
- **生效时机**：运行时
- **说明**：是否开启 IndexNow 搜索引擎即时差量推送协议。
  - 设为 `1` 后，每当服务端定时刷新或收录新番剧时，会自动将变动的 URL 秒级差量推送到 Bing、Yandex、Naver、Seznam 索引库。

### `INDEXNOW_KEY`
- **默认值**：`4ddfeb9c68384dd99bc302fb0f02eaf1`
- **类型**：32 位十六进制字符串
- **生效时机**：运行时
- **说明**：IndexNow 验证密钥。系统已在根路径内置了该默认密钥的静态验证文件。若你自行在 Bing Webmaster 生成了新密钥，填入此处即可。

---

## 八、前端品牌定制与导航栏外观 (Vite 构建期)

> ⚠️ **重要提示**：本节的所有变量均带有 **`VITE_`** 前缀，属于**前端构建期编译变量**。
> 修改本节变量后，Docker 部署**必须**执行 `docker compose up -d --build` 重新构建镜像才能生效！

### 1. 站点外观与品牌个性化

| 变量名 | 默认值 | 作用说明 |
| :--- | :--- | :--- |
| `VITE_PRODUCT_NAME` | `Animaku` | 站点品牌名称（展示在标题与页脚） |
| `VITE_SITE_TAGLINE` | `在线弹幕播放` | 浏览器副标题与页脚标语文案 |
| `VITE_DEFAULT_THEME` | `light` | 新访客出厂默认主题：`light`（浅色温润） / `dark`（深色琉璃） |
| `VITE_FOOTER_NOTE` | 留空 | 页脚附加版权/备案声明文案（如 `本站仅供个人学习交流`） |
| `VITE_CONTACT_EMAIL` | 留空 | 页脚展示的站长联系邮箱 |

### 2. 站长链接与社交信息

| 变量名 | 默认值 | 作用说明 |
| :--- | :--- | :--- |
| `VITE_MAINTAINER_NAME` | 留空 | 维护者名称（填写后页脚展示“由 xxx 维护”） |
| `VITE_MAINTAINER_URL` | 留空 | 维护者个人博客或主页 URL |
| `VITE_HOMEPAGE_URL` | 留空 | 站长专属主站链接（如你的导航页） |
| `VITE_HOMEPAGE_LABEL` | `主页` | 专属主站按钮文本 |
| `VITE_GITHUB_URL` | 项目官方地址 | 自定义导航栏与页脚指向的 GitHub 仓库地址 |

### 3. 顶部导航栏按钮出厂开关

控制未登录访客初次访问时，顶部导航栏右侧各个功能图标的默认展示状态（`1` 为开启，`0` 为隐藏）：

```env
VITE_NAV_SHOW_USER_MENU=1     # 用户中心下拉入口（我的追番、历史记录、系统设置等）
VITE_NAV_SHOW_HISTORY=1       # 顶部时钟形状的「观看历史」快捷入口
VITE_NAV_SHOW_THEME_TOGGLE=1  # 太阳/月亮一键日夜模式切换按钮
VITE_NAV_SHOW_GITHUB=1        # 顶部直达 GitHub 仓库的图标链接
```

---

## 九、时区与日志系统

### `TZ` / `TIMEZONE`
- **默认值**：`Asia/Shanghai` (UTC+8)
- **类型**：标准 IANA 时区字符串（如 `Asia/Shanghai`, `Asia/Tokyo`, `UTC`, `America/New_York`）
- **生效时机**：运行时
- **说明**：控制服务端日志打印时间、访问统计跨天归档与 Node.js 运行环境的时区。

### `LOG_FORMAT`
- **默认值**：`pretty`
- **类型**：枚举 (`pretty` / `json`)
- **生效时机**：运行时
- **说明**：
  - `pretty`（推荐）：高可读性单行彩色日志，自动精简展示访问设备类型（如 `[Win11]`、`[iPhone]`、`[Android]`）与响应状态；
  - `json`：单行标准 JSONL 格式，包含 IP、设备指纹与耗时，便于直接接入 Loki、Filebeat、ELK 进行自动化分析。

### `LOG_MAX_SIZE` 与 `LOG_MAX_FILE`
- **默认值**：`5m` / `10`
- **生效时机**：Docker 容器启动时
- **说明**：限制 Docker 容器的标准输出日志文件上限与回滚数量。避免长期运行后容器日志打爆 VPS 硬盘。

---

## 十、典型部署场景预设配置模板

复制对应的模板并保存为 `.env` 即可：

### 场景 A：家庭内网 / 本地 NAS 自用（最简体验）

无需担心被外界刷流量，省心开箱即用：

```env
PORT=8787
HOST=0.0.0.0
DATA_DIR=./data
BANGUMI_API=mirror
BANGUMI_IMAGE=mirror
```

---

### 场景 B：公网云服务器 (VPS) 生产部署（域名绑定 + SEO）

零流量消耗，绑定独立域名，日志规范化：

```env
# 端口与网络
PORT=8787
HOST=0.0.0.0
DATA_DIR=./data

# 国内云服务器网络优化
BANGUMI_API=mirror
BANGUMI_IMAGE=mirror

# 域名与 SEO 绑定
SITE_URL=https://anime.yourdomain.com
VITE_SITE_URL=https://anime.yourdomain.com
INDEXNOW_ENABLED=1

# 日志与时区
TZ=Asia/Shanghai
LOG_FORMAT=pretty
LOG_MAX_SIZE=10m
LOG_MAX_FILE=5
```

---

### 场景 C：海外轻量 VPS 部署（全直连极速流）

海外网络访问原生 API 畅通无阻：

```env
PORT=8787
HOST=0.0.0.0
DATA_DIR=./data

# 直连海外官方线路
BANGUMI_API=official
BANGUMI_IMAGE=official

TZ=Asia/Shanghai
```
