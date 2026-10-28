import type { RecordPlayViewResponse, AnimePlayStats } from '@animaku/shared'
import { useSettingsStore } from '../stores/settings'
import { getCachedBrowserFingerprint } from './fingerprint'
import { getDeviceId } from './client-identity'

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

export type UnauthorizedListener = (info: { path: string; status: number }) => void

const unauthorizedListeners = new Set<UnauthorizedListener>()

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

let lastUnauthorizedNotify = 0
export function notifyUnauthorized(path: string, status: number) {
  const now = Date.now()
  if (now - lastUnauthorizedNotify < 1500) return
  lastUnauthorizedNotify = now
  for (const listener of unauthorizedListeners) {
    try {
      listener({ path, status })
    } catch (e) {
      console.warn('[api] unauthorized listener error:', e)
    }
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`)
  }

  // Non-blocking persistent device identifier injection
  try {
    const devId = getDeviceId()
    if (devId && !headers.has('X-Device-ID')) {
      headers.set('X-Device-ID', devId)
    }
  } catch {
    /* ignore storage access error */
  }

  // Non-blocking browser fingerprint injection if ready (0ms overhead)
  try {
    const fp = getCachedBrowserFingerprint()
    if (fp && !headers.has('X-Browser-Fingerprint')) {
      headers.set('X-Browser-Fingerprint', fp)
    }
  } catch {
    /* ignore fingerprint access error */
  }

  const { token: _t, ...rest } = init
  // `signal` from React Query / caller is preserved via rest — abort on navigate.
  const res = await fetch(path, { ...rest, headers })
  // If aborted mid-body, text() throws — surface as ApiError-friendly abort
  let text: string
  try {
    text = await res.text()
  } catch (e) {
    if (rest.signal?.aborted) {
      throw new ApiError(0, '请求已取消')
    }
    throw e
  }
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    let msg: string | null = null
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>
      if (typeof obj.message === 'string' && obj.message.trim()) {
        msg = obj.message.trim()
      } else if (typeof obj.error === 'string' && obj.error.trim()) {
        msg = obj.error.trim()
      } else if (typeof obj.msg === 'string' && obj.msg.trim()) {
        msg = obj.msg.trim()
      }
    }
    msg = msg || res.statusText || '请求失败'
    if (
      res.status === 401 &&
      (init.token || /^\/api\/(bangumi\/(me|collections)|auth\/)/.test(path))
    ) {
      notifyUnauthorized(path, res.status)
    }
    throw new ApiError(res.status, msg, data)
  }
  return data as T
}

export const statsApi = {
  recordPlayView: (bangumiId: number, episode?: number) =>
    api<RecordPlayViewResponse>('/api/stats/view', {
      method: 'POST',
      body: JSON.stringify({
        bangumiId,
        episode: episode ?? 0,
        deviceId: getDeviceId(),
      }),
    }),
  getSubjectStats: (bangumiId: number) =>
    api<{ data: AnimePlayStats }>(`/api/stats/subject/${bangumiId}`),
  getRankings: (type: 'today' | 'week' | 'month' | 'total' = 'total', limit = 20) =>
    api<{ data: Array<{ bangumiId: number; totalPlayCount: number }>; type: string }>(
      `/api/stats/rank?type=${type}&limit=${limit}`,
    ),
}

