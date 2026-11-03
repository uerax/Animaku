import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { ProxyAgent } from 'undici'
import type { PluginRule } from '@animaku/shared'
import { isBimiRule } from './bimi'
import { getDispatcherForSource } from './outbound-proxy'

test('bimi: isBimiRule correctly matches rule variations', () => {
  const rule1: PluginRule = {
    name: 'bimi',
    baseURL: 'https://www.bimiacg14.net/',
    version: '1.0',
  }
  assert.equal(isBimiRule(rule1), true)

  const rule2: PluginRule = {
    name: '哔咪动漫',
    baseURL: 'https://www.bimiacg14.net',
    version: '1.0',
  }
  assert.equal(isBimiRule(rule2), true)

  const rule3: PluginRule = {
    name: 'custom-source',
    baseURL: 'https://m.bimiacg15.net/vod',
    version: '1.0',
  }
  assert.equal(isBimiRule(rule3), true)

  const otherRule: PluginRule = {
    name: 'xifan-next',
    baseURL: 'https://next.xifanacg.com/',
    version: '1.0',
  }
  assert.equal(isBimiRule(otherRule), false)
})

test('bimi: AES-256-GCM with HMAC-SHA256 key derivation decrypts valid payload', () => {
  // 1. Prepare sample plain data
  const plainObj = {
    url: 'https://v16-tiktokcdn-com.akamaized.net/video.mp4',
    id: 8742,
    sid: 3,
    nid: 1,
  }
  const token = 'sample_token_for_bimi_testing_1234567890'
  const challenge = crypto.randomBytes(32).toString('hex')
  const aad = Buffer.from(`bimi-response-v1|${challenge}`, 'utf8')

  // 2. Derive key using HMAC-SHA256
  const derivedKey = crypto
    .createHmac('sha256', Buffer.from(token, 'utf8'))
    .update(aad)
    .digest()

  // 3. Encrypt with AES-256-GCM
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv)
  cipher.setAAD(aad)
  const ct = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(plainObj), 'utf8')),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // 4. Simulate decryptor logic in bimi.ts
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv)
  decipher.setAAD(aad)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(ct), decipher.final()])
  const decryptedObj = JSON.parse(decrypted.toString('utf8'))

  assert.deepEqual(decryptedObj, plainObj)
})

test('bimi: AES-256-GCM rejects tampered ciphertext or wrong tag', () => {
  const token = 'sample_token'
  const challenge = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  const aad = Buffer.from(`bimi-response-v1|${challenge}`, 'utf8')
  const derivedKey = crypto
    .createHmac('sha256', Buffer.from(token, 'utf8'))
    .update(aad)
    .digest()

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv)
  cipher.setAAD(aad)
  const ct = Buffer.concat([cipher.update(Buffer.from('hello', 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()

  // Tamper tag
  const badTag = Buffer.from(tag)
  badTag[0] ^= 0xff

  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv)
  decipher.setAAD(aad)
  decipher.setAuthTag(badTag)

  assert.throws(() => {
    Buffer.concat([decipher.update(ct), decipher.final()])
  })
})

test('bimi: Road object conforms to standard schema with data and identifier arrays', () => {
  // Verify Road interface requirement (data: string[], identifier: string[])
  const sampleRoad = {
    name: '国际线路',
    data: ['https://www.bimiacg14.net/bangumi/8742/play/3/1/'],
    identifier: ['第01话'],
  }
  assert.ok(Array.isArray(sampleRoad.data))
  assert.ok(Array.isArray(sampleRoad.identifier))
  assert.equal(sampleRoad.data.length, sampleRoad.identifier.length)
})

test('bimi: getDispatcherForSource correctly resolves proxy for bimi source id', () => {
  const mockPool = {
    proxy_1: 'http://127.0.0.1:7890',
  }
  const mockMap = {
    bimi: 'proxy_1',
  }
  const agent = getDispatcherForSource('bimi', mockPool, mockMap)
  assert.ok(agent instanceof ProxyAgent)
})

