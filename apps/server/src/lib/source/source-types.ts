import type {
  PluginSearchResult,
  PluginChapterResult,
} from '@animaku/shared'

/**
 * 视频源网络能力与出站白名单声明
 */
export interface SourceCapabilities {
  /**
   * 可选精确域名白名单（仅用于有特殊隔离要求的专有源）
   * 若不配置，则由公网安全门禁（assertPublicHttpUrl）统一管控，自动支持多 CDN 轮换与动态直链
   */
  allowedHosts?: string[]

  /**
   * 允许的标准 Web 端口，默认仅限 [80, 443, 8080, 8443]
   */
  allowedPorts?: number[]
}

/**
 * 适配器解析出的原始媒体信息
 */
export interface RawResolveResult {
  /** 真实的媒体直链 (M3U8 或 MP4) */
  mediaUrl: string
  /** 视频源公开请求头 (Referer, User-Agent, Origin 等) */
  publicHeaders?: Record<string, string>
  /** 敏感凭据 (Cookie 等，由 PlaybackRegistry 进行 AES-256-GCM 加密存储) */
  credentials?: string | Record<string, string>
  /** 媒体格式 ('hls' | 'mp4') */
  format?: 'hls' | 'mp4'
  /** 资产生存时长（毫秒） */
  ttlMs?: number
}

/**
 * 固化视频源适配器标准契约
 */
export interface SourceAdapter {
  /** 唯一源标识，如 'xifan', 'cycani', 'moonci', 'tvtfun', 'anime1' */
  readonly id: string
  /** 人类可读名称，如 '稀饭动漫', '次元城' */
  readonly name: string
  /** 架构分级：Tier A（标准源） | Tier B（专有/代拉源） */
  readonly tier: 'tier_a' | 'tier_b'
  /** 声明的网络能力与白名单 */
  readonly capabilities: SourceCapabilities

  /** 搜索番剧 */
  search(keyword: string): Promise<PluginSearchResult>
  /** 获取分集与线路列表 */
  chapters(sourceUrlOrId: string): Promise<PluginChapterResult>
  /** 解析播放地址并产出 RawResolveResult */
  resolve(pageUrl: string): Promise<RawResolveResult>
}

/**
 * 客户端 Resolve 响应 DTO（全程不接触真实第三方 URL）
 */
export interface SourceResolveOutput {
  /** 视频源 ID */
  source: string
  /** 对外受控播放流地址 (/api/media/stream?t=...) */
  streamUrl: string
  /** 播放凭据 Ticket */
  ticket: string
  /** 媒体格式 ('hls' | 'mp4') */
  format: 'hls' | 'mp4'
  /** 凭据/资产过期时间戳（毫秒） */
  expiresAt: number
  /** 是否需要服务端强制代理流传输（如 Cookie 鉴权源） */
  requiresProxy?: boolean
}

/**
 * 视频源概览元数据
 */
export interface SourceMetadata {
  id: string
  name: string
  tier: 'tier_a' | 'tier_b'
  allowedHostsCount?: number
}
