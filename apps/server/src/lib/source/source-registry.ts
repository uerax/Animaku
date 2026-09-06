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
 * 1. 固化适配器清单与契约，彻底在网络边界隔离外部动态规则与任意 URL 参数；
 * 2. 强制落实精确 Host 与 Web Port 出站白名单；
 * 3. 产出受控 PlaybackAsset 并返回客户端完全透明的 /api/media/stream?t=... 票据流。
 */
export class SourceRegistry {
  private readonly adapters = new Map<string, SourceAdapter>()
  private readonly playback: PlaybackRegistry

  constructor(options: SourceRegistryOptions = {}) {
    this.playback = options.playback || defaultPlaybackRegistry

    const initialAdapters = options.adapters || [
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
   * 获取指定视频源适配器
   */
  getAdapter(sourceId: string): SourceAdapter | null {
    if (!sourceId) return null
    return this.adapters.get(sourceId.toLowerCase().trim()) || null
  }

  /**
   * 获取所有已注册视频源元数据列表
   */
  listSources(): SourceMetadata[] {
    return Array.from(this.adapters.values()).map((a) => ({
      id: a.id,
      name: a.name,
      tier: a.tier,
      allowedHostsCount: a.capabilities.allowedHosts.length,
    }))
  }

  /**
   * 出站网络能力与精确域名/端口策略审计 (Egress Host Policy)
   */
  validateEgress(
    urlStr: string,
    sourceId: string,
  ): { valid: boolean; reason?: string } {
    const adapter = this.getAdapter(sourceId)
    if (!adapter) {
      return { valid: false, reason: `Unknown source adapter: ${sourceId}` }
    }

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

    if (!adapter.capabilities.allowedPorts.includes(port)) {
      return {
        valid: false,
        reason: `Port ${port} not permitted by source capability policy (allowed: ${adapter.capabilities.allowedPorts.join(', ')})`,
      }
    }

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

    // 2. 出站域名/端口白名单审计
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

    // 6. 返回纯受控 DTO
    return {
      source: sourceId,
      streamUrl: `/api/media/stream?t=${encodeURIComponent(ticket)}`,
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
