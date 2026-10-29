import { create } from 'zustand'
import type { SiteDefaultSettings } from '@animaku/shared'
import { api } from '../lib/api'
import { applySiteDefaultsIfUncustomized } from './settings'

export interface AnnouncementItem {
  id: string
  title?: string
  content?: string
  imageUrl?: string
  imageLink?: string
  size?: 'compact' | 'standard' | 'large'
  imageHeight?: number
  imageWidth?: number
  imageOffsetX?: number
  imageOffsetY?: number
  imageZoom?: number
  updatedAt: number
}

export interface SiteConfigState {
  siteName: string
  siteTagline: string
  iconMode: 'default' | 'upload' | 'url'
  iconUrl: string
  iconUpdatedAt: number
  isLoaded: boolean

  // 站点公告
  announcementEnabled: boolean
  announcement: AnnouncementItem | null
  announcementHistory: AnnouncementItem[]

  // 全局默认配置（解耦于用户侧，作为新访客/未定制时的站点默认项）
  defaultSettings: SiteDefaultSettings | null

  // 管理模式会话状态（仅当前会话有效）
  adminSecret: string
  isAdminUnlocked: boolean

  fetchConfig: (force?: boolean) => Promise<void>
  unlockAdmin: (secret: string) => Promise<boolean>
  lockAdmin: () => void
  saveConfig: (data: {
    siteName: string
    siteTagline: string
    iconMode: 'default' | 'upload' | 'url'
    iconUrl: string
  }) => Promise<void>
  saveDefaultSettings: (data: Partial<SiteDefaultSettings>) => Promise<{ ok: boolean; message?: string }>
  uploadIcon: (file: File) => Promise<void>
  resetIcon: () => Promise<void>
  resetAllConfig: () => Promise<void>
  triggerIndexNow: () => Promise<{ ok: boolean; submitted?: number; message?: string }>

  // 公告管理方法
  saveAnnouncement: (data: {
    enabled: boolean
    title?: string
    content?: string
    imageUrl?: string
    imageLink?: string
    size?: 'compact' | 'standard' | 'large'
    imageHeight?: number
    imageWidth?: number
    imageOffsetX?: number
    imageOffsetY?: number
    imageZoom?: number
  }) => Promise<{ ok: boolean; message?: string }>
  uploadAnnouncementImage: (file: File) => Promise<{ ok: boolean; imageUrl?: string; message?: string }>
  fetchAnnouncementHistory: () => Promise<void>
  deleteAnnouncementHistory: (id: string) => Promise<void>
}

const ADMIN_STORAGE_KEY = 'animaku-admin-secret'
const SITE_CONFIG_CACHE_KEY = 'animaku-site-config-cache'
/** 客户端本地缓存 TTL：5 分钟（在此时间内整页刷新不重复发网络请求） */
export const SITE_CONFIG_TTL_MS = 5 * 60 * 1000

interface CachedSiteConfig {
  siteName: string
  siteTagline: string
  iconMode: 'default' | 'upload' | 'url'
  iconUrl: string
  iconUpdatedAt: number
  announcementEnabled?: boolean
  announcement?: AnnouncementItem | null
  defaultSettings?: SiteDefaultSettings | null
  cachedAt?: number
}

function getInitialSiteConfig(): CachedSiteConfig {
  if (typeof document === 'undefined') {
    return {
      siteName: '',
      siteTagline: '',
      iconMode: 'default',
      iconUrl: '',
      iconUpdatedAt: 0,
      announcementEnabled: false,
      announcement: null,
      defaultSettings: null,
      cachedAt: 0,
    }
  }

  // 1. 优先从 localStorage 读取历史持久化配置
  try {
    const raw = localStorage.getItem(SITE_CONFIG_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CachedSiteConfig>
      if (parsed && typeof parsed === 'object') {
        return {
          siteName: typeof parsed.siteName === 'string' ? parsed.siteName : '',
          siteTagline: typeof parsed.siteTagline === 'string' ? parsed.siteTagline : '',
          iconMode: ['default', 'upload', 'url'].includes(parsed.iconMode as string)
            ? (parsed.iconMode as 'default' | 'upload' | 'url')
            : 'default',
          iconUrl: typeof parsed.iconUrl === 'string' ? parsed.iconUrl : '',
          iconUpdatedAt: typeof parsed.iconUpdatedAt === 'number' ? parsed.iconUpdatedAt : 0,
          announcementEnabled: Boolean(parsed.announcementEnabled),
          announcement:
            parsed.announcement && typeof parsed.announcement === 'object'
              ? parsed.announcement
              : null,
          defaultSettings:
            parsed.defaultSettings && typeof parsed.defaultSettings === 'object'
              ? parsed.defaultSettings
              : null,
          cachedAt: typeof parsed.cachedAt === 'number' ? parsed.cachedAt : 0,
        }
      }
    }
  } catch {}

  // 2. 首次访问从服务端 SSR 注入的 meta[name="application-name"] 同步继承（首屏 0 闪烁）
  const metaApp = document.querySelector('meta[name="application-name"]')?.getAttribute('content')?.trim()
  if (metaApp && metaApp !== 'Animaku 动漫' && metaApp !== 'Animaku') {
    return {
      siteName: metaApp,
      siteTagline: '',
      iconMode: 'default',
      iconUrl: '',
      iconUpdatedAt: 0,
      announcementEnabled: false,
      announcement: null,
      defaultSettings: null,
      cachedAt: 0,
    }
  }

  return {
    siteName: '',
    siteTagline: '',
    iconMode: 'default',
    iconUrl: '',
    iconUpdatedAt: 0,
    announcementEnabled: false,
    announcement: null,
    defaultSettings: null,
    cachedAt: 0,
  }
}

