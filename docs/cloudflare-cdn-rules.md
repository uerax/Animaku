# Cloudflare CDN 接入与边缘规则配置指南 (Cloudflare CDN & WAF Rules Guide)

> 本文档面向运维部署与站点维护，详细汇总了 **Animaku** 在接入 Cloudflare CDN 时的**标准接入流程、WAF 安全防护规则、边缘缓存规则（Cache Rules）以及源站配套加固**。

---

## 1. 概述与核心价值

将 Animaku 接入 Cloudflare CDN 并配置边缘规则可以实现以下核心价值：
1. **全站加速与全球边缘就近分发**：前端静态资源（JS/CSS/WebP/Woff2）实现边缘 0 毫秒强缓存命中，大幅降低源站出口带宽。
2. **上游 API 额度保护与并发削峰**：弹弹 play 弹幕接口、B 站弹幕反代及 Bangumi 元数据在边缘 CDN 实现 30 分钟 ~ 24 小时聚合缓存，极大节约第三方 API 额度并防止高并发击穿。
3. **恶意嗅探与漏洞扫描秒级拦截**：通过自定义 WAF 规则，在边缘节点直接掐死针对 `.env`、配置文件、数据库备份及 Web 脚本的恶意探测，保护服务器性能与日志纯净度。
4. **源站隐藏与 DDoS 基础防护**：隐藏源站真实 IP，依托 Cloudflare Anycast 网络抗击四层与七层流量攻击。

---

## 2. Cloudflare 标准接入流程 (SOP)

### 2.1 域名托管与 DNS 配置
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，点击 **添加站点 (Add a Site)**，输入你的主域名并选择 **Free (免费版)**。
2. 在域名注册商（如 阿里云、腾讯云、NameSilo、Cloudflare Registrar 等）处，将域名的 **Nameservers (DNS 服务器)** 修改为 Cloudflare 分配给你的 2 个 NS 地址。
3. 进入 **DNS -> 记录 (Records)**：
   - 添加主域名或子域名的 `A` 记录（指向源站服务器公网 IPv4）或 `CNAME` 记录。
   - **务必开启代理状态（橙色云朵 ☁️ Proxied）**。若显示为灰色云朵（DNS Only），流量将直连源站，CDN 缓存与 WAF 规则均不会生效。

### 2.2 SSL/TLS 加密模式设置
前往 **SSL/TLS -> 概述 (Overview)**：
- **强烈推荐选择 `Full (完全)` 或 `Full (strict) (严格)`**。
- **避免选择 `Flexible`**：Flexible 会导致 Cloudflare 到源站使用明文 HTTP 80 端口，容易引起 `ERR_TOO_MANY_REDIRECTS`（重定向循环）或数据明文传输。
- 源站服务器可使用 Let's Encrypt / Certbot 证书，或在 Cloudflare 的 **SSL/TLS -> 源服务器 (Origin Server)** 处免费申请一张长达 15 年的 Cloudflare 原生源证书并配置到源站 Nginx。

### 2.3 开启网络与性能优化
前往 **速度 (Speed) -> 优化 (Optimization)**：
- **Auto Minify**：可选开启 HTML / CSS / JS 压缩（Animaku 打包已内置 Vite Terser/ESBuild 压缩，开启无害）。
- **Brotli**：开启（享受比 Gzip 更高压缩率的传输）。
- **Early Hints (早期提示 103)**：开启（加速关键 CSS/JS 预加载）。

---

## 3. WAF 安全防护规则 (防自动化扫描与恶意探测)

### 3.1 攻击背景与为什么默认不过滤？
- **现象**：服务器日志频繁出现 `GET /email/sendgrid/config.php`、`GET /email/mailgun/.env` 等探测，且状态码可能误报为 `200`。
- **原因**：这类扫描属于**低频自动化探测（每秒 1~2 次）**，使用的是普通 HTTP GET 请求，未达到 DDoS 触发阈值，Cloudflare 默认会透传给源站。同时前端 SPA（单页应用）的 fallback 路由会将不存在的路径回退给 `index.html` 并返回 `200 OK`，导致扫描器误判为命中并加大扫描力度。

### 3.2 工业级 WAF 自定义规则表达式 (一键复制)

前往 Cloudflare 控制台 -> **安全性 (Security) -> WAF -> 自定义规则 (Custom Rules) -> 创建规则**：

- **规则名称**：`Block-Scanners-And-Sensitive-Files`
- **操作 (Action)**：`阻止 (Block)`
- **表达式预览 (Expression Editor)**：

