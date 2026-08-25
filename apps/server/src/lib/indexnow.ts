import type { Context } from 'hono'
import type { BangumiItem } from '@animaku/shared'
import { config } from '../config'
import { isPrivateHost } from './private-host'
import { getClientIp } from './logger'
import { clientRemoteAddress } from './access'
import { fetchSitemapSubjects, SITEMAP_STATIC_PATHS } from './seo-static'

const INDEXNOW_API = 'https://api.indexnow.org/IndexNow'
const INDEXNOW_TIMEOUT_MS = 10_000 // 10s timeout
const INDEXNOW_MAX_BATCH_SIZE = 10_000

export interface IndexNowBatchResult {
  batch: number
  count: number
  status: number
  ok: boolean
  reason?: string
}

export interface IndexNowSubmitSummary {
  ok: boolean
  host: string
  totalSubmitted: number
  validCount: number
  rejectedCount: number
  rejectedUrls?: string[]
  results: IndexNowBatchResult[]
  message: string
}

/**
 * Extract hostname from public origin or URL string.
 */
export function extractHostFromOrigin(origin: string): string {
  const trimmed = origin.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return u.hostname
  } catch {
    return trimmed
  }
}

/**
 * Filter valid URLs that strictly match the target host.
 */
function filterValidUrls(
  urls: string[],
  targetHost: string,
): { valid: string[]; rejected: string[] } {
  const valid: string[] = []
  const rejected: string[] = []
  const expected = targetHost.toLowerCase()

  for (const u of urls) {
    if (!u || typeof u !== 'string') continue
    try {
      const parsed = new URL(u)
      if (parsed.hostname.toLowerCase() === expected) {
        valid.push(u)
      } else {
        rejected.push(u)
      }
    } catch {
      rejected.push(u)
    }
  }
  return { valid, rejected }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Submit a batch of URLs to IndexNow API.
 */
async function postIndexNowBatch(
  host: string,
  key: string,
  keyLocation: string,
  batch: string[],
  batchIndex: number,
  totalBatches: number,
): Promise<IndexNowBatchResult> {
  const payload = {
    host,
    key,
    keyLocation,
    urlList: batch,
  }

  try {
    const res = await fetch(INDEXNOW_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': config.productUserAgent,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
    })

    const status = res.status
    if (status === 200 || status === 202) {
      console.log(
        `[indexnow] Batch ${batchIndex}/${totalBatches} submitted ${batch.length} URLs successfully (HTTP ${status})`,
      )
      return { batch: batchIndex, count: batch.length, status, ok: true }
    }

    let reason = `HTTP ${status}`
    if (status === 400) reason = '400 Bad Request (Invalid JSON or format)'
    else if (status === 403) reason = '403 Forbidden (Key invalid or keyLocation unreachable)'
    else if (status === 422) reason = '422 Unprocessable Entity (URLs do not match host or invalid schema)'
    else if (status === 429) reason = '429 Too Many Requests (Rate limit / spam detection)'

    console.warn(
      `[indexnow] Batch ${batchIndex}/${totalBatches} rejected: ${reason} (count=${batch.length})`,
    )
    return { batch: batchIndex, count: batch.length, status, ok: false, reason }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(
      `[indexnow] Batch ${batchIndex}/${totalBatches} network/timeout error: ${msg}`,
    )
    return { batch: batchIndex, count: batch.length, status: 0, ok: false, reason: msg }
  }
}

/**
 * Submit arbitrary URLs to IndexNow with validation, host matching and safety guards.
 */
export async function submitToIndexNow(
  origin: string,
  urls: string[],
): Promise<IndexNowSubmitSummary> {
  if (!config.indexnowEnabled) {
    return {
      ok: false,
      host: '',
      totalSubmitted: 0,
      validCount: 0,
      rejectedCount: urls.length,
      results: [],
      message: 'IndexNow 已在服务端被禁用（INDEXNOW_ENABLED=0）',
    }
  }

  const key = config.indexnowKey
  if (!key) {
    return {
      ok: false,
      host: '',
      totalSubmitted: 0,
      validCount: 0,
      rejectedCount: urls.length,
      results: [],
      message: 'IndexNow Key 未配置（INDEXNOW_KEY 为空）',
    }
  }

  const cleanOrigin = origin.trim().replace(/\/+$/, '')
  const host = extractHostFromOrigin(cleanOrigin)

  if (!host) {
    return {
      ok: false,
      host: '',
      totalSubmitted: 0,
      validCount: 0,
      rejectedCount: urls.length,
      results: [],
      message: '无法解析站点 Host 域名',
    }
  }

  // Safety guard: reject local / private hosts (localhost, 127.0.0.1, internal IP)
  if (isPrivateHost(host)) {
    console.log(`[indexnow] Skip submission: host '${host}' is local/private.`)
    return {
      ok: false,
      host,
      totalSubmitted: 0,
      validCount: 0,
      rejectedCount: urls.length,
      results: [],
      message: `跳过提交：目标主机 '${host}' 为本地或局域网私有地址`,
    }
  }

  const keyLocation = `${cleanOrigin}/${key}.txt`
  const { valid, rejected } = filterValidUrls(urls, host)

  if (valid.length === 0) {
    return {
      ok: false,
      host,
      totalSubmitted: 0,
      validCount: 0,
      rejectedCount: rejected.length,
      rejectedUrls: rejected.slice(0, 10),
      results: [],
      message: `没有与 host '${host}' 匹配的有效 URL`,
    }
  }

  const batches = chunkArray(valid, INDEXNOW_MAX_BATCH_SIZE)
  const results: IndexNowBatchResult[] = []

  for (let i = 0; i < batches.length; i++) {
    const res = await postIndexNowBatch(
      host,
      key,
      keyLocation,
      batches[i],
      i + 1,
      batches.length,
    )
    results.push(res)
  }

  const allOk = results.every((r) => r.ok)
  const totalSubmitted = results
    .filter((r) => r.ok)
    .reduce((sum, r) => sum + r.count, 0)

  return {
    ok: allOk,
    host,
    totalSubmitted,
    validCount: valid.length,
    rejectedCount: rejected.length,
    rejectedUrls: rejected.length > 0 ? rejected.slice(0, 10) : undefined,
    results,
    message: allOk
      ? `成功向 IndexNow 提交 ${totalSubmitted} 条 URL`
      : `部分批次提交失败（成功 ${totalSubmitted}/${valid.length} 条）`,
  }
}

