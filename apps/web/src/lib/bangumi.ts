import { api } from './api'
import {
  type BangumiItem,
  type BangumiEpisode,
  type BangumiUser,
  type BangumiCollectionEntry,
  type BangumiRecommendationsPayload,
  type CommentPagePayload,
  type CollectType,
  computeBangumiRecommendations,
  fetchClientCalendar,
  fetchClientTrending,
  fetchClientSearch,
  fetchClientSubject,
  fetchClientEpisodes,
} from '@animaku/shared'
import { useSettingsStore } from '../stores/settings'

function token() {
  return useSettingsStore.getState().bangumiToken || null
}

function currentImageHost() {
  return useSettingsStore.getState().bangumiImageHost
}

type SignalOpt = { signal?: AbortSignal }

export const bangumiApi = {
  calendar: async (opts?: SignalOpt) => {
    const data = await fetchClientCalendar({
      imageHost: currentImageHost(),
      signal: opts?.signal,
    })
    return { data }
  },
  trending: async (limit = 24, offset = 0, opts?: SignalOpt) => {
    const data = await fetchClientTrending(limit, offset, 2, {
      imageHost: currentImageHost(),
      signal: opts?.signal,
    })
    return { data }
  },
  search: async (
    keyword: string,
    opts?: {
      limit?: number
      offset?: number
      /** heat | rank | score | date (放送时间, page-local) | match */
      sort?: string
      tags?: string[]
      type?: number[] | number
      year?: number | null
      airDate?: string[]
      signal?: AbortSignal
    },
  ) => {
    return fetchClientSearch(
      {
        keyword,
        limit: opts?.limit,
        offset: opts?.offset,
        sort: opts?.sort,
        tags: opts?.tags,
        type: opts?.type,
        year: opts?.year,
        airDate: opts?.airDate,
      },
      {
        imageHost: currentImageHost(),
        signal: opts?.signal,
      },
    )
  },
  subject: async (id: number | string, opts?: SignalOpt) => {
    const data = await fetchClientSubject(id, {
      imageHost: currentImageHost(),
      signal: opts?.signal,
    })
    return { data }
  },
  episodes: async (id: number | string, opts?: SignalOpt) => {
    const data = await fetchClientEpisodes(id, {
      imageHost: currentImageHost(),
      signal: opts?.signal,
    })
    return { data }
  },
  recommendations: async (
    subjectId: number | string,
    opts?: {
      tags?: string[]
      country?: string
      isMovie?: boolean
      imageHost?: string
      signal?: AbortSignal
      refresh?: boolean
    },
  ) => {
    const id = Number(subjectId)
    if (!Number.isFinite(id) || id <= 0) {
      return { data: { items: [], matchedTags: [] } }
    }
    // 纯客户端浏览器 100% 直连 Bangumi / 国内镜像源计算，且受 24h 本地持久化缓存保护
    const payload = await computeBangumiRecommendations(id, {
      tags: opts?.tags,
      country: opts?.country,
      isMovie: opts?.isMovie,
      imageHost: opts?.imageHost || useSettingsStore.getState().bangumiImageHost,
      signal: opts?.signal,
      bypassCache: opts?.refresh,
    })
    return { data: payload }
  },
  comments: (
    subjectId: number | string,
    opts?: {
      page?: number
      pageSize?: number
      type?: number
      signal?: AbortSignal
    },
  ) => {
    const q = new URLSearchParams()
    if (opts?.page) q.set('page', String(opts.page))
    if (opts?.pageSize) q.set('pageSize', String(opts.pageSize))
    if (opts?.type) q.set('type', String(opts.type))
    return api<CommentPagePayload>(
      `/api/bangumi/subjects/${subjectId}/comments?${q}`,
      { signal: opts?.signal },
    )
  },
  me: (opts?: SignalOpt & { token?: string }) =>
    api<{ data: BangumiUser }>('/api/bangumi/me', {
      token: opts?.token ?? token(),
      signal: opts?.signal,
    }),
  collections: (opts?: {
    limit?: number
    offset?: number
    type?: number
    signal?: AbortSignal
  }) => {
    const q = new URLSearchParams()
    if (opts?.limit != null) q.set('limit', String(opts.limit))
    if (opts?.offset != null) q.set('offset', String(opts.offset))
    if (opts?.type != null) q.set('type', String(opts.type))
    return api<{ data: BangumiCollectionEntry[]; total?: number; limit?: number; offset?: number }>(
      `/api/bangumi/collections?${q}`,
      { token: token(), signal: opts?.signal },
    )
  },
  getCollection: (subjectId: number | string, opts?: SignalOpt) =>
    api<{ data: BangumiCollectionEntry | null }>(
      `/api/bangumi/collections/${subjectId}`,
      { token: token(), signal: opts?.signal },
    ),
  setCollection: (subjectId: number | string, type: CollectType, opts?: SignalOpt) =>
    api<{ ok: boolean; type: CollectType }>(
      `/api/bangumi/collections/${subjectId}`,
      {
        method: 'PUT',
        token: token(),
        body: JSON.stringify({ type }),
        signal: opts?.signal,
      },
    ),
}
