import { randomBytes } from 'node:crypto'
import {
  PLAYBACK_TICKET_AUDIENCE,
  type PlaybackAsset,
  type PlaybackAssetStatus,
  type PlaybackTicketPayloadV1,
  type PlaybackTicketType,
  type RegisterAssetInput,
  type IssueTicketInput,
  type VerifyTicketResult,
} from './playback-types'
import {
  getDefaultMediaKey,
  encryptTicketPayload,
  decryptTicketPayload,
  encryptCredentials,
  decryptCredentials,
  validateSubPath,
} from './ticket-codec'

export const DEFAULT_ASSET_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours (覆盖长剧集与长电影观影)
export const DEFAULT_PLAYLIST_TTL_SEC = 30 * 60 // 30 minutes (用于动态拉取/刷新播放列表)
export const DEFAULT_SEGMENT_TTL_SEC = 4 * 60 * 60 // 4 hours
export const DEFAULT_KEY_TTL_SEC = 4 * 60 * 60 // 4 hours

/** 内存资产与黑名单最大容量上限（防无界膨胀） */
export const MAX_ASSETS_CAPACITY = 10_000
export const MAX_REVOKED_JTI_CAPACITY = 20_000
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export interface PlaybackRegistryOptions {
  key?: Buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv?: any
}

/**
 * PlaybackRegistry 资产与会话仓储引擎（高性能纯内存架构）
 *
 * 核心设计：
 * 1. 纯内存纳秒级存储与提取，全链路零磁盘 I/O；
 * 2. 基于 TTL 与最大容量限制自动淘汰过期资产，杜绝内存泄漏；
 * 3. 负责基于 AES-256-GCM 的版本化 Opaque Ticket 签发与防篡改验证。
 */
export class PlaybackRegistry {
  private readonly key: Buffer

  // 纯内存资产仓储：assetId -> PlaybackAsset
  private readonly assets = new Map<string, PlaybackAsset>()
  // 纯内存 JTI 黑名单：JTI -> expiresAtMs
  private readonly revokedJti = new Map<string, number>()
  private lastCleanup = Date.now()

  constructor(options: PlaybackRegistryOptions = {}) {
    this.key = options.key || getDefaultMediaKey()
  }

  /**
   * 清理过期资产与黑名单记录
   */
  cleanupExpired(now: number = Date.now()): void {
    this.lastCleanup = now

    // 1. 清理过期资产
    for (const [id, asset] of this.assets.entries()) {
      if (asset.expiresAt <= now) {
        this.assets.delete(id)
      }
    }

    // 若容量超出阈值，淘汰最先创建的资产
    if (this.assets.size > MAX_ASSETS_CAPACITY) {
      const sorted = Array.from(this.assets.entries()).sort(
        (a, b) => a[1].createdAt - b[1].createdAt,
      )
      const excess = this.assets.size - MAX_ASSETS_CAPACITY
      for (let i = 0; i < excess; i++) {
        this.assets.delete(sorted[i][0])
      }
    }

    // 2. 清理过期 JTI 黑名单
    for (const [jti, expMs] of this.revokedJti.entries()) {
      if (expMs <= now) {
        this.revokedJti.delete(jti)
      }
    }

    if (this.revokedJti.size > MAX_REVOKED_JTI_CAPACITY) {
      const sorted = Array.from(this.revokedJti.entries()).sort(
        (a, b) => a[1] - b[1],
      )
      const excess = this.revokedJti.size - MAX_REVOKED_JTI_CAPACITY
      for (let i = 0; i < excess; i++) {
        this.revokedJti.delete(sorted[i][0])
      }
    }
  }

  private maybeCleanup(now: number = Date.now()): void {
    if (
      now - this.lastCleanup > CLEANUP_INTERVAL_MS ||
      this.assets.size >= MAX_ASSETS_CAPACITY ||
      this.revokedJti.size >= MAX_REVOKED_JTI_CAPACITY
    ) {
      this.cleanupExpired(now)
    }
  }

  // ==========================================
  // PlaybackAsset 资产生命周期管理
  // ==========================================

