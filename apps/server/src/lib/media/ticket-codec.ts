import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from 'node:crypto'
import { posix } from 'node:path'
import { config } from '../../config'
import { kvCache } from '../../db/repositories/kv-cache'
import {
  PLAYBACK_TICKET_AUDIENCE,
  type PlaybackTicketPayloadV1,
  type PlaybackTicketType,
} from './playback-types'

const TICKET_VERSION_PREFIX = 'v1.'
const IV_LENGTH = 12 // 96 bits for AES-GCM
const AUTH_TAG_LENGTH = 16 // 128 bits for AES-GCM
const MIN_TOKEN_BUFFER_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH // 28 bytes

export const SYSTEM_KEY_NAMESPACE = 'system'
export const MASTER_KEY_KV_KEY = 'media_system_master_key'

// Singleton in-memory cache for authoritative master key
let cachedMasterKey: Buffer | null = null

/**
 * 派生标准的 32 字节 AES-256 密钥
 */
export function deriveKey(secret: string | Buffer): Buffer {
  if (Buffer.isBuffer(secret) && secret.length === 32) {
    return secret
  }
  return createHash('sha256')
    .update('animaku:media-ticket-key:v1:')
    .update(secret)
    .digest()
}

/**
 * 获取系统权威媒体主密钥（优先 SQLite 持久化 ➔ 环境变量 ➔ 随机生成并落盘）
 */
export function getDefaultMediaKey(): Buffer {
  if (cachedMasterKey) {
    return cachedMasterKey
  }

  try {
    // 1. 查询 SQLite (kvCache) 中是否存在已持久化的系统主密钥
    const persistedKeyHex = kvCache.get<string>(SYSTEM_KEY_NAMESPACE, MASTER_KEY_KV_KEY)
    if (persistedKeyHex && typeof persistedKeyHex === 'string') {
      const buf = Buffer.from(persistedKeyHex, 'hex')
      if (buf.length === 32) {
        cachedMasterKey = buf
        return cachedMasterKey
      }
    }
  } catch {
    // 忽略未初始化 SQLite 环境异常
  }

  // 2. 不存在持久化 Key 时，检查环境变量
  const configuredSecret = config.mediaSecret
  let resolvedKey: Buffer
  if (configuredSecret) {
    resolvedKey = deriveKey(configuredSecret)
  } else {
    resolvedKey = randomBytes(32)
  }

  // 3. 将决断出的 Key 写入 SQLite 作为权威 master key，内存单例缓存
  try {
    kvCache.set(SYSTEM_KEY_NAMESPACE, MASTER_KEY_KV_KEY, resolvedKey.toString('hex'))
  } catch {
    // 忽略初始化前写入异常
  }

  cachedMasterKey = resolvedKey
  return cachedMasterKey
}

/**
 * 测试辅助：重置单例内存缓存
 */
export function _resetDefaultMediaKeyForTest(): void {
  cachedMasterKey = null
}

/**
 * 规范化并严格校验相对子路径 (sub)
 * 彻底阻断路径穿越 (../)、协议注入 (http:, //) 以及控制字符/编码绕过
 */
