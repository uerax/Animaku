import { Hono } from 'hono'
import { sourceRegistry } from '../lib/source/source-registry'

export const sourceRoutes = new Hono()

// 违规网络参数注入黑名单
const FORBIDDEN_NETWORK_KEYS = [
  'baseURL',
  'baseUrl',
  'searchURL',
  'searchUrl',
  'headers',
  'header',
  'cookies',
  'cookie',
  'customHost',
  'custom_host',
  'rule',
  'rules',
] as const

/**
 * 严格审查请求体，严防外部网络配置或动态规则参数注入
 */
function assertNoForbiddenParams(body: Record<string, unknown>): void {
  for (const key of FORBIDDEN_NETWORK_KEYS) {
    if (key in body && body[key] !== undefined && body[key] !== null) {
      throw new Error(
        `Security violation: parameter "${key}" is prohibited on controlled source endpoints`,
      )
    }
  }
}

function errStatus(message: string): 400 | 502 | 504 {
  if (
    /无法访问|timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(
      message,
    )
  ) {
    return 504
  }
  if (
    /缺少|无效|bad|Security violation|Prohibited|prohibited|Unknown source|Egress policy/i.test(
      message,
    )
  ) {
    return 400
  }
  return 502
}

/**
 * 获取固化视频源列表
 */
sourceRoutes.get('/list', async (c) => {
  const list = sourceRegistry.listSources()
  return c.json({ data: list })
})

/**
 * 视频源搜索
 */
sourceRoutes.post('/search', async (c) => {
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ error: 'bad_request', message: '请求体必须为合法 JSON' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'bad_request', message: '请求体必须为 JSON 对象' }, 400)
  }

  try {
    assertNoForbiddenParams(body)
  } catch (err) {
    return c.json(
      { error: 'forbidden_params', message: (err as Error).message },
      400,
    )
  }

  const source = typeof body.source === 'string' ? body.source.trim() : ''
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : ''

  if (!source) {
    return c.json({ error: 'bad_request', message: '缺少 source 参数' }, 400)
  }
  if (!keyword) {
    return c.json({ error: 'bad_request', message: '缺少 keyword 参数' }, 400)
  }

  try {
    const data = await sourceRegistry.search(source, keyword)
    return c.json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'search_failed', message }, errStatus(message))
  }
})

/**
 * 视频源分集与线路获取
 */
sourceRoutes.post('/chapters', async (c) => {
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ error: 'bad_request', message: '请求体必须为合法 JSON' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'bad_request', message: '请求体必须为 JSON 对象' }, 400)
  }

  try {
    assertNoForbiddenParams(body)
  } catch (err) {
    return c.json(
      { error: 'forbidden_params', message: (err as Error).message },
      400,
    )
  }

  const source = typeof body.source === 'string' ? body.source.trim() : ''
  const url =
    typeof body.url === 'string'
      ? body.url.trim()
      : typeof body.sourceUrl === 'string'
        ? body.sourceUrl.trim()
        : ''

  if (!source) {
    return c.json({ error: 'bad_request', message: '缺少 source 参数' }, 400)
  }
  if (!url) {
    return c.json({ error: 'bad_request', message: '缺少 url 参数' }, 400)
  }

  try {
    const data = await sourceRegistry.chapters(source, url)
    return c.json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'chapters_failed', message }, errStatus(message))
  }
})

/**
 * 视频源播放直链解析并注册 PlaybackAsset
 */
sourceRoutes.post('/resolve', async (c) => {
  let body: Record<string, unknown>
  try {
    body = (await c.req.json()) as Record<string, unknown>
  } catch {
    return c.json({ error: 'bad_request', message: '请求体必须为合法 JSON' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'bad_request', message: '请求体必须为 JSON 对象' }, 400)
  }

  try {
    assertNoForbiddenParams(body)
  } catch (err) {
    return c.json(
      { error: 'forbidden_params', message: (err as Error).message },
      400,
    )
  }

  const source = typeof body.source === 'string' ? body.source.trim() : ''
  const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl.trim() : ''

  if (!source) {
    return c.json({ error: 'bad_request', message: '缺少 source 参数' }, 400)
  }
  if (!pageUrl) {
    return c.json({ error: 'bad_request', message: '缺少 pageUrl 参数' }, 400)
  }

  try {
    const data = await sourceRegistry.resolveAndRegister(source, pageUrl)
    return c.json({ data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'resolve_failed', message }, errStatus(message))
  }
})
