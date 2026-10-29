import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  validateIconBuffer,
  validateAnnouncementImageBuffer,
  saveAnnouncementImage,
  deleteAnnouncementHistoryItem,
  getSiteConfig,
  saveSiteConfig,
  saveCustomFavicon,
  resetCustomFavicon,
  hasCustomFavicon,
  hasCustomIcon,
  CUSTOM_ICON_FILENAMES,
  generateIconSuite,
  resetAllSiteConfig,
} from './site-config'
import { siteRoutes, adminSiteRoutes } from '../routes/site'
import { config } from '../config'

test('validateIconBuffer: correctly identifies valid image magic bytes', () => {
  // ICO: 00 00 01 00
  const icoBuf = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x20, 0x20])
  const icoRes = validateIconBuffer(icoBuf)
  assert.equal(icoRes.valid, true)
  assert.equal(icoRes.mime, 'image/x-icon')

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  const pngRes = validateIconBuffer(pngBuf)
  assert.equal(pngRes.valid, true)
  assert.equal(pngRes.mime, 'image/png')

  // JPEG: FF D8 FF
  const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
  const jpegRes = validateIconBuffer(jpegBuf)
  assert.equal(jpegRes.valid, true)
  assert.equal(jpegRes.mime, 'image/jpeg')

  // WebP: RIFF (bytes 0-3) ... WEBP (bytes 8-11)
  const webpBuf = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ])
  const webpRes = validateIconBuffer(webpBuf)
  assert.equal(webpRes.valid, true)
  assert.equal(webpRes.mime, 'image/webp')
})

test('validateIconBuffer: blocks SVG, text, empty, and oversized files', () => {
  // SVG text
  const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  const svgRes = validateIconBuffer(svgBuf)
  assert.equal(svgRes.valid, false)

  // Plain text
  const txtBuf = Buffer.from('hello world')
  const txtRes = validateIconBuffer(txtBuf)
  assert.equal(txtRes.valid, false)

  // Oversized (> 2MB)
  const bigBuf = Buffer.alloc(2 * 1024 * 1024 + 1)
  bigBuf[0] = 0x89
  bigBuf[1] = 0x50
  bigBuf[2] = 0x4e
  bigBuf[3] = 0x47
  bigBuf[4] = 0x0d
  bigBuf[5] = 0x0a
  bigBuf[6] = 0x1a
  bigBuf[7] = 0x0a
  const bigRes = validateIconBuffer(bigBuf)
  assert.equal(bigRes.valid, false)
  assert.match(bigRes.error || '', /超出上限/)
})

test('site-config: saves and reloads config', () => {
  const original = getSiteConfig()

  saveSiteConfig({
    siteName: '我的测试站',
    siteTagline: '测试标语',
    iconMode: 'url',
    iconUrl: 'https://example.com/logo.png',
  })

  const updated = getSiteConfig()
  assert.equal(updated.siteName, '我的测试站')
  assert.equal(updated.siteTagline, '测试标语')
  assert.equal(updated.iconMode, 'url')
  assert.equal(updated.iconUrl, 'https://example.com/logo.png')

  // Clean up
  saveSiteConfig({
    siteName: original.siteName,
    siteTagline: original.siteTagline,
    iconMode: original.iconMode,
    iconUrl: original.iconUrl,
  })
})

test('adminSiteRoutes: /verify rejects unauthorized and accepts authorized request', async () => {
  // Unauthorized
  const res1 = await adminSiteRoutes.request('/verify', {
    method: 'POST',
    headers: {
      'X-Admin-Secret': 'wrong-password-12345',
      'x-forwarded-for': '198.51.100.1',
    },
  })
  assert.equal(res1.status, 401)

  // Authorized (if ADMIN_SECRET is configured or via loopback)
  const secret = config.adminSecret || 'test-secret'
  config.adminSecret = secret
  try {
    const res2 = await adminSiteRoutes.request('/verify', {
      method: 'POST',
      headers: {
        'X-Admin-Secret': secret,
      },
    })
    assert.equal(res2.status, 200)
    const json = (await res2.json()) as { ok: boolean }
    assert.equal(json.ok, true)
  } finally {
    config.adminSecret = ''
  }
})

