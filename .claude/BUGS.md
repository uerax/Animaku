# 当前待处理任务清单

> 本文件记录当前正在处理与待处理的架构重构、Bug 修复与性能优化任务。
> 处理完成并验证通过后，将条目从本文件移除，并沉淀完整细节至 `.claude/STATE.md`。

---

## 📌 待处理清单 (Active Tasks & TODOs)

### [待处理] [P1] 视频源切片广告端云分层清洗体系与 TS 序号断层过滤算法 (adBlockerMode)

- **状态**：待处理（方案已就绪，等待用户确认执行）
- **优先级**：P1
- **描述**：引入 `adBlockerMode` 区分客户端本地清洗与服务端网关清洗；在共享算法库中吸收切片连续序号断层检测算法；对量子资源网等开放直连源启用纯前端零流量本地清洗，彻底去除插播切片广告。

---

### 📋 详细实现方案设计 (Implementation Blueprint)

#### 一、 设计背景与核心原则
1. **Zero Auto Proxy 铁律**：开放型 CDN 视频源（如量子资源 lzizy）坚决不走服务端中转视频切片，100% 由客户端直连源站播放，零服务器带宽与流量开销。
2. **端云分层治理**：
   - **客户端清洗 (`client`)**：公开免鉴权、支持 CORS 的直连源在用户浏览器本地直接清洗 M3U8 文本，转换为本地 Blob 流喂给播放器；
   - **服务端清洗 (`server`)**：有防盗链 Header（Referer/User-Agent）、Cookie 鉴权或无跨域头的受限源由服务端媒体网关代理清洗清单文本。
3. **命名对齐与历史兼容**：
   - 采用 `adBlockerMode` 契约字段，与现有的 `adBlocker: boolean` 命名空间完美呼应；
   - 对未显式声明 `adBlockerMode` 的旧规则实现智能推导（直连源 -> client，代理源 -> server）。

---

#### 二、 契约与规则规范设计

##### 1. 类型定义 (`packages/shared/src/plugin.ts`)
```ts
/**
 * 广告切片清洗模式：
 * - 'client': 客户端本地清洗（纯前端浏览器执行，零服务端资源开销，适用于量子资源等直连开放源）
 * - 'server': 服务端网关清洗（服务端仅代理清洗 M3U8 文本，切片直连，适用于有防盗链/无跨域头的受限源）
 * - 'auto': 智能推导（直连源优先 client，受控代理源走 server）
 * - 'none': 不开启清洗（默认）
 */
export type AdBlockerMode = 'none' | 'client' | 'server' | 'auto'

export interface PluginRule {
  // ... 现有字段保持不变
  adBlocker?: boolean              // 历史布尔标识，保持完全兼容
  adBlockerMode?: AdBlockerMode    // 显式声明清洗模式
}
```

##### 2. 规则推导算法 (Inference Logic)
当解析或播放时，针对任意规则的生效模式统一通过解析器计算：
- 若显式配置了 `adBlockerMode` 且不为 `'auto'`：直接使用该配置；
- 若未配置 `adBlockerMode` 或为 `'auto'`：
  - 若 `adBlocker === true`：
    - 若该源 `requiresProxy === false` 且为公共直连流 $\rightarrow$ 推导为 `'client'`；
    - 若该源 `requiresProxy === true` 或带有受控鉴权头 $\rightarrow$ 推导为 `'server'`；
  - 若 `adBlocker === false` 或未定义 $\rightarrow$ 推导为 `'none'`。

##### 3. 内置规则配置 (`apps/web/src/data/default-plugins/lzizy.json`)
```json
{
  "name": "lzizy",
  "version": "1.1",
  "adBlocker": true,
  "adBlockerMode": "client",
  "baseURL": "https://lzizy.net/",
  ...
}
```

---

#### 三、 核心算法升级：TS 序列号断层识别算法

在 `packages/shared/src/m3u8-ad-filter.ts` 中增强现有的多维评分模型，融入参考文章的破绽检测算法：
1. **TS 切片序列号正则提取**：
   - 提取切片 URL 中的递增数字序列：`/(?:.*?)(?:_|-|\/)(\d{1,5})\.ts/i`。
