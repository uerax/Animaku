import { memo, useState, useRef, useLayoutEffect, useEffect } from 'react'
import clsx from 'clsx'
import { CollectTypeLabel, type CommentItem } from '@animaku/shared'

const STAR_PATH =
  'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'

/**
 * B 站风格 5 星制评分渲染组件
 * 1:1 复刻 B 站番剧评分五角星：圆润角、正金橙色 (#FFAA04)、实心浅灰未激活底
 */
function BiliStarRating({ rate }: { rate: number }) {
  // Bangumi 1~10 分映射为 5 星制 (0.5~5.0)
  const starScore = Math.max(0, Math.min(5, rate / 2))

  return (
    <div
      className="inline-flex items-center gap-0.5 select-none"
      title={`评分: ${rate} / 10 分`}
      aria-label={`评分 ${rate} 分`}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const fillAmount = Math.max(0, Math.min(1, starScore - i))

        if (fillAmount >= 0.75) {
          // 全满星: B 站经典橙金 (#FFAA04) + 圆润描边
          return (
            <svg
              key={i}
              className="h-3.5 w-3.5 fill-[#FFAA04] stroke-[#FFAA04] stroke-[1.2]"
              style={{ strokeLinejoin: 'round', strokeLinecap: 'round' }}
              viewBox="0 0 24 24"
            >
              <path d={STAR_PATH} />
            </svg>
          )
        }

        if (fillAmount >= 0.25) {
          // 半星: 左半边正橙金，右半边浅灰底
          return (
            <span key={i} className="relative inline-block h-3.5 w-3.5">
              <svg
                className="absolute inset-0 h-3.5 w-3.5 fill-[var(--kz-border)] stroke-[var(--kz-border)] stroke-[1.2] opacity-80"
                style={{ strokeLinejoin: 'round', strokeLinecap: 'round' }}
                viewBox="0 0 24 24"
              >
                <path d={STAR_PATH} />
              </svg>
              <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                <svg
                  className="h-3.5 w-3.5 fill-[#FFAA04] stroke-[#FFAA04] stroke-[1.2]"
                  style={{ strokeLinejoin: 'round', strokeLinecap: 'round' }}
                  viewBox="0 0 24 24"
                >
                  <path d={STAR_PATH} />
                </svg>
              </span>
            </span>
          )
        }

        // 空星: 浅灰实底 + 圆润微线
        return (
          <svg
            key={i}
            className="h-3.5 w-3.5 fill-[var(--kz-border)] stroke-[var(--kz-border)] stroke-[1.2] opacity-70"
            style={{ strokeLinejoin: 'round', strokeLinecap: 'round' }}
            viewBox="0 0 24 24"
          >
            <path d={STAR_PATH} />
          </svg>
        )
      })}
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr

  const now = Date.now()
  const diffSec = Math.floor((now - d.getTime()) / 1000)

  if (diffSec < 60) return '刚刚'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)} 天前`
  if (diffSec < 86400 * 365) return `${Math.floor(diffSec / (86400 * 30))} 个月前`
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const CommentCard = memo(function CommentCard({
  comment,
  showActions = false, // 预留开关：后续接入自建点赞系统时置为 true 即可
}: {
  comment: CommentItem
  showActions?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [canOverflow, setCanOverflow] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)

  const content = comment.content || ''
  const timeLabel = formatRelativeTime(comment.createdAt)
  const statusLabel =
    comment.collectionType != null ? CollectTypeLabel[comment.collectionType] : null

  // 严格基于真实 DOM 尺寸测量是否产生了行数溢出截断
  const useIsomorphicLayoutEffect =
    typeof window !== 'undefined' ? useLayoutEffect : useEffect

  useIsomorphicLayoutEffect(() => {
    // 💡 无内容时直接跳过溢出测量，零 Observer 性能开销
    if (!content) return

    const el = textRef.current
    if (!el) return

    const checkOverflow = () => {
      // 只有在未展开时，比较真实内容高度与可视高度
      if (!expanded) {
        const isClamped = el.scrollHeight > el.clientHeight + 1
        setCanOverflow(isClamped)
      }
    }

    checkOverflow()

    const ro = new ResizeObserver(() => {
      checkOverflow()
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
    }
  }, [content, expanded])

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-[var(--kz-border)]/60 bg-[var(--kz-bg-card)] p-3.5 transition-colors hover:border-[var(--kz-border)] hover:bg-[var(--kz-bg-hover)]/40">
      {/* 用户头像 */}
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[var(--kz-bg-soft)] ring-1 ring-[var(--kz-border)]/60 shadow-xs">
        {comment.author.avatar ? (
          <img
            src={comment.author.avatar}
            alt={comment.author.nickname}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={(e) => {
              ;(e.currentTarget as HTMLElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[var(--kz-fg-muted)]">
            {(comment.author.nickname || '匿')[0]}
          </div>
        )}
      </div>

      {/* 右侧主体内容 */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* 顶部作者信息与打分星星 (B 站同款单行横排) */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {/* 用户昵称 */}
          <span className="text-sm font-semibold text-[var(--kz-fg)]">
            {comment.author.nickname}
          </span>

          {/* B 站 5 星填充格式 */}
          {comment.rate != null && comment.rate > 0 && (
            <BiliStarRating rate={comment.rate} />
          )}

          {/* 观看状态微胶囊 (如 看过 / 在看) */}
          {statusLabel && (
            <span
              className={clsx(
                'rounded-full px-1.5 py-0.2 text-[10.5px] font-medium leading-tight',
                comment.collectionType === 4 || comment.collectionType === 2
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : comment.collectionType === 1
                    ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                    : 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
              )}
            >
              {statusLabel}
            </span>
          )}

          {/* 右侧发布时间 */}
          {timeLabel && (
            <span
              className="ml-auto text-xs text-[var(--kz-fg-dim)]"
              title={comment.createdAt}
            >
              {timeLabel}
            </span>
          )}
        </div>

        {/* 💡 评论正文：仅当有内容时渲染，无文字时整块隐藏保持卡片高度紧凑 */}
        {content ? (
          <div className="relative text-sm leading-relaxed text-[var(--kz-fg-muted)]">
            <p
              ref={textRef}
              className={clsx(
                'whitespace-pre-wrap break-words transition-all',
                !expanded && 'line-clamp-2',
              )}
            >
              {content}
            </p>

            {/* 只有在确实发生溢出截断时，才展示精致的 B 站同款展开/收起文字 */}
            {(canOverflow || expanded) && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--kz-accent)] hover:opacity-80 transition-opacity focus:outline-hidden cursor-pointer"
                >
                  <span>{expanded ? '收起' : '展开'}</span>
                  <span className="text-[10px] leading-none">
                    {expanded ? '▲' : '▼'}
                  </span>
                </button>
              </div>
            )}
          </div>
        ) : null}

        {/* 🔮 预留互动操作栏 (默认隐藏，保留完整代码，后续接入自建点赞系统后直接开启) */}
        {showActions && (
          <div className="flex items-center gap-4 pt-1 text-[var(--kz-fg-muted)] select-none">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-[var(--kz-fg-dim)] hover:text-[var(--kz-accent)] transition-colors focus:outline-hidden cursor-pointer"
              title="点赞"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"
                />
              </svg>
              {comment.stats?.likeCount != null && comment.stats.likeCount > 0 && (
                <span className="tabular-nums">{comment.stats.likeCount}</span>
              )}
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-[var(--kz-fg-dim)] hover:text-[var(--kz-fg)] transition-colors focus:outline-hidden cursor-pointer"
              title="点踩"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h3a2 2 0 012 2v7a2 2 0 01-2 2h-3"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
})
