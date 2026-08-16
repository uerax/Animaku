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
   - suggest API 搜索              - 需抓取发布页 XOR 动态解密       - Supabase / 自建后端 RPC
   - player_aaaa 播放配置          - 代表：LIBVIO                   - 异步 Edge Function 发流
   - 代表：otage, mxdm             │                                - 代表：xifan-next, anime1, omofun
         │                                 │                                │
         ▼                                 ▼                                ▼
【纯 JSON 规则（零改代码）】      【Release 规则 (JSON 配置)】       【专有适配器 (TypeScript 模块)】
- searchMode: xpath / api        - release.pageUrl                - apps/server/src/lib/{name}.ts
- chapterRoads XPath             - release.xorKey / varName       - rule-engine/index.ts 挂载
- apps/web/src/data/default-*    - 自动定时解析有效镜象             - 支持自动鉴权容灾 & 高性能直连
```

---

## 2. 专有视频源接入标准 SOP（以 `xifan-next` 为例）

针对现代 SPA / BaaS / 加密 API 类型的视频源，标准接入流程分为以下 6 个步骤：

### 步骤一：抓包与协议探查

探查以下 4 个核心链路的请求格式与响应体：
1. **搜索链路**：
   - 接口 URL、Method（GET/POST）、请求头（Headers）、请求体（Body）与返回格式。
   - 探查是否存在公开 Key（如 Supabase `sb_publishable_...`）或签名参数。
2. **详情与分集链路**：
   - 是直接请求 REST API / RPC 还是渲染在 SSR HTML / RSC Payload 中。
   - 分集列表的字段结构（`id`, `title`, `episode_number`, `kind` 正片/SP）。
3. **播放解析链路**：
   - 获取视频流的触发方式（如 Edge Function `issue-web-playback`）。
   - 返回格式（m3u8 还是 mp4 直链，是否 302 重定向至 CDN / 网盘）。
4. **媒体流可播性**：
   - 使用 `curl.exe -L -I "VIDEO_URL"` 检查状态码是否为 `200 OK`。
   - 检查是否携带 `Accept-Ranges: bytes`（决定能否在播放器中自由拖拽 Seek）。

---

### 步骤二：编写服务端专有适配器 (`apps/server/src/lib/{name}.ts`)

在 `apps/server/src/lib/` 目录下新建 `{name}.ts`，实现以下三个核心函数并导出：

```typescript
// apps/server/src/lib/xifan-next.ts

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

// 1. 规则匹配判定
export function isXifanNextRule(rule: PluginRule): boolean {
  const name = (rule.name || '').toLowerCase().trim()
  return name === 'xifan-next' || (rule.baseURL || '').includes('next.xifanacg.com')
}

// 2. 搜索逻辑（支持主 RPC 搜索 + 数据库模糊查询平滑回退）
export async function searchXifanNext(rule: PluginRule, keyword: string): Promise<PluginSearchResult> {
  // 请求接口并组装 SearchItem[]: { name, src: `https://.../anime/${id}` }
}

// 3. 分集与线路逻辑（组装 Road[]，支持正片与 SP/特典分离）
export async function chaptersXifanNext(rule: PluginRule, source: string): Promise<PluginChapterResult> {
  // 解析 animeId，拉取分集列表并映射 Road[]: { name: '线路名', data: [epUrls...], identifier: [epNames...] }
}

