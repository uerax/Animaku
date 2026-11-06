import type { BangumiItem, BangumiCollectionEntry } from './bangumi'
import type { WatchHistoryEntry } from './history'

/**
 * 动漫标签噪音过滤与标准题材白名单工具（1:1 对齐 zakoway AnimeTagFilter）：
 * 1. 采用高命中率正则深度拦截多样化时间标签（年份、月份、季节、年代、新番泛词）；
 * 2. 严谨过滤无题材意义的通用载体、泛改编、地域与平台标签；
 * 3. 收录经过严格清洗的【动漫标准题材推荐白名单 (genreAllowList)】（受控词典 Controlled Vocabulary）；
 * 4. 特殊处理说明：根据业务策略，特意保留【游改 / 游戏改 / gal改 / galgame改 / 原创 / 原创动画】。
 */
export class AnimeTagFilter {
  /**
   * 动漫标准题材推荐白名单（受控词典 Controlled Vocabulary）
   * 严格清洗自 Bangumi 官方海量高频标签，彻底剔除结构性载体、时间、恶搞短句与观后感评价词。
   */
  static readonly genreAllowList: ReadonlySet<string> = new Set([
    // 1. 核心大类题材
    '恋爱',
    '搞笑',
    '日常',
    '校园',
    '奇幻',
    '战斗',
    '热血',
    '冒险',
    '科幻',
    '悬疑',
    '推理',
    '治愈',
    '青春',
    '运动',
    '竞技',
    '美食',
    '音乐',
    '偶像',
    '历史',
    '战争',
    '剧情',
    '打斗',
    '格斗',

    // 2. 二次元鲜明特色题材
    '异世界',
    '后宫',
    '百合',
    '轻百合',
    '耽美',
    'bl',
    '纯爱',
    '萌系',
    '萌',
    '魔法少女',
    '魔法',
    '机战',
    '机甲',
    '超能力',
    '穿越',
    '转生',
    '智斗',
    '催泪',
    '致郁',
    '暗黑',
    '恋爱喜剧',
    '一般向',
    '宫廷',

    // 3. 进阶/小众/深度题材
    '赛博朋克',
    '反乌托邦',
    '末世',
    '末日',
    '公路片',
    '群像',
    '群像剧',
    '职场',
    '妖怪',
    '怪谈',
    '丧尸',
    '僵尸',
    '硬核',
    '生存',
    '大逃杀',
    '犯罪',
    '谍战',
    '武侠',
    '仙侠',
    '古风',
    '和风',
    '童话',
    '心理',
    '露营',
    '萌宠',
    '生活',
    '种田',
    '落语',
    '魔幻',

    // 4. 特殊创作源（保留具象风格）
    '游改',
    '游戏改',
    'gal改',
    '原创',
    '原创动画',
  ])

  /**
   * 时间格式标签正则拦截器
   */
  private static readonly temporalTagRegex =
    /^(?:\d{4}年?(?:(?:0?[1-9]|1[0-2])月?|(?:春|夏|秋|冬)(?:番|季)?)?|\d{4}[.\-/](?:0?[1-9]|1[0-2])|\d{2}年代|.*新番)$/i

  /**
   * 结构性/载体类/属性类停用词库
   */
  private static readonly carrierNoiseTags: ReadonlySet<string> = new Set([
    'tv',
    '剧场版',
    'ova',
    'oad',
    'web',
    'ona',
    'sp',
    '特别篇',
    '短片',
    '泡面番',
    'movie',
    'film',
    '里番',
    '动画',
    '番剧',
    '漫改',
    '漫画改',
    '小说改',
    '轻改',
    '轻小说改',
    '日本',
    '日漫',
    '中国',
    '国产',
    '欧美',
    'bilibili',
    'b站',
    'netflix',
    'tx',
  ])

  /**
   * 敏感/限制级标签集合
   */
  private static readonly safetySensitiveTags: ReadonlySet<string> = new Set([
    '里番',
    'r18',
    'r-18',
    '工口',
  ])

  /** 判断该标签是否属于标准题材推荐白名单 */
  static isAllowedGenre(tag: string): boolean {
    const clean = tag.trim().toLowerCase()
    return AnimeTagFilter.genreAllowList.has(clean)
  }

