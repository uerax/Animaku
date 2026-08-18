import { existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { compress } from 'hono/compress'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { config } from './config'
import { initDatabase, closeDatabase } from './db'
import { corsOriginDecision } from './lib/access'
import { bangumiRoutes } from './routes/bangumi'
import { danmakuRoutes } from './routes/danmaku'
import { bilibiliDanmakuRoutes } from './routes/bilibili-danmaku'
import { pluginRoutes } from './routes/plugin'
import { pluginCatalogRoutes } from './routes/plugin-catalog'
import { mediaRoutes } from './routes/media'
import { buildRobotsTxt, buildSitemapXml, resolvePublicOrigin } from './lib/seo-static'

/**
 * Resolve SPA build output. @hono/node-server serveStatic only accepts
 * roots relative to process.cwd(), so we convert absolute → relative.
 *
 * Layouts we must cover:
 * - Docker: WORKDIR /app, SPA at /app/public, but `pnpm --filter @animaku/server start`
 *   sets cwd to /app/apps/server → WEB_DIST=public must still resolve via ../../public
 * - Local prod: cwd apps/server, SPA at apps/web/dist
 * - cwd monorepo root: public/ or apps/web/dist
 */
function resolveWebRootRel(): string | null {
  const env = process.env.WEB_DIST?.trim()
  const isAbs =
    !!env && (env.startsWith('/') || /^[A-Za-z]:[\\/]/.test(env))
  const candidates = [
    // Explicit WEB_DIST (absolute or relative to cwd)
    isAbs ? resolve(env!) : '',
    env ? resolve(process.cwd(), env) : '',
    // Docker / monorepo root public when cwd is apps/server (pnpm filter)
    resolve(process.cwd(), '../../public'),
    resolve(process.cwd(), 'public'),
    resolve(process.cwd(), 'apps/web/dist'),
    resolve(process.cwd(), '../web/dist'),
    // From source (apps/server/src) or bundled dist (apps/server/dist / /app/dist)
    resolve(import.meta.dirname, '../../../public'),
    resolve(import.meta.dirname, '../../web/dist'),
    resolve(import.meta.dirname, '../public'),
    resolve(import.meta.dirname, 'public'),
    resolve(import.meta.dirname, '../web/dist'),
  ].filter(Boolean)

  for (const abs of candidates) {
    if (existsSync(join(abs, 'index.html'))) {
      const rel = relative(process.cwd(), abs)
      // serveStatic rejects absolute paths; empty relative means cwd itself
      return rel === '' ? '.' : rel
    }
  }
  return null
}

const app = new Hono()

const accessLog = logger()
// Skip successful media segment spam (HLS can be 100s of lines per episode)
app.use('*', async (c, next) => {
  const path = c.req.path
  if (path.startsWith('/api/media/proxy')) {
    await next()
    const status = c.res.status
    if (status >= 400) {
      console.log(`<- ${c.req.method} ${path} ${status}`)
    }
    return
  }
  return accessLog(c, next)
})

// Compress API payloads (Danmaku XML/JSON, Bangumi metadata) and SPA static assets.
// Skip binary video streams in media proxy to save CPU.
app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/media/proxy')) {
    return next()
  }
  return compress()(c, next)
})
app.use(
  '*',
  cors({
    // Reflect allowlisted Origin only (no `*`). Same-origin requests omit Origin.
    origin: (origin) => corsOriginDecision(origin),
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Animaku-Proxy-Token',
      'X-Aniku-Proxy-Token',
      'X-Proxy-Token',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  }),
)

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    // Server always has a danmaku credential path (env or agefans fallback)
    danmakuConfigured: true,
    danmakuUsingFallback: !(
      config.dandanAppId?.trim() && config.dandanAppSecret?.trim()
    ),
    /** Who may call media/plugin open-proxy APIs */
    publicProxy: config.publicProxy,
    /**
     * MEDIA_FULL_PROXY: false = m3u8 list only (default);
     * true = may tunnel ts/mp4/full segments (Anime1 etc.)
     */
    mediaFullProxy: config.mediaFullProxy,
    /** Whether the server requires PROXY_TOKEN to unlock server proxy */
    proxyTokenRequired: Boolean(config.proxyToken?.trim()),
  }),
)

/** Verify administrator proxy token for unlocking client server proxy switch */
app.post('/api/proxy/verify', async (c) => {
  const body = (await c.req.json<{ token?: string }>().catch(() => ({}))) as { token?: string }
  const token = (body.token || '').trim()
  const serverToken = (config.proxyToken || '').trim()

  if (!serverToken) {
    // Server does not require a token (no lock needed)
    return c.json({ ok: true, required: false, message: '服务端未设置口令限制' })
  }

  if (token && token === serverToken) {
    return c.json({ ok: true, required: true, message: '口令验证成功' })
  }

  // 300ms anti-bruteforce sleep
  await new Promise((r) => setTimeout(r, 300))
  return c.json({ ok: false, error: 'invalid_token', message: '管理员口令错误' }, 401)
})

