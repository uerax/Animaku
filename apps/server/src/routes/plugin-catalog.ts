import { Hono } from 'hono'
import type { PluginCatalogItem } from '@animaku/shared'
import { parsePluginRule } from '@animaku/shared'
import { config } from '../config'

export const pluginCatalogRoutes = new Hono()

const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/

function bases(shop: 'anibaka' | 'kazumi', preferMirror: boolean): string[] {
  if (shop === 'anibaka') {
    const primary = config.anibakaShop.endsWith('/')
      ? config.anibakaShop
      : `${config.anibakaShop}/`
    const mirror = config.anibakaShopMirror.endsWith('/')
      ? config.anibakaShopMirror
      : `${config.anibakaShopMirror}/`
    return preferMirror ? [mirror, primary] : [primary, mirror]
  }

  const primary = config.pluginShop.endsWith('/')
    ? config.pluginShop
    : `${config.pluginShop}/`
  const mirror = config.pluginShopMirror.endsWith('/')
    ? config.pluginShopMirror
    : `${config.pluginShopMirror}/`
  return preferMirror ? [mirror, primary] : [primary, mirror]
}

async function fetchTextFromShop(
  shop: 'anibaka' | 'kazumi',
  path: string,
  preferMirror: boolean,
): Promise<{ text: string; source: string }> {
  const errors: string[] = []
  for (const base of bases(shop, preferMirror)) {
    const url = `${base}${path.replace(/^\//, '')}`
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': config.defaultUserAgent,
          Accept: 'application/json,text/plain,*/*',
        },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) {
        errors.push(`${url} → HTTP ${res.status}`)
        continue
      }
      const text = await res.text()
      if (!text.trim()) {
        errors.push(`${url} → empty body`)
        continue
      }
      return { text, source: base }
    } catch (e) {
      errors.push(`${url} → ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw new Error(`无法访问规则仓库: ${errors.join('; ')}`)
}

function parseKazumiCatalog(raw: string): PluginCatalogItem[] {
  const data = JSON.parse(raw) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Kazumi 规则目录格式错误：根节点必须是数组')
  }
  const items: PluginCatalogItem[] = []
  for (const value of data) {
    if (!value || typeof value !== 'object') continue
    const j = value as Record<string, unknown>
    const name = String(j.name ?? '').trim()
    if (!name) continue
    const rawConfig = j.antiCrawlerConfig
    const antiCrawlerEnabled =
      rawConfig && typeof rawConfig === 'object'
        ? Boolean((rawConfig as { enabled?: boolean }).enabled)
        : Boolean(j.antiCrawlerEnabled ?? false)
    items.push({
      name,
      version: String(j.version ?? ''),
      useNativePlayer: Boolean(j.useNativePlayer ?? true),
      author: String(j.author ?? ''),
      lastUpdate: Number(j.lastUpdate ?? 0) || 0,
      antiCrawlerEnabled,
      shop: 'kazumi',
    })
  }
  return items
}

function parseAnibakaCatalog(raw: string): PluginCatalogItem[] {
  const data = JSON.parse(raw) as Record<string, unknown>
  const entries = data.entries
  if (!Array.isArray(entries)) {
    throw new Error('AniBaka 规则目录格式错误：缺少 entries 数组')
  }
  const items: PluginCatalogItem[] = []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const key = String(e.key ?? '').trim()
    if (!key) continue
    const title = String(e.title ?? key).trim()
    const labels = Array.isArray(e.labels)
      ? e.labels.map(String)
      : []
    items.push({
      id: key,
      name: key,
      title,
      version: String(e.rev ?? '1'),
      useNativePlayer: true,
      author: String(e.by ?? 'anibaka'),
      lastUpdate: 0,
      antiCrawlerEnabled: false,
      shop: 'anibaka',
      intro: String(e.intro ?? ''),
      site: String(e.site ?? ''),
      badge: String(e.badge ?? ''),
      labels,
      ref: String(e.ref ?? `${key}.json`),
      engine: String(e.engine ?? 'anx-rule/2'),
    })
  }
  return items
}

/** GET /api/plugin/catalog?shop=anibaka|kazumi&mirror=1 */
pluginCatalogRoutes.get('/catalog', async (c) => {
  const shopParam = (c.req.query('shop') || 'anibaka').toLowerCase()
  const shop: 'anibaka' | 'kazumi' = shopParam === 'kazumi' ? 'kazumi' : 'anibaka'
  const preferMirror =
    c.req.query('mirror') === '1' || c.req.query('mirror') === 'true'

  try {
    const { text, source } = await fetchTextFromShop(shop, 'index.json', preferMirror)
    const items =
      shop === 'anibaka'
        ? parseAnibakaCatalog(text)
        : parseKazumiCatalog(text)
    return c.json({ data: items, source, shop })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[plugin/catalog?shop=${shop}]`, message)
    return c.json({ error: 'catalog_failed', message, shop }, 502)
  }
})

/** GET /api/plugin/catalog/:name?shop=anibaka|kazumi — download full rule JSON */
pluginCatalogRoutes.get('/catalog/:name', async (c) => {
  const name = c.req.param('name')
  if (!NAME_RE.test(name)) {
    return c.json({ error: 'bad_request', message: '规则名称无效' }, 400)
  }
  const shopParam = (c.req.query('shop') || 'anibaka').toLowerCase()
  const shop: 'anibaka' | 'kazumi' = shopParam === 'kazumi' ? 'kazumi' : 'anibaka'
  const preferMirror =
    c.req.query('mirror') === '1' || c.req.query('mirror') === 'true'

  try {
    const { text, source } = await fetchTextFromShop(
      shop,
      `${name}.json`,
      preferMirror,
    )
    const json = JSON.parse(text) as unknown
    const rule = parsePluginRule(json)
    return c.json({ data: rule, source, shop })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[plugin/catalog/:name?shop=${shop}]`, name, message)
    return c.json({ error: 'download_failed', message, shop }, 502)
  }
})