test('site-config: resetAllSiteConfig clears all custom settings and favicon', () => {
  saveSiteConfig({
    siteName: '临时站名',
    siteTagline: '临时标语',
    iconMode: 'url',
    iconUrl: 'https://example.com/test.png',
  })

  const resetRes = adminSiteRoutes.request('/site/reset-all', {
    method: 'POST',
    headers: {
      'X-Admin-Secret': 'loopback-allowed',
    },
  })

  const cfg = getSiteConfig()
  assert.equal(cfg.siteName, undefined)
  assert.equal(cfg.siteTagline, undefined)
  assert.equal(cfg.iconMode, 'default')
  assert.equal(cfg.iconUrl, undefined)
})

test('site-config: defaultSettings saving, fetching and resetting', async () => {
  const secret = 'test-secret'
  config.adminSecret = secret
  try {
    const res = await adminSiteRoutes.request('/site/default-settings', {
      method: 'POST',
      headers: {
        'X-Admin-Secret': secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        theme: 'dark',
        bangumiImageHost: 'https://img.example.com',
        player: { speed: 1.25, autoplay: true },
        nav: { openInNewTab: false },
      }),
    })
    assert.equal(res.status, 200)
    const json = (await res.json()) as { ok: boolean; data: any }
    assert.equal(json.ok, true)
    assert.equal(json.data.theme, 'dark')
    assert.equal(json.data.bangumiImageHost, 'https://img.example.com')
    assert.equal(json.data.player.speed, 1.25)

    const cfg = getSiteConfig()
    assert.equal(cfg.defaultSettings?.theme, 'dark')

    const getRes = await siteRoutes.request('/config')
    const getJson = (await getRes.json()) as { ok: boolean; defaultSettings: any }
    assert.equal(getJson.ok, true)
    assert.equal(getJson.defaultSettings?.theme, 'dark')

    // Clean up
    saveSiteConfig({ defaultSettings: undefined })
  } finally {
    config.adminSecret = ''
  }
})

test('site-config: generateIconSuite and saveCustomFavicon creates unified multi-size icon suite', async () => {
  // Use a small valid 1x1 transparent PNG buffer to test the pipeline
  const testPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )

  const suite = await generateIconSuite(testPng)
  assert.ok(suite['favicon.ico'].length > 0)
  assert.ok(suite['favicon-16x16.png'].length > 0)
  assert.ok(suite['favicon-32x32.png'].length > 0)
  assert.ok(suite['apple-touch-icon.png'].length > 0)
  assert.ok(suite['android-chrome-192x192.png'].length > 0)
  assert.ok(suite['android-chrome-512x512.png'].length > 0)
  assert.ok(suite['logo.png'].length > 0)

  // Test ICO magic header
  assert.equal(suite['favicon.ico'][0], 0x00)
  assert.equal(suite['favicon.ico'][1], 0x00)
  assert.equal(suite['favicon.ico'][2], 0x01)
  assert.equal(suite['favicon.ico'][3], 0x00)

  // Save custom favicon suite
  await saveCustomFavicon(testPng)
  const cfg = getSiteConfig()
  assert.equal(cfg.iconMode, 'upload')
  assert.ok(typeof cfg.iconUpdatedAt === 'number' && cfg.iconUpdatedAt > 0)

  for (const filename of CUSTOM_ICON_FILENAMES) {
    assert.equal(hasCustomIcon(filename), true, `Expected ${filename} to exist`)
  }
  assert.equal(hasCustomFavicon(), true)

  // Reset custom favicon
  resetCustomFavicon()
  const resetCfg = getSiteConfig()
  assert.equal(resetCfg.iconMode, 'default')
  assert.ok(resetCfg.iconUpdatedAt! >= cfg.iconUpdatedAt!)

  for (const filename of CUSTOM_ICON_FILENAMES) {
    assert.equal(hasCustomIcon(filename), false, `Expected ${filename} to be removed`)
  }

  // Clean up test state so it does not pollute other tests
  resetAllSiteConfig()
})