// 4. 播放直链解析（解析 episodeId 并下发媒体地址与代理地址）
export async function resolveXifanNext(rule: PluginRule, pageUrl: string): Promise<ResolvePlayResult> {
  // 调用播放解析接口获取 url，返回 { playUrl, proxyUrl, referer, headers, diagnostics }
}
```

#### 🛡️ 容灾与自愈设计（必加项）
若接口使用了前端静态 Key / Token，必须增加 **401/403 自动嗅探刷新机制**：
```typescript
// 一旦请求返回 401/403，服务端主动抓取站点首页 JS 提取最新密钥并更新内存缓存后重试
if (res.status === 401 || res.status === 403) {
  const newKey = await refreshPublishableKey()
  // 带上新 key 重新发起请求
}
```

---

### 步骤三：在规则引擎中挂载适配器 (`apps/server/src/rule-engine/index.ts`)

在 `rule-engine/index.ts` 的三处核心路由中导入并旁路分流：

1. **`searchWithRule`**：
   ```typescript
   {
     const { isXifanNextRule, searchXifanNext } = await import('../lib/xifan-next')
     if (isXifanNextRule(rule)) {
       try { return await searchXifanNext(rule, keyword) }
       catch (e) { return { pluginName: rule.name, items: [], diagnostics: [String(e)] } }
     }
   }
   ```
2. **`chaptersWithRule`**：
   ```typescript
   {
     const { isXifanNextRule, chaptersXifanNext } = await import('../lib/xifan-next')
     if (isXifanNextRule(rule)) {
       try { return await chaptersXifanNext(rule, source) }
       catch (e) { return { pluginName: rule.name, roads: [], diagnostics: [String(e)] } }
     }
   }
   ```
3. **`resolvePlay`**：
   ```typescript
   {
     const { isXifanNextRule, resolveXifanNext } = await import('../lib/xifan-next')
     if (isXifanNextRule(rule)) {
       return await resolveXifanNext(rule, pageUrl)
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
     "name": "xifan-next",
     "version": "1.0",
     "muliSources": true,
     "useWebview": false,
     "useNativePlayer": true,
     "usePost": false,
     "useLegacyParser": false,
     "adBlocker": false,
     "baseURL": "https://next.xifanacg.com/",
     "searchURL": "https://next.xifanacg.com/browse?q=@keyword",
     "searchList": "//a",
     "searchName": ".",
     "searchResult": ".",
     "chapterRoads": "//div",
     "chapterResult": ".//a",
     "referer": "https://next.xifanacg.com/"
   }
   ```
   > **注意**：如果由专有适配器全权接管解析（如 `isXifanNextRule` / `isAnime1Rule`），JSON 中的 `searchMode` 默认使用 `"xpath"` 并保留合法的 `searchURL`，避免触发通用校验报错 `API 搜索规则缺少 searchApiConfig`。

2. **在 `apps/web/src/data/default-plugins/index.ts` 中注册**：
   ```typescript
   import xifanNext from './xifan-next.json'
   
   export const DEFAULT_PLUGIN_RULES: PluginRule[] = [
     mxdm as PluginRule,
     omofun as PluginRule,
     xifanNext as PluginRule, // 注册到内置规则列表
     ...
   ]
   ```

---

### 步骤五：递增客户端默认规则版本号（至关重要）

在 `apps/web/src/stores/plugins.ts` 中：
1. **递增 `PLUGIN_DEFAULTS_VERSION`**（如 `12 -> 13`）；
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
| **请求头鉴权** | 误把抓包里的 Cookie/Session 当成永久 Key，导致几天后失效。 | 区分 **Publishable API Key**（前端公开硬编码）与用户会话；并在代码中实现 401 自动重新嗅探更新机制。 |
| **Node vs 浏览器 Fetch** | 在 Node 环境下直接 `fetch` 视频链接由于自动跟随 302 重定向丢头或被安全拦截报错 400。 | 探查 302 跳转目标（如 `pan.wo.cn`），使用 `curl.exe -L -I` 验证真实 CDN 响应；前端 `<video>` 会原生跟随重定向起播。 |
| **全量媒体代理限制** | 服务端默认 `MEDIA_FULL_PROXY=0`，直接向 `/api/media/proxy` 传大文件 MP4 会被 403 拦截。 | 播放器在客户端优先使用 `playUrl` 直连播放（直连源站 CDN，零服务器带宽消耗），仅在 HLS m3u8 广告过滤时走代理。 |
| **分集命名防噪音** | 源站分集列表中混杂“详情”、“评论”、“报错”、“立即播放”等干扰项。 | 使用 `cleanRoads` 或正则白名单过滤非剧集名称；统一格式为 `第XX集` 或 `SP XX`。 |
| **SSRF 安全防护** | 规则请求或解析直链时，若链接指向内网（如 `127.0.0.1`、`192.168.x`）会被服务端安全拦截。 | 服务端所有外网请求统一使用 `fetchPublic`，严格阻断私网与内网地址（防 SSRF 攻击）。 |
