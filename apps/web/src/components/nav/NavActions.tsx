import clsx from 'clsx'
import { defaultNavSettings, useSettingsStore } from '../../stores/settings'
import { getSiteBranding } from '../../lib/site-branding'
import { UserDropdown } from '../UserDropdown'

interface NavActionsProps {
  onOpenMobileSearch: () => void
  mobileSearchOpen: boolean
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  )
}

function GitHubIconButton() {
  const b = getSiteBranding()
  return (
    <a
      href={b.githubUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] transition-all duration-200 hover:bg-[var(--kz-bg-hover)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-95 shadow-2xs sm:h-9.5 sm:w-9.5"
      title={b.githubLabel}
      aria-label={`${b.productName} ${b.githubLabel}`}
    >
      <svg
        className="h-4 w-4 fill-current sm:h-4.5 sm:w-4.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    </a>
  )
}

export function NavActions({
  onOpenMobileSearch,
  mobileSearchOpen,
}: NavActionsProps) {
  const showGitHub = useSettingsStore(
    (s) => s.nav?.showGitHub ?? defaultNavSettings.showGitHub,
  )

  return (
    <>
      {/* Desktop actions cluster */}
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        {showGitHub && <GitHubIconButton />}
        <UserDropdown />
      </div>

      {/* Mobile action buttons — restrained B站 mobile pattern */}
      <div className="flex shrink-0 items-center gap-1.5 md:hidden">
        {/* Search icon button */}
        <button
          type="button"
          className={clsx(
            'inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] text-[var(--kz-fg)] transition-all duration-200 hover:bg-[var(--kz-bg-hover)] hover:border-[var(--kz-accent)] hover:text-[var(--kz-accent)] active:scale-95 shadow-2xs cursor-pointer',
            mobileSearchOpen && 'invisible pointer-events-none',
          )}
          aria-label="搜索番剧"
          title="搜索"
          disabled={mobileSearchOpen}
          tabIndex={mobileSearchOpen ? -1 : 0}
          onClick={(e) => {
            e.currentTarget.blur()
            onOpenMobileSearch()
          }}
        >
          <SearchIcon />
        </button>

        {/* GitHub icon button: only shown on sm+ screens to preserve mobile phone space */}
        {showGitHub && (
          <div className="hidden sm:inline-flex">
            <GitHubIconButton />
          </div>
        )}

        {/* User avatar / profile dropdown */}
        <UserDropdown />
      </div>
    </>
  )
}