  /** 判断该标签是否属于时间类标签 */
  static isTemporalTag(tag: string): boolean {
    const clean = tag.trim()
    if (!clean) return false
    return AnimeTagFilter.temporalTagRegex.test(clean)
  }

  /** 判断该标签是否属于限制级敏感标签 */
  static isSafetySensitiveTag(tag: string): boolean {
    const clean = tag.trim().toLowerCase()
    return AnimeTagFilter.safetySensitiveTags.has(clean)
  }

  /** 综合判断该标签是否属于噪音标签 */
  static isNoiseTag(tag: string): boolean {
    const clean = tag.trim().toLowerCase()
    if (!clean) return true
    if (AnimeTagFilter.temporalTagRegex.test(clean)) return true
    if (AnimeTagFilter.carrierNoiseTags.has(clean)) return true
    return false
  }

  /** 使用白名单词典过滤用户原始词频 */
  static filterByGenreAllowList(
    rawFreq: Record<string, number>,
  ): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [tag, count] of Object.entries(rawFreq)) {
      const clean = tag.trim()
      if (AnimeTagFilter.isAllowedGenre(clean) && count > 0) {
        result[clean] = count
      }
    }
    return result
  }

  /** 清洗用户的原始标签词频表（黑名单模式） */
  static cleanUserTagFreq(
    rawFreq: Record<string, number>,
  ): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [tag, count] of Object.entries(rawFreq)) {
      const clean = tag.trim()
      if (!AnimeTagFilter.isNoiseTag(clean) && count > 0) {
        result[clean] = count
      }
    }
    return result
  }

  /** 清洗番剧自带的标签列表 */
  static cleanItemTags(tags: Iterable<string>): string[] {
    const result: string[] = []
    for (const t of tags) {
      const clean = t.trim()
      if (clean && !AnimeTagFilter.isNoiseTag(clean)) {
        result.push(clean)
      }
    }
    return result
  }
}

/**
 * 确定性伪随机数生成器（Seeded PRNG）：
 * 基于 32 位种子产生稳定可重现的伪随机序列，与天命种子配合保证全天推荐幂等。
 */
export class SeededRandom {
  private s: number

  constructor(seed: number) {
    this.s = (seed & 0x7fffffff) || 1
  }

  /** 产出 [0, 1) 浮点数 */
  next(): number {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** 产出 [0, maxExclusive) 整数 */
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0
    return Math.floor(this.next() * maxExclusive)
  }

  /** Fisher-Yates 确定性洗牌 */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1)
      const temp = array[i]
      array[i] = array[j]
      array[j] = temp
    }
    return array
  }
}

/**
 * 计算当天的 32 位确定性正整数天命种子（1:1 对齐 zakoway computeSeed）
 * 采用 32-bit FNV-1a 高离散度哈希算法
 */
export function computeDailySeed(deviceId: string, date: Date = new Date()): number {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const dateStr = `${year}-${month}-${day}`
  const raw = `${deviceId}#${dateStr}`

  let hash = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash & 0x7fffffff
}

/**
 * 首页算法/个性化推荐数据模型（1:1 对齐 zakoway RecommendItem）
 */
export interface RecommendItem {
  item: BangumiItem
  reason: string
  tag: string
  matchRate: number
}

export namespace RecommendItem {
  /**
   * 轻量规则引擎辅助方法：
   * 基于高分、收藏热度与标签在内存中生成高置信度推荐，并赋予明确的推荐理由。
   */
  export function generateRecommendations(
    sourceItems: BangumiItem[],
    maxCount = 5,
  ): RecommendItem[] {
    if (!sourceItems || sourceItems.length === 0) return []

    // 过滤出有有效封面和评分的条目
    const validItems = sourceItems.filter((e) => {
      const hasCover = Boolean(e.images?.large || e.images?.common || e.images?.medium)
      return hasCover && (e.ratingScore > 0 || e.votes > 0)
    })

    // 优先高分与高热度
    validItems.sort((a, b) => {
      const scoreA = a.ratingScore > 0 ? a.ratingScore : 7.0
      const scoreB = b.ratingScore > 0 ? b.ratingScore : 7.0
      return scoreB - scoreA
    })

    const targetItems = validItems.slice(0, maxCount)

    const tags = ['口碑神作', '当季精选', '深度佳作', '视觉盛宴', '小众黑马']
    const reasons = [
      'Bangumi 社区万人口碑共识，叙事与视听水准极佳',
      '近期追番热度与完播率持续攀升，制作水准上乘',
      '世界观架构扎实，人物塑造与剧情节奏尤为出众',
      '作画与音乐顶尖水准，声优阵容极其豪华',
      '题材别具一格，风格强烈且立意深刻的诚意之作',
    ]

    const result: RecommendItem[] = []
    for (let i = 0; i < targetItems.length; i++) {
      const item = targetItems[i]
      const tagIndex = i % tags.length
      const reasonIndex = i % reasons.length
      const matchRate = Math.min(99, Math.max(85, 98 - i * 2))

      result.push({
        item,
        reason: reasons[reasonIndex],
        tag: tags[tagIndex],
        matchRate,
      })
    }

    return result
  }
}

