import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  deriveKey,
  validateSubPath,
  encryptTicketPayload,
  decryptTicketPayload,
  encryptCredentials,
  decryptCredentials,
  getDefaultMediaKey,
  _resetDefaultMediaKeyForTest,
  SYSTEM_KEY_NAMESPACE,
  MASTER_KEY_KV_KEY,
} from './ticket-codec'
import { kvCache } from '../../db/repositories/kv-cache'
import {
  PLAYBACK_TICKET_AUDIENCE,
  type PlaybackTicketPayloadV1,
} from './playback-types'

test('ticket-codec: deriveKey produces 32-byte Buffer', () => {
  const key1 = deriveKey('my-secret')
  assert.equal(Buffer.isBuffer(key1), true)
  assert.equal(key1.length, 32)

  const raw32 = randomBytes(32)
  const key2 = deriveKey(raw32)
  assert.equal(key2, raw32)
})

test('ticket-codec: validateSubPath allows safe relative paths and empty sub', () => {
  assert.deepEqual(validateSubPath(''), { valid: true, normalized: '' })
  assert.deepEqual(validateSubPath(undefined), { valid: true, normalized: '' })
  assert.deepEqual(validateSubPath(null), { valid: true, normalized: '' })

  const safe1 = validateSubPath('index.m3u8')
  assert.equal(safe1.valid, true)
  assert.equal(safe1.normalized, 'index.m3u8')

  const safe2 = validateSubPath('ep01/720p.m3u8')
  assert.equal(safe2.valid, true)
  assert.equal(safe2.normalized, 'ep01/720p.m3u8')

  const safe3 = validateSubPath('ep01/seg-001.ts')
  assert.equal(safe3.valid, true)
  assert.equal(safe3.normalized, 'ep01/seg-001.ts')

  const safe4 = validateSubPath('key.key')
  assert.equal(safe4.valid, true)
  assert.equal(safe4.normalized, 'key.key')
})

test('ticket-codec: validateSubPath strictly blocks directory traversal and protocol injection', () => {
  // Directory traversal
  assert.equal(validateSubPath('../secret').valid, false)
  assert.equal(validateSubPath('foo/../bar').valid, false)
  assert.equal(validateSubPath('foo/../../bar').valid, false)
  assert.equal(validateSubPath('..').valid, false)
  assert.equal(validateSubPath('.').valid, false)

  // URL-encoded traversal
  assert.equal(validateSubPath('%2e%2e/secret').valid, false)
  assert.equal(validateSubPath('foo/%2e%2e/bar').valid, false)
  assert.equal(validateSubPath('foo/%2e/bar').valid, false)

  // Absolute paths
  assert.equal(validateSubPath('/etc/passwd').valid, false)
  assert.equal(validateSubPath('/index.m3u8').valid, false)

  // Backslashes
  assert.equal(validateSubPath('foo\\bar').valid, false)
  assert.equal(validateSubPath('\\windows\\system32').valid, false)

  // Protocol / Scheme injections
  assert.equal(validateSubPath('http://evil.com/stream.m3u8').valid, false)
  assert.equal(validateSubPath('https://evil.com/stream.m3u8').valid, false)
  assert.equal(validateSubPath('//evil.com/stream.m3u8').valid, false)
  assert.equal(validateSubPath('javascript:alert(1)').valid, false)
  assert.equal(validateSubPath('file:///etc/passwd').valid, false)

  // Control characters & null bytes
  assert.equal(validateSubPath('foo\0bar.ts').valid, false)
  assert.equal(validateSubPath('foo\r\nbar.ts').valid, false)
})

test('ticket-codec: encryptTicketPayload enforces random 12B IV and formats v1. prefix', () => {
  const key = randomBytes(32)
  const payload: PlaybackTicketPayloadV1 = {
    v: 1,
    aud: PLAYBACK_TICKET_AUDIENCE,
    jti: 'jti_test_123',
    aid: 'ast_test_456',
    src: 'xifan',
    typ: 'playlist',
    sub: 'index.m3u8',
    exp: Math.floor(Date.now() / 1000) + 900,
  }

  const token1 = encryptTicketPayload(payload, key)
  const token2 = encryptTicketPayload(payload, key)

  // Both must start with v1.
  assert.equal(token1.startsWith('v1.'), true)
  assert.equal(token2.startsWith('v1.'), true)

  // Random IV must cause different ciphertexts for identical payload
  assert.notEqual(token1, token2)

  // Both decrypt cleanly back to identical payload
  const decrypted1 = decryptTicketPayload(token1, key)
  const decrypted2 = decryptTicketPayload(token2, key)
  assert.deepEqual(decrypted1, payload)
  assert.deepEqual(decrypted2, payload)
})

