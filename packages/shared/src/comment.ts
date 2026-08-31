import type { CollectType } from './bangumi'

export type CommentSource = 'bangumi' | 'local' | 'bilibili'

export interface CommentAuthor {
  id: number | string
  username: string
  nickname: string
  avatar: string
  userGroup?: number
  sign?: string
}

export interface CommentItem {
  id: number | string
  source: CommentSource
  author: CommentAuthor
  content: string
  /** 1-10 rating score (undefined when unrated) */
  rate?: number
  /** Watch status corresponding to CollectType (e.g. 2 for 看过, 3 for 在看) */
  collectionType?: CollectType
  /** ISO date string or formatted time */
  createdAt: string
  /**
   * 🔮 Future-proof interactive statistics (Phase 1 optional)
   */
  stats?: {
    likeCount?: number
    dislikeCount?: number
    replyCount?: number
  }
  /**
   * 🔮 Current logged-in user interaction state
   */
  userAction?: {
    liked?: boolean
    disliked?: boolean
  }
  /** Pinned comment by staff or admin */
  isPinned?: boolean
  /** Nested sub-replies (楼中楼) */
  replies?: CommentItem[]
}

export interface CommentPagePayload {
  data: CommentItem[]
  total: number
  page: number
  pageSize: number
}

// ---------------- 🔮 评论过滤模块 (Filter Module) ----------------

/** 评论过滤器签名 */
export type CommentFilter = (item: CommentItem) => boolean

/** 预置可插拔评论过滤器集合，支持未来按需即插即用与组合 */
export const commentFilters = {
  /** 默认策略：全量直通，不过滤任何评论/打分记录 */
  passthrough: (_item: CommentItem): boolean => true,

  /** 仅保留包含有效非空文字内容的评论 */
  nonEmptyContent: (item: CommentItem): boolean => item.content.trim().length > 0,

  /** 仅保留带有效评分（1~10 分）的评论 */
  ratedOnly: (item: CommentItem): boolean => item.rate !== undefined && item.rate > 0,

  /** 关键词/敏感词屏蔽过滤器工厂 */
  createKeywordFilter:
    (blockedWords: string[]): CommentFilter =>
    (item: CommentItem): boolean => {
      if (!blockedWords || blockedWords.length === 0) return true
      const text = item.content || ''
      return !blockedWords.some((word) => word && text.includes(word))
    },

  /** 组合多个过滤器（全部满足才放行） */
  combine:
    (...filters: CommentFilter[]): CommentFilter =>
    (item: CommentItem): boolean =>
      filters.every((f) => f(item)),
}