  /**
   * 登记受控媒体资产，产出合法 PlaybackAsset
   */
  registerAsset(input: RegisterAssetInput): PlaybackAsset {
    if (!input.source) {
      throw new Error('Asset source is required')
    }
    if (!input.baseUrl) {
      throw new Error('Asset baseUrl is required')
    }

    const now = Date.now()
    this.maybeCleanup(now)

    const ttlMs = input.ttlMs && input.ttlMs > 0 ? input.ttlMs : DEFAULT_ASSET_TTL_MS
    const expiresAt = now + ttlMs

    const assetId = `ast_${randomBytes(12).toString('hex')}`

    let encryptedCredentials: string | undefined
    if (input.credentials) {
      encryptedCredentials = encryptCredentials(input.credentials, this.key)
    }

    const asset: PlaybackAsset = {
      assetId,
      source: input.source,
      trustLevel: input.trustLevel || 'official',
      status: 'active',
      baseUrl: input.baseUrl,
      publicHeaders: input.publicHeaders,
      encryptedCredentials,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }

    this.assets.set(assetId, asset)
    return asset
  }

  /**
   * 获取媒体资产（纯内存毫秒级读取，自动过期剔除）
   */
  getAsset(assetId: string): PlaybackAsset | null {
    if (!assetId) return null
    const now = Date.now()

    const cached = this.assets.get(assetId)
    if (!cached) return null

    if (cached.expiresAt <= now) {
      this.assets.delete(assetId)
      return null
    }

    return cached
  }

  /**
   * 变更资产状态机 ('active' | 'expired' | 'revoked' | 'blocked')
   */
  updateAssetStatus(assetId: string, status: PlaybackAssetStatus): boolean {
    const asset = this.getAsset(assetId)
    if (!asset) return false

    const now = Date.now()
    asset.status = status
    asset.updatedAt = now
    this.assets.set(assetId, asset)
    return true
  }

  /**
   * 一键吊销资产（整条播放链失效）
   */
  revokeAsset(assetId: string): boolean {
    return this.updateAssetStatus(assetId, 'revoked')
  }

  /**
   * 一键封禁资产（恶意源/异常攻击拦截）
   */
  blockAsset(assetId: string): boolean {
    return this.updateAssetStatus(assetId, 'blocked')
  }

  /**
   * 解密提取资产绑定的私密凭据 (Cookie 等)
   */
  getDecryptedCredentials<T = string | Record<string, string>>(asset: PlaybackAsset): T | null {
    if (!asset.encryptedCredentials) return null
    try {
      return decryptCredentials<T>(asset.encryptedCredentials, this.key)
    } catch (err) {
      console.error(`[PlaybackRegistry] Failed to decrypt credentials for asset ${asset.assetId}:`, err)
      return null
    }
  }

  /**
   * 根据 asset.baseUrl 与验证通过的 safe sub 解析出上游最终 URL
   */
  resolveAssetUrl(asset: PlaybackAsset, sub: string): string {
    if (!sub) return asset.baseUrl
    try {
      return new URL(sub, asset.baseUrl).href
    } catch {
      return asset.baseUrl
    }
  }

  // ==========================================
  // JTI 吊销黑名单控制
  // ==========================================

  /**
   * 检查 JTI 是否在吊销黑名单中
   */
  isJtiRevoked(jti: string): boolean {
    if (!jti) return false
    const now = Date.now()

    const expMs = this.revokedJti.get(jti)
    if (expMs !== undefined) {
      if (expMs > now) {
        return true
      }
      this.revokedJti.delete(jti)
    }
    return false
  }

  /**
   * 吊销指定的 Ticket JTI（毫秒级写入内存黑名单）
   */
  revokeTicket(jti: string, expiresAtSec?: number): void {
    if (!jti) return

    const now = Date.now()
    this.maybeCleanup(now)

    const expSec =
      expiresAtSec && expiresAtSec > Math.floor(now / 1000)
        ? expiresAtSec
        : Math.floor(now / 1000) + 7200
    const expMs = expSec * 1000

    this.revokedJti.set(jti, expMs)
  }

  // ==========================================
  // Ticket 签发与全流程验证门禁
  // ==========================================

