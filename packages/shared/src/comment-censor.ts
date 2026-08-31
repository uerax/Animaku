/**
 * 评论区内容过滤与局部遮掩分词引擎 (Comment Censor & Rich Tokenizer)
 *
 * 采用规则插件/策略设计模式 (Rule-based Lexer & Strategy Pattern)，
 * 将纯文本解析为结构化 AST Token 数组，供客户端实现黑幕遮掩、点击解密与安全跳转。
 */

export type CommentTokenType =
  | 'text'
  | 'link'
  | 'social_lead'
  | 'number'
  | 'keyword'
  | (string & {})

export interface CommentTextToken {
  type: CommentTokenType
  raw: string
  /** 供 UI 显示的友好提示，如 "外部链接", "疑似引流", "数字串码" */
  label?: string
  /** 如果是链接，补全协议 (https://) 后的规范化目标 URL */
  url?: string
  /** 是否需要黑幕遮掩（默认需要，text 为 false） */
  redacted?: boolean
  /** 预留扩展元数据（如自定义表情 code, 违禁级别等） */
  meta?: Record<string, unknown>
}

export interface CensorRule {
  name: string
  pattern: RegExp
  type: CommentTokenType
  label?: string
  /** 将正则匹配结果转换为 Token 属性（可读取 match[1], match[2] 等子捕获组） */
  transform?: (match: RegExpExecArray) => Partial<CommentTextToken>
}

// ---------------- 权威正则集合 (零依赖、防误伤调优) ----------------

/**
 * 匹配带协议的 URL 以及主流裸域名/短链 (如 tt.vg/jmxz, pan.baidu.com/s/123, b23.tv/xxx)
 * 特点：
 * 1. 支持 http://, https://, 或无协议的裸域名
 * 2. 覆盖主流全球与短链 TLD (com, cn, net, org, tv, vg, me, io, cc, top, xyz, vip, site, link, app, fun, moe, dev, ai 等)
 * 3. 严格限定左边界与 TLD，杜绝中文句号 (如 "好看.但是") 误伤
 */
export const URL_PATTERN =
  /(?:https?:\/\/)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|cn|net|org|tv|vg|me|io|cc|top|xyz|vip|site|link|app|fun|moe|dev|ai|gg|co|info|icu|space|la|pw|in)(?::\d{2,5})?(?:\/[^\s一-龥<>"'()（）[\]]*)?/gi

/**
 * 匹配中文社交引流与群号 (如 Q群: 12345678、企鹅裙 987654、+vx: abc1234、TG: @xxx、进群 888888)
 */
export const SOCIAL_LEAD_PATTERN =
  /(?:QQ群?|[qQ]群?|企鹅[裙群]?|扣扣[裙群]?|加[裙群]|群号|微信|微信号?|[vV][xX]|TG|tg|电报)[\s:：#号*]*([a-zA-Z0-9_@-]{5,20})/gi

/**
 * 匹配 6~11 位孤立纯长数字 (如 83749281)
 * 通过负向前后断言，自动排除：年份(2024年)、第12集、8.5分、1080P、60fps 等正常自然表达
 */
export const UNKNOWN_NUMBER_PATTERN =
  /(?<!\d|\.)([1-9]\d{5,10})(?!\d|\.|年|集|话|分|[pP]|fps)/g

// ---------------- 默认预置规则流水线 ----------------

export const DEFAULT_CENSOR_RULES: CensorRule[] = [
  {
    name: 'url',
    pattern: URL_PATTERN,
    type: 'link',
    label: '外部链接',
    transform: (match) => {
      const raw = match[0]
      const url = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
      return { url }
    },
  },
  {
    name: 'social_lead',
    pattern: SOCIAL_LEAD_PATTERN,
    type: 'social_lead',
    label: '疑似引流',
    transform: (match) => ({
      meta: { account: match[1] },
    }),
  },
  {
    name: 'unknown_number',
    pattern: UNKNOWN_NUMBER_PATTERN,
    type: 'number',
    label: '串码',
  },
]

/**
 * 词法分词纯函数：将文本解析为 AST Token 列表
 * 采用独立规则扫描与重叠贪心仲裁算法，满足开闭原则 (Open-Closed Principle)，
 * 支持传入自定义规则追加或替换。
 */
export function tokenizeCommentText(
  text: string,
  rules: CensorRule[] = DEFAULT_CENSOR_RULES,
): CommentTextToken[] {
  if (!text) return []
  if (!rules || rules.length === 0) {
    return [{ type: 'text', raw: text, redacted: false }]
  }

  // 1. 独立扫描所有规则命中的区间
  const allMatches: {
    rule: CensorRule
    ruleIndex: number
    index: number
    endIndex: number
    raw: string
    match: RegExpExecArray
  }[] = []

  for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
    const rule = rules[ruleIndex]
    const flags = rule.pattern.flags.includes('g')
      ? rule.pattern.flags
      : rule.pattern.flags + 'g'
    const re = new RegExp(rule.pattern.source, flags)

    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        // 防止零宽断言死循环
        re.lastIndex++
        continue
      }
      allMatches.push({
        rule,
        ruleIndex,
        index: m.index,
        endIndex: m.index + m[0].length,
        raw: m[0],
        match: m,
      })
    }
  }

  // 2. 按起始位置升序排序；若起始位置相同，按规则数组声明顺序排序（高优先级胜出）
  allMatches.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index
    return a.ruleIndex - b.ruleIndex
  })

  // 3. 贪心消除重叠区间
  const nonOverlapping: typeof allMatches = []
  let currentEnd = 0

  for (const m of allMatches) {
    if (m.index >= currentEnd) {
      nonOverlapping.push(m)
      currentEnd = m.endIndex
    }
  }

  // 4. 构建 AST Token 数组
  const tokens: CommentTextToken[] = []
  let cursor = 0

  for (const item of nonOverlapping) {
    if (item.index > cursor) {
      tokens.push({
        type: 'text',
        raw: text.slice(cursor, item.index),
        redacted: false,
      })
    }

    const extraProps = item.rule.transform ? item.rule.transform(item.match) : {}
    tokens.push({
      type: item.rule.type,
      raw: item.raw,
      label: item.rule.label,
      redacted: true,
      ...extraProps,
    })

    cursor = item.endIndex
  }

  if (cursor < text.length) {
    tokens.push({
      type: 'text',
      raw: text.slice(cursor),
      redacted: false,
    })
  }

  return tokens
}