```text
(lower(http.request.uri.path) contains "/.env" or lower(http.request.uri.path) contains "/.git" or lower(http.request.uri.path) contains "/.svn" or lower(http.request.uri.path) contains "/.ds_store" or lower(http.request.uri.path) contains "/.idea" or lower(http.request.uri.path) contains "/.vscode" or lower(http.request.uri.path) contains "/.aws" or lower(http.request.uri.path) contains "/.ssh" or lower(http.request.uri.path) contains "/id_rsa" or lower(http.request.uri.path) contains "/credentials" or lower(http.request.uri.path) contains "/secrets" or lower(http.request.uri.path) contains "/wp-config" or lower(http.request.uri.path) contains "/web.config" or lower(http.request.uri.path) contains "/docker-compose" or lower(http.request.uri.path) contains "/phpmyadmin" or lower(http.request.uri.path) contains "/adminer" or lower(http.request.uri.path) contains "/xmlrpc.php" or lower(http.request.uri.path) contains "/wp-login" or lower(http.request.uri.path) contains "/actuator" or lower(http.request.uri.path) contains "/cgi-bin" or lower(http.request.uri.path) contains "/boaform" or lower(http.request.uri.path) contains "/solr" or lower(http.request.uri.path) contains "/../" or http.request.uri.path.extension in {"php" "asp" "aspx" "jsp" "jspx" "cgi" "pl" "py" "sh" "bash" "bat" "cmd" "bak" "old" "backup" "save" "orig" "temp" "tmp" "swp" "swo" "sql" "db" "sqlite" "sqlite3" "mdb" "dump" "env" "ini" "conf" "cfg" "properties" "log" "yml" "yaml"})
```

> **注意语法细节**：
> 1. 采用 `lower(http.request.uri.path)` 函数实现路径全小写归一化，能彻底防止利用大小写（如 `/.ENV`、`/.Git`、`/Config.PHP`）绕过。
> 2. 后缀匹配使用 Cloudflare 原生字段 `http.request.uri.path.extension in { ... }`，高效无歧义。

### 3.3 规则防护维度拆解表

| 防护类别 | 匹配模式 / 特征 | 拦截目标示例 |
| :--- | :--- | :--- |
| **敏感环境变量与凭据** | `/.env`, `/.aws`, `/.ssh`, `/id_rsa`, `/credentials`, `/secrets` | `/.env.production`, `/.aws/credentials`, `/.ssh/id_rsa` |
| **版本控制与 IDE 泄露** | `/.git`, `/.svn`, `/.ds_store`, `/.idea`, `/.vscode` | `/.git/config`, `/.git/HEAD`, `/.DS_Store`, `/.vscode/sftp.json` |
| **后台与数据库管理工具** | `/phpmyadmin`, `/adminer`, `/wp-login`, `/xmlrpc.php` | 常见 WordPress、PHP 暴力破解脚本 |
| **微服务与中间件漏洞** | `/actuator`, `/solr`, `/cgi-bin`, `/boaform` | Spring Boot Actuator 信息泄露、路由器漏洞探测 |
| **常见配置文件** | `/wp-config`, `/web.config`, `/docker-compose` | `/docker-compose.yml`, `/web.config` |
| **路径遍历 / 越权** | `/../` | 目录穿越攻击尝试 |
| **非 Node Web 脚本后缀** | `.php`, `.asp`, `.aspx`, `.jsp`, `.cgi`, `.pl`, `.py`, `.sh` 等 | Webshell 探测与恶意脚本注入 |
| **备份与临时残留** | `.bak`, `.old`, `.backup`, `.save`, `.orig`, `.temp`, `.tmp`, `.swp` | `/app.js.bak`, `/index.html.swp`, `/dump.sql.old` |
| **数据库导出与转储** | `.sql`, `.db`, `.sqlite`, `.sqlite3`, `.mdb`, `.dump` | 源码或生产数据库脱裤嗅探 |
| **敏感配置/日志扩展名** | `.env`, `.ini`, `.conf`, `.cfg`, `.properties`, `.log`, `.yml`, `.yaml` | 应用级配置文件与运行日志直接读取 |

