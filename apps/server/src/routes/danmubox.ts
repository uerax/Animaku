import { Hono } from 'hono'
import {
  initDanmuBox,
  isDanmuBoxLoaded,
  searchDanmuBox,
} from '../lib/danmubox/index'
import {
  setDanmakuCdnHeaders,
} from '../lib/cdn-cache-headers'
import { wantsCacheBypass } from '../lib/ttl-cache'

export const danmuboxRoutes = new Hono()

danmuboxRoutes.get('/danmubox/status', (c) => {
  return c.json({
    loaded: isDanmuBoxLoaded(),
  })
})

danmuboxRoutes.get('/danmubox/search', async (c) => {
  const keyword = (c.req.query('keyword') || '').trim()
  if (!keyword) {
    return c.json({ error: 'bad_request', message: '缺少 keyword 搜索词' }, 400)
  }

  const rawEp = c.req.query('targetEp') || c.req.query('ep')
  const targetEpisode = rawEp ? parseInt(rawEp, 10) : undefined
  const rawLimit = c.req.query('limit')
  const limit = rawLimit ? parseInt(rawLimit, 10) : 40

  try {
    if (!isDanmuBoxLoaded()) {
      await initDanmuBox()
    }

    const results = searchDanmuBox(keyword, {
      targetEpisode: Number.isFinite(targetEpisode) ? targetEpisode : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 40,
    })

    const bypass = wantsCacheBypass(c)
    setDanmakuCdnHeaders(c, bypass)

    return c.json({ data: results })
  } catch (err) {
    return c.json(
      {
        error: 'danmubox_search_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      502,
    )
  }
})

// 客户端迁移提示：旧的服务端下载解压接口已废弃并下放至客户端浏览器执行
danmuboxRoutes.get('/danmubox/episodes', (c) => {
  return c.json(
    {
      error: 'deprecated',
      message: '弹幕盒子已升级为纯前端客户端直连解压，请升级网页客户端',
    },
    410,
  )
})

danmuboxRoutes.get('/danmubox/comments', (c) => {
  return c.json(
    {
      error: 'deprecated',
      message: '弹幕盒子已升级为纯前端客户端直连解压，请升级网页客户端',
    },
    410,
  )
})