/**
 * 依据主题材与作品自身次级标签，合成地道二次元特色标签（1:1 对齐 zakoway resolveDisplayTag）
 */
export function resolveDisplayTag(
  mainTag: string | null | undefined,
  item: BangumiItem,
  rng?: SeededRandom,
): string {
  const subTags = new Set(
    (item.tags || [])
      .map((t) => t.name.trim())
      .filter((t) => t !== mainTag),
  )

  switch (mainTag) {
    case '恋爱':
      if (subTags.has('治愈') || subTags.has('纯爱')) return '#纯爱治愈'
      if (subTags.has('搞笑') || subTags.has('校园')) return '#恋爱喜剧'
      return '#恋爱喜剧'

    case '悬疑':
      if (subTags.has('智斗') || subTags.has('推理')) return '#硬核烧脑'
      return '#硬核烧脑'

    case '打斗':
    case '战斗':
      if (subTags.has('超能力') || subTags.has('热血')) return '#战斗爽'
      return '#战斗爽'

    case '日常':
      if (subTags.has('美食')) return '#下饭神作'
      if (subTags.has('治愈')) return '#日常治愈'
      return '#日常治愈'

    case '奇幻':
      if (subTags.has('异世界')) return '#异界冒险'
      if (subTags.has('冒险')) return '#奇幻冒险'
      return '#奇幻冒险'

    case '宫廷':
      if (subTags.has('悬疑') || subTags.has('剧情')) return '#宫廷权谋'
      return '#宫廷权谋'

    default: {
      const rawTags = (item.tags || []).map((t) => t.name)
      const validTags = AnimeTagFilter.cleanItemTags(rawTags)
      if (validTags.length > 0) {
        const pickIndex = rng ? rng.nextInt(validTags.length) : 0
        return `#${validTags[pickIndex]}`
      }
      if (mainTag && mainTag.length > 0) {
        return `#${mainTag}`
      }
      return '#每日推荐'
    }
  }
}

/**
 * 四维槽位推荐理由文案动态引擎（1:1 对齐 zakoway buildRecommendReason）
 */
/**
 * 四维槽位推荐理由文案动态引擎（1:1 对齐 zakoway buildRecommendReason）
 */
export function buildRecommendReason(
  slotIndex: number,
  mainTag: string | null | undefined,
  item: BangumiItem,
  isColdStart = false,
  matchRate?: number,
): string {
  const scoreStr = item.ratingScore > 0 ? `${item.ratingScore.toFixed(1)}分` : '高人气'
  const matchSegment = matchRate != null ? `，契合度 ${matchRate}%` : ''

  if (isColdStart && mainTag && mainTag.length > 0) {
    return `今日散落精选：【${mainTag}】题材${matchSegment}，Bangumi ${scoreStr}`
  }

  // 槽位 0 (Top 1 主力)
  if (slotIndex === 0 && mainTag) {
    return `命中你偏好最高的【${mainTag}】题材${matchSegment}，Bangumi ${scoreStr}`
  }

  // 槽位 1~2 (Top 2~3 次级主力)
  if ((slotIndex === 1 || slotIndex === 2) && mainTag) {
    return `兼顾你关注的【${mainTag}】风向${matchSegment}，Bangumi ${scoreStr}`
  }

  // 槽位 3~4 (长尾探索)
  if ((slotIndex === 3 || slotIndex === 4) && mainTag) {
    return `偶尔换换口味：捕捉到你兴趣库中的【${mainTag}】基因${matchSegment}，翻出的宝藏作品`
  }

  // 无标签 / 兜底
  return `今日番剧推荐：${matchRate != null ? `契合度 ${matchRate}%，` : ''}Bangumi ${scoreStr}`
}

