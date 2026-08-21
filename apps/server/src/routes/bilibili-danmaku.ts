import { Hono } from 'hono'
import { gunzipSync } from 'node:zlib'
import { parseDanmakuXml, extractBvid } from '@animaku/shared'
import { config } from '../config'
import { setDanmakuCdnHeaders } from '../lib/cdn-cache-headers'
import { cacheGetOrSet, wantsCacheBypass } from '../lib/ttl-cache'

/**
 * Bilibili danmaku proxy (BV → cid → XML comments).
 * Browser cannot call api.bilibili.com directly (CORS); server fetches and parses.
 * In-process 15m TTL cache + CDN Cache-Control.
 */
export const bilibiliDanmakuRoutes = new Hono()

const BILI_CACHE_TTL = 15 * 60_000

const UA = config.defaultUserAgent

const BILI_TIMEOUT_MS = 15_000
/** Hard cap on danmaku XML/gzip body (≈ raw bytes before gunzip). */
const MAX_DANMAKU_BYTES = 4_000_000

async function bilibiliFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: '*/*',
      Referer: 'https://www.bilibili.com/',
      Origin: 'https://www.bilibili.com',
    },
    signal:
      typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(BILI_TIMEOUT_MS)
        : undefined,
  })
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
  const raw = c.req.query('bvid') || c.req.query('bv') || ''
  const bvid = extractBvid(raw)
  if (!bvid) {
    return c.json(
      { error: 'bad_request', message: '请提供有效 BV 号（如 BV1xx…）' },
      400,
    )
  }
  const page = Math.max(1, Number(c.req.query('p') || c.req.query('page') || '1') || 1)
  const bypass = wantsCacheBypass(c)

  try {
    const { value: result, hit } = await cacheGetOrSet(
      `bili:danmaku:${bvid}:${page}`,
      BILI_CACHE_TTL,
      async () => {
        const viewRes = await bilibiliFetch(
          `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
        )
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
            pages?: Array<{ cid: number; page: number; part?: string }>
          }
        }
        if (viewJson.code !== 0 || !viewJson.data) {
          throw new Error(viewJson.message || `B站返回 code=${viewJson.code}`)
        }

        const pages = viewJson.data.pages || []
        const pageInfo =
          pages.find((p) => p.page === page) || pages[page - 1] || pages[0]
        const cid = pageInfo?.cid ?? viewJson.data.cid
        if (!cid) {
          throw new Error('未找到分 P / cid')
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
            const buf = Buffer.from(await readArrayBufferLimited(res, MAX_DANMAKU_BYTES))
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
            bvid,
            cid,
            page,
            title: viewJson.data.title || '',
            part: pageInfo?.part || '',
            pages: pages.map((p) => ({
              page: p.page,
              cid: p.cid,
              part: p.part || `P${p.page}`,
            })),
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
