import { assertPublicHttpUrl } from '../private-host'
import {
  playbackRegistry as defaultPlaybackRegistry,
  type PlaybackRegistry,
} from '../media/playback-registry'
import type {
  SourceAdapter,
  SourceResolveOutput,
  SourceMetadata,
} from './source-types'
import { xifanNextAdapter } from './adapters/xifan-next'
import { xifanAdapter } from './adapters/xifan'
import { cycaniAdapter } from './adapters/cycani'
import { moonciAdapter } from './adapters/moonci'
import { tvtfunAdapter } from './adapters/tvtfun'
import { anime1Adapter } from './adapters/anime1'

export interface SourceRegistryOptions {
  playback?: PlaybackRegistry
  adapters?: SourceAdapter[]
}

/**
 * SourceRegistry 统一受控视频源注册表与网络能力校验中心
 *
 * 核心安全职责：
 * 1. 固化专有适配器清单，支持传统与现代源完全独立运作；
 * 2. 统一出站公网安全门禁（协议 + 标准 Web 端口 + 物理层 SSRF/环回阻断），抵御 CDN 动态轮换；
 * 3. 兼容规则引擎通用源，产出受控 PlaybackAsset 并根据媒体类型返回正确的 Ticket 播放入口。
 */
export class SourceRegistry {
  private readonly adapters = new Map<string, SourceAdapter>()
  private readonly playback: PlaybackRegistry

  constructor(options: SourceRegistryOptions = {}) {
    this.playback = options.playback || defaultPlaybackRegistry

    const initialAdapters = options.adapters || [
      xifanNextAdapter,
      xifanAdapter,
      cycaniAdapter,
      moonciAdapter,
      tvtfunAdapter,
      anime1Adapter,
    ]

    for (const adapter of initialAdapters) {
      this.registerAdapter(adapter)
    }
  }

  /**
   * 注册视频源适配器
   */
  registerAdapter(adapter: SourceAdapter): void {
    const id = adapter.id.toLowerCase().trim()
    this.adapters.set(id, adapter)
  }

  /**
   * 获取指定视频源适配器（支持名称与别名标准化归一查找）
   */
  getAdapter(sourceId: string): SourceAdapter | null {
    if (!sourceId) return null
    const normalized = sourceId.toLowerCase().trim()
    const direct = this.adapters.get(normalized)
    if (direct) return direct

    // 别名标准化匹配
    if (
      normalized === 'xifan-next' ||
      normalized === 'xifan_next' ||
      normalized === 'xifannext' ||
      normalized === '稀饭next'
    ) {
      return this.adapters.get('xifan-next') || null
    }
    if (
      normalized === 'xifan' ||
      normalized === '稀饭动漫' ||
      normalized === '稀饭'
    ) {
      return this.adapters.get('xifan') || null
    }
    if (
      normalized === 'cycani' ||
      normalized === '次元城' ||
      normalized === '次元城动画'
    ) {
      return this.adapters.get('cycani') || null
    }
    if (normalized === 'moonci' || normalized === '月之祠') {
      return this.adapters.get('moonci') || null
    }
    if (normalized === 'tvtfun') {
      return this.adapters.get('tvtfun') || null
    }
    if (normalized === 'anime1' || normalized === 'anime1.me') {
      return this.adapters.get('anime1') || null
    }
    return null
  }

  /**
   * 获取所有已注册视频源元数据列表
   */
  listSources(): SourceMetadata[] {
    return Array.from(this.adapters.values()).map((a) => ({
      id: a.id,
      name: a.name,
      tier: a.tier,
      allowedHostsCount: a.capabilities.allowedHosts?.length,
    }))
  }

  /**
   * 出站公网 Web 安全门禁 (Public Web Egress Gate)
   * 1. 协议严格限定为 http: / https:
   * 2. 物理层拦截私有 IP / 内网穿透 / 环回 / 云元数据 (assertPublicHttpUrl)
   * 3. 端口限定为 Web 端口 (默认 80, 443, 8080, 8443)
   * 4. 若适配器显式声明了 allowedHosts 则做补充检查；通用规则源天然安全放行
   */
  validateEgress(
    urlStr: string,
    sourceId?: string,
  ): { valid: boolean; reason?: string } {
    let parsed: URL
    try {
      parsed = new URL(urlStr)
    } catch {
      return { valid: false, reason: `Malformed media URL: ${urlStr}` }
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        reason: `Disallowed protocol "${parsed.protocol}": only http/https allowed`,
      }
    }

