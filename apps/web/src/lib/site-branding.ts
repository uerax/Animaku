import { DEFAULT_APP_VERSION } from '@animaku/shared'
import { useSiteConfigStore } from '../stores/site-config'

/**
 * Site footer / about branding — build-time env (VITE_*), safe defaults for this repo.
 * Deployers fill maintainer fields in `.env` without code changes.
 * Runtime overrides (siteName, siteTagline) from useSiteConfigStore take precedence.
 */

function trimUrl(raw: string | undefined): string {
  const s = (raw || '').trim()
  if (!s) return ''
  // Allow bare github.com/owner/repo
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, '')
  if (/^github\.com\//i.test(s)) return `https://${s}`.replace(/\/+$/, '')
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) return `https://github.com/${s}`
  return s.replace(/\/+$/, '')
}

export function formatCustomUrl(raw: string | undefined): string {
  const s = (raw || '').trim()
  if (!s) return ''
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(s)) return s
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(s)) return `mailto:${s}`
  return trimUrl(s)
}

function trimText(raw: string | undefined): string {
  return (raw || '').trim()
}

/** Default public repo (matches origin remote when unset). */
export const DEFAULT_GITHUB_URL = 'https://github.com/uerax/Animaku'
export const DEFAULT_CONTACT_URL = 'https://github.com/uerax'

export type SiteBranding = {
  /** Application version (e.g. v1.1.1) */
  version: string
  /** Project source — always preferred for “Star / Source” */
  githubUrl: string
  githubLabel: string
  /** Custom or default feedback URL (defaults to `${githubUrl}/issues`) */
  feedbackUrl: string
  /** Custom or default contact URL (defaults to `https://github.com/uerax`) */
  contactUrl: string
  /** Short product blurb under the name */
  tagline: string
  /** Display name in footer */
  productName: string
  maintainerName: string
  /** Profile / homepage for the maintainer line */
  maintainerUrl: string
  /** Extra personal / project homepage (docs, blog, status) */
  homepageUrl: string
  homepageLabel: string
  contactEmail: string
  /** Optional free-form line (e.g. “自托管 · 非官方”) */
  extraNote: string
}

export function getSiteBranding(): SiteBranding {
  const env = import.meta.env
  const dynamic = useSiteConfigStore.getState()

  const githubUrl =
    formatCustomUrl(dynamic.githubUrl) ||
    trimUrl(env.VITE_GITHUB_URL as string | undefined) ||
    DEFAULT_GITHUB_URL

  const feedbackUrl =
    formatCustomUrl(dynamic.feedbackUrl) ||
    formatCustomUrl(env.VITE_FEEDBACK_URL as string | undefined) ||
    `${githubUrl}/issues`

  const contactUrl =
    formatCustomUrl(dynamic.contactUrl) ||
    formatCustomUrl(env.VITE_CONTACT_URL as string | undefined) ||
    (env.VITE_CONTACT_EMAIL ? `mailto:${trimText(env.VITE_CONTACT_EMAIL)}` : '') ||
    DEFAULT_CONTACT_URL

  return {
    version: trimText(env.VITE_APP_VERSION) || DEFAULT_APP_VERSION,
    githubUrl,
    githubLabel: trimText(env.VITE_GITHUB_LABEL as string | undefined) || 'GitHub',
    feedbackUrl,
    contactUrl,
    tagline:
      dynamic.siteTagline?.trim() ||
      trimText(env.VITE_SITE_TAGLINE as string | undefined) ||
      '在线弹幕播放',
    productName:
      dynamic.siteName?.trim() ||
      trimText(env.VITE_PRODUCT_NAME as string | undefined) ||
      'Animaku',
    maintainerName: trimText(env.VITE_MAINTAINER_NAME as string | undefined),
    maintainerUrl: trimUrl(env.VITE_MAINTAINER_URL as string | undefined),
    homepageUrl: trimUrl(env.VITE_HOMEPAGE_URL as string | undefined),
    homepageLabel:
      trimText(env.VITE_HOMEPAGE_LABEL as string | undefined) || '主页',
    contactEmail: trimText(env.VITE_CONTACT_EMAIL as string | undefined),
    extraNote: trimText(env.VITE_FOOTER_NOTE as string | undefined),
  }
}

/**
 * 响应式 Hook：当 Admin 动态修改站名、标语或链接时，自动触发组件重渲染
 */
export function useSiteBranding(): SiteBranding {
  const dynamicName = useSiteConfigStore((s) => s.siteName)
  const dynamicTagline = useSiteConfigStore((s) => s.siteTagline)
  const dynamicGithubUrl = useSiteConfigStore((s) => s.githubUrl)
  const dynamicFeedbackUrl = useSiteConfigStore((s) => s.feedbackUrl)
  const dynamicContactUrl = useSiteConfigStore((s) => s.contactUrl)
  const env = import.meta.env

  const githubUrl =
    formatCustomUrl(dynamicGithubUrl) ||
    trimUrl(env.VITE_GITHUB_URL as string | undefined) ||
    DEFAULT_GITHUB_URL

  const feedbackUrl =
    formatCustomUrl(dynamicFeedbackUrl) ||
    formatCustomUrl(env.VITE_FEEDBACK_URL as string | undefined) ||
    `${githubUrl}/issues`

  const contactUrl =
    formatCustomUrl(dynamicContactUrl) ||
    formatCustomUrl(env.VITE_CONTACT_URL as string | undefined) ||
    (env.VITE_CONTACT_EMAIL ? `mailto:${trimText(env.VITE_CONTACT_EMAIL)}` : '') ||
    DEFAULT_CONTACT_URL

  return {
    version: trimText(env.VITE_APP_VERSION) || DEFAULT_APP_VERSION,
    githubUrl,
    githubLabel: trimText(env.VITE_GITHUB_LABEL as string | undefined) || 'GitHub',
    feedbackUrl,
    contactUrl,
    tagline:
      dynamicTagline?.trim() ||
      trimText(env.VITE_SITE_TAGLINE as string | undefined) ||
      '在线弹幕播放',
    productName:
      dynamicName?.trim() ||
      trimText(env.VITE_PRODUCT_NAME as string | undefined) ||
      'Animaku',
    maintainerName: trimText(env.VITE_MAINTAINER_NAME as string | undefined),
    maintainerUrl: trimUrl(env.VITE_MAINTAINER_URL as string | undefined),
    homepageUrl: trimUrl(env.VITE_HOMEPAGE_URL as string | undefined),
    homepageLabel:
      trimText(env.VITE_HOMEPAGE_LABEL as string | undefined) || '主页',
    contactEmail: trimText(env.VITE_CONTACT_EMAIL as string | undefined),
    extraNote: trimText(env.VITE_FOOTER_NOTE as string | undefined),
  }
}
