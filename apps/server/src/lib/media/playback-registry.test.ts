import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PlaybackRegistry } from './playback-registry'
import { kvCache } from '../../db/repositories/kv-cache'

test('playback-registry: asset registration, encryption & retrieval', () => {
  const key = randomBytes(32)
  const registry = new PlaybackRegistry({ key, kv: kvCache })

  const cookieData = 'v=secret_cookie_val; cf_clearance=abcdef'
  const asset = registry.registerAsset({
    source: 'xifan',
    baseUrl: 'https://cdn1.xifan.cc/20240101/index.m3u8',
    trustLevel: 'official',
    publicHeaders: {
      Referer: 'https://xifan.cc/',
      'User-Agent': 'Animaku/1.4',
    },
    credentials: cookieData,
    ttlMs: 3600 * 1000,
  })

  assert.equal(asset.assetId.startsWith('ast_'), true)
  assert.equal(asset.source, 'xifan')
  assert.equal(asset.status, 'active')
  assert.equal(asset.baseUrl, 'https://cdn1.xifan.cc/20240101/index.m3u8')
  assert.deepEqual(asset.publicHeaders, {
    Referer: 'https://xifan.cc/',
    'User-Agent': 'Animaku/1.4',
  })

  // Credentials must be stored in encrypted form, never in plain text
  assert.notEqual(asset.encryptedCredentials, cookieData)
  assert.equal(asset.encryptedCredentials?.startsWith('v1.'), true)

  // Decrypt credentials
  const decrypted = registry.getDecryptedCredentials<string>(asset)
  assert.equal(decrypted, cookieData)

  // Retrieve from L1
  const retrieved = registry.getAsset(asset.assetId)
  assert.deepEqual(retrieved, asset)

  // URL resolution
  const resolvedMaster = registry.resolveAssetUrl(asset, '')
  assert.equal(resolvedMaster, 'https://cdn1.xifan.cc/20240101/index.m3u8')

  const resolvedChild = registry.resolveAssetUrl(asset, '720p.m3u8')
  assert.equal(resolvedChild, 'https://cdn1.xifan.cc/20240101/720p.m3u8')

  const resolvedSeg = registry.resolveAssetUrl(asset, 'chunks/seg-001.ts')
  assert.equal(resolvedSeg, 'https://cdn1.xifan.cc/20240101/chunks/seg-001.ts')
})

test('playback-registry: L2 SQLite persistence & server restart simulation', () => {
  const key = randomBytes(32)
  const registry = new PlaybackRegistry({ key, kv: kvCache })

  const asset = registry.registerAsset({
    source: 'anime1',
    baseUrl: 'https://v.anime1.me/watch/123/stream.m3u8',
    credentials: 'auth_session=998877',
  })

  // Simulate server restart by clearing in-memory L1 cache
  registry.clearL1Caches()

  // Must successfully load from L2 SQLite
  const fromL2 = registry.getAsset(asset.assetId)
  assert.ok(fromL2)
  assert.equal(fromL2.assetId, asset.assetId)
  assert.equal(fromL2.source, 'anime1')
  assert.equal(fromL2.baseUrl, asset.baseUrl)

  // Decryption of credentials still works after reload
  const decrypted = registry.getDecryptedCredentials<string>(fromL2)
  assert.equal(decrypted, 'auth_session=998877')
})

test('playback-registry: ticket issuance, type checking and verification pipeline', () => {
  const key = randomBytes(32)
  const registry = new PlaybackRegistry({ key, kv: kvCache })

  const asset = registry.registerAsset({
    source: 'cycani',
    baseUrl: 'https://cdn.cycani.com/hls/master.m3u8',
  })

  // 1. Issue playlist ticket
  const playlistToken = registry.issueTicket({
    aid: asset.assetId,
    src: 'cycani',
    typ: 'playlist',
  })
  assert.equal(playlistToken.startsWith('v1.'), true)

  const verifyPlaylist = registry.verifyTicket(playlistToken, 'playlist')
  assert.equal(verifyPlaylist.valid, true)
  if (verifyPlaylist.valid) {
    assert.equal(verifyPlaylist.payload.v, 1)
    assert.equal(verifyPlaylist.payload.aud, 'media')
    assert.equal(verifyPlaylist.payload.aid, asset.assetId)
    assert.equal(verifyPlaylist.payload.typ, 'playlist')
    assert.equal(verifyPlaylist.normalizedSub, '')
    assert.equal(verifyPlaylist.asset.assetId, asset.assetId)
  }

  // 2. Type mismatch defense
  const typeMismatchResult = registry.verifyTicket(playlistToken, 'segment')
  assert.equal(typeMismatchResult.valid, false)
  if (!typeMismatchResult.valid) {
    assert.equal(typeMismatchResult.code, 'TYPE_MISMATCH')
  }

  // 3. Issue segment ticket with safe relative sub path
  const segmentToken = registry.issueTicket({
    aid: asset.assetId,
    src: 'cycani',
    typ: 'segment',
    sub: 'ep01/chunk_001.ts',
  })

  const verifySegment = registry.verifyTicket(segmentToken, 'segment')
  assert.equal(verifySegment.valid, true)
  if (verifySegment.valid) {
    assert.equal(verifySegment.payload.typ, 'segment')
    assert.equal(verifySegment.normalizedSub, 'ep01/chunk_001.ts')
  }

  // 4. Issue key ticket
  const keyToken = registry.issueTicket({
    aid: asset.assetId,
    src: 'cycani',
    typ: 'key',
    sub: 'enc.key',
  })
  const verifyKey = registry.verifyTicket(keyToken, 'key')
  assert.equal(verifyKey.valid, true)
  if (verifyKey.valid) {
    assert.equal(verifyKey.payload.typ, 'key')
    assert.equal(verifyKey.normalizedSub, 'enc.key')
  }
})

