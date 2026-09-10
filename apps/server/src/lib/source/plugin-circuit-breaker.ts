/**
 * Plugin Circuit Breaker (单飞半开整站级熔断器)
 *
 * 为第三方视频源爬虫/解析提供插件维度的短时故障熔断机制：
 * 1. 软故障 (504/超时/ETIMEDOUT): 30s 内连续 2 次触发 90s 冷却；
 * 2. 硬故障 (ECONNREFUSED/ENOTFOUND/网络不可达): 单次直接触发 90s 冷却；
 * 3. 单飞半开 (Single-Flight Half-Open): 冷却期满后仅放行单个真实探测请求，
 *    期间所有并发请求继续快速失败，杜绝"每 90 秒集中超时爆发"；
 * 4. 故障快速短路返回 504，绝不返回 200 假空结果，彻底避免客户端持久化污染。
 */

export interface PluginBreakerState {
  failureCount: number
  lastFailureTime: number
  trippedUntil: number
  halfOpenProbing: boolean
}

export const BREAKER_CONFIG = {
  FAILURE_WINDOW_MS: 30_000,
  COOLDOWN_MS: 90_000,
  SOFT_FAILURE_THRESHOLD: 2,
} as const

const HARD_ERROR_REGEX = /ECONNREFUSED|ENOTFOUND|fetch failed|getaddrinfo|网络不可达/i
const TIMEOUT_ERROR_REGEX = /504|timeout|超时|ETIMEDOUT|ESOCKETTIMEDOUT|timed out/i

class PluginCircuitBreaker {
  private states = new Map<string, PluginBreakerState>()

  private normalizeKey(pluginName: string): string {
    return pluginName.trim().toLowerCase()
  }

  /**
   * 检查指定源当前是否被允许执行搜索请求。
   * 若处于熔断冷却中，或半开态已有正在试探的单飞请求，则立即快速失败。
   */
  checkBeforeSearch(pluginName: string): { allowed: boolean; reason?: string } {
    const key = this.normalizeKey(pluginName)
    const state = this.states.get(key)
    if (!state) {
      return { allowed: true }
    }

    const now = Date.now()

    // 1. 仍在完全冷却期内
    if (now < state.trippedUntil) {
      const remainingSec = Math.max(1, Math.ceil((state.trippedUntil - now) / 1000))
      return {
        allowed: false,
        reason: `源站响应异常，熔断冷却中 (剩余 ${remainingSec}s，请稍后重试)`,
      }
    }

    // 2. 冷却期已过，进入半开测试期 (Half-Open)
    if (state.trippedUntil > 0) {
      if (state.halfOpenProbing) {
        // 单飞互斥保护：已有正在发起的探活请求，后续并发请求继续沿用熔断短路，避免打爆源站
        return {
          allowed: false,
          reason: '源站响应异常，半开探活测试中 (请稍后重试)',
        }
      }
      // 成功抢占唯一的半开探活名额
      state.halfOpenProbing = true
      return { allowed: true }
    }

    return { allowed: true }
  }

  /**
   * 记录一次成功的源站响应，彻底清空该源的熔断状态
   */
  recordSuccess(pluginName: string): void {
    const key = this.normalizeKey(pluginName)
    this.states.delete(key)
  }

  /**
   * 记录一次源站异常。判断是软超时还是硬故障，并推进状态机
   */
  recordFailure(pluginName: string, error: unknown): void {
    const key = this.normalizeKey(pluginName)
    const errorMsg = error instanceof Error ? error.message : String(error || '')

    const isHard = HARD_ERROR_REGEX.test(errorMsg)
    const isTimeout = TIMEOUT_ERROR_REGEX.test(errorMsg)

    // 仅对真正的网络中断或超时执行熔断（业务 400/语法错误等不计入整站熔断）
    if (!isHard && !isTimeout) {
      return
    }

    const now = Date.now()
    const state = this.states.get(key) || {
      failureCount: 0,
      lastFailureTime: 0,
      trippedUntil: 0,
      halfOpenProbing: false,
    }

    // 若当前正是半开试探请求失败，直接重新冷却 90 秒
    if (state.trippedUntil > 0 && state.halfOpenProbing) {
      state.trippedUntil = now + BREAKER_CONFIG.COOLDOWN_MS
      state.halfOpenProbing = false
      state.lastFailureTime = now
      state.failureCount++
      this.states.set(key, state)
      return
    }

    // 统计滑动窗口内的连续失败次数
    if (now - state.lastFailureTime <= BREAKER_CONFIG.FAILURE_WINDOW_MS) {
      state.failureCount++
    } else {
      state.failureCount = 1
    }
    state.lastFailureTime = now

    // 判定是否达到熔断阈值
    const shouldTrip = isHard || state.failureCount >= BREAKER_CONFIG.SOFT_FAILURE_THRESHOLD
    if (shouldTrip) {
      state.trippedUntil = now + BREAKER_CONFIG.COOLDOWN_MS
      state.halfOpenProbing = false
    }

    this.states.set(key, state)
  }

  /** 获取源当前熔断状态（用于测试与监控） */
  getState(pluginName: string): PluginBreakerState | undefined {
    return this.states.get(this.normalizeKey(pluginName))
  }

  /** 重置单个或所有源的熔断状态（用于单元测试） */
  reset(pluginName?: string): void {
    if (pluginName) {
      this.states.delete(this.normalizeKey(pluginName))
    } else {
      this.states.clear()
    }
  }
}

export const pluginCircuitBreaker = new PluginCircuitBreaker()
