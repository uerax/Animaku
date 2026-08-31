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