### 3.4 误杀排查与灰度验证
- **是否影响正常服务？**：Animaku 前端与接口依赖的是 `.html`, `.js`, `.css`, `.json`, `.png`, `.webp`, `.svg`, `.woff2`, `.mp4`, `.m3u8`, `.ts`，全部不在拦截列表内，**对正常用户 100% 零影响**。
- **特殊业务场景自查**：如果你的站点同时提供了 Electron 自动更新（依赖 `latest.yml`）或 Clash 订阅（依赖 `.yaml`），可将花括号内的 `"yml" "yaml"` 移除。
- **零风险灰度上线**：新创建规则时，可先将操作设为 **`托管质询 (Managed Challenge)`** 运行 1~2 天。在 **安全性 -> 事件 (Events)** 中确认被拦截的均为可疑扫描 IP 后，再切为 **`阻止 (Block)`**。

### 3.5 开启 Bot Fight Mode（Bot 战斗模式）
前往 **安全性 (Security) -> Bot (Bots)**：
- 开启 **Bot 战斗模式 (Bot Fight Mode)**。
- 自动对公网已知爬虫引擎之外的可疑 Python/cURL/Go 扫描器执行静默挑战。

---

## 4. CDN 边缘缓存规则 (Cache Rules & Edge TTL)

Animaku 系统内部已实施了精细化的响应头策略（`Cache-Control`, `s-maxage`, `CDN-Cache-Control`），但在 Cloudflare 默认策略下，`/api/*` 以及没有特定静态后缀的动态路由是不会被边缘 CDN 自动缓存的。

为了最大化发挥边缘 CDN 效能，建议在 **缓存 (Caching) -> 缓存规则 (Cache Rules)** 中配置以下规则（免费版支持 10 条自定义 Cache Rules）。

---

### 4.1 全栈多级缓存架构一览

```
[ 用户浏览器 Client ]
       │ (1) 命中 Browser Cache: Vite Assets 1年 / 详情页 30m / 页面 HTML no-cache
       ▼
[ Cloudflare 边缘 CDN (Anycast Edge) ]
       │ (2) 命中 Edge Cache: 弹幕 30m / 吐槽评论 1h / 详情页 1h / Sitemap 6h / 静态资源 1年
       ▼
[ Animaku 服务端 (Hono Node Process) ]
       │ (3) 命中 L1 In-Memory TTL Cache (Single-Flight 防击穿 + 吐槽 3h Chunk 缓存)
       ▼
[ SQLite 数据库持久化缓存 (L2 Cache) ]
       │ (4) 命中 plugin_search_cache / plugin_chapters_cache / kv_cache
       ▼
[ 上游源站 / 第三方 API (Bangumi / Dandanplay / 视频源站) ]
```

---

### 4.2 Cloudflare Cache Rules 规则清单（按优先级从高到低）

> **Cloudflare 中英文控制台术语对照 (Terminology Mapping)**：
> - **缓存资格 (Cache Eligibility)**：
>   - `符合缓存条件 (Eligible for cache)`
>   - `绕过缓存 (Bypass cache)`
> - **边缘 TTL (Edge TTL)**：
>   - 遵循源站头（推荐）：`🔘 使用缓存控制标头（如果存在），否则绕过缓存 (Use cache control header if present, bypass cache otherwise)`
>   - 默认回退：`🔘 如果存在，使用缓存控制标头，如果不存在，使用 Cloudflare 的默认 TTL 缓存请求来获取响应状态 (Use cache control header if present, use Cloudflare's default TTL otherwise)`
>   - 强制固定时间：`🔘 忽略缓存控制标头，使用此 TTL (Ignore cache control header and use this TTL)` -> 输入秒数或选择时长
> - **浏览器 TTL (Browser TTL)**：
>   - 遵循源站头（推荐）：`🔘 接受源服务器 TTL (Respect origin server TTL)`
>   - 强制不存浏览器：`🔘 绕过缓存 (Bypass cache)`
>   - 强制固定时间：`🔘 替代源服务器，使用此 TTL (Override origin server and use this TTL)` -> 输入秒数

---

#### 规则 1：媒体代理与写入请求绕过 (Bypass Media & Non-GET)
- **规则名称**：`animaku-bypass-media-and-writes`
- **匹配表达式 (Expression)**：
  ```text
  (starts_with(http.request.uri.path, "/api/media/") or http.request.uri.path eq "/api/health" or http.request.method ne "GET")
  ```
- **缓存设置**：
  - **缓存资格 (Cache Eligibility)**：`绕过缓存 (Bypass cache)`
  - **目的**：媒体流实时长连接代理与动态鉴权、健康检查及非 GET 请求全部直通源站。