function saveSiteConfigToCache(data: CachedSiteConfig) {
  try {
    const toSave: CachedSiteConfig = {
      ...data,
      cachedAt: data.cachedAt || Date.now(),
    }
    localStorage.setItem(SITE_CONFIG_CACHE_KEY, JSON.stringify(toSave))
  } catch {}
}

function clearSiteConfigCache() {
  try {
    localStorage.removeItem(SITE_CONFIG_CACHE_KEY)
  } catch {}
}

function getSavedAdminSecret(): string {
  try {
    return sessionStorage.getItem(ADMIN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function saveAdminSecretToSession(secret: string) {
  try {
    if (secret) {
      sessionStorage.setItem(ADMIN_STORAGE_KEY, secret)
    } else {
      sessionStorage.removeItem(ADMIN_STORAGE_KEY)
    }
  } catch {}
}

export function updateDocumentFavicon(
  iconMode: 'default' | 'upload' | 'url',
  iconUrl?: string,
  iconUpdatedAt?: number,
) {
  if (typeof document === 'undefined') return

  if (iconMode === 'url' && iconUrl) {
    const existingIcons = document.querySelectorAll<HTMLLinkElement>(
      "link[rel*='icon'], link[rel='apple-touch-icon']",
    )
    existingIcons.forEach((el) => {
      el.href = iconUrl
    })
    return
  }

  const v = iconUpdatedAt ? `?v=${iconUpdatedAt}` : ''
  const links = document.querySelectorAll<HTMLLinkElement>(
    "link[rel*='icon'], link[rel='apple-touch-icon'], link[rel='manifest']",
  )

  links.forEach((el) => {
    const rawHref = el.getAttribute('href') || ''
    const clean = rawHref.split('?')[0]
    if (clean.endsWith('/favicon.ico')) {
      el.href = `/favicon.ico${v}`
    } else if (clean.endsWith('/favicon-32x32.png')) {
      el.href = `/favicon-32x32.png${v}`
    } else if (clean.endsWith('/favicon-16x16.png')) {
      el.href = `/favicon-16x16.png${v}`
    } else if (clean.endsWith('/apple-touch-icon.png')) {
      el.href = `/apple-touch-icon.png${v}`
    } else if (clean.endsWith('/android-chrome-192x192.png')) {
      el.href = `/android-chrome-192x192.png${v}`
    } else if (clean.endsWith('/site.webmanifest')) {
      el.href = `/site.webmanifest${v}`
    }
  })
}

const initialSecret = getSavedAdminSecret()
const initialConfig = getInitialSiteConfig()

if (initialConfig.iconMode !== 'default' || initialConfig.iconUpdatedAt > 0) {
  updateDocumentFavicon(initialConfig.iconMode, initialConfig.iconUrl, initialConfig.iconUpdatedAt)
}

export const useSiteConfigStore = create<SiteConfigState>((set, get) => ({
  siteName: initialConfig.siteName,
  siteTagline: initialConfig.siteTagline,
  iconMode: initialConfig.iconMode,
  iconUrl: initialConfig.iconUrl,
  iconUpdatedAt: initialConfig.iconUpdatedAt,
  announcementEnabled: initialConfig.announcementEnabled ?? false,
  announcement: initialConfig.announcement ?? null,
  announcementHistory: [],
  defaultSettings: initialConfig.defaultSettings ?? null,
  isLoaded: false,

  adminSecret: initialSecret,
  isAdminUnlocked: Boolean(initialSecret),

  fetchConfig: async (force = false) => {
    // 5 分钟本地缓存拦截：若在 TTL 时间窗口内且已有缓存数据，则直接标记加载完成，不发网络请求
    if (!force && initialConfig.cachedAt && Date.now() - initialConfig.cachedAt < SITE_CONFIG_TTL_MS) {
      set({ isLoaded: true })
      return
    }

    try {
      const res = await api<{
        ok: boolean
        siteName: string
        siteTagline: string
        iconMode: 'default' | 'upload' | 'url'
        iconUrl: string
        iconUpdatedAt: number
        announcementEnabled: boolean
        announcement: AnnouncementItem | null
        defaultSettings?: SiteDefaultSettings | null
      }>('/api/site/config')

      if (res && res.ok) {
        const nextConfig: CachedSiteConfig = {
          siteName: res.siteName || '',
          siteTagline: res.siteTagline || '',
          iconMode: res.iconMode || 'default',
          iconUrl: res.iconUrl || '',
          iconUpdatedAt: res.iconUpdatedAt || 0,
          announcementEnabled: Boolean(res.announcementEnabled),
          announcement: res.announcement || null,
          defaultSettings: res.defaultSettings || null,
          cachedAt: Date.now(),
        }

        set({
          ...nextConfig,
          isLoaded: true,
        })

        saveSiteConfigToCache(nextConfig)
        updateDocumentFavicon(nextConfig.iconMode, nextConfig.iconUrl, nextConfig.iconUpdatedAt)

        if (nextConfig.defaultSettings) {
          applySiteDefaultsIfUncustomized(nextConfig.defaultSettings)
        }
      }
    } catch (err) {
      console.warn('[site-config] 加载站点配置失败:', err)
      set({ isLoaded: true })
    }
  },

  unlockAdmin: async (secret: string) => {
    const trimmed = secret.trim()
    if (!trimmed) return false

    try {
      const res = await api<{ ok: boolean }>('/api/admin/verify', {
        method: 'POST',
        headers: {
          'X-Admin-Secret': trimmed,
        },
      })

      if (res && res.ok) {
        saveAdminSecretToSession(trimmed)
        set({
          adminSecret: trimmed,
          isAdminUnlocked: true,
        })
        return true
      }
      return false
    } catch {
      return false
    }
  },

  lockAdmin: () => {
    saveAdminSecretToSession('')
    set({
      adminSecret: '',
      isAdminUnlocked: false,
    })
  },

  saveConfig: async (data) => {
    const { adminSecret } = get()
    const res = await api<{
      ok: boolean
      data: {
        siteName: string
        siteTagline: string
        iconMode: 'default' | 'upload' | 'url'
        iconUrl: string
        iconUpdatedAt: number
      }
    }>('/api/admin/site/config', {
      method: 'POST',
      headers: {
        'X-Admin-Secret': adminSecret,
      },
      body: JSON.stringify(data),
    })

    if (res && res.ok && res.data) {
      const nextConfig: CachedSiteConfig = {
        siteName: res.data.siteName || '',
        siteTagline: res.data.siteTagline || '',
        iconMode: res.data.iconMode || 'default',
        iconUrl: res.data.iconUrl || '',
        iconUpdatedAt: res.data.iconUpdatedAt || 0,
      }
      set(nextConfig)
      saveSiteConfigToCache(nextConfig)
      updateDocumentFavicon(res.data.iconMode, res.data.iconUrl, res.data.iconUpdatedAt)
    }
  },

  saveDefaultSettings: async (defaults) => {
    const { adminSecret } = get()
    try {
      const res = await api<{
        ok: boolean
        data?: SiteDefaultSettings
        message?: string
        error?: string
      }>('/api/admin/site/default-settings', {
        method: 'POST',
        headers: {
          'X-Admin-Secret': adminSecret,
        },
        body: JSON.stringify(defaults),
      })

      if (res && res.ok) {
        const currentSettings = get().defaultSettings || {}
        const newDefaults = res.data || {
          ...currentSettings,
          ...defaults,
        }
        set({ defaultSettings: newDefaults })
        const currentCached = getInitialSiteConfig()
        saveSiteConfigToCache({
          ...currentCached,
          defaultSettings: newDefaults,
        })
        return { ok: true, message: res.message || '配置已更新' }
      }
      return { ok: false, message: res?.error || res?.message || '保存失败' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, message: msg }
    }
  },

  uploadIcon: async (file: File) => {
    const { adminSecret } = get()
    const formData = new FormData()
    formData.append('file', file)

    const res = await api<{
      ok: boolean
      iconMode: 'upload'
      iconUpdatedAt: number
    }>('/api/admin/site/upload-icon', {
      method: 'POST',
      headers: {
        'X-Admin-Secret': adminSecret,
      },
      body: formData,
    })

    if (res && res.ok) {
      const current = get()
      const nextConfig: CachedSiteConfig = {
        siteName: current.siteName,
        siteTagline: current.siteTagline,
        iconMode: 'upload',
        iconUrl: current.iconUrl,
        iconUpdatedAt: res.iconUpdatedAt,
      }
      set({
        iconMode: 'upload',
        iconUpdatedAt: res.iconUpdatedAt,
      })
      saveSiteConfigToCache(nextConfig)
      updateDocumentFavicon('upload', undefined, res.iconUpdatedAt)
    }
  },

  resetIcon: async () => {
    const { adminSecret } = get()
    const res = await api<{
      ok: boolean
      iconMode: 'default'
      iconUpdatedAt: number
    }>('/api/admin/site/reset-icon', {
      method: 'POST',
      headers: {
        'X-Admin-Secret': adminSecret,
      },
    })

    if (res && res.ok) {
      const current = get()
      const nextConfig: CachedSiteConfig = {
        siteName: current.siteName,
        siteTagline: current.siteTagline,
        iconMode: 'default',
        iconUrl: current.iconUrl,
        iconUpdatedAt: res.iconUpdatedAt,
      }
      set({
        iconMode: 'default',
        iconUpdatedAt: res.iconUpdatedAt,
      })
      saveSiteConfigToCache(nextConfig)
      updateDocumentFavicon('default')
    }
  },

  resetAllConfig: async () => {
    const { adminSecret } = get()
    const res = await api<{
      ok: boolean
      data?: {
        siteName?: string
        siteTagline?: string
        iconMode?: 'default' | 'upload' | 'url'
        iconUrl?: string
        iconUpdatedAt?: number
      }
    }>('/api/admin/site/reset-all', {
      method: 'POST',
      headers: {
        'X-Admin-Secret': adminSecret,
      },
    })

    if (res && res.ok) {
      clearSiteConfigCache()
      set({
        siteName: '',
        siteTagline: '',
        iconMode: 'default',
        iconUrl: '',
        iconUpdatedAt: res.data?.iconUpdatedAt || Date.now(),
        announcementEnabled: false,
        announcement: null,
        announcementHistory: [],
        defaultSettings: null,
      })
      updateDocumentFavicon('default')
    }
  },

  triggerIndexNow: async () => {
    const { adminSecret } = get()
    const res = await api<{
      ok: boolean
      submitted?: number
      message?: string
    }>('/api/admin/indexnow', {
      method: 'POST',
      headers: {
        'X-Admin-Secret': adminSecret,
      },
      body: JSON.stringify({ forceAll: true }),
    })
    return res
  },

  saveAnnouncement: async (data) => {
    const { adminSecret } = get()
    try {
      const res = await api<{
        ok: boolean
        message?: string
        error?: string
        data?: {
          announcementEnabled: boolean
          announcement: AnnouncementItem | null
          announcementHistory: AnnouncementItem[]
        }
      }>('/api/admin/site/announcement', {
        method: 'POST',
        headers: {
          'X-Admin-Secret': adminSecret,
        },
        body: JSON.stringify(data),
      })

      if (res && res.ok && res.data) {
        set({
          announcementEnabled: res.data.announcementEnabled,
          announcement: res.data.announcement,
          announcementHistory: res.data.announcementHistory,
        })
        const currentCached = getInitialSiteConfig()
        saveSiteConfigToCache({
          ...currentCached,
          announcementEnabled: res.data.announcementEnabled,
          announcement: res.data.announcement,
        })
        return { ok: true, message: res.message || '公告已保存' }
      }
      return { ok: false, message: res?.error || res?.message || '保存失败' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, message: msg }
    }
  },

  uploadAnnouncementImage: async (file: File) => {
    const { adminSecret } = get()
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api<{
        ok: boolean
        imageUrl?: string
        message?: string
        error?: string
      }>('/api/admin/site/upload-announcement-image', {
        method: 'POST',
        headers: {
          'X-Admin-Secret': adminSecret,
        },
        body: formData,
      })

      if (res && res.ok && res.imageUrl) {
        return { ok: true, imageUrl: res.imageUrl, message: res.message }
      }
      return { ok: false, message: res?.error || res?.message || '上传失败' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, message: msg }
    }
  },

  fetchAnnouncementHistory: async () => {
    const { adminSecret } = get()
    try {
      const res = await api<{
        ok: boolean
        data?: AnnouncementItem[]
      }>('/api/admin/site/announcement-history', {
        headers: {
          'X-Admin-Secret': adminSecret,
        },
      })
      if (res && res.ok && Array.isArray(res.data)) {
        set({ announcementHistory: res.data })
      }
    } catch (err) {
      console.warn('[site-config] 获取历史公告失败:', err)
    }
  },

  deleteAnnouncementHistory: async (id: string) => {
    const { adminSecret } = get()
    try {
      const res = await api<{
        ok: boolean
        data?: AnnouncementItem[]
      }>(`/api/admin/site/announcement-history/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Secret': adminSecret,
        },
      })
      if (res && res.ok && Array.isArray(res.data)) {
        set({ announcementHistory: res.data })
      }
    } catch (err) {
      console.warn('[site-config] 删除历史公告失败:', err)
    }
  },
}))
