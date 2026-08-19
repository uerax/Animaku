# 视频源（Plugin / Source）接入规范与实战指南

> 本文档详细记录了在 **Animaku / kazumi-web** 中分析、逆向并接入全新视频源（Video Source / Plugin）的标准步骤、架构模式与踩坑注意事项，供后续维护与 AI Session 开发参考。

---

## 1. 视频源接入架构决策矩阵

在接入新视频源前，首先通过抓包或逆向确定其**技术形态**，选择最合适的接入路径：

```
                        ┌─────────────────────────────────────┐
                        │   新视频源分析 (抓包 & HTML/API 探查)  │
                        └──────────────────┬──────────────────┘
                                           │
         ┌─────────────────────────────────┼────────────────────────────────┐
         │                                 │                                │
         ▼                                 ▼                                ▼
   【形态 A：标准 MacCMS】          【形态 B：动态发布页】            【形态 C：专有 API / SPA】
   - 静态 HTML 渲染                - 主域名频繁被封                 - Next.js / Nuxt / SPA
   - suggest API 搜索              - 抓取发布页 XOR 动态解密         - Supabase / 自建后端 RPC
   - player_aaaa 播放配置          - 代表：LIBVIO                   - 异步 Edge Function 发流
   - 代表：mxdm                    │                                - 代表：cycani, xifan-next, anime1, omofun
         │                                 │                                │
         ▼                                 ▼                                ▼
【纯 JSON 规则（零改代码）】      【Release 规则 (JSON 配置)】       【专有适配器 (TypeScript 模块)】
- searchMode: xpath / api        - release.pageUrl                - apps/server/src/lib/{name}.ts
- chapterRoads XPath             - release.xorKey / varName       - rule-engine/index.ts 挂载
- apps/web/src/data/default-*    - 自动定时解析有效镜像             - 支持自动鉴权容灾、区域路由 & 毫秒级直连
```

---

## 2. 专有视频源接入标准 SOP

针对现代 SPA / BaaS / 加密 API 类型的视频源（如 `xifan-next`、`cycani`），标准接入流程分为以下 6 个步骤：

### 步骤一：自动化指纹探测与协议逆向

项目提供了标准化的**自动化视频源探查工具**（`scripts/probe-source.ts`），可快速识别技术指纹、反爬特征并给出推荐接入形态：

```bash
# 自动化探查视频源架构与接口
npx tsx scripts/probe-source.ts <站点URL> [测试关键词]

# 示例
npx tsx scripts/probe-source.ts https://www.tvtfun.net/videos 从零开始
npx tsx scripts/probe-source.ts https://www.cycani.org 鬼灭之刃
```

工具会自动检测并输出：
1. **前端技术架构**：Next.js RSC / Vite SPA / MacCMS 模板；
2. **反爬与 F12 拦截标记**：检测是否存在 `disable-devtool`、`redirectUrl` 跳转；
3. **有效 JSON 搜索 API**：自动探测 `/api/videos/search?q=` 等常见 RESTful 接口；
4. **架构决策建议**：自动推荐形态 A（纯 JSON 规则）、形态 B（Release 发布页）或形态 C（TypeScript 专有适配器）。

探查核心 4 个业务链路：
1. **搜索链路**：接口 URL、Method、Headers、Body 与返回格式，是否存在公开 Key 或签名参数。
2. **详情与分集链路**：REST API / RPC / SSR RSC Payload，分集多线路结构（`Road[]`）。
3. **播放解析链路**：获取视频直链的触发方式（`resolve-play-url` / `issue-web-playback`）、鉴权凭证类型（一次性 Nonce / Bearer JWT / 临时签名）。
4. **媒体流可播性与防盗链探查**：`curl.exe -L -I "VIDEO_URL"` 检查 `HTTP 206 Partial Content` 与 `Accept-Ranges: bytes`。

---

### 步骤二：编写服务端专有适配器 (`apps/server/src/lib/{name}.ts`)

在 `apps/server/src/lib/` 目录下新建 `{name}.ts`，实现以下核心模块并导出：

