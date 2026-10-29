import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import type { SiteDefaultSettings } from '@animaku/shared'
import { isAuthorizedAdmin } from '../lib/indexnow'
import {
  getSiteConfig,
  saveSiteConfig,
  saveCustomFavicon,
  resetCustomFavicon,
  resetAllSiteConfig,
  validateIconBuffer,
  getCustomFaviconPath,
  hasCustomFavicon,
  getAnnouncementUploadsDir,
  validateAnnouncementImageBuffer,
  saveAnnouncementImage,
  deleteAnnouncementHistoryItem,
  type SiteConfig,
  type AnnouncementItem,
} from '../lib/site-config'

export const siteRoutes = new Hono()

function isValidHttpUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 公开接口：获取当前站点品牌与自定义图标配置及站点公告
 */
siteRoutes.get('/config', (c) => {
  const cfg = getSiteConfig()
  return c.json({
    ok: true,
    siteName: cfg.siteName || '',
    siteTagline: cfg.siteTagline || '',
    iconMode: cfg.iconMode || 'default',
    iconUrl: cfg.iconUrl || '',
    iconUpdatedAt: cfg.iconUpdatedAt || 0,
    announcementEnabled: Boolean(cfg.announcementEnabled),
    announcement: cfg.announcement || null,
    defaultSettings: cfg.defaultSettings || null,
  })
})

/**
 * 公开接口：提供上传的站点公告图片静态访问服务
 */
siteRoutes.get('/announcement-image/:filename', (c) => {
  const filename = c.req.param('filename')
  // 严格文件名正则校验，彻底杜绝路径穿越与非图片文件读取
  if (!filename || !/^[a-zA-Z0-9_-]+\.(png|jpe?g|webp|gif)$/i.test(filename)) {
    return c.text('Invalid filename', 400)
  }

  const dir = getAnnouncementUploadsDir()
  const filePath = resolve(dir, filename)
  if (!existsSync(filePath)) {
    return c.text('Image not found', 404)
  }

  try {
    const data = readFileSync(filePath)
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
    }
    const contentType = mimeMap[ext] || 'image/png'

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return c.text('Error reading image', 500)
  }
})

/**
 * 公开接口：获取当前站点的 Favicon 图标（根据实际格式输出正确的 Content-Type）
 */
siteRoutes.get('/favicon', (c) => {
  const cfg = getSiteConfig()
  if (cfg.iconMode === 'upload' && hasCustomFavicon()) {
    const targetPath = getCustomFaviconPath()
    if (existsSync(targetPath)) {
      try {
        const data = readFileSync(targetPath)
        const check = validateIconBuffer(data)
        const mime = check.valid && check.mime ? check.mime : 'image/x-icon'
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': mime,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      } catch {
        return c.text('Icon not found', 404)
      }
    }
  } else if (cfg.iconMode === 'url' && cfg.iconUrl) {
    return c.redirect(cfg.iconUrl, 302)
  }
  return c.text('No custom icon', 404)
})

export const adminSiteRoutes = new Hono()

// 管理员身份前置校验中间件
adminSiteRoutes.use('*', async (c, next) => {
  if (!isAuthorizedAdmin(c)) {
    return c.json(
      {
        ok: false,
        error: 'unauthorized',
        message: '管理员鉴权失败：请提供有效的 X-Admin-Secret 或仅在本机回环访问',
      },
      401,
    )
  }
  await next()
})

/**
 * 校验管理员凭据是否有效
 */
adminSiteRoutes.post('/verify', (c) => {
  return c.json({
    ok: true,
    message: '管理员身份验证成功',
  })
})

/**
 * 更新站点配置（名称、标语、图标模式及外链）
 */