/**
 * 聚合多数据源生成用户题材词频画像：
 * 1. 播放历史：按 bangumiId 去重，每部番剧只计一次题材频次（防止同番多集重复计数）；
 * 2. Bangumi 登录用户数据：提取在看 (type=2) 与看过 (type=3) 的 subject.tags；
 * 3. 自建用户系统预留口子：汇入 userSystemTags。
 */
export function collectUserGenreFrequencies(options: {
  historyItems?: WatchHistoryEntry[]
  bangumiCollections?: BangumiCollectionEntry[]
  userSystemTags?: string[]
}): Record<string, number> {
  const freq: Record<string, number> = {}

  // 1. 本地播放历史：按 bangumiId 去重
  if (options.historyItems && options.historyItems.length > 0) {
    const seenBangumiIds = new Set<number>()
    for (const item of options.historyItems) {
      if (item.bangumiId <= 0 || seenBangumiIds.has(item.bangumiId)) continue
      seenBangumiIds.add(item.bangumiId)

      if (Array.isArray(item.genres)) {
        for (const genre of item.genres) {
          const clean = genre.trim()
          if (AnimeTagFilter.isAllowedGenre(clean)) {
            freq[clean] = (freq[clean] || 0) + 1
          }
        }
      }
    }
  }

  // 2. Bangumi 登录用户数据：提取在看 (type=2) 与看过 (type=3)
  if (options.bangumiCollections && options.bangumiCollections.length > 0) {
    for (const col of options.bangumiCollections) {
      if (col.type !== 2 && col.type !== 3) continue

      const subTags = col.subject?.tags || []
      for (const t of subTags) {
        const name = typeof t === 'string' ? t : t?.name
        if (!name) continue
        const clean = name.trim()
        if (AnimeTagFilter.isAllowedGenre(clean)) {
          freq[clean] = (freq[clean] || 0) + 1
        }
      }

      // 用户自己打的自定义标签（如有）
      const customTags = (col as { tags?: unknown[] }).tags || []
      for (const t of customTags) {
        const name = typeof t === 'string' ? t : (t as { name?: string })?.name
        if (!name) continue
        const clean = String(name).trim()
        if (AnimeTagFilter.isAllowedGenre(clean)) {
          freq[clean] = (freq[clean] || 0) + 1
        }
      }
    }
  }

  // 3. 预留口子：未来自建用户系统标签
  if (options.userSystemTags && options.userSystemTags.length > 0) {
    for (const tag of options.userSystemTags) {
      const clean = String(tag).trim()
      if (AnimeTagFilter.isAllowedGenre(clean)) {
        freq[clean] = (freq[clean] || 0) + 1
      }
    }
  }

  return freq
}

/**
 * 每日推荐服务客户端依赖契约
 */
export interface DailyRecommendClient {
  searchWithTotal: (
    keyword: string,
    opts: {
      tags?: string[]
      sort?: string
      limit?: number
      offset?: number
      type?: number[] | number
    },
  ) => Promise<{ items: BangumiItem[]; total?: number }>
  getTagTotal?: (tag: string) => Promise<number>
  getTrending: (limit?: number) => Promise<BangumiItem[]>
}

/**
 * 今日推荐调度核心算法服务（广域离散散落采样架构，1:1 对齐 zakoway DailyRecommendService）：
 * 1. 确定性天命种子（Deterministic Daily Seed）：
 *    结合设备唯一标识 (DeviceUUID) 与当日日期字符串计算 32 位离散哈希，
 *    确保“千人千面、天内绝对幂等（全天刷新结果不变）、次日零点自动平滑轮换”；
 * 2. 受控白名单精准清洗：
 *    通过 AnimeTagFilter.genreAllowList 过滤用户输入，彻底免疫时间、载体、恶搞短句等一切 UGC 噪音；
 * 3. 广域离散散落采样（Scattered Sampling，坚决杜绝连号与扎堆）：
 *    - 5 个槽位题材严格互斥（绝不推荐同一题材）；
 *    - 每个槽位基于独立随机跳跃与基底计算 offset，翻页深度彼此相距甚远，杜绝在同一局部区间抓取连号邻近条目；
 *    - 排序维度交替采用 heat（热度/流行新番）与 score（口碑经典），热度与品质错落交替；
 *    - 评分不过滤：放宽生硬的评分限制，让 6~8 分各类精品与宝藏自然涌现；
 * 4. 槽位调度与降级保护：
 *    - 无数据时（冷启动）：从题材库中离散打乱抽样 5 个互斥题材独立检索；
 *    - 有数据时（个性化）：前几个槽位绑定用户 Top 偏好题材，其余槽位取长尾与探索互斥题材；
 * 5. 跨槽位与播放历史全局去重，输出稳固散落的 5 部今日推荐番剧。
 */
