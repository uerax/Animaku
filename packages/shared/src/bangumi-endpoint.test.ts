import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BANGUMI_IMAGE_HOST_BANGUMI,
  BANGUMI_IMAGE_HOST_MIRROR,
  DEFAULT_BANGUMI_IMAGE_HOST,
  resolveBangumiImagePreset,
  resolveBangumiApiPreset,
  bangumiImageUrl,
  toBangumiOfficialImageUrl,
  setBangumiImageHost,
  extractImagePath,
  buildImageUrl,
  preferResizedCover,
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

test('bangumiImageUrl: rewrites known host to current or override host and enforces https', () => {
  setBangumiImageHost(BANGUMI_IMAGE_HOST_MIRROR)
  assert.equal(
    bangumiImageUrl('https://lain.bgm.tv/pic/cover/l/1.jpg'),
    'https://bgmimg.anibt.net/pic/cover/l/1.jpg',
  )
  assert.equal(
    bangumiImageUrl('http://lain.bgm.tv/pic/cover/l/1.jpg'),
    'https://bgmimg.anibt.net/pic/cover/l/1.jpg',
  )
  assert.equal(
    bangumiImageUrl('//lain.bgm.tv/pic/cover/l/1.jpg'),
    'https://bgmimg.anibt.net/pic/cover/l/1.jpg',
  )
  assert.equal(
    bangumiImageUrl('http://lain.bgm.tv/pic/cover/l/1.jpg', BANGUMI_IMAGE_HOST_BANGUMI),
    'https://lain.bgm.tv/pic/cover/l/1.jpg',
  )
  // Non-bangumi URLs remain untouched
  assert.equal(
    bangumiImageUrl('https://img.thirdparty.com/pic.jpg'),
    'https://img.thirdparty.com/pic.jpg',
  )
})

test('preferResizedCover: only resizes large/original covers and keeps pre-sized thumbs safe', () => {
  setBangumiImageHost(BANGUMI_IMAGE_HOST_MIRROR)
  // 1. Large original cover -> properly resized with /r/400/
  assert.equal(
    preferResizedCover('http://lain.bgm.tv/pic/cover/l/ce/e2/456080_C4q4C.jpg', 400),
    'https://bgmimg.anibt.net/r/400/pic/cover/l/ce/e2/456080_C4q4C.jpg',
  )
  // 2. Pre-sized common cover (/cover/c/) -> MUST NOT add /r/400/ (prevents HTTP 400)
  assert.equal(
    preferResizedCover('http://lain.bgm.tv/pic/cover/c/ce/e2/456080_C4q4C.jpg', 400),
    'https://bgmimg.anibt.net/pic/cover/c/ce/e2/456080_C4q4C.jpg',
  )
  // 3. Pre-sized medium cover (/cover/m/) -> MUST NOT add /r/400/
  assert.equal(
    preferResizedCover('https://lain.bgm.tv/pic/cover/m/ce/e2/456080_C4q4C.jpg', 400),
    'https://bgmimg.anibt.net/pic/cover/m/ce/e2/456080_C4q4C.jpg',
  )
  // 4. Already resized cover (/r/400/pic/cover/l/) -> keeps /r/400/
  assert.equal(
    preferResizedCover('https://lain.bgm.tv/r/400/pic/cover/l/ce/e2/456080_C4q4C.jpg', 400),
    'https://bgmimg.anibt.net/r/400/pic/cover/l/ce/e2/456080_C4q4C.jpg',
  )
})

test('toBangumiOfficialImageUrl: forces official lain.bgm.tv host', () => {
  assert.equal(
    toBangumiOfficialImageUrl('https://bgmimg.anibt.net/pic/cover/l/2.jpg'),
    'https://lain.bgm.tv/pic/cover/l/2.jpg',
  )
})

test('extractImagePath: extracts standard pathname across different domains and protocols', () => {
  assert.equal(
    extractImagePath('https://lain.bgm.tv/pic/user/l/000/74/93/749305.jpg?r=1708829256&hd=1'),
    '/pic/user/l/000/74/93/749305.jpg?r=1708829256&hd=1',
  )
  assert.equal(
    extractImagePath('https://bgmimg.anibt.net/pic/cover/l/6b/01/100403_R8KN2.jpg'),
    '/pic/cover/l/6b/01/100403_R8KN2.jpg',
  )
  assert.equal(
    extractImagePath('//lain.bgm.tv/pic/user/m/icon.jpg'),
    '/pic/user/m/icon.jpg',
  )
  assert.equal(
    extractImagePath('/pic/cover/c/7f/41/43210_xxx.jpg'),
    '/pic/cover/c/7f/41/43210_xxx.jpg',
  )
  assert.equal(
    extractImagePath('pic/user/s/icon.jpg'),
    '/pic/user/s/icon.jpg',
  )
  assert.equal(extractImagePath(''), '')
  assert.equal(extractImagePath(null), '')
})

test('buildImageUrl: constructs https://${host}${path} cleanly with mirror default fallback', () => {
  assert.equal(
    buildImageUrl('/pic/user/l/1.jpg'),
    `https://${DEFAULT_BANGUMI_IMAGE_HOST}/pic/user/l/1.jpg`,
  )
  assert.equal(
    buildImageUrl('/pic/user/l/1.jpg', 'lain.bgm.tv'),
    'https://lain.bgm.tv/pic/user/l/1.jpg',
  )
  assert.equal(
    buildImageUrl('/pic/user/l/1.jpg', 'bgmimg.anibt.net'),
    'https://bgmimg.anibt.net/pic/user/l/1.jpg',
  )
  assert.equal(
    buildImageUrl('pic/user/l/1.jpg', 'https://custom.proxy.com/'),
    'https://custom.proxy.com/pic/user/l/1.jpg',
  )
  assert.equal(buildImageUrl('', 'lain.bgm.tv'), '')
})
