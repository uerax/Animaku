# 弹弹play Token 耗尽兜底与运行时降级方案设计

> 本文档记录了关于弹弹play开放弹幕网络 API 凭证机制的调研过程、官方规范、现存代码问题分析以及未来落地执行的设计方案。

---

## 一、 背景与现存问题分析

### 1. 现存机制排查
目前服务端弹幕模块（`apps/server/src/lib/dandan.ts`）内置了一组默认的兜底凭证（`FALLBACK_APP_ID` 与 `FALLBACK_APP_SECRET`）。

其当前的凭证解析逻辑如下：
```typescript
function resolveCredentials() {
  const id = config.dandanAppId.trim()
  const secret = config.dandanAppSecret.trim()
  if (id && secret) {
    return { appId: id, appSecret: secret, mode: 'open' }
  }
  return { appId: FALLBACK_APP_ID, appSecret: FALLBACK_APP_SECRET, mode: 'legacy' }
}
```

### 2. 核心缺陷
- **仅属于启动期静态环境变量兜底**：只要用户在 `.env` 中配置了 `DANDAN_APP_ID` 和 `DANDAN_APP_SECRET`，系统就会永久只使用用户的凭证发送请求。
- **缺乏运行时失败降级机制**：一旦用户配置的 Token 额度耗尽、被限流或由于签名/配置问题报错，`dandanGet` 会直接抛出异常，各弹幕路由捕获后直接向前端返回 `502 Bad Gateway`，**不会尝试切换到内置的兜底 Token 重新请求**，导致弹幕搜索与弹幕装载功能完全瘫痪。

---

## 二、 弹弹play 官方 API 规范与调研结论

查阅了弹弹play 官方开放平台文档（`https://doc.dandanplay.com/open/`）、Swagger Spec（`https://api.dandanplay.net/swagger/v2/swagger.json`）以及开发者中心公告（`https://dev.dandanplay.com/PublicPage/Quota`）。

### 1. 官方明确确认的事实 (Confirmed Facts)
1. **基础响应结构 `ResponseBase`**（所有业务接口统一继承）：
   ```json
   {
     "errorCode": 0,       // 0 表示成功，非 0 表示有错误
     "success": true,      // 接口是否调用成功
     "errorMessage": null, // 发生错误时的具体原因文本
     "errorDetail": null   // 参数校验失败时的定位信息
   }
   ```
2. **HTTP 状态码规范**：
   - **401 Unauthorized**：调用受限接口时缺少必要的身份验证头。
   - **403 Forbidden**：`AppId` 或 `AppSecret` 无效、签名不匹配、时间戳超差、应用被禁用、或 IP 被屏蔽；官方明确说明具体原因会包含在响应头 `X-Error-Message` 中（如 `Invalid AppId`, `Invalid Signature`, `Invalid AppSecret` 等）。
   - **HTTP 200 + 业务错误**：例如 `{ "success": false, "errorCode": 1, "errorMessage": "服务器内部错误" }`。
3. **资源未收录错误码**：
   - `errorCode: 7`（`errorMessage: "无法找到指定的资源"`）：代表该番剧尚未被弹弹play收录，属于正常业务 404，本项目已实现 12 小时空结果缓存优化，**此情况不属于 Token 异常**。
4. **配额管理机制**：
   - 弹弹play 开放平台已自 2026 年 6 月起全面启用应用分层与配额管理机制，超出每日限额或每月限额的应用调用将被限制。

### 2. 推测与未公开部分 (Hypothesis & Edge Cases)
- 官方未提供一份完整的全局 `errorCode` 数值枚举对照表，没有公开“配额耗尽具体对应的 errorCode 是多少”；
- 额度耗尽或被限流时，上游可能表现为 **网关层拦截（HTTP 403 / 429）**，也可能表现为 **业务层返回（HTTP 200 + `success: false` + `errorCode != 0 && errorCode != 7`）**。

---

## 三、 推荐落地方案设计 (Implementation Blueprint)

当后续决定实现该功能时，可直接按以下架构设计落地：

### 1. 宽容的 Token 故障判定器 (`isTokenFailure`)
不要只硬编码匹配某一个具体的错误码数字，而是采用宽容拦截规则：
```typescript
function isTokenOrUpstreamFailure(status: number, json?: any): boolean {
  // 1. HTTP 状态码鉴权/超限/服务端故障
  if ([401, 403, 429, 500, 502, 503].includes(status)) {
    return true
  }
  // 2. 业务 JSON 错误：排除 errorCode === 7 (资源未收录为正常业务)
  if (json && json.success === false && json.errorCode !== 7) {
    return true
  }
  return false
}
```

### 2. 双阶执行器与透明重试 (Primary with Fallback Retry)
改造 `dandanGet` 为两阶段执行逻辑：
1. **第 1 阶段（Primary Attempt）**：
   - 若用户配置了自定义 Token 且主 Token 未处于熔断期，使用主 Token 请求；
2. **第 2 阶段（Fallback Retry）**：
   - 若第 1 阶段发生网络超时、HTTP 401/403/429、或返回了非 7 的业务错误，捕获并打印 warn 日志；
   - 自动切换为 `FALLBACK_APP_ID` / `FALLBACK_APP_SECRET`（使用 `legacy` 凭证模式）重新发起请求；
   - 兜底成功则正常返回结果，上层路由完全无感知；
   - 若主 Token 和兜底 Token 均失败，再抛出异常。

### 3. 内存熔断冷却状态机 (Circuit Breaker)
避免在主 Token 耗尽后，后续每一个请求都先消耗一次网络往返去报错再重试：
```typescript
let primaryTokenCooldownUntil = 0 // 时间戳 (ms)

// 当检测到主 Token 返回 403/429/配额耗尽时：
function tripPrimaryCooldown(durationMs = 60 * 60_000) {
  primaryTokenCooldownUntil = Date.now() + durationMs
  console.warn(`[dandan] 主 Token 异常或额度耗尽，已触发自动熔断，接下来的 ${durationMs / 60000} 分钟将直接使用内置兜底 Token`)
}

function shouldUsePrimary(): boolean {
  const hasCustom = Boolean(config.dandanAppId.trim() && config.dandanAppSecret.trim())
  if (!hasCustom) return false
  return Date.now() > primaryTokenCooldownUntil
}
```

### 4. 状态查询端点增强 (`GET /api/danmaku/status`)
将 `/api/danmaku/status` 丰富为：
```json
{
  "configured": true,
  "usingFallback": false,
  "primaryStatus": "active | cooldown",
  "cooldownRemainingSec": 0
}
```
便于前端设置页或运维排查当前 Token 的实际运行状态。

---

## 四、 涉及改动文件清单

| 文件路径 | 改动要点 |
| :--- | :--- |
| `apps/server/src/lib/dandan.ts` | 引入熔断状态机、请求重试包装器与宽容错误判定 |
| `apps/server/src/routes/danmaku.ts` | 优化 `/status` 状态响应 |
| `scripts/test-dandan-fallback.ts` | 编写单元测试覆盖主 Token 正常、主 Token 403 自动降级、资源 404 保持等场景 |