#### 规则 2：弹幕与 B 站代理 30 分钟边缘缓存 (Danmaku CDN 30m)
- **规则名称**：`Animaku danmaku CDN 30m`
- **匹配表达式 (Expression)**：
  ```text
  (http.request.method eq "GET" and (starts_with(http.request.uri.path, "/api/danmaku/") or starts_with(http.request.uri.path, "/api/bilibili/danmaku/")) and http.request.uri.path ne "/api/danmaku/status" and not http.request.uri.query contains "refresh=1" and not http.request.uri.query contains "refresh=true")
  ```
- **缓存设置**：
  - **缓存资格 (Cache Eligibility)**：`符合缓存条件 (Eligible for cache)`
  - **边缘 TTL (Edge TTL)**：`🔘 使用缓存控制标头（如果存在），否则绕过缓存 (Use cache control header if present, bypass cache otherwise)`（服务端通过 `setDanmakuCdnHeaders` 精准下发 `s-maxage=1800`，即 30 分钟）
  - **浏览器 TTL (Browser TTL)**：`🔘 接受源服务器 TTL (Respect origin server TTL)`（源站下发 `max-age=0`，避免占用用户本地浏览器内存）
  - **目的**：聚合全网弹幕拉取，保护弹弹 play 50w/月 额度与 B 站并发限制，同时支持用户带 `?refresh=1` 手动刷新穿透。

#### 规则 3：静态哈希资源 1 年不可变长缓存 (Static Long Cache)
- **规则名称**：`animaku-static-long-cache`
- **匹配表达式 (Expression)**：
  ```text
  (starts_with(http.request.uri.path, "/assets/") and http.request.uri.path.extension in {"js" "css" "woff2" "woff" "ttf" "png" "jpg" "jpeg" "webp" "svg" "ico" "map"})
  ```
- **缓存设置**：
  - **缓存资格 (Cache Eligibility)**：`符合缓存条件 (Eligible for cache)`
  - **边缘 TTL (Edge TTL)**：`🔘 忽略缓存控制标头，使用此 TTL (Ignore cache control header and use this TTL)` -> 选择 `1 年 (1 year)`（或 `31536000` 秒）
  - **浏览器 TTL (Browser TTL)**：`🔘 替代源服务器，使用此 TTL (Override origin server and use this TTL)` -> 选择 `1 年 (1 year)`
  - **目的**：Vite 构建产物自带内容 Hash，1 年强缓存实现 0ms 边缘毫秒级秒开。

#### 规则 4：日历、热门、插件仓库与番剧吐槽 API 缓存 (API Soft Cache)
- **规则名称**：`animaku-api-soft-cache`
- **匹配表达式 (Expression)**：
  ```text
  (http.request.method eq "GET" and (starts_with(http.request.uri.path, "/api/bangumi/calendar") or starts_with(http.request.uri.path, "/api/bangumi/trending") or starts_with(http.request.uri.path, "/api/plugin/catalog") or (starts_with(http.request.uri.path, "/api/bangumi/subjects/") and http.request.uri.path contains "/comments")))
  ```
- **缓存设置**：
  - **缓存资格 (Cache Eligibility)**：`符合缓存条件 (Eligible for cache)`
  - **边缘 TTL (Edge TTL)**：`🔘 使用缓存控制标头（如果存在），否则绕过缓存 (Use cache control header if present, bypass cache otherwise)`（服务端对日历/热门下发 2 小时、对番剧吐槽下发 `s-maxage=3600` 即 1 小时，由源站精确控制）
  - **浏览器 TTL (Browser TTL)**：`🔘 接受源服务器 TTL (Respect origin server TTL)`（源站下发 `max-age=0`，不占用客户端浏览器内存，由 React Query 管理）
  - **目的**：将高频访问的番剧吐槽列表（`/api/bangumi/subjects/:id/comments`）、日历与规则仓库拦截在边缘 CDN，极大降低服务端与 Bangumi 上游并发压力。

#### 规则 5：SSR 番剧详情页边缘缓存 (SSR Subject Cache)
- **规则名称**：`animaku-ssr-subject-cache`
- **匹配表达式 (Expression)**：
  ```text
  (http.request.method eq "GET" and starts_with(http.request.uri.path, "/subject/"))
  ```
