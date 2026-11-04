/**
 * 站点精选与运营展位点位标识 (去敏感化命名，杜绝 AdBlock 拦截)
 */
export type HighlightPlacement =
  | 'hero_banner' // 首页轮播图 (嵌入卡片)
  | 'daily_schedule' // 首页今日放送 (嵌入卡片)
  | 'home_above_history' // 首页历史播放上方 (横条)
  | 'home_above_movies' // 首页剧场版上方 (横条)
  | 'home_above_ovas' // 首页 OVA 特别篇上方 (横条)
  | 'watch_mid_section' // 播放页选集与推荐之间 (横条)

export type HighlightKind = 'embedded_card' | 'banner'

/**
 * 单个运营条目/广告条目定义
 */
export interface HighlightItem {
  id: string
  title: string
  subtitle?: string
  imageUrl: string
  linkUrl: string
  target?: '_blank' | '_self'
  badge?: string // 默认为 "推广"，可自定义为 "公告"、"活动"、"赞助" 等
}

/**
 * 单个点位的配置状态
 */
export interface HighlightConfig {
  placement: HighlightPlacement
  enabled: boolean
  layout: 'single' | 'double'
  items: HighlightItem[]
  updatedAt: number
}

/**
 * 全站前台获取的字典映射
 */
export type HighlightSlotsMap = Partial<Record<HighlightPlacement, HighlightConfig>>

/**
 * 点位注册表元数据（供 Admin 下拉列表与前端组件统一驱动）
 */
export interface HighlightSlotMeta {
  key: HighlightPlacement
  label: string
  kind: HighlightKind
  maxItems: 1 | 2
  description: string
}

export const HIGHLIGHT_SLOTS: readonly HighlightSlotMeta[] = [
  {
    key: 'hero_banner',
    label: '首页 · 轮播图 (嵌入卡片)',
    kind: 'embedded_card',
    maxItems: 1,
    description: '在首页顶部海报轮播中随机抽取一帧展示，满幅铺满海报',
  },
  {
    key: 'daily_schedule',
    label: '首页 · 今日放送第6格 (嵌入卡片)',
    kind: 'embedded_card',
    maxItems: 1,
    description: '今日放送 6 宫格第 6 张卡片；当页若不足 6 张则紧随末尾展示',
  },
  {
    key: 'home_above_history',
    label: '首页 · 历史播放上方 (横条)',
    kind: 'banner',
    maxItems: 2,
    description: '历史观看模块正上方，支持 1 个通栏长条或 2 个半屏并排小长条',
  },
  {
    key: 'home_above_movies',
    label: '首页 · 剧场版上方 (横条)',
    kind: 'banner',
    maxItems: 2,
    description: '剧场版网格正上方，支持 1 个通栏长条或 2 个半屏并排小长条',
  },
  {
    key: 'home_above_ovas',
    label: '首页 · OVA特别篇上方 (横条)',
    kind: 'banner',
    maxItems: 2,
    description: 'OVA / 特别篇网格正上方，支持 1 个通栏长条或 2 个半屏并排小长条',
  },
  {
    key: 'watch_mid_section',
    label: '播放页 · 选集与推荐之间 (横条)',
    kind: 'banner',
    maxItems: 2,
    description: '播放器下方选集与相关推荐中间，支持 1 个通栏长条或 2 个半屏并排小长条',
  },
] as const