app.route('/api/bangumi', bangumiRoutes)
app.route('/api/danmaku', danmakuRoutes)
app.route('/api/danmaku', bilibiliDanmakuRoutes)
app.route('/api/plugin', pluginRoutes)
app.route('/api/plugin', pluginCatalogRoutes)
app.route('/api/media', mediaRoutes)

// Host-aware SEO files (before SPA static so they are not shadowed by public/)
app.get('/robots.txt', (c) => {
  const origin = resolvePublicOrigin(config.siteUrl, c.req)
  return new Response(buildRobotsTxt(origin), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})
app.get('/sitemap.xml', (c) => {
  const origin = resolvePublicOrigin(config.siteUrl, c.req)
  return new Response(buildSitemapXml(origin), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

// Production: one process serves API + Vite build (same origin → no /api proxy needed)
const webRoot = resolveWebRootRel()
if (webRoot) {
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) return next()
    // Dynamic robots/sitemap already handled above
    if (c.req.path === '/robots.txt' || c.req.path === '/sitemap.xml') {
      return next()
    }
    return serveStatic({ root: webRoot })(c, next)
  })
  // SPA fallback (client routes like /subject/123)
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api')) return next()
    if (c.req.path === '/robots.txt' || c.req.path === '/sitemap.xml') {
      return next()
    }
    return serveStatic({ root: webRoot, path: 'index.html' })(c, next)
  })
  console.log(`serving web SPA from ${webRoot}/ (cwd=${process.cwd()})`)
} else {
  console.log(
    'no web dist found (set WEB_DIST or build apps/web) — API-only mode',
  )
}

app.onError((err, c) => {
  // Client aborted / connect timeout while proxying media — not a server bug
  const name = err instanceof Error ? err.name : ''
  const msg = err instanceof Error ? err.message : String(err)
  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    /aborted due to timeout|The operation was aborted/i.test(msg)
  ) {
    console.warn('[server] request aborted/timeout:', msg)
    return c.json(
      { error: 'upstream', message: msg || '请求超时或已取消' },
      504,
    )
  }
  console.error(err)
  const message = err instanceof Error ? err.message : 'Internal Server Error'
  return c.json({ error: 'internal_error', message }, 500)
})

console.log(`animaku server listening on http://${config.host}:${config.port}`)
initDatabase()
const server = serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
})

// @hono/node-server returns Node http.Server — surface bind failures clearly
if (server && typeof (server as { on?: unknown }).on === 'function') {
  ;(server as import('node:http').Server).on('error', (err: NodeJS.ErrnoException) => {
    console.error('[server] listen error:', err.code || err.message, err)
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[server] port ${config.port} is already in use. Stop the other process or change PORT in .env`,
      )
    }
    process.exit(1)
  })
}

// Stream aborts after Response is already handed off may surface as unhandled
// rejections (client seek/cancel, upstream drop, HTTP/2 stream close). Log softly; don't crash.
function isBenignAbort(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as {
    name?: string
    message?: string
    code?: string
    cause?: unknown
  }
  const name = e.name || ''
  const msg = e.message || String(err)
  const code = e.code || ''

  const causeCode =
    e.cause && typeof e.cause === 'object'
      ? (e.cause as { code?: string; message?: string }).code || ''
      : ''
  const causeMsg =
    e.cause && typeof e.cause === 'object'
      ? (e.cause as { code?: string; message?: string }).message || ''
      : ''

  const pattern =
    /aborted due to timeout|The operation was aborted|ECONNRESET|EPIPE|terminated|NGHTTP2_|UND_ERR_|ERR_HTTP2_/i

  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    code === 'ABORT_ERR' ||
    code === 'ERR_HTTP2_STREAM_ERROR' ||
    causeCode === 'ERR_HTTP2_STREAM_ERROR' ||
    pattern.test(msg) ||
    pattern.test(causeMsg)
  )
}

process.on('SIGINT', () => {
  console.log('[server] received SIGINT, closing database...')
  closeDatabase()
  process.exit(0)
})
process.on('SIGTERM', () => {
  console.log('[server] received SIGTERM, closing database...')
  closeDatabase()
  process.exit(0)
})

process.on('uncaughtException', (err) => {
  if (isBenignAbort(err)) {
    console.warn('[server] uncaught abort/timeout (ignored):', err)
    return
  }
  console.error('[server] uncaughtException', err)
})
process.on('unhandledRejection', (err) => {
  if (isBenignAbort(err)) {
    console.warn('[server] unhandled abort/timeout (ignored):', err)
    return
  }
  console.error('[server] unhandledRejection', err)
})