// In-memory record of already submitted subject IDs to avoid redundant IndexNow submissions
const submittedSubjectIds = new Set<number>()
let initialSyncDone = false

/**
 * Differential submission for sitemap 6h refreshes & server startup.
 * - First run: submits static routes + current subjects.
 * - Subsequent runs: submits ONLY newly added subject IDs.
 * Never throws.
 */
export async function submitDifferentialSitemapSubjects(
  origin: string,
  subjects: BangumiItem[],
): Promise<{ submitted: number; newSubjectIds: number[] }> {
  if (!config.indexnowEnabled) return { submitted: 0, newSubjectIds: [] }

  const cleanOrigin = origin.trim().replace(/\/+$/, '')
  const host = extractHostFromOrigin(cleanOrigin)
  if (!host || isPrivateHost(host)) return { submitted: 0, newSubjectIds: [] }

  if (!initialSyncDone) {
    // Initial startup: static paths + all currently active subjects
    const staticUrls = SITEMAP_STATIC_PATHS.map(
      (p) => `${cleanOrigin}${p.path === '/' ? '/' : p.path}`,
    )
    const subjectUrls = subjects.map((s) => `${cleanOrigin}/subject/${s.id}`)
    const allUrls = [...staticUrls, ...subjectUrls]

    console.log(
      `[indexnow] Initial sync: submitting ${allUrls.length} URLs (3 static + ${subjects.length} subjects) for ${host}`,
    )
    const summary = await submitToIndexNow(cleanOrigin, allUrls)
    if (summary.ok) {
      for (const s of subjects) {
        if (s.id > 0) submittedSubjectIds.add(s.id)
      }
      initialSyncDone = true
    }
    return { submitted: summary.totalSubmitted, newSubjectIds: subjects.map((s) => s.id) }
  }

  // Differential check
  const newSubjects = subjects.filter((s) => s.id > 0 && !submittedSubjectIds.has(s.id))
  if (newSubjects.length === 0) {
    console.log(`[indexnow] Differential check: 0 new subjects detected for ${host}, 0 requests sent.`)
    return { submitted: 0, newSubjectIds: [] }
  }

  const newUrls = newSubjects.map((s) => `${cleanOrigin}/subject/${s.id}`)
  console.log(
    `[indexnow] Differential sync: found ${newSubjects.length} new subjects to submit for ${host}`,
  )

  const summary = await submitToIndexNow(cleanOrigin, newUrls)
  if (summary.ok) {
    for (const s of newSubjects) {
      submittedSubjectIds.add(s.id)
    }
  }
  return { submitted: summary.totalSubmitted, newSubjectIds: newSubjects.map((s) => s.id) }
}

/**
 * Full submission for manual admin trigger endpoint (POST /api/admin/indexnow).
 */
export async function submitFullSitemapToIndexNow(
  origin: string,
  customUrls?: string[],
): Promise<IndexNowSubmitSummary> {
  const cleanOrigin = origin.trim().replace(/\/+$/, '')

  if (customUrls && customUrls.length > 0) {
    return submitToIndexNow(cleanOrigin, customUrls)
  }

  // Fetch full sitemap items (static + all current subjects)
  const staticUrls = SITEMAP_STATIC_PATHS.map(
    (p) => `${cleanOrigin}${p.path === '/' ? '/' : p.path}`,
  )
  const subjects = await fetchSitemapSubjects()
  const subjectUrls = subjects.map((s) => `${cleanOrigin}/subject/${s.id}`)
  const allUrls = [...staticUrls, ...subjectUrls]

  const summary = await submitToIndexNow(cleanOrigin, allUrls)
  if (summary.ok) {
    for (const s of subjects) {
      if (s.id > 0) submittedSubjectIds.add(s.id)
    }
    initialSyncDone = true
  }
  return summary
}

/**
 * Check if the request is authorized as administrator for admin routes.
 */
export function isAuthorizedAdmin(c: Context): boolean {
  const secret = config.adminSecret
  if (secret) {
    const hdr =
      c.req.header('x-admin-secret') ||
      c.req.header('x-animaku-proxy-token') ||
      c.req.header('x-aniku-proxy-token') ||
      c.req.header('x-proxy-token') ||
      ''
    if (hdr && hdr === secret) return true
    const q = c.req.query('secret') || c.req.query('token') || ''
    if (q && q === secret) return true
    return false
  }

  // If no secret configured, allow loopback only
  const ip = getClientIp(c.req)
  const remoteAddr = clientRemoteAddress(c)
  const isLoopback =
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    remoteAddr === '127.0.0.1' ||
    remoteAddr === '::1' ||
    remoteAddr === 'localhost'

  return isLoopback
}
