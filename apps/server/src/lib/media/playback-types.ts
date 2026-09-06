/**
 * 播放凭据与资产模型核心类型定义
 * @module playback-types
 */

/**
 * 受众隔离标识：媒体 Ticket 强制要求 aud === 'media'
 */
export const PLAYBACK_TICKET_AUDIENCE = 'media' as const

/**
 * Ticket 类型：
 * - 'playlist': 主播放列表或多码率子列表 (.m3u8)
 * - 'segment': 媒体分片 (.ts, .m4s, .mp4)
 * - 'key': HLS AES-128 解密密钥 (.key)
 */
export type PlaybackTicketType = 'playlist' | 'segment' | 'key'

/**
 * 资产信任等级
 */
export type PlaybackAssetTrustLevel = 'official' | 'community' | 'temporary'

/**
 * 资产状态机：
 * - 'active': 正常服务中
 * - 'expired': 自然过期
 * - 'revoked': 人工/风控撤销（整条播放链失效）
 * - 'blocked': 恶意/黑名单封禁
 */
export type PlaybackAssetStatus = 'active' | 'expired' | 'revoked' | 'blocked'

/**
 * 播放凭据 Payload V1 规范
 */
export interface PlaybackTicketPayloadV1 {
  /** 版本号，必须为 1 */
  v: 1
  /** 受众严格隔离，必须为 'media' */
  aud: typeof PLAYBACK_TICKET_AUDIENCE
  /** 唯一 Token ID（用于黑名单吊销追踪） */
  jti: string
  /** 关联资产 ID (PlaybackAsset.assetId) */
  aid: string
  /** 视频源 ID (如 'xifan', 'anime1') */
  src: string
  /** Ticket 类型 */
  typ: PlaybackTicketType
  /** 规范化相对路径或子标识（严格拦截 ../ 及绝对协议） */
  sub: string
  /** 过期时间戳（秒级 Unix Timestamp） */
  exp: number
}

/**
 * 媒体资产模型 (PlaybackAsset)
 */
export interface PlaybackAsset {
  /** 资产唯一 ID */
  assetId: string
  /** 视频源 ID */
  source: string
  /** 信任等级 */
  trustLevel: PlaybackAssetTrustLevel
  /** 资产状态 */
  status: PlaybackAssetStatus
  /** 上游目标基础 URL */
  baseUrl: string
  /** 公共出站请求头（Referer, User-Agent, Origin 等） */
  publicHeaders?: Record<string, string>
  /** 敏感凭据隔离密文（Cookie 等经 AES-256-GCM 加密） */
  encryptedCredentials?: string
  /** 过期时间戳（毫秒级 Unix Timestamp） */
  expiresAt: number
  /** 创建时间戳（毫秒级 Unix Timestamp） */
  createdAt: number
  /** 更新时间戳（毫秒级 Unix Timestamp） */
  updatedAt: number
}

/**
 * 资产注册入参
 */
export interface RegisterAssetInput {
  /** 视频源 ID */
  source: string
  /** 上游目标基础 URL */
  baseUrl: string
  /** 信任等级，默认 'official' */
  trustLevel?: PlaybackAssetTrustLevel
  /** 公共出站请求头 */
  publicHeaders?: Record<string, string>
  /** 敏感凭据明文（Cookie 等，由底层安全加密存储） */
  credentials?: string | Record<string, string>
  /** 生存时间（毫秒），默认 2 小时 (7,200,000 ms) */
  ttlMs?: number
}

/**
 * Ticket 签发入参
 */
export interface IssueTicketInput {
  /** 关联资产 ID */
  aid: string
  /** 视频源 ID */
  src: string
  /** Ticket 类型 */
  typ: PlaybackTicketType
  /** 相对子路径（空串表示主根资产） */
  sub?: string
  /** 有效期（秒），缺省根据类型自动匹配推荐值（playlist: 900s, segment/key: 3600s） */
  ttlSec?: number
}

/**
 * 验证 Ticket 成功结果
 */
export interface VerifyTicketSuccess {
  valid: true
  payload: PlaybackTicketPayloadV1
  asset: PlaybackAsset
  normalizedSub: string
}

/**
 * 验证 Ticket 失败结果
 */
export interface VerifyTicketFailure {
  valid: false
  code:
    | 'INVALID_FORMAT'
    | 'DECRYPTION_FAILED'
    | 'INVALID_VERSION'
    | 'INVALID_AUDIENCE'
    | 'TOKEN_EXPIRED'
    | 'TOKEN_REVOKED'
    | 'TYPE_MISMATCH'
    | 'UNSAFE_PATH'
    | 'ASSET_NOT_FOUND'
    | 'ASSET_EXPIRED'
    | 'ASSET_REVOKED'
    | 'ASSET_BLOCKED'
    | 'UNKNOWN_ERROR'
  reason: string
}

export type VerifyTicketResult = VerifyTicketSuccess | VerifyTicketFailure
