import { useQuery } from '@tanstack/react-query'
import type {
  HighlightConfig,
  HighlightItem,
  HighlightPlacement,
  HighlightSlotsMap,
} from '@animaku/shared'
import { api } from './api'

export const HIGHLIGHTS_QUERY_KEY = ['site-highlights'] as const
export const HIGHLIGHTS_STALE_TIME = 60 * 1000 // 对齐服务端 1 分钟 CDN 缓存

/**
 * 前台公共请求：拉取所有已启用的展位配置字典
 */
export async function fetchPublicHighlights(): Promise<HighlightSlotsMap> {
  try {
    const res = await api<{ ok: boolean; data?: HighlightSlotsMap }>('/api/site/highlights')
    if (res && res.ok && res.data) {
      return res.data
    }
    return {}
  } catch (err) {
    console.warn('[highlights] 加载站点展位配置失败:', err)
    return {}
  }
}

/**
 * 前台通用的 React Query Hook，跨页面、跨组件深度复用 1 分钟缓存，零冗余网络请求
 */
export function useSiteHighlights() {
  return useQuery({
    queryKey: HIGHLIGHTS_QUERY_KEY,
    queryFn: fetchPublicHighlights,
    staleTime: HIGHLIGHTS_STALE_TIME,
    gcTime: 5 * 60 * 1000,
  })
}

/**
 * 快捷读取特定点位配置的 Hook
 */
export function usePlacementHighlight(placement: HighlightPlacement): HighlightConfig | null {
  const { data } = useSiteHighlights()
  const cfg = data?.[placement]
  if (!cfg || !cfg.enabled || !Array.isArray(cfg.items) || cfg.items.length === 0) {
    return null
  }
  return cfg
}

/**
 * 管理后台专用 API 封装
 */
export const adminHighlightsApi = {
  fetchAll: async (secret: string): Promise<Record<string, HighlightConfig>> => {
    try {
      const res = await api<{ ok: boolean; data?: Record<string, HighlightConfig> }>(
        '/api/admin/site/highlights',
        {
          headers: {
            'X-Admin-Secret': secret,
          },
        },
      )
      if (res && res.ok && res.data) {
        return res.data
      }
      return {}
    } catch (err) {
      console.warn('[admin-highlights] 获取全量展位失败:', err)
      return {}
    }
  },

  save: async (
    secret: string,
    placement: HighlightPlacement,
    data: {
      enabled: boolean
      layout?: 'single' | 'double'
      items: HighlightItem[]
    },
  ): Promise<{ ok: boolean; message?: string; data?: HighlightConfig }> => {
    try {
      const res = await api<{ ok: boolean; message?: string; data?: HighlightConfig }>(
        `/api/admin/site/highlights/${encodeURIComponent(placement)}`,
        {
          method: 'POST',
          headers: {
            'X-Admin-Secret': secret,
          },
          body: JSON.stringify(data),
        },
      )
      return {
        ok: Boolean(res?.ok),
        message: res?.message || '保存成功',
        data: res?.data,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      return { ok: false, message: msg }
    }
  },

  delete: async (
    secret: string,
    placement: HighlightPlacement,
  ): Promise<{ ok: boolean; message?: string }> => {
    try {
      const res = await api<{ ok: boolean; message?: string }>(
        `/api/admin/site/highlights/${encodeURIComponent(placement)}`,
        {
          method: 'DELETE',
          headers: {
            'X-Admin-Secret': secret,
          },
        },
      )
      return { ok: Boolean(res?.ok), message: res?.message || '已清空' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '清空失败'
      return { ok: false, message: msg }
    }
  },
}