export class DailyRecommendService {
  /** 缓存当天的推荐计算结果，避免同一会话内重复计算 */
  private static memoryCachedItems: RecommendItem[] | null = null
  private static cachedDateKey: string | null = null

  /** 清空今日推荐的内存与时间戳缓存 */
  static clearCache(): void {
    DailyRecommendService.memoryCachedItems = null
    DailyRecommendService.cachedDateKey = null
  }

  /** 获取今日推荐番剧核心入口 */
  static async getDailyRecommendations(params: {
    client: DailyRecommendClient
    rawUserTagFreq?: Record<string, number>
    watchedSubjectIds?: Set<number>
    customDate?: Date
    customDeviceId: string
    forceRefresh?: boolean
    diskCache?: {
      get: (key: string) => Promise<RecommendItem[] | null>
      set: (key: string, data: RecommendItem[], maxAgeMs: number) => Promise<void>
    }
  }): Promise<RecommendItem[]> {
    const {
      client,
      rawUserTagFreq = {},
      watchedSubjectIds = new Set<number>(),
      customDate,
      customDeviceId,
      forceRefresh = false,
      diskCache,
    } = params

    const now = customDate || new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const dateKey = `${year}-${month}-${day}`
    const diskCacheKey = `daily_roam_bundle_${dateKey}`

    // 1. L1 内存缓存拦截（当前会话内绝对幂等）
    if (
      !forceRefresh &&
      DailyRecommendService.cachedDateKey === dateKey &&
      DailyRecommendService.memoryCachedItems
    ) {
      return DailyRecommendService.memoryCachedItems
    }

    // 2. L2 本地持久化缓存拦截（用户刷新页面时 0ms 命中，0 次网络请求）
    if (!forceRefresh && diskCache) {
      try {
        const cached = await diskCache.get(diskCacheKey)
        if (cached && Array.isArray(cached) && cached.length > 0) {
          DailyRecommendService.cachedDateKey = dateKey
          DailyRecommendService.memoryCachedItems = cached
          return cached
        }
      } catch {}
    }

    const seed = computeDailySeed(customDeviceId, now)
    const rng = new SeededRandom(seed)

    // 3. 白名单清洗用户词频画像
    const cleanProfile = AnimeTagFilter.filterByGenreAllowList(rawUserTagFreq)

    let finalRecommendations: RecommendItem[]

    if (Object.keys(cleanProfile).length === 0) {
      // 4. 情况 A：冷启动（无用户数据）
      finalRecommendations = await DailyRecommendService.fetchColdStartRecommendations({
        client,
        seed,
        rng,
        watchedSubjectIds,
      })
    } else {
      // 5. 情况 B：有用户数据（Top 3 主力 + 2 长尾探索）
      finalRecommendations = await DailyRecommendService.fetchPersonalizedRecommendations({
        client,
        cleanProfile,
        seed,
        rng,
        watchedSubjectIds,
      })
    }

    // 6. 回填 L1 内存缓存
    DailyRecommendService.cachedDateKey = dateKey
    DailyRecommendService.memoryCachedItems = finalRecommendations

    // 7. 异步安全落盘至 L2 硬盘：有效期锁定至今日 23:59:59 (次日零点自动过期)
    if (diskCache) {
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      const remainingTtl = endOfDay.getTime() - now.getTime()
      const validDuration = remainingTtl <= 0 || remainingTtl < 15 * 60_000
        ? 4 * 3600_000
        : remainingTtl

      diskCache
        .set(diskCacheKey, finalRecommendations, validDuration)
        .catch(() => {})
    }

    return finalRecommendations
  }