test('validateAnnouncementImageBuffer: correctly verifies PNG/JPEG/WebP/GIF and blocks non-images', () => {
  // GIF: GIF89a
  const gifBuf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00])
  const gifRes = validateAnnouncementImageBuffer(gifBuf)
  assert.equal(gifRes.valid, true)
  assert.equal(gifRes.mime, 'image/gif')
  assert.equal(gifRes.ext, 'gif')

  // PNG
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const pngRes = validateAnnouncementImageBuffer(pngBuf)
  assert.equal(pngRes.valid, true)
  assert.equal(pngRes.mime, 'image/png')
  assert.equal(pngRes.ext, 'png')

  // Invalid: HTML / SVG
  const htmlBuf = Buffer.from('<html><head></head><body>bad</body></html>')
  const htmlRes = validateAnnouncementImageBuffer(htmlBuf)
  assert.equal(htmlRes.valid, false)
})

test('site-config: announcement save, history archiving, deletion, and public endpoint', async () => {
  // 1. Initially disabled
  saveSiteConfig({ announcementEnabled: false, announcement: null, announcementHistory: [] })
  const initialCfg = getSiteConfig()
  assert.equal(initialCfg.announcementEnabled, false)

  // 2. Reject enabling when all fields are empty
  const emptyRes = await adminSiteRoutes.request('/site/announcement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, title: '', content: '', imageUrl: '' }),
  })
  assert.equal(emptyRes.status, 400)
  const emptyJson = (await emptyRes.json()) as { error: string }
  assert.match(emptyJson.error, /至少需要填写一项/)

  // 3. Save a valid announcement with title only
  const saveRes = await adminSiteRoutes.request('/site/announcement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: true,
      title: '系统维护通知',
      content: '今晚 12 点进行线路切换',
      imageUrl: '',
      imageLink: 'https://example.com/notice',
    }),
  })
  assert.equal(saveRes.status, 200)
  const saveJson = (await saveRes.json()) as { ok: boolean; data: { announcement: { id: string; title: string } } }
  assert.equal(saveJson.ok, true)
  assert.equal(saveJson.data.announcement.title, '系统维护通知')
  const annId = saveJson.data.announcement.id
  assert.ok(annId)

  // Verify public endpoint returns the announcement
  const publicRes = await siteRoutes.request('/config')
  assert.equal(publicRes.status, 200)
  const publicJson = (await publicRes.json()) as {
    ok: boolean
    announcementEnabled: boolean
    announcement: { id: string; title: string }
  }
  assert.equal(publicJson.announcementEnabled, true)
  assert.equal(publicJson.announcement.id, annId)
  assert.equal(publicJson.announcement.title, '系统维护通知')

  // Verify history contains this announcement
  const histRes = await adminSiteRoutes.request('/site/announcement-history')
  const histJson = (await histRes.json()) as { ok: boolean; data: Array<{ id: string; title: string }> }
  assert.equal(histJson.ok, true)
  assert.ok(histJson.data.some((h) => h.id === annId))

  // Delete this announcement from history
  const delRes = await adminSiteRoutes.request(`/site/announcement-history/${annId}`, {
    method: 'DELETE',
  })
  assert.equal(delRes.status, 200)
  const delJson = (await delRes.json()) as { ok: boolean; data: Array<{ id: string }> }
  assert.ok(!delJson.data.some((h) => h.id === annId))

  // Clean up
  resetAllSiteConfig()
})


