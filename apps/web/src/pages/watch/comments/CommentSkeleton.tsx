export function CommentSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="加载吐槽列表中">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-xl p-3 border border-[var(--kz-border)]/40 bg-[var(--kz-bg-card)]/50"
        >
          {/* 头像骨架 */}
          <div className="kz-skeleton h-9 w-9 shrink-0 rounded-full ring-1 ring-[var(--kz-border)]/40" />

          {/* 右侧内容骨架 */}
          <div className="flex-1 min-w-0 space-y-2.5">
            {/* 作者行 */}
            <div className="flex items-center gap-2">
              <div className="kz-skeleton h-3.5 w-24 rounded" />
              <div className="kz-skeleton h-3.5 w-12 rounded-full" />
              <div className="kz-skeleton h-3.5 w-10 rounded" />
              <div className="kz-skeleton h-3 w-16 ml-auto rounded" />
            </div>

            {/* 正文骨架 */}
            <div className="space-y-1.5">
              <div className="kz-skeleton h-3.5 w-full rounded" />
              <div className="kz-skeleton h-3.5 w-4/5 rounded" />
              <div className="kz-skeleton h-3.5 w-2/3 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