  /**
   * 冷启动抓取：广域离散散落抽样（从白名单题材库中抽选 5 个互斥题材独立检索，绝不连号扎堆）
   */
  private static async fetchColdStartRecommendations(params: {
    client: DailyRecommendClient
    seed: number
    rng: SeededRandom
    watchedSubjectIds: Set<number>
  }): Promise<RecommendItem[]> {
    const { client, seed, rng, watchedSubjectIds } = params

    // 从题材白名单中基于种子打乱选取 5 个截然不同的题材，确保 5 个槽位题材完全互斥
    const availableGenres = rng.shuffle([...AnimeTagFilter.genreAllowList])
    const slotTags = availableGenres.slice(0, 5)

    return DailyRecommendService.fetchScatteredRecommendations({
      client,
      slotTags,
      seed,
      rng,
      watchedSubjectIds,
      isColdStart: true,
    })
  }

  /**
   * 个性化抓取：前几个槽位绑定用户 Top 偏好题材，其余槽位取长尾与探索互斥题材
   */
  private static async fetchPersonalizedRecommendations(params: {
    client: DailyRecommendClient
    cleanProfile: Record<string, number>
    seed: number
    rng: SeededRandom
    watchedSubjectIds: Set<number>
  }): Promise<RecommendItem[]> {
    const { client, cleanProfile, seed, rng, watchedSubjectIds } = params

    // 1. 标签按频次降序排序
    const sortedTags = Object.keys(cleanProfile).sort(
      (a, b) => (cleanProfile[b] || 0) - (cleanProfile[a] || 0),
    )

    // 2. 提取 Top 3 核心偏好标签
    const top3Tags = sortedTags.slice(0, 3)

    // 3. 提取长尾候选标签（排除 Top 3）
    const remainingTags = sortedTags.length > 3 ? sortedTags.slice(3) : []
    const selectedLongTailTags: string[] = []
    if (remainingTags.length > 0) {
      const shuffled = rng.shuffle([...remainingTags])
      selectedLongTailTags.push(...shuffled.slice(0, 2))
    }

    // 4. 构建 5 个互斥的槽位标签；若用户题材不足 5 个，从白名单题材中补充互斥题材
    const pickedTagSet = new Set([...top3Tags, ...selectedLongTailTags])
    const candidateGenres = rng.shuffle(
      [...AnimeTagFilter.genreAllowList].filter((g) => !pickedTagSet.has(g)),
    )

    const slotTags = [...top3Tags, ...selectedLongTailTags]
    for (const genre of candidateGenres) {
      if (slotTags.length >= 5) break
      slotTags.push(genre)
    }

    return DailyRecommendService.fetchScatteredRecommendations({
      client,
      slotTags,
      seed,
      rng,
      watchedSubjectIds,
      isColdStart: false,
    })
  }