2. **正片连续性基线测算**：
   - 统计主切片序列的步长变化率，正片通常呈现严格的连续递增（如 $N, N+1, N+2\dots$）。
3. **断层异常突变判定（Break Detection）**：
   - 当遇到 `#EXT-X-DISCONTINUITY` 分割的分组时，如果该分组内切片数字重置为小数字（如 $0, 1, 2$）或与前后正片产生严重跳变断层；
   - 判定该分组为广告插入切片，赋予断层异常高权重分值（+60 分），触发该 Discontinuity 分组的整体剔除。
4. **安全保护（Safety Guard）**：
   - 维持最大 8%（2/25）总时长安全熔断阈值，若过滤时长超标则安全回退，绝不误伤正片剧情。

---

#### 四、 客户端清洗流水线 (Client-side Pipeline)

- **核心位置**：`apps/web/src/player/hooks/useMediaEngine.ts`
- **执行流程**：
  1. 播放器接收到播放地址，检测到当前源启用了客户端清洗（`adBlockerMode === 'client'`）且为 HLS 直链；
  2. 客户端直接发起轻量 `fetch(activeSrc)`（几十 KB 文本，耗时通常 <50ms）；
  3. 调用 `@animaku/shared` 的 `filterM3u8AdsIfApplicable` 进行文本清洗：
     - 若命中广告切片，算法将多余广告切片剔除；
     - 将保留切片的相对路径补全为源站 CDN 绝对 URL；
  4. 浏览器通过 `URL.createObjectURL(new Blob([cleanText], { type: 'application/vnd.apple.mpegurl' }))` 生成安全的本地伪流；
  5. 喂给 `hls.loadSource(blobUrl)` 正常解码起播；
  6. **生命周期与内存防护**：在切集、换源、或组件卸载时，立即调用 `URL.revokeObjectURL(blobUrl)`，防止内存积压；
  7. **异常降级**：若遇到极少数源的跨域阻断或拉取失败，自动优雅降级使用原始 `activeSrc`，保证播放可用性。

---

#### 五、 服务端清洗保留与对齐 (Server-side Pipeline)

- **核心位置**：`apps/server/src/routes/media.ts` 与 `hls-pipeline.ts`
- **保留价值**：
  - 针对带有防盗链 Referer、Cookie 鉴权、受保护 AES-128 Key、或没有配置 CORS 头的受控源，保留服务端轻量代理清洗能力；
  - 同样复用升级后的断层过滤算法，且保持切片直连（Hybrid 模式），绝不代理切片视频流量。

---

#### 六、 实施计划与步骤清单

1. **第 1 步（Shared 契约与算法）**：
   - 在 `packages/shared/src/plugin.ts` 中新增 `AdBlockerMode` 类型定义与推导函数；
   - 在 `packages/shared/src/m3u8-ad-filter.ts` 中实现 TS 序号连续性断层检测算法；
   - 在 `packages/shared/src/m3u8-ad-filter.test.ts` 补充针对量子/非凡等采集站真实切片格式的单元测试。
2. **第 2 步（Server 与内置规则）**：
   - 更新 `apps/web/src/data/default-plugins/lzizy.json` 声明 `"adBlocker": true, "adBlockerMode": "client"`；
   - 递增 `PLUGIN_DEFAULTS_VERSION`（v30 -> v31），确保老用户自动升级规则；
   - 在 `resolvePlay`（`lzizy.ts` 及规则引擎）中透传 `adBlockerMode` 字段。
3. **第 3 步（Web 播放器装配）**：
   - 在 `apps/web/src/player/hooks/useMediaEngine.ts` 装配客户端本地 Blob 清洗流水线与 GC 释放逻辑；
   - 增加 CORS / 失败静默回退降级保护。
4. **第 4 步（验证与发布）**：
   - 运行全量单元测试与类型检查（`pnpm test` + `pnpm typecheck`）；
   - 根据代码修改幅度执行 `pnpm bump minor` 递增版本号；
   - 将已完成任务从 `BUGS.md` 移除并记录至 `STATE.md`。