adminSiteRoutes.post('/site/config', async (c) => {
  const body = (await c.req.json<Partial<SiteConfig>>().catch(() => ({}))) as Partial<SiteConfig>

  const updates: Partial<SiteConfig> = {}

  if (body.siteName !== undefined) {
    updates.siteName = typeof body.siteName === 'string' ? body.siteName.trim().slice(0, 50) : ''
  }

  if (body.siteTagline !== undefined) {
    updates.siteTagline = typeof body.siteTagline === 'string' ? body.siteTagline.trim().slice(0, 100) : ''
  }

  if (body.iconMode !== undefined) {
    if (['default', 'upload', 'url'].includes(body.iconMode)) {
      updates.iconMode = body.iconMode
    }
  }

  if (body.iconUrl !== undefined) {
    const trimmed = typeof body.iconUrl === 'string' ? body.iconUrl.trim() : ''
    if (trimmed && !isValidHttpUrl(trimmed)) {
      const msg = '图标外链必须为以 http:// 或 https:// 开头的合法 URL'
      return c.json({ ok: false, error: msg, message: msg }, 400)
    }
    updates.iconUrl = trimmed.slice(0, 500)
  }

  try {
    const saved = saveSiteConfig(updates)
    return c.json({
      ok: true,
      data: saved,
      message: '站点配置已更新',
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '保存失败'
    return c.json({ ok: false, error: errMsg, message: errMsg }, 500)
  }
})

/**
 * 更新站点全局默认配置（图片源、规则排序与开关、播放器、弹幕、导航栏等）
 */
adminSiteRoutes.post('/site/default-settings', async (c) => {
  const body = (await c.req.json<SiteDefaultSettings>().catch(() => ({}))) as SiteDefaultSettings
  try {
    const saved = saveSiteConfig({ defaultSettings: body })
    return c.json({
      ok: true,
      data: saved.defaultSettings || null,
      message: '全局默认配置已更新',
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '保存全局默认配置失败'
    return c.json({ ok: false, error: errMsg, message: errMsg }, 500)
  }
})

/**
 * 在线上传站点图标文件（≤2MB，格式嗅探 ICO/PNG/JPEG/WEBP，固定保存为 favicon.ico）
 */
adminSiteRoutes.post('/site/upload-icon', async (c) => {
  try {
    let buffer: Buffer
    const contentType = c.req.header('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      let file: unknown
      try {
        const formData = await c.req.formData()
        file = formData.get('file')
      } catch {
        const body = await c.req.parseBody()
        file = body['file']
      }

      if (!file) {
        return c.json({ ok: false, error: '未找到上传的图标文件 (file 字段)', message: '未找到上传的图标文件 (file 字段)' }, 400)
      }

      if (typeof (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === 'function') {
        buffer = Buffer.from(await (file as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer())
      } else if (typeof file === 'string') {
        buffer = Buffer.from(file, 'utf8')
      } else {
        return c.json({ ok: false, error: '无法解析上传的文件内容', message: '无法解析上传的文件内容' }, 400)
      }
    } else {
      const ab = await c.req.arrayBuffer()
      buffer = Buffer.from(ab)
    }

    if (!buffer || buffer.length === 0) {
      return c.json({ ok: false, error: '上传内容为空', message: '上传内容为空' }, 400)
    }

    const check = validateIconBuffer(buffer)
    if (!check.valid) {
      const errText = check.error || '非法图标文件'
      return c.json({ ok: false, error: errText, message: errText }, 400)
    }

    await saveCustomFavicon(buffer)
    const cfg = getSiteConfig()

    return c.json({
      ok: true,
      message: '图标上传并更新成功',
      iconMode: cfg.iconMode,
      iconUpdatedAt: cfg.iconUpdatedAt,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '图标上传保存失败'
    return c.json({ ok: false, error: errMsg, message: errMsg }, 500)
  }
})

/**
 * 重置为官方默认图标
 */
adminSiteRoutes.post('/site/reset-icon', (c) => {
  try {
    resetCustomFavicon()
    const cfg = getSiteConfig()
    return c.json({
      ok: true,
      message: '已恢复官方默认图标',
      iconMode: cfg.iconMode,
      iconUpdatedAt: cfg.iconUpdatedAt,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '重置失败'
    return c.json({ ok: false, error: errMsg, message: errMsg }, 500)
  }
})

/**
 * 全局恢复为官方默认设置（站点名称、标语与图标全部清除重置）
 */
adminSiteRoutes.post('/site/reset-all', (c) => {
  try {
    const cfg = resetAllSiteConfig()
    return c.json({
      ok: true,
      message: '已全局恢复官方默认设置',
      data: {
        siteName: cfg.siteName || '',
        siteTagline: cfg.siteTagline || '',
        iconMode: cfg.iconMode || 'default',
        iconUrl: cfg.iconUrl || '',
        iconUpdatedAt: cfg.iconUpdatedAt || 0,
        defaultSettings: null,
      },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '全局重置失败'
    return c.json({ ok: false, error: errMsg, message: errMsg }, 500)
  }
})

/**
 * 更新站点公告配置（开关、标题、正文、图片、图片跳转链接）
 */
adminSiteRoutes.post('/site/announcement', async (c) => {
  interface AnnouncementBody {
    enabled?: boolean
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
  }

  const body = (await c.req.json<AnnouncementBody>().catch(() => ({}))) as AnnouncementBody
  const enabled = Boolean(body.enabled)

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 100) : ''
  const content = typeof body.content === 'string' ? body.content.trim().slice(0, 5000) : ''
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim().slice(0, 1000) : ''
  const imageLink = typeof body.imageLink === 'string' ? body.imageLink.trim().slice(0, 1000) : ''
  const size: 'compact' | 'standard' | 'large' =
    body.size && ['compact', 'standard', 'large'].includes(body.size) ? body.size : 'standard'
  const imageHeight = typeof body.imageHeight === 'number' && body.imageHeight >= 0 ? body.imageHeight : undefined
  const imageWidth = typeof body.imageWidth === 'number' ? Math.max(30, Math.min(100, body.imageWidth)) : undefined
  const imageOffsetX = typeof body.imageOffsetX === 'number' ? Math.max(0, Math.min(100, body.imageOffsetX)) : undefined
  const imageOffsetY = typeof body.imageOffsetY === 'number' ? Math.max(0, Math.min(100, body.imageOffsetY)) : undefined
  const imageZoom = typeof body.imageZoom === 'number' ? Math.max(0.3, Math.min(2.5, body.imageZoom)) : undefined

  const hasContent = Boolean(title || content || imageUrl)

  // 开启公告时，必须至少填写了一项（标题、正文、图片其一）
  if (enabled && !hasContent) {
    const errMsg = '开启公告时，标题、正文或图片至少需要填写一项'
    return c.json({ ok: false, error: errMsg, message: errMsg }, 400)
  }

  // 校验链接格式
  if (imageUrl && !imageUrl.startsWith('/') && !isValidHttpUrl(imageUrl)) {
    const errMsg = '公告图片链接必须为合法网址或站内路径'
    return c.json({ ok: false, error: errMsg, message: errMsg }, 400)
  }
  if (imageLink && !imageLink.startsWith('/') && !isValidHttpUrl(imageLink)) {
    const errMsg = '图片跳转链接必须为合法网址 (http:// 或 https://)'
    return c.json({ ok: false, error: errMsg, message: errMsg }, 400)
  }

  const currentCfg = getSiteConfig()
  const current = currentCfg.announcement

  // 判断内容是否有实质变更（以此决定是否刷新版本 ID 与已读缓存击穿时间戳）
  const isContentChanged =
    !current ||
    (current.title || '') !== title ||
    (current.content || '') !== content ||
    (current.imageUrl || '') !== imageUrl ||
    (current.imageLink || '') !== imageLink ||
    (current.size || 'standard') !== size ||
    (current.imageHeight ?? undefined) !== imageHeight ||
    (current.imageWidth ?? undefined) !== imageWidth ||
    (current.imageOffsetX ?? undefined) !== imageOffsetX ||
    (current.imageOffsetY ?? undefined) !== imageOffsetY ||
    (current.imageZoom ?? undefined) !== imageZoom

  let nextAnnouncement: AnnouncementItem | null = null
  let nextHistory = currentCfg.announcementHistory || []

  if (hasContent) {
    nextAnnouncement = {
      id: isContentChanged ? `ann_${Date.now()}` : (current?.id || `ann_${Date.now()}`),
      title: title || undefined,
      content: content || undefined,
      imageUrl: imageUrl || undefined,
      imageLink: imageLink || undefined,
      size,
      imageHeight,
      imageWidth,
      imageOffsetX,
      imageOffsetY,
      imageZoom,
      updatedAt: isContentChanged ? Date.now() : (current?.updatedAt || Date.now()),
    }

    if (isContentChanged) {
      nextHistory = [
        nextAnnouncement,
        ...nextHistory.filter((item) => item.id !== nextAnnouncement?.id),
      ].slice(0, 30)
    }
  }

  try {
    const saved = saveSiteConfig({
      announcementEnabled: enabled,
      announcement: nextAnnouncement,
      announcementHistory: nextHistory,
    })

    return c.json({
      ok: true,
      message: '公告配置已保存',
      data: {
        announcementEnabled: saved.announcementEnabled,
        announcement: saved.announcement,
        announcementHistory: saved.announcementHistory,
      },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '保存公告失败'
    return c.json({ ok: false, error: errMsg, message: errMsg }, 500)
  }
})

/**
 * 获取历史公告归档列表
 */
adminSiteRoutes.get('/site/announcement-history', (c) => {
  const cfg = getSiteConfig()
  return c.json({
    ok: true,
    data: cfg.announcementHistory || [],
  })
})

/**
 * 删除单条历史公告
 */
adminSiteRoutes.delete('/site/announcement-history/:id', (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ ok: false, error: '缺少 id 参数', message: '缺少 id 参数' }, 400)
  }
  const saved = deleteAnnouncementHistoryItem(id)
  return c.json({
    ok: true,
    message: '已删除历史公告',
    data: saved.announcementHistory || [],
  })
})

/**
 * 上传公告配图文件（≤5MB，支持 PNG/JPEG/WEBP/GIF）
 */
adminSiteRoutes.post('/site/upload-announcement-image', async (c) => {
  try {
    let buffer: Buffer
    let originalName = ''
    const contentType = c.req.header('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      let file: unknown
      try {
        const formData = await c.req.formData()
        file = formData.get('file')
      } catch {
        const body = await c.req.parseBody()
        file = body['file']
      }

      if (!file) {
        return c.json(
          { ok: false, error: '未找到上传的图片文件 (file 字段)', message: '未找到上传的图片文件 (file 字段)' },
          400,
        )
      }

      if (typeof (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === 'function') {
        buffer = Buffer.from(await (file as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer())
        originalName = (file as { name?: string }).name || ''
      } else if (typeof file === 'string') {
        buffer = Buffer.from(file, 'utf8')
      } else {
        return c.json({ ok: false, error: '无法解析上传的文件内容', message: '无法解析上传的文件内容' }, 400)
      }
    } else {
      const ab = await c.req.arrayBuffer()
      buffer = Buffer.from(ab)
    }

    if (!buffer || buffer.length === 0) {
      return c.json({ ok: false, error: '上传内容为空', message: '上传内容为空' }, 400)
    }

    const check = validateAnnouncementImageBuffer(buffer)
    if (!check.valid) {
      const errText = check.error || '非法图片文件'
      return c.json({ ok: false, error: errText, message: errText }, 400)
    }

    const imageUrl = saveAnnouncementImage(buffer, check.ext)
    return c.json({
      ok: true,
      imageUrl,
      message: '图片上传成功',
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '上传失败'
    return c.json({ ok: false, error: errMsg, message: errMsg }, 500)
  }
})
