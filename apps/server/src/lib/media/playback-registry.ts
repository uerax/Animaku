import { randomBytes } from 'node:crypto'
import { kvCache, type KvCacheRepository } from '../../db/repositories/kv-cache'
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

const DEFAULT_ASSET_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours
const DEFAULT_PLAYLIST_TTL_SEC = 15 * 60 // 15 minutes (TTL 15m)
const DEFAULT_SEGMENT_TTL_SEC = 60 * 60 // 60 minutes (TTL 60m)
const DEFAULT_KEY_TTL_SEC = 60 * 60 // 60 minutes (TTL 60m)

const KV_NS_ASSET = 'playback_asset'
const KV_NS_REVOKED_JTI = 'revoked_jti'

export interface PlaybackRegistryOptions {
  key?: Buffer
  kv?: KvCacheRepository
}

/**
 * PlaybackRegistry 资产与会话仓储引擎
 * 提供：
 * 1. PlaybackAsset 注册、提取与状态机控制（支持整条播放链一键主动拉黑/撤销）；
 * 2. PlaybackTicket 基于 AES-256-GCM 的版本化 Opaque Token 签发与验证；
 * 3. 双层 JTI 吊销黑名单（L1 内存毫秒级 + L2 SQLite 持久化保证重启不丢失）。
 */
export class PlaybackRegistry {
  private readonly key: Buffer
  private readonly kv: KvCacheRepository

  // L1 内存缓存：高性能资产读取
  private readonly l1Assets = new Map<string, PlaybackAsset>()
  // L1 内存黑名单：JTI -> expiresAtMs 毫秒级 0 延迟负向过滤
  private readonly l1RevokedJti = new Map<string, number>()

  constructor(options: PlaybackRegistryOptions = {}) {
    this.key = options.key || getDefaultMediaKey()
    this.kv = options.kv || kvCache
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

    // 写入 L1 内存
    this.l1Assets.set(assetId, asset)

    // 写入 L2 SQLite 持久化
    try {
      this.kv.set(KV_NS_ASSET, assetId, asset, ttlMs)
    } catch (err) {
      console.error(`[PlaybackRegistry] Failed to persist asset ${assetId} to L2:`, err)
    }

    return asset
  }

  /**
   * 获取媒体资产（L1 内存优先，穿透回源 L2 SQLite）
   */
  getAsset(assetId: string): PlaybackAsset | null {
    if (!assetId) return null
    const now = Date.now()

    // 1. 查 L1 内存
    const cached = this.l1Assets.get(assetId)
    if (cached) {
      if (cached.expiresAt <= now) {
        this.l1Assets.delete(assetId)
        return null
      }
      return cached
    }

    // 2. 查 L2 SQLite 持久化
    try {
      const persisted = this.kv.get<PlaybackAsset>(KV_NS_ASSET, assetId)
      if (persisted) {
        if (persisted.expiresAt <= now) {
          return null
        }
        // 写回 L1
        this.l1Assets.set(assetId, persisted)
        return persisted
      }
    } catch (err) {
      console.error(`[PlaybackRegistry] Failed to read asset ${assetId} from L2:`, err)
    }

    return null
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

    // 更新 L1
    this.l1Assets.set(assetId, asset)

    // 更新 L2
    try {
      const remainingMs = Math.max(1000, asset.expiresAt - now)
      this.kv.set(KV_NS_ASSET, assetId, asset, remainingMs)
    } catch (err) {
      console.error(`[PlaybackRegistry] Failed to update asset status in L2 (${assetId}):`, err)
    }

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
  // 双层 JTI 吊销黑名单控制
  // ==========================================

  /**
   * 检查 JTI 是否在双层吊销黑名单中
   */
  isJtiRevoked(jti: string): boolean {
    if (!jti) return false
    const now = Date.now()

    // 1. 检查 L1 内存黑名单
    const l1Exp = this.l1RevokedJti.get(jti)
    if (l1Exp !== undefined) {
      if (l1Exp > now) {
        return true
      }
      this.l1RevokedJti.delete(jti)
    }

    // 2. 检查 L2 SQLite 持久化黑名单
    try {
      const l2ExpSec = this.kv.get<number>(KV_NS_REVOKED_JTI, jti)
      if (l2ExpSec !== null && typeof l2ExpSec === 'number') {
        const l2ExpMs = l2ExpSec * 1000
        if (l2ExpMs > now) {
          // 回填 L1 内存加速后续验证
          this.l1RevokedJti.set(jti, l2ExpMs)
          return true
        }
      }
    } catch (err) {
      console.error(`[PlaybackRegistry] Error querying L2 JTI blacklist for ${jti}:`, err)
    }

    return false
  }

  /**
   * 吊销指定的 Ticket JTI（同步写入 L1 内存与 L2 SQLite）
   */
  revokeTicket(jti: string, expiresAtSec?: number): void {
    if (!jti) return

    const now = Date.now()
    // 缺省保留至 2 小时后，或依照 Ticket 自身过期时间
    const expSec =
      expiresAtSec && expiresAtSec > Math.floor(now / 1000)
        ? expiresAtSec
        : Math.floor(now / 1000) + 7200
    const expMs = expSec * 1000
    const remainingMs = Math.max(1000, expMs - now)

    // 1. 写入 L1 内存
    this.l1RevokedJti.set(jti, expMs)

    // 2. 写入 L2 SQLite
    try {
      this.kv.set(KV_NS_REVOKED_JTI, jti, expSec, remainingMs)
    } catch (err) {
      console.error(`[PlaybackRegistry] Failed to persist revoked JTI ${jti} to L2:`, err)
    }
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

    // 确定有效时长
    let ttlSec = input.ttlSec
    if (!ttlSec || ttlSec <= 0) {
      switch (input.typ) {
        case 'playlist':
          ttlSec = DEFAULT_PLAYLIST_TTL_SEC
          break
        case 'segment':
          ttlSec = DEFAULT_SEGMENT_TTL_SEC
          break
        case 'key':
          ttlSec = DEFAULT_KEY_TTL_SEC
          break
        default:
          ttlSec = DEFAULT_PLAYLIST_TTL_SEC
      }
    }

    const nowSec = Math.floor(Date.now() / 1000)
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

    // 6. 校验双层 JTI 吊销黑名单
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
   * 清理 L1 内存缓存（便于测试与内存整理）
   */
  clearL1Caches(): void {
    this.l1Assets.clear()
    this.l1RevokedJti.clear()
  }
}

/**
 * 全局单例 PlaybackRegistry
 */
export const playbackRegistry = new PlaybackRegistry()