- **缓存设置**：
  - **缓存资格 (Cache Eligibility)**：`符合缓存条件 (Eligible for cache)`
  - **边缘 TTL (Edge TTL)**：`🔘 使用缓存控制标头（如果存在），否则绕过缓存 (Use cache control header if present, bypass cache otherwise)`（服务端下发 `s-maxage=3600`，即 1 小时）
  - **浏览器 TTL (Browser TTL)**：`🔘 接受源服务器 TTL (Respect origin server TTL)`（服务端下发 `max-age=1800`，即 30 分钟）
  - **目的**：爬虫或用户访问番剧页直接由边缘 CDN 秒级吐出带完整 SEO 元数据的 HTML，源站 CPU 负载为 0。

#### 规则 6：SPA 根路由与 HTML 页面即时绕过 (HTML Bypass)
- **规则名称**：`animaku-html-bypass`
- **匹配表达式 (Expression)**：
  ```text
  (http.request.uri.path eq "/" or http.request.uri.path eq "/index.html" or (not http.request.uri.path contains "." and not starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/subject/")))
  ```
- **缓存设置**：
  - **缓存资格 (Cache Eligibility)**：`绕过缓存 (Bypass cache)`
  - **目的**：确保前端代码发布后，用户访问或刷新首页立即拉取最新的 `index.html`，绝无历史版本缓存残留。

---

### 4.3 客户端一键穿透与刷新机制

全系统（服务端 + CDN）已统一接入缓存穿透协议：
- **主动刷新**：只要请求携带 `?refresh=1`、`?refresh=true` 或请求头 `Cache-Control: no-cache`，服务端 `setDanmakuCdnHeaders` 与 `ttl-cache` 会自动下发 `CDN-Cache-Control: no-store`，强制穿透边缘 CDN 并回源拉取最新鲜数据。

---

## 5. 源站与 Nginx 最佳配套配置

为防止攻击者绕过 Cloudflare 直接扫描源站公网 IP，以及防止 SPA 泛解析对敏感文件误报 200，建议在源站 Nginx 进行以下配套加固。

### 5.1 Nginx 严格禁止隐藏文件与敏感扩展名 (防止 SPA 200 误报)

在 Nginx `server` 块中配置：

```nginx
# 1. 严格阻断所有隐藏文件（如 .env, .git, .DS_Store 等）直接返回 404
location ~ /\. {
    deny all;
    access_log off;
    log_not_found off;
    return 404;
}

# 2. 严格阻断探测脚本与配置文件直接返回 404
location ~* \.(php|asp|aspx|jsp|cgi|sh|bash|bak|old|sql|db|sqlite|yml|yaml|ini|conf|cfg|log)$ {
    deny all;
    access_log off;
    log_not_found off;
    return 404;
}
```

### 5.2 获取客户端真实 IP (Real-IP)

当接入 Cloudflare 后，Nginx 默认看到的 IP 都是 Cloudflare 节点 IP。为了让 Animaku 的 IP 访问统计与 Rate Limit 限流生效，需还原真实 IP：

```nginx
# 在 nginx.conf 的 http 或 server 块中加入 Cloudflare 官方 IP 段：
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;

real_ip_header CF-Connecting-IP;
```

### 5.3 源站防火墙仅允许 Cloudflare 回源 (防止 IP 直连绕过)

- 使用 Linux `ufw` 或云厂商安全组，将 Web 端口（80/443）设置为仅允许上述 Cloudflare IP 段访问，拒绝公网任意 IP 直连。
- 或者使用 **Cloudflare Tunnel (`cloudflared`)** 守护进程：源站无需公网 IP 和开放任何公网入站端口，彻底根除源站 IP 泄露与绕过风险。

---

## 6. 验证与排查指南

### 6.1 验证 WAF 拦截是否生效
在本地终端使用 `curl` 模拟恶意探测：
```bash
curl -I https://your-domain.com/.env
curl -I https://your-domain.com/email/sendgrid/config.php
```
- **预期响应**：HTTP 状态码 `403 Forbidden`，且响应头包含 `server: cloudflare` 及 `cf-ray` 标识。

### 6.2 验证 CDN 缓存是否命中
多次请求弹幕或静态资源接口：
```bash
curl -I https://your-domain.com/api/danmaku/search?keyword=clannad
curl -I https://your-domain.com/assets/index-Bxxxxxx.js
```
- **查看响应头中的 `CF-Cache-Status`**：
  - `MISS`：初次回源拉取。
  - `HIT`：**成功命中 Cloudflare 边缘缓存！**（0 延迟直接返回，无需请求源站）。
  - `EXPIRED`：缓存到期后正在重新验证。
  - `BYPASS`：被规则配置为绕过缓存。
