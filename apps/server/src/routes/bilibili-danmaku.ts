import { Hono } from 'hono'
import { gunzipSync } from 'node:zlib'
import {
  parseDanmakuXml,
  parseBilibiliInput,
  type BilibiliTarget,
} from '@animaku/shared'
import { config } from '../config'
import { setDanmakuCdnHeaders } from '../lib/cdn-cache-headers'
import { cacheGetOrSet, wantsCacheBypass } from '../lib/ttl-cache'
import { getBilibiliTargetByBangumiId } from '../lib/bangumi-data'

/**
 * Bilibili danmaku proxy (BV / ep / ss / md / bgm / av / b23 → cid → XML comments).
 * Browser cannot call api.bilibili.com directly (CORS); server fetches and parses.
 * In-process 30m TTL cache + CDN Cache-Control.
 */
export const bilibiliDanmakuRoutes = new Hono()

const BILI_CACHE_TTL = 30 * 60_000

const UA = config.defaultUserAgent

const BILI_TIMEOUT_MS = 15_000
/** Hard cap on danmaku XML/gzip body (≈ raw bytes before gunzip). */
const MAX_DANMAKU_BYTES = 4_000_000

async function bilibiliFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      Referer: 'https://www.bilibili.com/',
      Origin: 'https://www.bilibili.com',
      ...init?.headers,
    },
    signal:
      init?.signal ||
      (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(BILI_TIMEOUT_MS)
        : undefined),
  })
}