test('ticket-codec: tamper resistance with AES-256-GCM auth tag', () => {
  const key = randomBytes(32)
  const payload: PlaybackTicketPayloadV1 = {
    v: 1,
    aud: PLAYBACK_TICKET_AUDIENCE,
    jti: 'jti_tamper',
    aid: 'ast_tamper',
    src: 'cycani',
    typ: 'segment',
    sub: 'chunk-1.ts',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }

  const token = encryptTicketPayload(payload, key)

  // 1. Altering version prefix
  assert.throws(() => {
    decryptTicketPayload('v2.' + token.slice(3), key)
  }, /unsupported version prefix/)

  // 2. Tampering with base64 content (flip characters in the middle)
  const rawBody = token.slice(3)
  const tamperedBody =
    rawBody.slice(0, 10) +
    (rawBody[10] === 'A' ? 'B' : 'A') +
    rawBody.slice(11)

  assert.throws(() => {
    decryptTicketPayload('v1.' + tamperedBody, key)
  }, /tampered|Decryption failed/)

  // 3. Truncated token (< 28 bytes)
  const shortBuffer = randomBytes(20)
  assert.throws(() => {
    decryptTicketPayload('v1.' + shortBuffer.toString('base64url'), key)
  }, /binary payload length insufficient/)

  // 4. Decrypting with wrong key fails
  const wrongKey = randomBytes(32)
  assert.throws(() => {
    decryptTicketPayload(token, wrongKey)
  }, /tampered|Decryption failed/)
})

test('ticket-codec: audience isolation prevents non-media credentials', () => {
  const key = randomBytes(32)
  const invalidPayload = {
    v: 1 as const,
    aud: 'admin' as unknown as typeof PLAYBACK_TICKET_AUDIENCE,
    jti: 'jti_admin',
    aid: 'ast_admin',
    src: 'test',
    typ: 'playlist' as const,
    sub: 'index.m3u8',
    exp: Math.floor(Date.now() / 1000) + 300,
  } as unknown as PlaybackTicketPayloadV1

  assert.throws(() => {
    encryptTicketPayload(invalidPayload, key)
  }, /Invalid audience/)
})

test('ticket-codec: encryptCredentials & decryptCredentials handles string and object payloads', () => {
  const key = randomBytes(32)

  // 1. String cookie
  const cookieStr = 'v=12345; __cf_bm=abcdef; path=/'
  const enc1 = encryptCredentials(cookieStr, key)
  assert.equal(enc1.startsWith('v1.'), true)
  const dec1 = decryptCredentials<string>(enc1, key)
  assert.equal(dec1, cookieStr)

  // 2. Header object
  const headerObj = {
    Cookie: 'session=xyz',
    Authorization: 'Bearer test-token',
  }
  const enc2 = encryptCredentials(headerObj, key)
  const dec2 = decryptCredentials<typeof headerObj>(enc2, key)
  assert.deepEqual(dec2, headerObj)

  // 3. Tampering fails
  const tampered = enc2.slice(0, 5) + 'X' + enc2.slice(6)
  assert.throws(() => {
    decryptCredentials(tampered, key)
  })
})

test('ticket-codec: getDefaultMediaKey persists key and reuses across restarts', () => {
  // 1. Reset memory cache
  _resetDefaultMediaKeyForTest()

  // 2. Call getDefaultMediaKey, should generate/resolve a key
  const key1 = getDefaultMediaKey()
  assert.equal(Buffer.isBuffer(key1), true)
  assert.equal(key1.length, 32)

  // Verify it is stored in kvCache
  const stored = kvCache.get(SYSTEM_KEY_NAMESPACE, MASTER_KEY_KV_KEY)
  assert.equal(stored, key1.toString('hex'))

  // 3. Reset memory cache to simulate process restart
  _resetDefaultMediaKeyForTest()
  const key2 = getDefaultMediaKey()
  assert.deepEqual(key2, key1)
})