export function validateSubPath(sub: string | undefined | null): {
  valid: boolean
  normalized: string
  error?: string
} {
  if (sub === undefined || sub === null || sub === '') {
    return { valid: true, normalized: '' }
  }

  if (typeof sub !== 'string') {
    return { valid: false, normalized: '', error: 'Sub path must be a string' }
  }

  if (sub.length > 2048) {
    return { valid: false, normalized: '', error: 'Sub path exceeds maximum length' }
  }

  // 严格拦截空字符与 ASCII 控制字符 (\0 - \x1F, \x7F)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(sub)) {
    return { valid: false, normalized: '', error: 'Sub path contains control characters or null bytes' }
  }

  // 严格拒绝反斜杠 (\)，统一要求 URL 规范斜杠 (/)
  if (sub.includes('\\')) {
    return { valid: false, normalized: '', error: 'Sub path contains backslash' }
  }

  // 分离 Path 与 Query 参数（仅在 Path 上进行严格路径穿越与冒号 Scheme 校验，放行合法 Query 带参切片如时间戳）
  const qIndex = sub.indexOf('?')
  const pathPart = qIndex >= 0 ? sub.slice(0, qIndex) : sub
  const queryPart = qIndex >= 0 ? sub.slice(qIndex + 1) : ''

  // 严格拦截协议相对路径 (//)
  if (pathPart.startsWith('//')) {
    return { valid: false, normalized: '', error: 'Sub path cannot be protocol-relative' }
  }

  // 严格拦截绝对路径 (/ 开头)
  if (pathPart.startsWith('/')) {
    return { valid: false, normalized: '', error: 'Sub path cannot be absolute' }
  }

  // 严格拦截路径部分的协议前缀或冒号 (包含冒号 : 如 http:, javascript:, file:)
  if (pathPart.includes(':')) {
    return { valid: false, normalized: '', error: 'Sub path cannot contain URI schemes or colon' }
  }

  // 逐段审计与解码校验，防御 URL 编码穿透 (如 %2e%2e%2f)
  const segments = pathPart.split('/')
  for (const segment of segments) {
    if (segment === '') {
      return { valid: false, normalized: '', error: 'Sub path contains empty segment or consecutive slashes' }
    }

    let decodedSegment: string
    try {
      decodedSegment = decodeURIComponent(segment)
    } catch {
      return { valid: false, normalized: '', error: 'Sub path contains malformed URL encoding' }
    }

    // 严禁任何形式的目录穿越 (. 或 ..)
    if (decodedSegment === '.' || decodedSegment === '..' || segment === '.' || segment === '..') {
      return { valid: false, normalized: '', error: 'Sub path contains directory traversal (.) or (..)' }
    }

    // 解码后二次审计危险字符
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(decodedSegment) || decodedSegment.includes('\\') || decodedSegment.includes(':')) {
      return { valid: false, normalized: '', error: 'Sub path contains unsafe characters after decoding' }
    }
  }

  // 使用 posix.normalize 最终校验路径走向
  const normalizedPath = posix.normalize(pathPart)
  if (normalizedPath.startsWith('../') || normalizedPath === '..' || normalizedPath.startsWith('/')) {
    return { valid: false, normalized: '', error: 'Sub path resolves outside root' }
  }

  const normalized = queryPart ? `${normalizedPath}?${queryPart}` : normalizedPath
  return { valid: true, normalized }
}

/**
 * 加密并编码 PlaybackTicketPayloadV1 为版本化 Opaque Token
 * 格式：v1.${base64url(12B_Random_IV + 16B_AuthTag + Ciphertext)}
 */
