import test from 'node:test'
import assert from 'node:assert/strict'
import type { PluginRule } from '@animaku/shared'
import { isAnimoeRule } from './animoe'
import { readTextLimited } from './media/m3u8-pipeline'

test('animoe: isAnimoeRule correctly matches rule variations', () => {
  const rule1: PluginRule = {
    name: 'animoe',
    baseURL: 'https://animoe.org/',
    version: '1.0',
  }
  assert.equal(isAnimoeRule(rule1), true)

  const rule2: PluginRule = {
    name: 'Animoe动漫',
    baseURL: 'https://animoe.org',
    version: '1.0',
  }
  assert.equal(isAnimoeRule(rule2), true)

  const rule3: PluginRule = {
    name: 'custom-source',
    baseURL: 'https://sub.animoe.org/vod',
    version: '1.0',
  }
  assert.equal(isAnimoeRule(rule3), true)

  const otherRule: PluginRule = {
    name: 'tvtfun',
    baseURL: 'https://tvtfun.net/',
    version: '1.0',
  }
  assert.equal(isAnimoeRule(otherRule), false)
})

test('animoe: readTextLimited auto-decrypts enc! XOR obfuscated M3U8 stream', async () => {
  // Construct an enc! payload with known raw content: "#EXTM3U\n#EXT-X-VERSION:7\n"
  const rawExpected = '#EXTM3U\n#EXT-X-VERSION:7\n'
  const textBytes = new TextEncoder().encode(rawExpected)

  // enc! XOR encryption logic matching AssPlayer
  const mask = [144, 223, 214, 167, 22, 76, 53]
  const key = 165
  const encrypted = new Uint8Array(3 + textBytes.length)
  encrypted[0] = 101 // 'e'
  encrypted[1] = 110 // 'n'
  encrypted[2] = 99  // 'c'

  for (let n = 0; n < textBytes.length; n++) {
    const encryptedIdx = n + 3
    encrypted[encryptedIdx] =
      textBytes[n] ^ mask[encryptedIdx % 10 < mask.length ? encryptedIdx % 10 : mask.length - 1] ^ key
  }

  const mockResponse = new Response(encrypted, {
    headers: { 'content-type': 'application/x-mpegURL' },
  })

  const decryptedText = await readTextLimited(mockResponse)
  assert.equal(decryptedText, rawExpected)
})

test('animoe: readTextLimited passes plain #EXTM3U without mutation', async () => {
  const plainM3u8 = '#EXTM3U\n#EXTINF:10,\nhttps://example.com/segment.ts\n'
  const mockResponse = new Response(plainM3u8, {
    headers: { 'content-type': 'application/vnd.apple.mpegurl' },
  })
  const text = await readTextLimited(mockResponse)
  assert.equal(text, plainM3u8)
})