  /**
   * 核心离散散落推荐调度引擎：
   * 1. 题材散落：5 个槽位题材严格互斥，各探索不同风格；
   * 2. 深度散落：每个槽位使用独立散列跳跃计算 offset，翻页深度彼此相距甚远，杜绝在同一局部区间抓取连号邻近条目；
   * 3. 排序错落：交替使用 heat（热度）与 score（口碑经典），热度与口碑自然交融；
   * 4. 评分不过滤：放宽生硬的评分限制，只校验海报有效性与已看去重，让 6~8 分各类精品与宝藏自然涌现；
   * 5. 跨槽位全局去重与已看过滤，平滑兜底。
   */
  private static async fetchScatteredRecommendations(params: {
    client: DailyRecommendClient
    slotTags: string[]
    seed: number
    rng: SeededRandom
    watchedSubjectIds: Set<number>
    isColdStart: boolean
  }): Promise<RecommendItem[]> {
    const { client, slotTags, seed, rng, watchedSubjectIds, isColdStart } = params

    // 排序错落交替：热度流行与口碑经典错落交融
    const sortModes = ['heat', 'score', 'heat', 'score', 'heat']

    const slotPromises: Promise<BangumiItem[]>[] = []
    let prevOffset = -999

    for (let i = 0; i < 5; i++) {
      const targetTag = i < slotTags.length ? slotTags[i] : null
      const sortMode = sortModes[i % sortModes.length]

      // 广域全库大纵深真随机漫游：读取题材持久化容量 total，在 0 ~ (total - 8) 范围内基于天命种子散列跳跃
      const effectiveTag = targetTag || '日本'
      const tagTotal = client.getTagTotal ? await client.getTagTotal(effectiveTag) : 400
      const maxOffset = Math.max(0, tagTotal - 8)
      let slotOffset = maxOffset > 0 ? rng.nextInt(maxOffset + 1) : 0

      // 确保槽位之间大跨度散落，绝不相邻连号
      if (Math.abs(slotOffset - prevOffset) <= 1 && maxOffset > 10) {
        slotOffset = (slotOffset + 17) % (maxOffset + 1)
      }
      prevOffset = slotOffset

      const searchTags = targetTag ? [targetTag, '日本'] : ['日本']

      slotPromises.push(
        (async () => {
          try {
            // 严格限定 type: 2 (Anime 动画)，避免 Bangumi 上游检索包含 type: 6 (Real 三次元/日剧)
            let res = await client.searchWithTotal('', {
              tags: searchTags,
              sort: sortMode,
              limit: 8,
              offset: slotOffset,
              type: 2,
            })

            // 自适应防空保底：若冷门题材因大 offset 返回空，平滑退回 offset: 0
            if ((!res.items || res.items.length === 0) && slotOffset > 0) {
              res = await client.searchWithTotal('', {
                tags: searchTags,
                sort: sortMode,
                limit: 8,
                offset: 0,
                type: 2,
              })
            }

            return res.items || []
          } catch {
            return []
          }
        })(),
      )
    }

    const slotResults = await Promise.all(slotPromises)

    // 跨槽位去重与已看过滤（取消死板评分限制，重点保证条目散落不扎堆）
    const seenIds = new Set<number>(watchedSubjectIds)
    const chosenItems: BangumiItem[] = []
    const chosenTags: string[] = []

    for (let i = 0; i < 5; i++) {
      const candidates = slotResults[i] || []
      let picked: BangumiItem | null = null
      for (const item of candidates) {
        const cover = item.images?.large || item.images?.common || item.images?.medium
        if (!seenIds.has(item.id) && cover) {
          picked = item
          break
        }
      }

      if (picked) {
        seenIds.add(picked.id)
        chosenItems.push(picked)
        chosenTags.push(i < slotTags.length ? slotTags[i] : '精选')
      }
    }

    // 兜底补偿：若因去重或偏门标签未凑满 5 部，通过离散 offset 全量池平滑补充
    if (chosenItems.length < 5) {
      try {
        const fallbackOffset = ((seed * 73 + chosenItems.length * 29) & 0x7fffffff) % 100
        // 严格限定 type: 2 (Anime 动画)，避免兜底池混入三次元日剧
        const fallbackRes = await client.searchWithTotal('', {
          tags: ['日本'],
          sort: 'heat',
          limit: 12,
          offset: fallbackOffset,
          type: 2,
        })
        for (const item of fallbackRes.items || []) {
          const cover = item.images?.large || item.images?.common || item.images?.medium
          if (!seenIds.has(item.id) && cover) {
            seenIds.add(item.id)
            chosenItems.push(item)
            chosenTags.push('精选')
            if (chosenItems.length >= 5) break
          }
        }
      } catch {}
    }

    // 终极网络失败兜底（当 Bangumi 搜索完全不可用时）：从热门列表中补充
    if (chosenItems.length === 0) {
      try {
        const hotFallback = await client.getTrending(10)
        for (const item of hotFallback || []) {
          const cover = item.images?.large || item.images?.common || item.images?.medium
          if (!seenIds.has(item.id) && cover) {
            seenIds.add(item.id)
            chosenItems.push(item)
            chosenTags.push('精选')
            if (chosenItems.length >= 5) break
          }
        }
      } catch {}
    }

    // 装箱为推荐实体
    const result: RecommendItem[] = []
    for (let i = 0; i < chosenItems.length; i++) {
      const item = chosenItems[i]
      const tag = chosenTags[i]
      const isDegraded = tag === '精选'
      const displayTag = resolveDisplayTag(isDegraded ? null : tag, item, rng)
      const matchRate = 98 - i * 2
      const reason = buildRecommendReason(i, isDegraded ? null : tag, item, isColdStart, matchRate)

      result.push({
        item,
        tag: displayTag,
        reason,
        matchRate,
      })
    }

    return result
  }
}