test('playback-registry: sub path traversal attack rejected on issuance', () => {
  const key = randomBytes(32)
  const registry = new PlaybackRegistry({ key, kv: kvCache })

  const asset = registry.registerAsset({
    source: 'xifan',
    baseUrl: 'https://cdn.example.com/live.m3u8',
  })

  // Directory traversal
  assert.throws(() => {
    registry.issueTicket({
      aid: asset.assetId,
      src: 'xifan',
      typ: 'segment',
      sub: '../evil.ts',
    })
  }, /unsafe sub path/i)

  // Protocol injection
  assert.throws(() => {
    registry.issueTicket({
      aid: asset.assetId,
      src: 'xifan',
      typ: 'segment',
      sub: 'http://attacker.com/evil.ts',
    })
  }, /unsafe sub path/i)
})

test('playback-registry: token expiration rejection', async () => {
  const key = randomBytes(32)
  const registry = new PlaybackRegistry({ key, kv: kvCache })

  const asset = registry.registerAsset({
    source: 'moonci',
    baseUrl: 'https://cdn.moonci.com/play.m3u8',
  })

  // Issue ticket with 1 second TTL
  const token = registry.issueTicket({
    aid: asset.assetId,
    src: 'moonci',
    typ: 'playlist',
    ttlSec: 1,
  })

  // Initially valid
  const initial = registry.verifyTicket(token)
  assert.equal(initial.valid, true)

  // Wait 1.1 seconds for token to expire
  await new Promise((r) => setTimeout(r, 1100))

  const expired = registry.verifyTicket(token)
  assert.equal(expired.valid, false)
  if (!expired.valid) {
    assert.equal(expired.code, 'TOKEN_EXPIRED')
  }
})

test('playback-registry: double-tier JTI revocation & reboot persistence', () => {
  const key = randomBytes(32)
  const registry = new PlaybackRegistry({ key, kv: kvCache })

  const asset = registry.registerAsset({
    source: 'tvtfun',
    baseUrl: 'https://cdn.tvtfun.com/stream.m3u8',
  })

  const token = registry.issueTicket({
    aid: asset.assetId,
    src: 'tvtfun',
    typ: 'playlist',
  })

  const verified = registry.verifyTicket(token)
  assert.equal(verified.valid, true)
  if (!verified.valid) return

  const { jti, exp } = verified.payload

  // 1. Revoke the token
  registry.revokeTicket(jti, exp)

  // 2. Immediate rejection via L1 memory
  const revokedL1 = registry.verifyTicket(token)
  assert.equal(revokedL1.valid, false)
  if (!revokedL1.valid) {
    assert.equal(revokedL1.code, 'TOKEN_REVOKED')
  }

  // 3. Clear L1 memory to simulate server reboot
  registry.clearL1Caches()

  // 4. Must still be rejected via L2 SQLite persistence!
  const revokedL2 = registry.verifyTicket(token)
  assert.equal(revokedL2.valid, false)
  if (!revokedL2.valid) {
    assert.equal(revokedL2.code, 'TOKEN_REVOKED')
  }
})

test('playback-registry: whole playback session cascade revocation & blocking', () => {
  const key = randomBytes(32)
  const registry = new PlaybackRegistry({ key, kv: kvCache })

  const asset = registry.registerAsset({
    source: 'xifan',
    baseUrl: 'https://cdn.xifan.cc/series/ep1.m3u8',
  })

  const playlistToken = registry.issueTicket({
    aid: asset.assetId,
    src: 'xifan',
    typ: 'playlist',
  })
  const segToken = registry.issueTicket({
    aid: asset.assetId,
    src: 'xifan',
    typ: 'segment',
    sub: 'seg-001.ts',
  })

  assert.equal(registry.verifyTicket(playlistToken).valid, true)
  assert.equal(registry.verifyTicket(segToken).valid, true)

  // 1. Revoke the entire asset session
  const revokeSuccess = registry.revokeAsset(asset.assetId)
  assert.equal(revokeSuccess, true)

  const playlistRevoked = registry.verifyTicket(playlistToken)
  assert.equal(playlistRevoked.valid, false)
  if (!playlistRevoked.valid) {
    assert.equal(playlistRevoked.code, 'ASSET_REVOKED')
  }

  const segRevoked = registry.verifyTicket(segToken)
  assert.equal(segRevoked.valid, false)
  if (!segRevoked.valid) {
    assert.equal(segRevoked.code, 'ASSET_REVOKED')
  }

  // 2. Block the asset session
  const blockSuccess = registry.blockAsset(asset.assetId)
  assert.equal(blockSuccess, true)

  const playlistBlocked = registry.verifyTicket(playlistToken)
  assert.equal(playlistBlocked.valid, false)
  if (!playlistBlocked.valid) {
    assert.equal(playlistBlocked.code, 'ASSET_BLOCKED')
  }
})