    const port = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === 'https:'
        ? 443
        : 80

    const adapter = sourceId ? this.getAdapter(sourceId) : null
    const allowedPorts = adapter?.capabilities.allowedPorts || [
      80, 443, 8080, 8443,
    ]

    if (allowedPorts.length > 0 && !allowedPorts.includes(port)) {
      return {
        valid: false,
        reason: `Port ${port} not permitted by egress policy (allowed: ${allowedPorts.join(', ')})`,
      }
    }

    if (
      adapter?.capabilities.allowedHosts &&
      adapter.capabilities.allowedHosts.length > 0
    ) {
      const hostname = parsed.hostname.toLowerCase()
      const isAllowed = adapter.capabilities.allowedHosts.some(
        (h) => h.toLowerCase() === hostname,
      )
      if (!isAllowed) {
        return {
          valid: false,
          reason: `Host "${hostname}" is not declared in allowedHosts for source "${sourceId}"`,
        }
      }
    }

    try {
      assertPublicHttpUrl(urlStr, '媒体出站')
    } catch (err) {
      return {
        valid: false,
        reason:
          (err as Error).message ||
          'Disallowed target IP: private / internal hosts forbidden',
      }
    }

    return { valid: true }
  }

  /**
   * 搜索番剧
   */
  async search(sourceId: string, keyword: string) {
    const adapter = this.getAdapter(sourceId)
    if (!adapter) {
      throw new Error(`Unknown source adapter: ${sourceId}`)
    }
    return adapter.search(keyword)
  }

  /**
   * 获取番剧线路与分集列表
   */
  async chapters(sourceId: string, sourceUrlOrId: string) {
    const adapter = this.getAdapter(sourceId)
    if (!adapter) {
      throw new Error(`Unknown source adapter: ${sourceId}`)
    }
    return adapter.chapters(sourceUrlOrId)
  }

  /**
   * 解析播放链接并上架 PlaybackAsset，签发初始播放票据流
   */
  async resolveAndRegister(
    sourceId: string,
    pageUrl: string,
  ): Promise<SourceResolveOutput> {
    const adapter = this.getAdapter(sourceId)
    if (!adapter) {
      throw new Error(`Unknown source adapter: ${sourceId}`)
    }

    // 1. 调用适配器执行业务解析
    const raw = await adapter.resolve(pageUrl)
    if (!raw.mediaUrl) {
      throw new Error(`Source ${sourceId} failed to resolve media URL`)
    }

    // 2. 出站安全审计
    const egressCheck = this.validateEgress(raw.mediaUrl, sourceId)
    if (!egressCheck.valid) {
      throw new Error(`Egress policy check failed: ${egressCheck.reason}`)
    }

    // 3. Socket / SSRF 物理层安全审计
    assertPublicHttpUrl(raw.mediaUrl)

    // 4. 注册 PlaybackAsset 到资产仓储
    const isMp4 =
      raw.format === 'mp4' ||
      (!raw.format && raw.mediaUrl.toLowerCase().includes('.mp4'))
    const format: 'hls' | 'mp4' = isMp4 ? 'mp4' : 'hls'

    const asset = this.playback.registerAsset({
      source: sourceId,
      baseUrl: raw.mediaUrl,
      trustLevel: adapter.tier === 'tier_a' ? 'official' : 'temporary',
      publicHeaders: raw.publicHeaders,
      credentials: raw.credentials,
      ttlMs: raw.ttlMs,
    })

    // 5. 签发初始播放票据
    const ticket = this.playback.issueTicket({
      aid: asset.assetId,
      src: sourceId,
      typ: isMp4 ? 'segment' : 'playlist',
      sub: '',
    })

    const endpoint = isMp4 ? '/api/media/segment' : '/api/media/stream'

    // 6. 返回纯受控 DTO
    return {
      source: sourceId,
      streamUrl: `${endpoint}?t=${encodeURIComponent(ticket)}`,
      ticket,
      format,
      expiresAt: asset.expiresAt,
    }
  }
}

/**
 * 全局单例 SourceRegistry
 */
export const sourceRegistry = new SourceRegistry()