  /**
   * 为指定资产签发 Opaque PlaybackTicket
   */
  issueTicket(input: IssueTicketInput): string {
    const asset = this.getAsset(input.aid)
    if (!asset) {
      throw new Error(`Cannot issue ticket: asset ${input.aid} not found`)
    }
    if (asset.status !== 'active') {
      throw new Error(`Cannot issue ticket: asset ${input.aid} is ${asset.status}`)
    }

    // 校验相对路径安全性
    const pathCheck = validateSubPath(input.sub)
    if (!pathCheck.valid) {
      throw new Error(`Cannot issue ticket: unsafe sub path (${pathCheck.error})`)
    }

    // 确定有效时长（动态跟随 Asset 剩余寿命，覆盖 2~4 小时观影需求）
    const nowMs = Date.now()
    const nowSec = Math.floor(nowMs / 1000)
    const assetRemainingSec = Math.max(
      60,
      Math.floor((asset.expiresAt - nowMs) / 1000),
    )

    let ttlSec = input.ttlSec
    if (!ttlSec || ttlSec <= 0) {
      switch (input.typ) {
        case 'playlist':
          ttlSec = Math.min(DEFAULT_PLAYLIST_TTL_SEC, assetRemainingSec)
          break
        case 'segment':
        case 'key':
          ttlSec = Math.min(DEFAULT_SEGMENT_TTL_SEC, assetRemainingSec)
          break
        default:
          ttlSec = Math.min(DEFAULT_PLAYLIST_TTL_SEC, assetRemainingSec)
      }
    }
    const jti = `jti_${randomBytes(12).toString('hex')}`

    const payload: PlaybackTicketPayloadV1 = {
      v: 1,
      aud: PLAYBACK_TICKET_AUDIENCE,
      jti,
      aid: input.aid,
      src: input.src || asset.source,
      typ: input.typ,
      sub: pathCheck.normalized,
      exp: nowSec + ttlSec,
    }

    return encryptTicketPayload(payload, this.key)
  }

  /**
   * 验签、解密并核验 Ticket 全流程
   */
  verifyTicket(token: string, expectedType?: PlaybackTicketType): VerifyTicketResult {
    // 1. 尝试解密并解析 Payload
    let payload: PlaybackTicketPayloadV1
    try {
      payload = decryptTicketPayload(token, this.key)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        valid: false,
        code: message.includes('tampered') ? 'DECRYPTION_FAILED' : 'INVALID_FORMAT',
        reason: message,
      }
    }

    // 2. 校验受众隔离 (aud === 'media')
    if (payload.aud !== PLAYBACK_TICKET_AUDIENCE) {
      return {
        valid: false,
        code: 'INVALID_AUDIENCE',
        reason: `Invalid audience claim: expected ${PLAYBACK_TICKET_AUDIENCE}, got ${payload.aud}`,
      }
    }

    // 3. 校验 Ticket 类型对齐
    if (expectedType && payload.typ !== expectedType) {
      return {
        valid: false,
        code: 'TYPE_MISMATCH',
        reason: `Ticket type mismatch: expected ${expectedType}, got ${payload.typ}`,
      }
    }

    // 4. 校验 Ticket 过期时间
    const nowSec = Math.floor(Date.now() / 1000)
    if (payload.exp <= nowSec) {
      return {
        valid: false,
        code: 'TOKEN_EXPIRED',
        reason: `Ticket expired at ${payload.exp}, current time is ${nowSec}`,
      }
    }

    // 5. 校验 sub 安全性与路径穿透
    const pathCheck = validateSubPath(payload.sub)
    if (!pathCheck.valid) {
      return {
        valid: false,
        code: 'UNSAFE_PATH',
        reason: `Unsafe sub path in ticket: ${pathCheck.error}`,
      }
    }

    // 6. 校验 JTI 吊销黑名单
    if (this.isJtiRevoked(payload.jti)) {
      return {
        valid: false,
        code: 'TOKEN_REVOKED',
        reason: `Ticket token ${payload.jti} has been revoked`,
      }
    }

    // 7. 提取关联媒体资产
    const asset = this.getAsset(payload.aid)
    if (!asset) {
      return {
        valid: false,
        code: 'ASSET_NOT_FOUND',
        reason: `Associated asset ${payload.aid} not found`,
      }
    }

    // 8. 校验资产过期
    const nowMs = Date.now()
    if (asset.expiresAt <= nowMs) {
      return {
        valid: false,
        code: 'ASSET_EXPIRED',
        reason: `Associated asset ${payload.aid} has expired`,
      }
    }

    // 9. 校验资产状态机 (非 active 状态联动失效)
    if (asset.status !== 'active') {
      const code = asset.status === 'revoked' ? 'ASSET_REVOKED' : 'ASSET_BLOCKED'
      return {
        valid: false,
        code,
        reason: `Associated asset ${payload.aid} is ${asset.status}`,
      }
    }

    // 10. 全部通过
    return {
      valid: true,
      payload,
      asset,
      normalizedSub: pathCheck.normalized,
    }
  }

  /**
   * 清理内存缓存（便于单元测试与状态重置）
   */
  clearCaches(): void {
    this.assets.clear()
    this.revokedJti.clear()
  }

  clearL1Caches(): void {
    this.clearCaches()
  }
}

/**
 * 全局单例 PlaybackRegistry
 */
export const playbackRegistry = new PlaybackRegistry()
