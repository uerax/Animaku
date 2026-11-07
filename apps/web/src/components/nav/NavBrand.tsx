import { NavLink } from 'react-router-dom'
import { useSiteConfigStore } from '../../stores/site-config'
import { useSiteBranding } from '../../lib/site-branding'

interface NavBrandProps {
  onNavigate?: () => void
}

export function NavBrand({ onNavigate }: NavBrandProps) {
  const b = useSiteBranding()
  const iconMode = useSiteConfigStore((s) => s.iconMode)
  const iconUrl = useSiteConfigStore((s) => s.iconUrl)
  const iconUpdatedAt = useSiteConfigStore((s) => s.iconUpdatedAt)

  const logoSrc =
    iconMode === 'url' && iconUrl
      ? iconUrl
      : `/logo.png${iconUpdatedAt ? `?v=${iconUpdatedAt}` : ''}`

  return (
    <NavLink
      to="/"
      onClick={onNavigate}
      className="group relative flex shrink-0 items-center gap-2 sm:gap-2.5 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kz-accent)] rounded-lg py-1"
      aria-label={`${b.productName} 首页`}
    >
      {/* Logo container */}
      <div className="relative flex items-center justify-center">
        <img
          src={logoSrc}
          alt={b.productName}
          width={36}
          height={36}
          className="relative h-7.5 w-7.5 rounded-full object-cover ring-1 ring-[var(--kz-border)] transition-all duration-200 group-hover:scale-105 group-hover:ring-[var(--kz-accent)] active:scale-95 sm:h-9 sm:w-9"
          decoding="async"
        />
      </div>

      {/* Brand title & tagline */}
      <div className="hidden flex-col leading-tight sm:flex">
        <span className="text-[14.5px] font-extrabold tracking-tight bg-gradient-to-r from-[var(--kz-fg)] via-[var(--kz-fg)] to-[var(--kz-fg-muted)] group-hover:to-[var(--kz-accent)] bg-clip-text text-transparent transition-all duration-300 sm:text-[16px]">
          {b.productName}
        </span>
        <span className="hidden text-[10px] font-medium text-[var(--kz-fg-dim)] tracking-wide transition-colors group-hover:text-[var(--kz-fg-muted)] sm:block">
          {b.tagline}
        </span>
      </div>
    </NavLink>
  )
}