/** Resolve media_id (md28229015) to season_id (ss3578) */
async function resolveMediaIdToSeasonId(mediaId: number): Promise<number | null> {
  try {
    const res = await bilibiliFetch(
      `https://api.bilibili.com/pgc/review/user?media_id=${mediaId}`
    )
    if (res.ok) {
      const json = (await res.json()) as {
        result?: { media?: { season_id?: number } }
      }
      if (json.result?.media?.season_id) {
        return json.result.media.season_id
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Resolve b23.tv short link to final target */
async function resolveB23ShortLink(shortUrl: string): Promise<BilibiliTarget | null> {
  try {
    const res = await bilibiliFetch(shortUrl, { redirect: 'manual' })
    const location = res.headers.get('location') || res.url
    if (location && location !== shortUrl) {
      return parseBilibiliInput(location)
    }
  } catch {
    /* fallback to follow redirect */
    try {
      const res = await bilibiliFetch(shortUrl, { redirect: 'follow' })
      if (res.url && res.url !== shortUrl) {
        return parseBilibiliInput(res.url)
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

async function readArrayBufferLimited(
  res: Response,
  maxBytes: number,
): Promise<ArrayBuffer> {
  const cl = res.headers.get('content-length')
  if (cl) {
    const n = Number(cl)
    if (Number.isFinite(n) && n > maxBytes) {
      try {
        await res.body?.cancel()
      } catch {
        /* ignore */
      }
      throw new Error(`弹幕响应过大 (${n} > ${maxBytes} bytes)`)
    }
  }
  if (!res.body) return res.arrayBuffer()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value?.byteLength) continue
    total += value.byteLength
    if (total > maxBytes) {
      try {
        await reader.cancel()
      } catch {
        /* ignore */
      }
      throw new Error(`弹幕响应过大 (>${maxBytes} bytes)`)
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }
  return merged.buffer
}

bilibiliDanmakuRoutes.get('/bilibili', async (c) => {
  const rawInput =
    c.req.query('input') ||
    c.req.query('bvid') ||
    c.req.query('bv') ||
    c.req.query('epid') ||
    c.req.query('ep') ||
    c.req.query('ssid') ||
    c.req.query('ss') ||
    c.req.query('aid') ||
    c.req.query('av') ||
    c.req.query('url') ||
    ''

  let target = parseBilibiliInput(rawInput)

  const rawPageParam = c.req.query('p') ?? c.req.query('page')
  const queryPage =
    rawPageParam !== undefined && rawPageParam.trim() !== ''
      ? Number(rawPageParam)
      : -1
  const queryEpId = Number(c.req.query('epid') || c.req.query('ep') || '0')
  const querySsId = Number(c.req.query('ssid') || c.req.query('ss') || '0')
  const queryMdId = Number(c.req.query('mdid') || c.req.query('md') || c.req.query('mediaId') || '0')
  const queryBgmId = Number(c.req.query('bgm') || c.req.query('bangumiId') || c.req.query('bangumi_id') || c.req.query('bgm_id') || '0')
  const queryAid = Number(c.req.query('aid') || c.req.query('av') || '0')

  if (!target) {
    if (queryEpId > 0) {
      target = { type: 'ep', epId: queryEpId, raw: `ep${queryEpId}` }
    } else if (querySsId > 0) {
      target = { type: 'ss', seasonId: querySsId, raw: `ss${querySsId}` }
    } else if (queryMdId > 0) {
      target = { type: 'md', mediaId: queryMdId, raw: `md${queryMdId}` }
    } else if (queryBgmId > 0) {
      target = { type: 'bgm', bangumiId: queryBgmId, raw: `bgm${queryBgmId}` }
    } else if (queryAid > 0) {
      target = { type: 'av', aid: queryAid, raw: `av${queryAid}` }
    }
  }

  if (!target) {
    return c.json(
      {
        error: 'bad_request',
        message:
          '请提供有效的 B 站链接或标识（支持 BV号 / ep番剧 / ss季度 / md媒体 / bgm条目 / av号 / b23短链）',
      },
      400,
    )
  }

  // Handle Bangumi ID cross-platform mapping lookup
  if (target.type === 'bgm') {
    const mapped = getBilibiliTargetByBangumiId(target.bangumiId)
    if (!mapped?.targetId) {
      return c.json(
        {
          data: [],
          count: 0,
          meta: {
            unmapped: true,
            message: `未在跨站映射库中找到 Bangumi ID ${target.bangumiId} 对应的 B 站番剧`,
          },
        },
        200,
      )
    }
    const parsedMapped = parseBilibiliInput(mapped.targetId)
    if (parsedMapped && parsedMapped.type !== 'bgm') {
      target = {
        ...parsedMapped,
        page: queryPage >= 0 ? queryPage : parsedMapped.page ?? target.page,
      }
    } else {
      const numId = parseInt(mapped.targetId, 10)
      if (Number.isFinite(numId) && numId > 0) {
        target = {
          type: 'md',
          mediaId: numId,
          page: queryPage >= 0 ? queryPage : target.page,
          raw: `md${numId}`,
        }
      } else {
        return c.json(
          {
            data: [],
            count: 0,
            meta: {
              unmapped: true,
              message: `Bangumi ID ${target.bangumiId} 对应的 B 站映射标识格式无法识别`,
            },
          },
          200,
        )
      }
    }
  }

  // Handle md (media_id) -> season_id resolution
  if (target.type === 'md') {
    const resolvedSsId = await resolveMediaIdToSeasonId(target.mediaId)
    if (resolvedSsId && resolvedSsId > 0) {
      target = { type: 'ss', seasonId: resolvedSsId, page: target.page, raw: `ss${resolvedSsId}` }
    } else {
      // Fallback: try treating mediaId as seasonId directly
      target = { type: 'ss', seasonId: target.mediaId, page: target.page, raw: `ss${target.mediaId}` }
    }
  }

  // Handle b23 short link resolution
  if (target.type === 'b23') {
    const resolved = await resolveB23ShortLink(target.url)
    if (resolved) {
      target = resolved
    } else {
      return c.json(
        { error: 'bad_request', message: '未能解析该 b23.tv 短链接对应的内容' },
        400,
      )
    }
  }

  const page =
    Number.isFinite(queryPage) && queryPage >= 0
      ? queryPage
      : target.page !== undefined && target.page >= 0
        ? target.page
        : 1
  const bypass = wantsCacheBypass(c)

  let cacheKey = ''
  if (target.type === 'ep') {
    cacheKey = `bili:danmaku:ep:${target.epId}`
  } else if (target.type === 'ss') {
    cacheKey = `bili:danmaku:ss:${target.seasonId}:${page}`
  } else if (target.type === 'bv') {
    cacheKey = `bili:danmaku:bv:${target.bvid}:${page}`
  } else if (target.type === 'av') {
    cacheKey = `bili:danmaku:av:${target.aid}:${page}`
  } else {
    cacheKey = `bili:danmaku:raw:${encodeURIComponent(rawInput)}:${page}`
  }

  try {
    const { value: result, hit } = await cacheGetOrSet(
      cacheKey,
      BILI_CACHE_TTL,
      async () => {
        let cid = 0
        let title = ''
        let part = ''
        let bvid = ''
        let epId = 0
        let seasonId = 0
        let pages: Array<{
          page: number
          cid: number
          part: string
          epId?: number
          bvid?: string
        }> = []

        if (target.type === 'ep' || target.type === 'ss') {
          const pgcUrl =
            target.type === 'ep'
              ? `https://api.bilibili.com/pgc/view/web/season?ep_id=${target.epId}`
              : `https://api.bilibili.com/pgc/view/web/season?season_id=${target.seasonId}`
          const pgcRes = await bilibiliFetch(pgcUrl)
          if (!pgcRes.ok) {
            const t = await pgcRes.text()
            throw new Error(`B站番剧信息 ${pgcRes.status}: ${t.slice(0, 120)}`)
          }
          const pgcJson = (await pgcRes.json()) as {
            code?: number
            message?: string
            result?: {
              title?: string
              season_title?: string
              season_id?: number
              episodes?: Array<{
                id?: number
                ep_id?: number
                cid?: number
                bvid?: string
                title?: string
                show_title?: string
                long_title?: string
                share_copy?: string
              }>
              section?: Array<{
                title?: string
                episodes?: Array<{
                  id?: number
                  ep_id?: number
                  cid?: number
                  bvid?: string
                  title?: string
                  show_title?: string
                  long_title?: string
                  share_copy?: string
                }>
              }>
            }
          }

          if (pgcJson.code !== 0 || !pgcJson.result) {
            throw new Error(pgcJson.message || `B站番剧返回 code=${pgcJson.code}`)
          }

          const resData = pgcJson.result
          title = resData.title || resData.season_title || ''
          seasonId = resData.season_id || (target.type === 'ss' ? target.seasonId : 0)

          const mainEps = resData.episodes || []
          const sectionEps = (resData.section || []).flatMap(
            (s) => s.episodes || [],
          )
          const allEps = [...mainEps, ...sectionEps]

          let matchedEp: (typeof allEps)[number] | undefined

          if (target.type === 'ep') {
            matchedEp = allEps.find(
              (e) => e.id === target.epId || e.ep_id === target.epId,
            )
          } else {
            // 1. Try smart matching by episode title / show_title (supports 0-episode e.g. "00", "0")
            const targetNumStr = String(page)
            const targetPaddedStr = page < 10 ? `0${page}` : String(page)

            matchedEp = allEps.find((e) => {
              const t = (e.title || '').trim()
              const st = (e.show_title || '').trim()
              return (
                t === targetNumStr ||
                t === targetPaddedStr ||
                st === targetNumStr ||
                st === targetPaddedStr
              )
            })

            // 2. Fallback to index in mainEps if title match failed
            if (!matchedEp) {
              console.warn(
                `[bilibili-danmaku] Title match missed for page ${page} in ${title || target.seasonId}, falling back to index ${page === 0 ? 0 : page - 1}`,
              )
              matchedEp = page === 0 ? mainEps[0] : (mainEps[page - 1] || allEps[0])
            }
          }

          if (!matchedEp && allEps.length > 0) {
            matchedEp = allEps[0]
          }

          if (!matchedEp || !matchedEp.cid) {
            throw new Error('未找到对应剧集或 cid')
          }

          cid = matchedEp.cid
          bvid = matchedEp.bvid || ''
          epId = matchedEp.ep_id || matchedEp.id || 0
          part =
            matchedEp.show_title ||
            matchedEp.long_title ||
            (matchedEp.title ? `第${matchedEp.title}话` : '') ||
            `P${page}`

          pages = mainEps.map((p, idx) => ({
            page: idx + 1,
            cid: p.cid || 0,
            part:
              p.show_title ||
              p.long_title ||
              (p.title ? `第${p.title}话` : `P${idx + 1}`),
            epId: p.ep_id || p.id,
            bvid: p.bvid,
          }))
        } else {
          let ugcUrl = ''
          if (target.type === 'bv') {
            ugcUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(target.bvid)}`
          } else if (target.type === 'av') {
            ugcUrl = `https://api.bilibili.com/x/web-interface/view?aid=${target.aid}`
          } else {
            throw new Error('未知的 B 站资源类型')
          }
          const viewRes = await bilibiliFetch(ugcUrl)
          if (!viewRes.ok) {
            const t = await viewRes.text()
            throw new Error(`B站视频信息 ${viewRes.status}: ${t.slice(0, 120)}`)
          }
          const viewJson = (await viewRes.json()) as {
            code?: number
            message?: string
            data?: {
              title?: string
              cid?: number
              bvid?: string
              pages?: Array<{ cid: number; page: number; part?: string }>
            }
          }
          if (viewJson.code !== 0 || !viewJson.data) {
            throw new Error(viewJson.message || `B站返回 code=${viewJson.code}`)
          }

          title = viewJson.data.title || ''
          bvid = viewJson.data.bvid || (target.type === 'bv' ? target.bvid : '')
          const ugcPages = viewJson.data.pages || []
          const pageInfo =
            ugcPages.find((p) => p.page === page) ||
            ugcPages[page - 1] ||
            ugcPages[0]
          cid = pageInfo?.cid ?? viewJson.data.cid ?? 0
          if (!cid) {
            throw new Error('未找到分 P / cid')
          }
          part = pageInfo?.part || `P${page}`
          pages = ugcPages.map((p) => ({
            page: p.page,
            cid: p.cid,
            part: p.part || `P${p.page}`,
          }))
        }

        // Classic XML endpoint (often gzip). Fallback to list.so.
        let xml = ''
        const xmlUrls = [
          `https://comment.bilibili.com/${cid}.xml`,
          `https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`,
        ]
        let lastErr = ''
        for (const u of xmlUrls) {
          try {
            const res = await bilibiliFetch(u)
            if (!res.ok) {
              lastErr = `${u} → ${res.status}`
              continue
            }
            const buf = Buffer.from(
              await readArrayBufferLimited(res, MAX_DANMAKU_BYTES),
            )
            // gzip magic
            if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
              xml = gunzipSync(buf).toString('utf8')
            } else {
              xml = buf.toString('utf8')
            }
            if (xml.includes('<d ')) break
            lastErr = `${u} → empty danmaku`
            xml = ''
          } catch (e) {
            lastErr = e instanceof Error ? e.message : String(e)
          }
        }

        if (!xml) {
          throw new Error(`拉取弹幕失败：${lastErr || '未知'}`)
        }

        const comments = parseDanmakuXml(xml)
        return {
          comments,
          meta: {
            bvid: bvid || undefined,
            epid: epId || undefined,
            seasonId: seasonId || undefined,
            cid,
            page,
            title,
            part,
            pages,
          },
        }
      },
      { bypass, keyPrefix: 'bili:' },
    )

    c.header('X-Cache', hit ? 'HIT' : 'MISS')
    setDanmakuCdnHeaders(c, bypass)
    return c.json({
      data: result.comments,
      count: result.comments.length,
      meta: result.meta,
    })
  } catch (e) {
    return c.json(
      {
        error: 'upstream',
        message: e instanceof Error ? e.message : String(e),
      },
      502,
    )
  }
})
