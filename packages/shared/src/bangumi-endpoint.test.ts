import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BANGUMI_IMAGE_HOST_BANGUMI,
  BANGUMI_IMAGE_HOST_MIRROR,
  resolveBangumiImagePreset,
  resolveBangumiApiPreset,
  bangumiImageUrl,
  toBangumiOfficialImageUrl,
  setBangumiImageHost,
} from './bangumi-endpoint.ts'

test('resolveBangumiImagePreset: parses mirror and official keywords correctly', () => {
  assert.equal(resolveBangumiImagePreset('mirror'), BANGUMI_IMAGE_HOST_MIRROR)
  assert.equal(resolveBangumiImagePreset('proxy'), BANGUMI_IMAGE_HOST_MIRROR)
  assert.equal(resolveBangumiImagePreset('bgmimg.anibt.net'), BANGUMI_IMAGE_HOST_MIRROR)
  assert.equal(resolveBangumiImagePreset('official'), BANGUMI_IMAGE_HOST_BANGUMI)
  assert.equal(resolveBangumiImagePreset('direct'), BANGUMI_IMAGE_HOST_BANGUMI)
  assert.equal(resolveBangumiImagePreset('lain.bgm.tv'), BANGUMI_IMAGE_HOST_BANGUMI)
  assert.equal(resolveBangumiImagePreset('https://custom.img.cdn/'), 'custom.img.cdn')
  assert.equal(resolveBangumiImagePreset(''), BANGUMI_IMAGE_HOST_MIRROR)
})

test('resolveBangumiApiPreset: parses mirror and official keywords correctly', () => {
  assert.equal(resolveBangumiApiPreset('mirror'), 'bgmapi.anibt.net')
  assert.equal(resolveBangumiApiPreset('proxy'), 'bgmapi.anibt.net')
  assert.equal(resolveBangumiApiPreset('official'), 'api.bgm.tv')
  assert.equal(resolveBangumiApiPreset('direct'), 'api.bgm.tv')
  assert.equal(resolveBangumiApiPreset('api.bgm.tv'), 'api.bgm.tv')
})

test('bangumiImageUrl: rewrites known host to current or override host', () => {
  setBangumiImageHost(BANGUMI_IMAGE_HOST_MIRROR)
  assert.equal(
    bangumiImageUrl('https://lain.bgm.tv/pic/cover/l/1.jpg'),
    'https://bgmimg.anibt.net/pic/cover/l/1.jpg',
  )
  assert.equal(
    bangumiImageUrl('https://lain.bgm.tv/pic/cover/l/1.jpg', BANGUMI_IMAGE_HOST_BANGUMI),
    'https://lain.bgm.tv/pic/cover/l/1.jpg',
  )
  // Non-bangumi URLs remain untouched
  assert.equal(
    bangumiImageUrl('https://img.thirdparty.com/pic.jpg'),
    'https://img.thirdparty.com/pic.jpg',
  )
})

test('toBangumiOfficialImageUrl: forces official lain.bgm.tv host', () => {
  assert.equal(
    toBangumiOfficialImageUrl('https://bgmimg.anibt.net/pic/cover/l/2.jpg'),
    'https://lain.bgm.tv/pic/cover/l/2.jpg',
  )
})