```typescript
// apps/server/src/lib/{name}.ts

import type {
  PluginChapterResult,
  PluginRule,
  PluginSearchResult,
  ResolvePlayResult,
  Road,
  SearchItem,
} from '@animaku/shared'
import { config } from '../config'
import { fetchPublic } from './private-host'

// 1. 规则匹配判定（通过 name 或 baseURL 域名特征识别）
export function isMySourceRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  return name === 'my-source' || (rule.baseURL || '').includes('example.com')
}

// 2. 搜索逻辑（支持主 RPC 搜索 + 数据库模糊查询平滑回退）
export async function searchMySource(rule: PluginRule, keyword: string): Promise<PluginSearchResult> {
  // 请求接口并组装 SearchItem[]: { name, src: `https://.../anime/${id}` }
}

// 3. 分集与线路逻辑（组装 Road[]，支持全量分流线路与 SP 分离）
export async function chaptersMySource(rule: PluginRule, source: string): Promise<PluginChapterResult> {
  // 提取 animeId，解析全量多线路 Road[]: { name: '线路名', data: [epUrls...], identifier: [epNames...] }
}

// 4. 播放直链解析（解析 episodeId 并下发媒体地址与代理地址）
export async function resolveMySource(rule: PluginRule, pageUrl: string): Promise<ResolvePlayResult> {
  // 并发竞速解析直链，处理防盗链 Referer，返回 ResolvePlayResult
}
```

#### 🛡️ 容灾与自愈设计（必加项）
若接口使用了前端静态 Key / Token，必须增加 **401/403 自动嗅探刷新机制**：
```typescript
// 一旦请求返回 401/403，服务端主动抓取站点首页 JS 提取最新密钥或重新登录，并更新内存缓存后重试
if (res.status === 401 || res.status === 403) {
  const newKey = await refreshPublishableKey()
  // 带上新 key 重新发起请求
}
```

#### ⚡ BaaS 区域路由直达（Region Routing，至关重要）
对于 Supabase / Cloudflare Workers 等部署在指定区域的后端，必须显式注入区域参数：
```typescript
// 例如 xifan-next 部署在新加坡机房，若不带 region 会走全球默认 Edge Ingress 跨洲中继，延迟增加 7 倍（1.7s vs 0.25s）
let url = `${DEFAULT_SUPABASE_URL}${endpoint}`
if (endpoint.startsWith('/functions/v1/')) {
  url += url.includes('?') ? '&forceFunctionRegion=ap-southeast-1' : '?forceFunctionRegion=ap-southeast-1'
}
headers['x-region'] = 'ap-southeast-1'
```

#### ⚡ 并发竞速代替串行试错（Concurrent Probing）
当视频源支持多种流格式（如优先 HLS，未转码降级 MP4）时，**禁止使用串行 `await` 试错**，使用 `Promise.allSettled` 并发发起请求：
```typescript
const [hlsRes, fbRes] = await Promise.allSettled([
  fetchHlsStream(episodeId),
  fetchFallbackStream(episodeId),
])
// 优先采用 HLS，未就绪秒切 Fallback，总耗时对齐单次最快往返（~250ms）
```

#### 🚫 严禁服务端同步阻塞式 HEAD 探测
- **不要**在服务端对返回的视频直链执行 `fetch(playUrl, { method: 'HEAD' })`。
- 海外 CDN 节点对 HEAD 请求响应极其缓慢（常耗费 1000~2500ms），会严重拖慢首帧解析；
- 浏览器 `<video>` 和 `Hls.js` 内核原生支持 0ms 自动跟随 302 重定向，服务端直接下发链接即可。

---

### 步骤三：在规则引擎中挂载适配器 (`apps/server/src/rule-engine/index.ts`)

在 `rule-engine/index.ts` 的三处核心路由中导入并旁路分流：

1. **`searchWithRule`**：
   ```typescript
   {
     const { isMySourceRule, searchMySource } = await import('../lib/my-source')
     if (isMySourceRule(rule)) {
       try { return await searchMySource(rule, keyword) }
       catch (e) { return { pluginName: rule.name, items: [], diagnostics: [String(e)] } }
     }
   }
   ```
2. **`chaptersWithRule`**：
   ```typescript
   {
     const { isMySourceRule, chaptersMySource } = await import('../lib/my-source')
     if (isMySourceRule(rule)) {
       try { return await chaptersMySource(rule, source) }
       catch (e) { return { pluginName: rule.name, roads: [], diagnostics: [String(e)] } }
     }
   }
   ```
3. **`resolvePlay`**：
   ```typescript
   {
     const { isMySourceRule, resolveMySource } = await import('../lib/my-source')
     if (isMySourceRule(rule)) {
       return await resolveMySource(rule, pageUrl)
     }
   }
   ```

---

### 步骤四：新建内置规则定义并注册

1. **新建 `apps/web/src/data/default-plugins/{name}.json`**：
   ```json
   {
     "api": "1",
     "type": "anime",
     "name": "my-source",
     "version": "1.0",
     "weight": 70,
     "preferOriginalTitle": false,
     "muliSources": true,
     "useWebview": false,
     "useNativePlayer": true,
     "usePost": false,
     "useLegacyParser": false,
     "adBlocker": false,
     "baseURL": "https://example.com/",
     "searchURL": "https://example.com/search?q=@keyword",
     "searchList": "//a",
     "searchName": ".",
     "searchResult": ".",
     "chapterRoads": "//div",
     "chapterResult": ".//a",
     "referer": "https://example.com/"
   }
   ```
   > **⚠️ 格式规范**：若由专有适配器全权接管解析，JSON 中的 `searchMode` 保持默认 `"xpath"` 并保留合法的 `searchURL`，避免声明 `searchMode: "api"` 却缺失 `searchApiConfig` 导致通用 Schema 校验报错 `400 Bad Request`。  
   > **💡 权重配置**：`weight` 决定列表排序（70 优质原画直链 > 60 代理源 > 55 普通源 > 50 备选源）。

2. **在 `apps/web/src/data/default-plugins/index.ts` 中注册**：
   ```typescript
   import mySource from './my-source.json'
   
   export const DEFAULT_PLUGIN_RULES: PluginRule[] = [
     mySource as PluginRule, // 注册到内置规则列表
     ...
   ]
   ```

---

### 步骤五：递增客户端默认规则版本号（至关重要）

在 `apps/web/src/stores/plugins.ts` 中：
1. **递增 `PLUGIN_DEFAULTS_VERSION`**（如 `21 -> 22`）；
2. **将新规则名称加入 `legacyBuiltinNames` 集合**；

> **为什么必须做这一步？**  
> 用户的浏览器在本地 `localStorage` 会持久化缓存已安装的内置规则。如果不递增版本号，老用户访问时只会保留本地旧规则，**新视频源永远不会出现在老用户的界面中**。

---

### 步骤六：全仓验证与状态记录

1. **类型检查**：运行 `pnpm typecheck`，确保 3 个 Workspace（`@animaku/shared`、`@animaku/server`、`@animaku/web`）编译 0 错误；
2. **构建测试**：运行 `pnpm build`，验证前后端打包完全成功；
3. **状态记录**：按照 `CLAUDE.md` 规则，在 `.claude/STATE.md` 中追加记录本次改动。

---

## 3. 核心注意事项与避坑指南

| 关注维度 | 踩坑现象与常见隐患 | 正确做法与规范 |
| :--- | :--- | :--- |
| **BaaS / Serverless 区域路由** | 未指定机房 region，请求走全球 Edge Ingress 跨洲中继，单次往返延迟从 250ms 膨胀至 1800ms。 | 抓包官方前端 client 查看配置的 region（如 `ap-southeast-1`），在 URL 追加 `?forceFunctionRegion=...` 并在 Header 注入 `x-region` 直达实例。 |
| **流分支串行试错** | 先 `await` HLS（失败报错），再 `await` Fallback，两次串行导致解析耗时成倍放大。 | 改用 `Promise.allSettled` 并发请求 HLS 与 Fallback，取最快且可用分支，将耗时压缩至单次请求最大值（~250ms）。 |
| **无意义的 HEAD 探测** | 服务端在下发链接前使用 `HEAD` 方法探测海外 CDN 302 重定向，单次白白浪费 1~2.5 秒。 | 坚决移除服务端同步 HEAD 探测；现代浏览器内核原生支持 0ms 跟随重定向，直接将直链下发给客户端。 |
| **防盗链与 Referer** | 联通云盘直链（`pan.wo.cn`）或部分 CDN 在携带跨域 Referer（如 `localhost:5173`）时直接报 `400 Bad Request`。 | 在 `index.html` 配置 `<meta name="referrer" content="no-referrer" />`，在 `<video>` 实例配置 `referrerPolicy = 'no-referrer'`；服务端根据目标 CDN 清除跨域 Referer。 |
| **Next.js RSC 串流多线路解析** | 现代 Next.js 站点分集数据嵌套在 `self.__next_f.push([1, "..."])` 中，且含有三层转义（`\\\"sources\\\":[...]`），简单正则无法匹配。 | 编写带括号层级计数的 `extractNextFPushes` 块提取器，先将外层字符串 `JSON.parse` 解开一层，再解析内部 `sources` JSON 提取多线路。 |
| **选源异步竞态（Race Condition）** | 初始后台预搜索较慢返回，强行触发 `autoPickFirst` 覆盖了用户刚刚点击选择的新源，导致页面突然跳回首个默认源。 | 在 `searchOnePlugin` 返回时增加断言：若当前用户已选中或正在聚焦另一个源（`selectionRef.current.plugin.name !== plugin.name`），**绝对禁止自动覆盖选集**；侧边栏切源传递 `clearSelection: true`。 |
| **全量媒体代理限制** | 服务端默认 `MEDIA_FULL_PROXY=0`，直接向 `/api/media/proxy` 传大文件 MP4 会被 403 拦截。 | 播放器在客户端优先使用 `playUrl` 直连播放（直连源站 CDN，零服务器带宽消耗），仅在 HLS m3u8 广告过滤时走代理。 |
| **请求头鉴权生命周期** | 误把抓包里的 Cookie/Session 当成永久 Key，导致几天后失效。 | 区分 **Publishable API Key**（前端公开硬编码）与用户会话；并在代码中实现 401 自动重新嗅探更新机制。 |
| **一次性消费凭证 (Nonce Token)** | 很多现代站点（如 TvTFun）的播放 Token 带单次消费限制，全局静态缓存导致第 1 集正常，切到第 2~4 集立即 403 崩溃。 | 采用 **JIT（按需即用 / On-Demand）** 策略，在 `resolve` 直链前毫秒级针对目标分集拉取专属新凭证并即时消费，彻底杜绝 403 连锁反应。 |
| **前端 F12 反调试防爬绕过** | 前端内嵌 `disable-devtool`，用户在浏览器中打开 F12 立即强制跳转百度，无法正常抓包。 | 无需在浏览器调试，直接使用 `scripts/probe-source.ts` 或 Node.js 抓取 SSR HTML / RSC Payload 逆向提取真实 RESTful JSON 接口。 |
| **路由别名 (Slug) 与数据库 ID 分离** | 很多站点（如 Next.js / Prisma 架构）详情路由只认 `slug`（如 `/video/video-83075`），使用数据库 ID 会 404 导致 Referer 校验失败返回 403。 | 专有适配器内部维护 `videoIdToSlugMap` 双向映射表，在选集与搜索阶段自动绑定，直链解析时规整为合法 Referer。 |
| **短效鉴权签名正则收敛** | 直链带有 `verify=`、`pt=`、`sign=` 等短效签名，若按 `.mp4` / `.m3u8` 后缀被赋予 30 分钟缓存，签名过期后导致死链无法播放。 | 在 `ttl-cache.ts` 的 `resolveCacheTtlMs` 中优先匹配短效签名参数，统一收敛为 60s 缓存（`resolveSigned`），兼顾快速切集 0ms 秒开与失效自愈。 |
| **分集命名防噪音** | 源站分集列表中混杂“详情”、“评论”、“报错”、“立即播放”等干扰项。 | 使用 `cleanRoads` 或正则白名单过滤非剧集名称；统一格式为 `第XX集` 或 `SP XX`。 |
| **SSRF 安全防护** | 规则请求或解析直链时，若链接指向内网（如 `127.0.0.1`、`192.168.x`）会被服务端安全拦截。 | 服务端所有外网请求统一使用 `fetchPublic`，严格阻断私网与内网地址（防 SSRF 攻击）。 |
