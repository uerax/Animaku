import { Modal } from './Modal'
import type { AnnouncementItem } from '../stores/site-config'

const DISMISSED_KEY = 'animaku_announcement_dismissed'
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * 检查当前公告在浏览器中是否处于 1 天免打扰缓存期内
 * - 若公告 ID 与本地缓存不一致（管理员发布新公告或修改了内容），立即返回 false（打破缓存重新弹窗）
 * - 若处于同一 ID 且未满 1 天，返回 true（不再提示）
 */
export function isAnnouncementDismissed(announcementId: string): boolean {
  if (typeof window === 'undefined' || !announcementId) return false
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { id?: string; expireAt?: number }
    if (parsed.id !== announcementId) {
      return false
    }
    if (typeof parsed.expireAt === 'number' && Date.now() < parsed.expireAt) {
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * 将公告标记为已读并写入 1 天浏览器本地缓存
 */
export function dismissAnnouncement(announcementId: string): void {
  if (typeof window === 'undefined' || !announcementId) return
  try {
    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify({
        id: announcementId,
        expireAt: Date.now() + ONE_DAY_MS,
      }),
    )
  } catch {}
}

interface SiteAnnouncementModalProps {
  announcement: AnnouncementItem
  onClose: () => void
}

const SIZE_STYLES = {
  compact: {
    container: 'max-w-[340px] sm:max-w-[360px]',
    title: 'text-sm sm:text-base',
    content: 'text-xs sm:text-[13px]',
    padding: 'p-4',
  },
  standard: {
    container: 'max-w-[420px] sm:max-w-[460px]',
    title: 'text-base sm:text-lg',
    content: 'text-sm leading-relaxed',
    padding: 'p-5',
  },
  large: {
    container: 'max-w-[500px] sm:max-w-[560px]',
    title: 'text-lg sm:text-xl',
    content: 'text-sm sm:text-base leading-relaxed',
    padding: 'p-6',
  },
} as const

export function SiteAnnouncementModal({
  announcement,
  onClose,
}: SiteAnnouncementModalProps) {
  const {
    title,
    content,
    imageUrl,
    imageLink,
    size = 'standard',
    imageHeight,
    imageWidth = 100,
    imageOffsetX = 50,
    imageOffsetY = 50,
    imageZoom = 1,
  } = announcement
  const s = SIZE_STYLES[size] || SIZE_STYLES.standard
  const isFixedArea = Boolean(imageHeight && imageHeight > 0)

  return (
    <Modal
      open={true}
      onClose={onClose}
      ariaLabel="站点公告"
      hasBackdrop={false}
      lockScroll={false}
      className={`flex flex-col items-center w-full ${s.container}`}
    >
      {/* 展示卡片主体：标题在上方，图片在最下方，超高长图卡内平滑滚动 */}
      <div className={`w-full ${!imageUrl ? 'min-h-[140px]' : ''} rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg)] shadow-2xl overflow-hidden flex flex-col max-h-[82vh] ring-1 ring-black/10 dark:ring-white/10`}>
        {/* 滚动容器：标题在上方，正文紧随其后，图片位于最下方 */}
        <div className="overflow-y-auto flex-1 flex flex-col">
          {/* 顶部标题与正文区域 */}
          {(title || content || !imageUrl) && (
            <div
              className={`${s.padding} ${imageUrl ? 'pb-3' : ''} space-y-2 shrink-0 ${
                !imageUrl ? 'flex-1 flex flex-col justify-center' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--kz-accent)] mb-0.5">
                <span className="text-sm">📢</span>
                <span>站点公告</span>
              </div>
              {title && (
                <h2 className={`${s.title} font-bold text-[var(--kz-fg)] leading-snug tracking-tight`}>
                  {title}
                </h2>
              )}
              {content && (
                <div className={`${s.content} text-[var(--kz-fg-muted)] whitespace-pre-wrap break-words leading-relaxed`}>
                  {content}
                </div>
              )}
            </div>
          )}

          {/* 配图区域：位于卡片最下方，支持自定义展示高宽、平移焦点与缩放（放大/缩小） */}
          {imageUrl && (
            <div
              className={`w-full shrink-0 bg-black/5 overflow-hidden flex items-center justify-center mt-auto ${
                title || content ? 'border-t border-[var(--kz-border)]/30' : ''
              }`}
              style={{
                height: isFixedArea ? `${imageHeight}px` : 'auto',
              }}
            >
              {imageLink ? (
                <a
                  href={imageLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center relative group overflow-hidden w-full h-full"
                  title="点击打开链接"
                >
                  <img
                    src={imageUrl}
                    alt={title || '站点公告'}
                    style={{
                      height: isFixedArea ? '100%' : 'auto',
                      width: `${imageWidth}%`,
                      maxWidth: '100%',
                      objectFit: isFixedArea ? 'cover' : 'contain',
                      objectPosition: `${imageOffsetX}% ${imageOffsetY}%`,
                      transform: imageZoom && imageZoom !== 1 ? `scale(${imageZoom})` : undefined,
                    }}
                    className="block transition-transform duration-300 group-hover:scale-[1.01]"
                  />
                  <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white/95 backdrop-blur-md opacity-85 group-hover:opacity-100 transition-opacity">
                    点击跳转 ↗
                  </span>
                </a>
              ) : (
                <img
                  src={imageUrl}
                  alt={title || '站点公告'}
                  style={{
                    height: isFixedArea ? '100%' : 'auto',
                    width: `${imageWidth}%`,
                    maxWidth: '100%',
                    objectFit: isFixedArea ? 'cover' : 'contain',
                    objectPosition: `${imageOffsetX}% ${imageOffsetY}%`,
                    transform: imageZoom && imageZoom !== 1 ? `scale(${imageZoom})` : undefined,
                  }}
                  className="block"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 卡片正下方居中关闭按钮 */}
      <div className="mt-3.5 flex justify-center shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭公告"
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg)] hover:bg-[var(--kz-bg-soft)] active:scale-90 text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] flex items-center justify-center transition-all shadow-lg cursor-pointer"
        >
          <svg
            className="w-4.5 h-4.5 stroke-[2]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </Modal>
  )
}
