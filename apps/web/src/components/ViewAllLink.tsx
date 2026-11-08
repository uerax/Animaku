import { memo } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

interface ViewAllLinkProps extends Omit<LinkProps, 'children'> {
  text?: string
  className?: string
}

export const ViewAllLink = memo(function ViewAllLink({
  text = '查看全部',
  className = '',
  ...props
}: ViewAllLinkProps) {
  return (
    <Link
      {...props}
      className={`group inline-flex h-7 items-center justify-center gap-0.5 rounded-md border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] px-2 text-xs font-normal text-[var(--kz-fg)] transition-all duration-200 hover:border-[var(--kz-accent)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-accent)] active:scale-95 ${className}`}
    >
      <span>{text}</span>
      <svg
        className="h-2.5 w-2.5 shrink-0 text-current transition-transform duration-200 group-hover:translate-x-0.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 4 4 4-4 4" />
      </svg>
    </Link>
  )
})
