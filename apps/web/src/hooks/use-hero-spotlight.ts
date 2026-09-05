import { useQuery } from '@tanstack/react-query'
import type { BangumiItem } from '@animaku/shared'
import { bangumiApi } from '../lib/bangumi'

export interface HeroSpotlightOptions {
  limit?: number
  /**
   * 预留未来扩展的数据源类型：
   * - 'trending': 当前默认，从高热度热门番剧中提取
   * - 'calendar': 从当天放送的精选新番提取
   * - 'curated': 预留给未来独立运营/精选推荐 API
   */
  sourceType?: 'trending' | 'calendar' | 'curated'
}

export interface UseHeroSpotlightResult {
  items: BangumiItem[]
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

/**
 * 首页顶部 Hero 焦点海报的数据源抽象层 Hook。
 * 隔离具体业务 API 与前端 UI 表现，方便未来平滑切换为独立推荐接口、运营配置或自建榜单。
 */
export function useHeroSpotlight(
  options: HeroSpotlightOptions = {},
): UseHeroSpotlightResult {
  const { limit = 5, sourceType = 'trending' } = options

  // 当前默认策略：从热度榜单拉取前 N 项作为焦点轮播
  const query = useQuery({
    queryKey: ['hero-spotlight', sourceType, limit],
    queryFn: async ({ signal }) => {
      switch (sourceType) {
        case 'trending':
        default: {
          const res = await bangumiApi.trending(limit, 0, { signal })
          return res.data
        }
      }
    },
    staleTime: 2 * 60 * 60_000,
    gcTime: 12 * 60 * 60_000,
  })

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
