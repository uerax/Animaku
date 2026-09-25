/**
 * 视频源多代理池与出站调度器
 * @module outbound-proxy
 */
import { ProxyAgent } from 'undici'
import { config } from '../config'

// 缓存已创建的 ProxyAgent 实例，同一代理 URL 共享单例连接池
const proxyAgentCache = new Map<string, ProxyAgent>()

/**
 * 根据视频源名称获取对应的出站代理 Dispatcher
 * - 若未指定 source 或未在映射表中配置，返回 null（调用方回退直连）
 * - 若配置了映射但代理池中未找到对应的代理 URL，打印警告并返回 null（降级直连）
 */
export function getDispatcherForSource(
  sourceName?: string | null,
  proxyPool: Record<string, string> = config.proxyPool,
  sourceProxyMap: Record<string, string> = config.sourceProxyMap,
): ProxyAgent | null {
  if (!sourceName) return null

  const cleanSource = sourceName.trim().toLowerCase()
  if (!cleanSource) return null

  const proxyKey = sourceProxyMap[cleanSource]
  if (!proxyKey) return null

  const proxyUrl = proxyPool[proxyKey]
  if (!proxyUrl) {
    console.warn(
      `[outbound-proxy] 视频源 '${sourceName}' 映射了代理 '${proxyKey}'，但未在代理池中配置对应的 PROXY_${proxyKey.toUpperCase()}，已降级直连`,
    )
    return null
  }

  const cached = proxyAgentCache.get(proxyUrl)
  if (cached) return cached

  try {
    const agent = new ProxyAgent(proxyUrl)
    proxyAgentCache.set(proxyUrl, agent)
    return agent
  } catch (err) {
    console.warn(
      `[outbound-proxy] 初始化代理失败 (${proxyUrl}):`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/**
 * 仅用于单元测试清理缓存
 */
export function clearProxyAgentCache(): void {
  proxyAgentCache.clear()
}
