import { getSiteBranding } from '../lib/site-branding'

const START_YEAR = 2026

/**
 * Minimalist inline horizontal footer inspired by GitHub.
 * Single row centered flow: Brand · Version · Copyright · Source · Feedback · Disclaimer
 */
export function SiteFooter() {
  const b = getSiteBranding()
  const currentYear = new Date().getFullYear()
  const yearDisplay =
    currentYear > START_YEAR ? `${START_YEAR}–${currentYear}` : `${START_YEAR}`

  const maintainerLabel = b.maintainerName
    ? b.maintainerName
    : b.maintainerUrl
      ? hostLabel(b.maintainerUrl)
      : ''

  const githubUrl = b.githubUrl || 'https://github.com/uerax/Animaku'

  return (
    <footer className="border-t border-[var(--kz-border)]">
      <div className="mx-auto flex max-w-[1760px] flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 px-4 py-3.5 text-[12px] text-[var(--kz-fg-muted)] sm:px-5 sm:py-4 lg:px-6">
        <span className="font-medium tracking-tight text-[var(--kz-fg)]">
          {b.productName}
        </span>
        {b.version ? (
          <span className="rounded-md border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--kz-fg-dim)] leading-none">
            {b.version}
          </span>
        ) : null}

        <span className="text-[var(--kz-border)]" aria-hidden>
          ·
        </span>

        <span className="inline-flex items-center gap-1.5">
          <span>© {yearDisplay}</span>
          {maintainerLabel ? (
            b.maintainerUrl ? (
              <a
                href={b.maintainerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[var(--kz-fg)]"
              >
                {maintainerLabel}
              </a>
            ) : (
              <span>{maintainerLabel}</span>
            )
          ) : null}
        </span>

        <span className="text-[var(--kz-border)]" aria-hidden>
          ·
        </span>

        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[var(--kz-fg)]"
        >
          源码
        </a>

        <span className="text-[var(--kz-border)]" aria-hidden>
          ·
        </span>

        <a
          href={`${githubUrl}/issues`}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[var(--kz-fg)]"
        >
          反馈
        </a>

        <span className="text-[var(--kz-border)]" aria-hidden>
          ·
        </span>

        <span className="text-[var(--kz-fg-dim)]">本站不存储任何音视频文件</span>
      </div>
    </footer>
  )
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '')
  }
}