export function encryptTicketPayload(
  payload: PlaybackTicketPayloadV1,
  key: Buffer = getDefaultMediaKey(),
): string {
  if (payload.v !== 1) {
    throw new Error(`Unsupported ticket version: ${payload.v}`)
  }
  if (payload.aud !== PLAYBACK_TICKET_AUDIENCE) {
    throw new Error(`Invalid audience: expected ${PLAYBACK_TICKET_AUDIENCE}, got ${payload.aud}`)
  }

  const pathCheck = validateSubPath(payload.sub)
  if (!pathCheck.valid) {
    throw new Error(`Unsafe sub path in ticket payload: ${pathCheck.error}`)
  }

  const payloadString = JSON.stringify({
    ...payload,
    sub: pathCheck.normalized,
  })

  // 强制生成 12 字节随机 IV，绝对禁止复用
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(payloadString, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag() // 16 字节

  const combined = Buffer.concat([iv, authTag, ciphertext])
  return `${TICKET_VERSION_PREFIX}${combined.toString('base64url')}`
}

/**
 * 解密并校验 PlaybackTicketPayloadV1
 * 严格验签、检查版本、解包并做初步结构审计
 */
export function decryptTicketPayload(
  token: string,
  key: Buffer = getDefaultMediaKey(),
): PlaybackTicketPayloadV1 {
  if (typeof token !== 'string' || !token.startsWith(TICKET_VERSION_PREFIX)) {
    throw new Error('Invalid ticket: missing or unsupported version prefix')
  }

  const encoded = token.slice(TICKET_VERSION_PREFIX.length)
  if (!encoded) {
    throw new Error('Invalid ticket: empty payload')
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(encoded, 'base64url')
  } catch {
    throw new Error('Invalid ticket: malformed base64url encoding')
  }

  if (buffer.length < MIN_TOKEN_BUFFER_LENGTH) {
    throw new Error('Invalid ticket: binary payload length insufficient')
  }

  const iv = buffer.subarray(0, IV_LENGTH)
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  let plaintext: string
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8')
  } catch (err) {
    console.warn('[ticket-codec] 凭据解密失败（可能由密钥变更引起），建议客户端刷新重新解析选集:', (err as Error).message)
    throw new Error('Decryption failed or ticket tampered with')
  }

  let rawPayload: unknown
  try {
    rawPayload = JSON.parse(plaintext)
  } catch {
    throw new Error('Ticket decrypted but contained invalid JSON')
  }

  if (!rawPayload || typeof rawPayload !== 'object') {
    throw new Error('Ticket payload is not an object')
  }

  const p = rawPayload as Record<string, unknown>

  if (p.v !== 1) {
    throw new Error(`Unsupported payload version: ${p.v}`)
  }
  if (p.aud !== PLAYBACK_TICKET_AUDIENCE) {
    throw new Error(`Invalid audience claim: ${p.aud}`)
  }
  if (typeof p.jti !== 'string' || !p.jti) {
    throw new Error('Invalid or missing jti claim')
  }
  if (typeof p.aid !== 'string' || !p.aid) {
    throw new Error('Invalid or missing aid claim')
  }
  if (typeof p.src !== 'string' || !p.src) {
    throw new Error('Invalid or missing src claim')
  }
  if (p.typ !== 'playlist' && p.typ !== 'segment' && p.typ !== 'key') {
    throw new Error(`Invalid typ claim: ${p.typ}`)
  }
  if (typeof p.sub !== 'string') {
    throw new Error('Invalid or missing sub claim')
  }
  if (typeof p.exp !== 'number' || !Number.isFinite(p.exp)) {
    throw new Error('Invalid or missing exp claim')
  }

  const pathCheck = validateSubPath(p.sub)
  if (!pathCheck.valid) {
    throw new Error(`Unsafe sub path in decrypted payload: ${pathCheck.error}`)
  }

  return {
    v: 1,
    aud: PLAYBACK_TICKET_AUDIENCE,
    jti: p.jti,
    aid: p.aid,
    src: p.src,
    typ: p.typ as PlaybackTicketType,
    sub: pathCheck.normalized,
    exp: p.exp,
  }
}

/**
 * 敏感凭据（如 Cookie）对称加密存储
 */
export function encryptCredentials(
  credentials: string | Record<string, string>,
  key: Buffer = getDefaultMediaKey(),
): string {
  const plainText = typeof credentials === 'string' ? credentials : JSON.stringify(credentials)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, authTag, ciphertext])
  return `${TICKET_VERSION_PREFIX}${combined.toString('base64url')}`
}

/**
 * 敏感凭据解密提取
 */
export function decryptCredentials<T = string>(
  encrypted: string,
  key: Buffer = getDefaultMediaKey(),
): T {
  if (!encrypted.startsWith(TICKET_VERSION_PREFIX)) {
    throw new Error('Invalid credentials format: missing version prefix')
  }

  const encoded = encrypted.slice(TICKET_VERSION_PREFIX.length)
  const buffer = Buffer.from(encoded, 'base64url')
  if (buffer.length < MIN_TOKEN_BUFFER_LENGTH) {
    throw new Error('Invalid credentials buffer length')
  }

  const iv = buffer.subarray(0, IV_LENGTH)
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  let plaintext: string
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8')
  } catch (err) {
    console.warn('[ticket-codec] 凭据解密失败（可能由密钥变更引起），建议客户端刷新重新解析选集:', (err as Error).message)
    throw new Error('Credentials decryption failed or corrupted')
  }

  try {
    return JSON.parse(plaintext) as T
  } catch {
    return plaintext as unknown as T
  }
}
