import type { PluginRule } from '@animaku/shared'
import { isReleaseRule } from '../release'
import { isCycaniRule } from '../cycani'
import { isSoraniRule } from '../sorani'
import { isAnime1Rule } from '../anime1'
import { isXifanNextRule } from '../xifan-next'
import { isTvTFunRule } from '../tvtfun'
import { isAkianimeRule } from '../akianime'
import { isHuaziRule } from '../huazi'
import { isNeosekRule } from '../neosek'
import { isBimiRule } from '../bimi'
import { isMoonciRule } from '../moonci'
import { isAnimoeRule } from '../animoe'
import { isJzacgRule } from '../jzacg'

/**
 * 官方适配器默认安全域名对照表。
 * 若客户端规则修改了 baseURL（如指向自建镜像或私有代理），
 * 其输出不可视为确定性官方输出，不得进入跨端共享缓存。
 */
const DEFAULT_SOURCE_DOMAINS: Record<string, string> = {
  bimi: 'bimiacg14.net',
  animoe: 'animoe.org',
  jzacg: 'jzacg.net',
}

/**
 * 判定规则是否属于 12 个拥有 /api/source 适配器的内置受控源。
 * 判定优先级严格与 rule-engine/index.ts 保持一致。
 *
 * 若匹配且安全（未篡改 baseURL），返回适配器标准 ID；
 * 若为纯自定义规则、未包含适配器的内置规则（mifun/girigiri等）、或篡改了 baseURL 的规则，返回 null。
 */
export function resolveBuiltinSourceId(rule: PluginRule): string | null {
  // Release page 规则为动态解密镜像，不属于固定内置源适配器
  if (isReleaseRule(rule)) {
    return null
  }

  // 1. cycani
  if (isCycaniRule(rule)) return 'cycani'

  // 2. sorani
  if (isSoraniRule(rule)) return 'sorani'

  // 3. anime1
  if (isAnime1Rule(rule)) return 'anime1'

  // 4. xifan-next
  if (isXifanNextRule(rule)) return 'xifan-next'

  // 5. tvtfun
  if (isTvTFunRule(rule)) return 'tvtfun'

  // 6. akianime
  if (isAkianimeRule(rule)) return 'akianime'

  // 7. huazi
  if (isHuaziRule(rule)) return 'huazi'

  // 8. neosekai
  if (isNeosekRule(rule)) return 'neosekai'

  // 9. bimi (验证是否使用官方默认镜像)
  if (isBimiRule(rule)) {
    const base = (rule.baseURL || '').toLowerCase()
    if (!base || base.includes(DEFAULT_SOURCE_DOMAINS.bimi)) {
      return 'bimi'
    }
    return null
  }

  // 10. moonci
  if (isMoonciRule(rule)) return 'moonci'

  // 11. animoe (验证是否使用官方默认镜像)
  if (isAnimoeRule(rule)) {
    const base = (rule.baseURL || '').toLowerCase()
    if (!base || base.includes(DEFAULT_SOURCE_DOMAINS.animoe)) {
      return 'animoe'
    }
    return null
  }

  // 12. jzacg (验证是否使用官方默认镜像)
  if (isJzacgRule(rule)) {
    const base = (rule.baseURL || '').toLowerCase()
    if (!base || base.includes(DEFAULT_SOURCE_DOMAINS.jzacg)) {
      return 'jzacg'
    }
    return null
  }

  return null
}

function extractHostname(rawUrl?: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  try {
    const candidate = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const u = new URL(candidate)
    return u.hostname.toLowerCase().trim() || null
  } catch {
    return null
  }
}

/**
 * 服务端决定视频源的唯一标识 upstreamKey，用于熔断、共享缓存和限流。
 * 绝不信任客户端随意提交的 rule.name。
 */
export function resolveUpstreamKey(rule: PluginRule): string {
  // 1. 若为已知受控内置源，直接采用受控源标准 ID
  const builtinId = resolveBuiltinSourceId(rule)
  if (builtinId) return builtinId

  // 2. 自定义规则：尝试提取目标网络 Hostname
  // 2.1 检查 AniBaka V2 pipeline 规则
  if (Array.isArray(rule.search)) {
    for (const step of rule.search) {
      if (step && typeof step === 'object') {
        const urlCandidate = (step as Record<string, unknown>).url
        if (typeof urlCandidate === 'string' && urlCandidate.includes('://')) {
          const host = extractHostname(urlCandidate)
          if (host) return host
        }
      }
    }
  }

  // 2.2 检查 searchURL
  if (rule.searchURL && rule.searchURL.includes('://')) {
    const host = extractHostname(rule.searchURL)
    if (host) return host
  }

  // 2.3 检查 baseURL
  if (rule.baseURL && rule.baseURL.includes('://')) {
    const host = extractHostname(rule.baseURL)
    if (host) return host
  }

  // 2.4 回退策略：解析不出 host 时使用规则固有标识
  const fallback = (rule.id || rule.name || 'custom').toLowerCase().trim()
  return fallback.replace(/[^a-z0-9_-]/g, '_') || 'custom'
}
