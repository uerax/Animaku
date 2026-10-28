import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { isStaticAssetPath, accessLogger } from './logger'
import { config } from '../config'

test('isStaticAssetPath: correctly classifies static assets and SPA/API routes', () => {
  // Vite build assets
  assert.equal(isStaticAssetPath('/assets/index-B_xxxx.js'), true)
  assert.equal(isStaticAssetPath('/assets/vendor-1234.css'), true)
  assert.equal(isStaticAssetPath('/assets/font-5678.woff2'), true)
  assert.equal(isStaticAssetPath('/assets/chunk.map'), true)

  // Standard web icons and manifest
  assert.equal(isStaticAssetPath('/favicon.ico'), true)
  assert.equal(isStaticAssetPath('/favicon-16x16.png'), true)
  assert.equal(isStaticAssetPath('/favicon-32x32.png'), true)
  assert.equal(isStaticAssetPath('/site.webmanifest'), true)
  assert.equal(isStaticAssetPath('/apple-touch-icon.png'), true)
  assert.equal(isStaticAssetPath('/android-chrome-192x192.png'), true)
  assert.equal(isStaticAssetPath('/logo.png'), true)

  // Extensions
  assert.equal(isStaticAssetPath('/images/hero.webp'), true)
  assert.equal(isStaticAssetPath('/icons/play.svg'), true)

  // Must NOT classify API endpoints as static assets, even if having extensions or asset in name
  assert.equal(isStaticAssetPath('/api/bangumi/subjects/12345'), false)
  assert.equal(isStaticAssetPath('/api/assets/export.json'), false)
  assert.equal(isStaticAssetPath('/api/danmaku/comment/1'), false)
  assert.equal(isStaticAssetPath('/api/source/resolve'), false)

  // SEO & SPA routes must NOT be filtered
  assert.equal(isStaticAssetPath('/subject/12345'), false)
  assert.equal(isStaticAssetPath('/timeline'), false)
  assert.equal(isStaticAssetPath('/anime'), false)
  assert.equal(isStaticAssetPath('/robots.txt'), false)
  assert.equal(isStaticAssetPath('/sitemap.xml'), false)
  assert.equal(isStaticAssetPath('/llms.txt'), false)
})

test('accessLogger: silences successful /assets/* requests while keeping errors & API logs', async () => {
  const originalLog = console.log
  const loggedLines: string[] = []
  console.log = (msg: unknown) => {
    loggedLines.push(String(msg))
  }

  const prevLogStaticAssets = config.logStaticAssets

  try {
    config.logStaticAssets = false

    const app = new Hono()
    app.use('*', accessLogger())

    // Mock routes
    app.get('/assets/index-test.js', (c) => c.text('console.log("app")', 200))
    app.get('/assets/missing.js', (c) => c.text('not found', 404))
    app.get('/api/test', (c) => c.json({ ok: true }, 200))

    // 1. Successful /assets/ chunk should be completely SILENT
    loggedLines.length = 0
    const resAsset = await app.request('/assets/index-test.js')
    assert.equal(resAsset.status, 200)
    assert.equal(loggedLines.length, 0, 'Successful /assets/ request should not be logged')

    // 2. Failed /assets/ chunk (404) should be LOGGED for debugging
    loggedLines.length = 0
    const resMissing = await app.request('/assets/missing.js')
    assert.equal(resMissing.status, 404)
    assert.equal(loggedLines.length, 1, '404 on /assets/ must still be logged')
    assert.match(loggedLines[0], /\/assets\/missing\.js/)

    // 3. Normal API route should be LOGGED
    loggedLines.length = 0
    const resApi = await app.request('/api/test')
    assert.equal(resApi.status, 200)
    assert.equal(loggedLines.length, 1, 'API request must be logged')
    assert.match(loggedLines[0], /\/api\/test/)

    // 4. When LOG_STATIC_ASSETS is explicitly true, /assets/ 200 is LOGGED
    config.logStaticAssets = true
    loggedLines.length = 0
    const resAssetAllowed = await app.request('/assets/index-test.js')
    assert.equal(resAssetAllowed.status, 200)
    assert.equal(loggedLines.length, 1, 'Should log /assets/ when logStaticAssets is enabled')
    assert.match(loggedLines[0], /\/assets\/index-test\.js/)
  } finally {
    console.log = originalLog
    config.logStaticAssets = prevLogStaticAssets
  }
})
