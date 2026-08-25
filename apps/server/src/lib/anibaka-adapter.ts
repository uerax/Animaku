import crypto from 'node:crypto'
import type {
  PluginChapterResult,
  PluginRule,
  PluginSearchResult,
  PipelineStep,
  ResolvePlayResult,
  Road,
  SearchItem,
} from '@animaku/shared'
import { isAnxRule } from '@animaku/shared'
import * as cheerio from 'cheerio'
import { config } from '../config'
import { fetchPublic, isPrivateHost } from './private-host'
import { simplifiedToTraditional } from './opencc-s2t'

export { isAnxRule }

const TEMPLATE_RE = /\{([a-zA-Z0-9_]+)(:raw)?\}/g
const HTTP_SCHEME_RE = /^https?:\/\//i
const TRAILING_SLASHES_RE = /\/+$|\s+$/g
const MACCMS_CHALLENGE_RE =
  /身份验证|安全验证|点击访问|smart_verify|请输入验证码|verify_check|\/verify\/index\.html|雷池 WAF|altcha-widget|aegis_altcha/i
const SMART_VERIFY_BTN_RE = /\bid\s*=\s*["']smart-verify-btn["']/i
const VERIFY_CHECK_URL_RE = /["']([^"']*verify_check[^"']*)["']/i
const VERIFY_CHECK_KEY_RE = /new\s+Uint8Array\s*\(\s*\[([^\]]+)\]\s*\)/i
const EC_PLAYER_CONFIG_RE = /(?:let|var)\s+ConFig\s*=\s*(\{[\s\S]*?\})\s*,\s*box\s*=/i

/** Pipeline context for a single run */
class PipelineContext {
  vars: Record<string, unknown>
  value: unknown
  pageUrl: string
  seriesById = new Map<string, SearchItem>()
  roads: Road[] = []
  mediaHeaders: Record<string, string> = {}
  cookieNames: string[] = []
  cookiePrefixes: string[] = []
  sinkRuns = 0

  constructor(
    public rule: PluginRule,
    baseUrl: string,
    inputName: string,
    input: unknown,
  ) {
    this.vars = {
      baseUrl: baseUrl.replace(TRAILING_SLASHES_RE, ''),
      [inputName]: input,
      timestamp: String(Date.now()),
    }
    this.value = input
    this.pageUrl = ''
  }

  get currentString(): string {
    if (typeof this.value === 'string') return this.value
    if (this.value == null) return ''
    if (typeof this.value === 'object') {
      try {
        return JSON.stringify(this.value)
      } catch {
        return ''
      }
    }
    return String(this.value)
  }

  get baseUrl(): string {
    return String(this.vars.baseUrl ?? this.rule.baseURL ?? '').replace(
      TRAILING_SLASHES_RE,
      '',
    )
  }

  get outputCount(): number {
    return (
      this.seriesById.size +
      this.roads.reduce((n, r) => n + r.data.length, 0)
    )
  }

  trial(): PipelineContext {
    const next = new PipelineContext(
      this.rule,
      this.baseUrl,
      '_',
      this.value,
    )
    next.vars = { ...this.vars }
    next.value = this.value
    next.pageUrl = this.pageUrl
    next.seriesById = new Map(this.seriesById)
    next.roads = this.roads.map((r) => ({
      ...r,
      data: [...r.data],
      identifier: [...r.identifier],
    }))
    next.mediaHeaders = { ...this.mediaHeaders }
    next.cookieNames = [...this.cookieNames]
    next.cookiePrefixes = [...this.cookiePrefixes]
    return next
  }

  commit(trial: PipelineContext) {
    this.value = trial.value
    this.pageUrl = trial.pageUrl
    this.vars = { ...trial.vars }
    this.seriesById = new Map(trial.seriesById)
    this.roads = trial.roads
    this.mediaHeaders = { ...trial.mediaHeaders }
    this.cookieNames = trial.cookieNames
    this.cookiePrefixes = trial.cookiePrefixes
    this.sinkRuns += trial.sinkRuns
  }

  addSeries(item: SearchItem) {
    const src = item.src.trim()
    if (!src || !item.name.trim()) return
    if (!this.seriesById.has(src)) {
      this.seriesById.set(src, { name: item.name.trim(), src })
    }
  }

  beginSink() {
    this.sinkRuns++
  }
}

/** Render {var} and {var:raw} templates */
function renderTemplate(
  template: string,
  ctx: PipelineContext,
  extra?: Record<string, string | undefined | null>,
): string {
  if (!template || !template.includes('{')) return template
  return template.replace(TEMPLATE_RE, (_, name: string, isRaw: string) => {
    let val: unknown
    if (extra && Object.prototype.hasOwnProperty.call(extra, name)) {
      val = extra[name]
    } else if (name === 'url') {
      val = ctx.currentString
    } else {
      val = ctx.vars[name]
    }
    const str = val == null ? '' : String(val)
    return isRaw ? str : encodeURIComponent(str)
  })
}

function renderMap(
  raw: unknown,
  ctx: PipelineContext,
): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = renderTemplate(String(v ?? ''), ctx)
  }
  return out
}

function toAbsoluteUrl(rawUrl: string, base: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''
  try {
    return new URL(trimmed, base || 'http://localhost').toString()
  } catch {
    return trimmed
  }
}

/** JSON dot-path resolver (data.videos[0].id) */
function jsonPath(obj: unknown, path: string): unknown {
  if (obj == null || !path) return obj
  const parts = path
    .replace(/\[(\w+)\]/g, '.$1')
    .replace(/^\./, '')
    .split('.')
  let cur: any = obj
  for (const part of parts) {
    if (cur == null) return undefined
    cur = cur[part]
  }
  return cur
}

function asJson(val: unknown): unknown {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val.trim())
    } catch {
      return null
    }
  }
  return val
}

function isNonEmpty(val: unknown): boolean {
  if (val == null) return false
  if (typeof val === 'string') return val.trim().length > 0
  if (Array.isArray(val)) return val.length > 0
  if (typeof val === 'object') return Object.keys(val).length > 0
  return true
}

function encodeLittleEndianBaseN(value: number, alphabet: string): string {
  if (alphabet.length < 2 || value < 0) return String(value)
  if (value === 0) return alphabet[0]
  const base = alphabet.length
  let res = ''
  let remaining = value
  while (remaining > 0) {
    res += alphabet[remaining % base]
    remaining = Math.floor(remaining / base)
  }
  return res
}

function decodeLittleEndianBaseN(input: string, alphabet: string): number {
  const base = alphabet.length
  let value = 0
  let place = 1
  for (let i = 0; i < input.length; i++) {
    const digit = alphabet.indexOf(input[i])
    if (digit < 0) return NaN
    value += digit * place
    place *= base
  }
  return value
}

// -----------------------------------------------------------------------------
// Pipeline Interpreter Core
// -----------------------------------------------------------------------------

async function runStep(step: PipelineStep, ctx: PipelineContext): Promise<void> {
  const op = (step.op || '').trim()
  const handler = OP_HANDLERS[op]
  if (!handler) {
    console.warn(`[anibaka-adapter] 未知 op: ${op}`)
    return
  }
  await handler(step, ctx)
}

async function runSteps(
  steps: PipelineStep[] | undefined,
  ctx: PipelineContext,
): Promise<void> {
  if (!steps || !steps.length) return
  for (const step of steps) {
    await runStep(step, ctx)
  }
}

type OpHandler = (step: PipelineStep, ctx: PipelineContext) => Promise<void> | void

const OP_HANDLERS: Record<string, OpHandler> = {
  template(step, ctx) {
    ctx.value = renderTemplate(String(step.value ?? ''), ctx)
  },

  setVar(step, ctx) {
    const name = String(step.name ?? '_').trim()
    ctx.vars[name] = renderTemplate(String(step.value ?? ''), ctx)
  },

  query(step, ctx) {
    const name = String(step.name ?? step.key ?? '').trim()
    if (!name) return
    const input = step.input
      ? renderTemplate(String(step.input), ctx)
      : ctx.pageUrl || ctx.currentString
    let val = ''
    try {
      const u = new URL(input, 'http://localhost')
      val = u.searchParams.get(name) || ''
    } catch {
      /* ignore */
    }
    if (!val && step.default != null) {
      val = String(step.default)
    }
    const varName = String(step.var ?? '').trim()
    if (varName) ctx.vars[varName] = val
    ctx.value = val
  },

  async fetch(step, ctx) {
    const template = step.url ? String(step.url) : ''
    const rawUrl = template ? renderTemplate(template, ctx) : ctx.currentString
    if (!rawUrl.trim()) {
      ctx.value = ''
      return
    }

    const url = toAbsoluteUrl(
      rawUrl.trim(),
      ctx.pageUrl || ctx.baseUrl,
    )
    const method = String(step.method ?? 'GET').toUpperCase()
    const customHeaders = renderMap(step.headers, ctx)
    const globalHeaders = ctx.rule.headers || {}

    const headers: Record<string, string> = {
      'User-Agent':
        customHeaders['User-Agent'] ||
        globalHeaders['User-Agent'] ||
        ctx.rule.userAgent ||
        config.defaultUserAgent,
      Accept:
        customHeaders.Accept ||
        'text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...globalHeaders,
      ...customHeaders,
    }
    if (!headers.Referer && ctx.pageUrl) {
      headers.Referer = ctx.pageUrl
    }

    let body: string | URLSearchParams | undefined
    const bodyParam = step.body
    if (bodyParam && typeof bodyParam === 'object') {
      const contentType = String(step.contentType ?? headers['Content-Type'] ?? '').toLowerCase()
      if (contentType.includes('json')) {
        const bodyObj: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(bodyParam as Record<string, unknown>)) {
          bodyObj[k] =
            typeof v === 'string' ? renderTemplate(v, ctx) : v
        }
        body = JSON.stringify(bodyObj)
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json'
      } else {
        const params = new URLSearchParams()
        for (const [k, v] of Object.entries(bodyParam as Record<string, unknown>)) {
          params.set(
            k,
            typeof v === 'string' ? renderTemplate(v, ctx) : String(v ?? ''),
          )
        }
        body = params
      }
    } else if (typeof bodyParam === 'string') {
      body = renderTemplate(bodyParam, ctx)
    }

    try {
      const res = await fetchPublic(
        url,
        {
          method,
          headers,
          body,
        },
        { timeoutMs: 15_000 },
      )
      if (!res.ok) {
        ctx.value = ''
        return
      }
      ctx.value = await res.text()
      ctx.pageUrl = url
    } catch (e) {
      console.warn(`[anibaka-adapter] fetch 失败: ${url}`, e)
      ctx.value = ''
    }
  },

  async follow(step, ctx) {
    await OP_HANDLERS.fetch(step, ctx)
  },

  select(step, ctx) {
    const html = ctx.currentString
    const selector = String(step.css ?? '').trim()
    const attr = String(step.attr ?? 'text').trim()
    if (!html || !selector) {
      ctx.value = ''
      return
    }
    try {
      const $ = cheerio.load(html)
      if (step.all) {
        const list: string[] = []
        $(selector).each((_, el) => {
          const val =
            attr === 'text' ? $(el).text().trim() : $(el).attr(attr)?.trim() || ''
          if (val) list.push(val)
        })
        ctx.value = list
      } else {
        const $el = $(selector).first()
        ctx.value =
          attr === 'text' ? $el.text().trim() : $el.attr(attr)?.trim() || ''
      }
    } catch {
      ctx.value = ''
    }
  },

  regex(step, ctx) {
    const source = ctx.currentString
    const patternStr = renderTemplate(String(step.pattern ?? ''), ctx)
    if (!patternStr) {
      ctx.value = ''
      return
    }
    const group = typeof step.group === 'number' ? step.group : 1
    const flags = (step.ignoreCase ? 'i' : '') + (step.all ? 'g' : '') + (step.dotAll ? 's' : '')
    try {
      const re = new RegExp(patternStr, flags)
      if (step.all) {
        const results: string[] = []
        let m: RegExpExecArray | null
        while ((m = re.exec(source)) !== null) {
          const val = group <= m.length - 1 ? m[group] ?? '' : ''
          if (val) results.push(val)
          if (!re.global) break
        }
        ctx.value = results
      } else {
        const m = re.exec(source)
        ctx.value = m && group <= m.length - 1 ? m[group] ?? '' : ''
      }
    } catch (e) {
      console.warn(`[anibaka-adapter] regex 错误: ${patternStr}`, e)
      ctx.value = ''
    }
  },

  replace(step, ctx) {
    const patternStr = renderTemplate(String(step.pattern ?? ''), ctx)
    if (!patternStr) return
    const replacement = renderTemplate(String(step.replacement ?? ''), ctx)
    const source = step.input
      ? renderTemplate(String(step.input), ctx)
      : ctx.currentString
    try {
      if (step.regex) {
        const flags =
          (step.first ? '' : 'g') +
          (step.ignoreCase ? 'i' : '') +
          (step.dotAll ? 's' : '')
        const re = new RegExp(patternStr, flags)
        ctx.value = source.replace(re, replacement)
      } else {
        ctx.value = step.first
          ? source.replace(patternStr, replacement)
          : source.replaceAll(patternStr, replacement)
      }
    } catch {
      ctx.value = source
    }
  },

  json(step, ctx) {
    const data = asJson(ctx.value)
    const path = String(step.path ?? '').trim()
    let val = jsonPath(data, path)
    if ((val == null || val === '') && path) {
      if (path.startsWith('data.')) {
        val = jsonPath(data, path.slice(5))
      } else if (!path.includes('.')) {
        val = jsonPath(data, `data.${path}`)
      }
    }
    ctx.value = val
  },

  pick(step, ctx) {
    const idx = Number(renderTemplate(String(step.index ?? '0'), ctx)) || 0
    if (Array.isArray(ctx.value) && idx >= 0 && idx < ctx.value.length) {
      ctx.value = ctx.value[idx]
    } else {
      ctx.value = ''
    }
  },

  crypto(step, ctx) {
    const algo = String(step.algo ?? '').toLowerCase().trim()
    const mode = String(step.mode ?? 'decrypt').toLowerCase().trim()
    const input = step.input
      ? renderTemplate(String(step.input), ctx)
      : ctx.currentString

    try {
      switch (algo) {
        case 'base64': {
          if (mode === 'encrypt') {
            ctx.value = Buffer.from(input, 'utf8').toString('base64')
          } else {
            try {
              ctx.value = Buffer.from(input, 'base64').toString('utf8')
            } catch {
              ctx.value = input
            }
          }
          break
        }
        case 'md5': {
          ctx.value = crypto.createHash('md5').update(input, 'utf8').digest('hex')
          break
        }
        case 'sha1': {
          ctx.value = crypto.createHash('sha1').update(input, 'utf8').digest('hex')
          break
        }
        case 'sha256': {
          ctx.value = crypto.createHash('sha256').update(input, 'utf8').digest('hex')
          break
        }
        case 'aes-cbc':
        case 'aes-gcm': {
          const isGcm = algo === 'aes-gcm'
          const keyEncoding = String(step.keyEncoding ?? 'utf8').toLowerCase()
          const keyRaw = renderTemplate(String(step.key ?? ''), ctx)
          const keyBytes =
            keyEncoding === 'base64'
              ? Buffer.from(keyRaw, 'base64')
              : keyEncoding === 'hex'
                ? Buffer.from(keyRaw.replace(/[^0-9a-fA-F]/g, ''), 'hex')
                : Buffer.from(keyRaw, 'utf8')

          let ivBytes: Buffer
          const ivRandom = Number(step.ivRandom)
          if (Number.isFinite(ivRandom) && ivRandom > 0) {
            ivBytes = crypto.randomBytes(ivRandom)
          } else {
            const ivEncoding = String(step.ivEncoding ?? 'utf8').toLowerCase()
            const ivRaw = renderTemplate(String(step.iv ?? ''), ctx)
            ivBytes =
              ivEncoding === 'base64'
                ? Buffer.from(ivRaw, 'base64')
                : ivEncoding === 'hex'
                  ? Buffer.from(ivRaw.replace(/[^0-9a-fA-F]/g, ''), 'hex')
                  : Buffer.from(ivRaw, 'utf8')
          }
          if (step.ivVar) {
            ctx.vars[String(step.ivVar)] = ivBytes.toString('base64')
          }

          const cipherAlgo = `aes-${keyBytes.length * 8}-${isGcm ? 'gcm' : 'cbc'}`
          if (mode === 'encrypt') {
            const cipher = crypto.createCipheriv(cipherAlgo, keyBytes, ivBytes)
            const enc = Buffer.concat([cipher.update(input, 'utf8'), cipher.final()])
            const outEncoding = String(step.outputEncoding ?? 'base64').toLowerCase()
            ctx.value = outEncoding === 'hex' ? enc.toString('hex') : enc.toString('base64')
          } else {
            const inputEncoding = String(step.inputEncoding ?? 'base64').toLowerCase()
            const cipherBuf =
              inputEncoding === 'hex'
                ? Buffer.from(input.replace(/[^0-9a-fA-F]/g, ''), 'hex')
                : Buffer.from(input, 'base64')
            const decipher = crypto.createDecipheriv(cipherAlgo, keyBytes, ivBytes)
            const dec = Buffer.concat([decipher.update(cipherBuf), decipher.final()])
            ctx.value = dec.toString('utf8').trim()
          }
          break
        }
        default:
          console.warn(`[anibaka-adapter] 未知 crypto 算法: ${algo}`)
      }
    } catch (e) {
      console.warn(`[anibaka-adapter] crypto 错误: ${algo}`, e)
      ctx.value = ''
    }
  },

  baseN(step, ctx) {
    const alphabet = String(step.alphabet ?? '')
    const mode = String(step.mode ?? 'encode').toLowerCase()
    const prefix = String(step.prefix ?? '')
    const suffix = String(step.suffix ?? '')
    const input = (step.input ? renderTemplate(String(step.input), ctx) : ctx.currentString).trim()
    if (alphabet.length < 2 || !input) {
      ctx.value = input
      return
    }
    if (mode === 'decode') {
      let code = input
      if (prefix && code.startsWith(prefix)) code = code.slice(prefix.length)
      if (suffix && code.endsWith(suffix)) code = code.slice(0, -suffix.length)
      const num = decodeLittleEndianBaseN(code, alphabet)
      ctx.value = Number.isNaN(num) ? input : String(num)
    } else {
      const num = parseInt(input, 10)
      if (Number.isNaN(num) || num < 0) {
        ctx.value = input
      } else {
        ctx.value = `${prefix}${encodeLittleEndianBaseN(num, alphabet)}${suffix}`
      }
    }
  },

  async first(step, ctx) {
    const branches = step.branches
    if (!Array.isArray(branches) || !branches.length) return
    const outBefore = ctx.outputCount
    for (const branch of branches) {
      if (!Array.isArray(branch)) continue
      const trial = ctx.trial()
      await runSteps(branch as PipelineStep[], trial)
      const succeeded =
        trial.sinkRuns === 0
          ? isNonEmpty(trial.value)
          : trial.outputCount > outBefore
      if (succeeded) {
        ctx.commit(trial)
        return
      }
    }
    ctx.value = ''
  },

  // ---------------------------------------------------------------------------
  // Structural Sinks & Builders
  // ---------------------------------------------------------------------------

  searchList(step, ctx) {
    ctx.beginSink()
    const html = ctx.currentString
    if (!html) return
    const $ = cheerio.load(html)
    const selectors = Array.isArray(step.selectors)
      ? step.selectors.map(String)
      : [String(step.selectors || '.card, .module-item, .search_list li, .search-item')]
    const detailPattern = String(step.detailPattern ?? '')
    const keywordMatch = Boolean(step.keywordMatch)
    const targetKw = keywordMatch ? String(ctx.vars.keyword ?? '').toLowerCase().trim() : ''

    const seen = new Set<string>()
    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const $el = $(el)
        let $a = $el.is('a') ? $el : $el.find('a').first()
        if (detailPattern) {
          const matchingA = $el.find(`a[href*="${detailPattern}"]`).first()
          if (matchingA.length) $a = matchingA
        }
        const href = $a.attr('href') || ''
        const name =
          $el.find('.title, .name, .video-name, .time-title, h3, h4').first().text().trim() ||
          $a.attr('title')?.trim() ||
          $el.find('img').attr('alt')?.trim() ||
          $a.text().trim()

        if (!name || !href) return
        if (detailPattern && !href.includes(detailPattern)) return
        if (targetKw && !name.toLowerCase().includes(targetKw)) return

        const absUrl = toAbsoluteUrl(href, ctx.pageUrl || ctx.baseUrl)
        if (seen.has(absUrl)) return
        seen.add(absUrl)
        ctx.addSeries({ name, src: absUrl })
      })
      if (ctx.seriesById.size > 0) break
    }
  },

  jsonSeries(step, ctx) {
    ctx.beginSink()
    const raw = asJson(ctx.value)
    if (!raw) return
    const listPath = String(step.listPath ?? '')
    let target = jsonPath(raw, listPath)
    if (!Array.isArray(target)) {
      if (Array.isArray(raw)) target = raw
      else if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>
        if (Array.isArray(r.data)) target = r.data
        else if (Array.isArray(r.list)) target = r.list
        else if (Array.isArray(r.videos)) target = r.videos
      }
    }
    if (!Array.isArray(target)) return

    const idKey = String(step.idKey ?? 'id')
    const nameKey = String(step.nameKey ?? 'name')
    const urlKey = step.urlKey ? String(step.urlKey) : null
    const template = step.detailUrlTemplate ? String(step.detailUrlTemplate) : null
    const alphabet = String(step.idAlphabet ?? step.alphabet ?? '')
    const idTransform = String(step.idTransform ?? '').toLowerCase()
    const prefix = String(step.idPrefix ?? '')
    const suffix = String(step.idSuffix ?? '')

    for (const item of target) {
      if (!item || typeof item !== 'object') continue
      const it = item as Record<string, unknown>
      const name = String(it[nameKey] ?? '').trim()
      if (!name) continue
      let rawId = String(it[idKey] ?? '').trim()
      if (idTransform === 'basen' && alphabet.length >= 2) {
        const num = parseInt(rawId, 10)
        if (!Number.isNaN(num)) {
          rawId = `${prefix}${encodeLittleEndianBaseN(num, alphabet)}${suffix}`
        }
      }

      let seriesUrl = ''
      if (urlKey && it[urlKey]) {
        seriesUrl = toAbsoluteUrl(String(it[urlKey]), ctx.baseUrl)
      } else if (template && rawId) {
        seriesUrl = toAbsoluteUrl(
          template.replaceAll('{id}', rawId).replaceAll('{rawId}', rawId),
          ctx.baseUrl,
        )
      } else if (rawId) {
        seriesUrl = rawId
      }
      if (seriesUrl) {
        ctx.addSeries({ name, src: seriesUrl })
      }
    }
  },

  episodes(step, ctx) {
    ctx.beginSink()
    const html = ctx.currentString
    if (!html) return
    const $ = cheerio.load(html)
    const listSelectors = Array.isArray(step.listSelectors)
      ? step.listSelectors.map(String)
      : ['.anthology-list-box', '.module-play-list', '.play-list', 'ul.hl-plays-list', '.playlist']
    const tabSelectors = Array.isArray(step.tabSelectors)
      ? step.tabSelectors.map(String)
      : ['.tabs a', '.play-from a', '.module-tab-item', '.source a']

    const tabs: string[] = []
    for (const tabSel of tabSelectors) {
      $(tabSel).each((_, el) => {
        const t = $(el).text().replace(/\s+/g, ' ').trim()
        if (t) tabs.push(t)
      })
      if (tabs.length) break
    }

    const roads: Road[] = []
    for (const listSel of listSelectors) {
      const lists = $(listSel).toArray()
      if (!lists.length) continue
      lists.forEach((listEl, idx) => {
        const urls: string[] = []
        const names: string[] = []
        const seen = new Set<string>()
        $(listEl)
          .find('a[href]')
          .each((_, a) => {
            const href = $(a).attr('href') || ''
            const text = $(a).text().trim()
            if (!href || !text) return
            const abs = toAbsoluteUrl(href, ctx.pageUrl || ctx.baseUrl)
            if (seen.has(abs)) return
            seen.add(abs)
            urls.push(abs)
            names.push(text)
          })
        if (urls.length > 0) {
          const tabName = idx < tabs.length ? tabs[idx] : `线路${roads.length + 1}`
          roads.push({
            name: tabName,
            data: urls,
            identifier: names,
          })
        }
      })
      if (roads.length > 0) break
    }

    if (step.reverseEpisodes) {
      for (const r of roads) {
        r.data.reverse()
        r.identifier.reverse()
      }
    }
    if (step.reverse) {
      roads.reverse()
    }
    ctx.roads.push(...roads)
  },

  jsonEpisodes(step, ctx) {
    ctx.beginSink()
    const data = asJson(ctx.value)
    if (!data) return

    const episodesPath = String(step.episodesPath ?? '')
    const epNameKey = String(step.episodeNameKey ?? step.nameKey ?? 'name')
    const idTemplate = String(step.episodeIdTemplate ?? step.detailUrlTemplate ?? '{id}')

    const buildEps = (epList: unknown[], sourceId?: unknown): { urls: string[]; names: string[] } => {
      const urls: string[] = []
      const names: string[] = []
      epList.forEach((it, idx) => {
        if (!it || typeof it !== 'object') return
        const map = it as Record<string, unknown>
        const epId = renderTemplate(idTemplate, ctx, {
          id: String(map.id ?? ''),
          source_id: sourceId != null ? String(sourceId) : '',
          index: String(idx + 1),
          ...Object.fromEntries(
            Object.entries(map).map(([k, v]) => [k, String(v ?? '')]),
          ),
        })
        const title = String(map[epNameKey] ?? '').trim() || `第${idx + 1}集`
        urls.push(epId)
        names.push(title)
      })
      return { urls, names }
    }

    if (episodesPath) {
      const epList = jsonPath(data, episodesPath)
      if (Array.isArray(epList)) {
        const { urls, names } = buildEps(epList)
        if (urls.length) {
          const srcName = renderTemplate(String(step.sourceName ?? '默认线路'), ctx).trim()
          ctx.roads.push({ name: srcName || '默认线路', data: urls, identifier: names })
        }
      }
      return
    }

    const sourcesPath = String(step.sourcesPath ?? '')
    const sourcesList = jsonPath(data, sourcesPath)
    if (Array.isArray(sourcesList)) {
      const epListKey = String(step.episodesKey ?? 'episodes')
      const sourceNameKey = String(step.sourceNameKey ?? 'name')
      sourcesList.forEach((srcObj, idx) => {
        if (!srcObj || typeof srcObj !== 'object') return
        const sMap = srcObj as Record<string, unknown>
        const epList = sMap[epListKey]
        if (Array.isArray(epList)) {
          const { urls, names } = buildEps(epList, sMap.id)
          if (urls.length) {
            const lineName = String(sMap[sourceNameKey] ?? '').trim() || `线路${idx + 1}`
            ctx.roads.push({ name: lineName, data: urls, identifier: names })
          }
        }
      })
    }
  },

  maccmsApiEpisodes(step, ctx) {
    ctx.beginSink()
    const data = asJson(ctx.value)
    const list = jsonPath(data, String(step.listPath ?? 'list'))
    if (!Array.isArray(list) || !list.length) return
    const item = list[0]
    if (!item || typeof item !== 'object') return
    const it = item as Record<string, unknown>

    const sourceNames = String(it[String(step.fromKey ?? 'vod_play_from')] ?? '').split('$$$')
    const rawGroups = String(it[String(step.urlKey ?? 'vod_play_url')] ?? '').split('$$$')

    rawGroups.forEach((group, sIdx) => {
      const urls: string[] = []
      const names: string[] = []
      for (const entry of group.split('#')) {
        const sep = entry.indexOf('$')
        if (sep <= 0 || sep >= entry.length - 1) continue
        const title = entry.slice(0, sep).trim()
        const rawId = entry.slice(sep + 1).trim()
        if (!rawId) continue
        urls.push(rawId)
        names.push(title || `第${urls.length}集`)
      }
      if (urls.length) {
        const name = sIdx < sourceNames.length ? sourceNames[sIdx].trim() : ''
        ctx.roads.push({
          name: name || `线路${sIdx + 1}`,
          data: urls,
          identifier: names,
        })
      }
    })
  },

  videoUrl(step, ctx) {
    const raw = ctx.currentString.trim()
    if (HTTP_SCHEME_RE.test(raw) && !raw.includes('<html') && !raw.includes('{')) {
      ctx.value = raw
      return
    }
    const m = raw.match(
      /(https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?)/i,
    )
    ctx.value = m ? m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/') : ''
  },

  setMediaHeaders(step, ctx) {
    const staticHeaders = renderMap(step.headers, ctx)
    const jsonPathStr = String(step.jsonPath ?? '').trim()
    if (jsonPathStr) {
      const data = asJson(ctx.value)
      const found = jsonPath(data, jsonPathStr)
      if (found && typeof found === 'object' && !Array.isArray(found)) {
        for (const [k, v] of Object.entries(found as Record<string, unknown>)) {
          staticHeaders[k] = String(v ?? '')
        }
      }
    }
    ctx.mediaHeaders = { ...ctx.mediaHeaders, ...staticHeaders }
  },

  playerAaaa(step, ctx) {
    const html = ctx.currentString
    const variable = String(step.var ?? 'player_aaaa')
    const key = String(step.key ?? 'url')
    const re = new RegExp(`${variable}\\s*=\\s*(\\{.*?\\})\\s*[;<]`, 's')
    const m = re.exec(html)
    if (!m) {
      ctx.value = ''
      return
    }
    try {
      const obj = JSON.parse(m[1]) as Record<string, unknown>
      let url = String(obj[key] ?? '').trim()
      const encrypt = String(obj.encrypt ?? '0')
      if (encrypt === '1') {
        url = decodeURIComponent(url)
      } else if (encrypt === '2') {
        url = Buffer.from(url, 'base64').toString('utf8')
        if (url.includes('%')) url = decodeURIComponent(url)
      }
      ctx.value = url.replace(/\\u002F/g, '/').replace(/\\\//g, '/')
    } catch {
      ctx.value = ''
    }
  },

  playerDecrypt(step, ctx) {
    const html = ctx.currentString
    const salt = renderTemplate(String(step.salt ?? ''), ctx)
    if (!html || !salt) {
      ctx.value = ''
      return
    }
    try {
      const $ = cheerio.load(html)
      const viewportId = $('meta[name="viewport"]').attr('id') || ''
      const charsetId = $('meta[charset]').attr('id') || ''
      const prefix = String(step.idPrefix ?? 'now_')
      const cleanVp = viewportId.startsWith(prefix) ? viewportId.slice(prefix.length) : viewportId
      const cleanCs = charsetId.startsWith(prefix) ? charsetId.slice(prefix.length) : charsetId

      const len = Math.min(cleanVp.length, cleanCs.length)
      if (!len) {
        ctx.value = ''
        return
      }
      const order = Array.from({ length: len }, (_, i) => i)
      order.sort((a, b) => cleanCs.charCodeAt(a) - cleanCs.charCodeAt(b))
      let secret = ''
      for (const idx of order) secret += cleanVp[idx]

      const hash = crypto.createHash('md5').update(`${secret}${salt}`, 'utf8').digest('hex')
      const key = Buffer.from(hash.slice(16), 'utf8')
      const iv = Buffer.from(hash.slice(0, 16), 'utf8')

      const configVar = String(step.configVar ?? 'config')
      const urlKey = String(step.urlKey ?? 'url')
      const encRe = new RegExp(`(?:var|let|const)?\\s*${configVar}\\s*=\\s*\\{[\\s\\S]*?["']${urlKey}["']\\s*:\\s*["']([^"']+)["']`, 'i')
      const encM = encRe.exec(html)
      if (!encM) {
        ctx.value = ''
        return
      }
      let cipherText = encM[1].replaceAll('\\/', '/').trim()
      if (cipherText.includes('%')) cipherText = decodeURIComponent(cipherText)

      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv)
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(cipherText, 'base64')),
        decipher.final(),
      ]).toString('utf8').trim()
      ctx.value = decrypted.replaceAll('\\/', '/')
    } catch (e) {
      console.warn('[anibaka-adapter] playerDecrypt 失败', e)
      ctx.value = ''
    }
  },

  ecPlayer(step, ctx) {
    const html = ctx.currentString
    const m = EC_PLAYER_CONFIG_RE.exec(html)
    if (!m) {
      ctx.value = ''
      return
    }
    try {
      const cfg = JSON.parse(m[1]) as Record<string, unknown>
      const encryptedUrl = String(cfg.url ?? '').replaceAll('\\/', '/')
      const uid = String(jsonPath(cfg, 'config.uid') ?? '').trim()
      if (!encryptedUrl || !uid) {
        ctx.value = ''
        return
      }
      const keyStr = renderTemplate(String(step.key ?? '2890{uid}tB959C'), ctx, { uid })
      const ivStr = renderTemplate(String(step.iv ?? '2F131BE91247866E'), ctx)
      const decipher = crypto.createDecipheriv(
        'aes-128-cbc',
        Buffer.from(keyStr, 'utf8'),
        Buffer.from(ivStr, 'utf8'),
      )
      const dec = Buffer.concat([
        decipher.update(Buffer.from(encryptedUrl, 'base64')),
        decipher.final(),
      ]).toString('utf8').trim()
      ctx.value = toAbsoluteUrl(dec.replaceAll('\\/', '/'), ctx.pageUrl)
    } catch {
      ctx.value = ''
    }
  },

  async maccmsSuggest(step, ctx) {
    ctx.beginSink()
    const base = ctx.baseUrl
    const mid = String(step.mid ?? '1')
    const limit = String(step.limit ?? '20')
    const keyword = String(ctx.vars.keyword ?? '').trim()
    if (!keyword) return

    const headers: Record<string, string> = {
      'X-Requested-With': 'XMLHttpRequest',
      ...renderMap(step.headers, ctx),
    }

    const paths = ['/index.php/ajax/suggest', '/ajax/suggest']
    for (const p of paths) {
      const url = toAbsoluteUrl(
        `${p}?mid=${mid}&wd=${encodeURIComponent(keyword)}&limit=${limit}`,
        base,
      )
      try {
        const res = await fetchPublic(url, { headers }, { timeoutMs: 10_000 })
        if (!res.ok) continue
        const text = await res.text()
        const json = asJson(text)
        const listPathStr = String(step.listPath ?? 'list')
        const found = jsonPath(json, listPathStr)
        if (Array.isArray(found) && found.length) {
          const filtered = found.filter((it) => {
            if (!it || typeof it !== 'object') return false
            const name = String((it as Record<string, unknown>).name ?? '').toLowerCase().trim()
            return name.includes(keyword.toLowerCase())
          })
          if (filtered.length) {
            ctx.value = { list: filtered }
            OP_HANDLERS.jsonSeries({ ...step, listPath: 'list' }, ctx)
            break
          }
        }
      } catch {
        /* ignore */
      }
    }
  },

  sniff(step, ctx) {
    // In Node.js environment without Headless Chrome, skip sniff to allow fallback branches to run
    ctx.value = ''
  },

  // ---------------------------------------------------------------------------
  // Anime1 Specialized Handlers
  // ---------------------------------------------------------------------------

  async anime1Search(step, ctx) {
    ctx.beginSink()
    const keyword = String(ctx.vars.keyword ?? '').trim()
    if (!keyword) return
    const url = String(step.url ?? 'https://d1zquzjgwo9yb.cloudfront.net/')
    try {
      const res = await fetchPublic(url, {}, { timeoutMs: 10_000 })
      if (!res.ok) return
      const text = await res.text()
      const catalog = JSON.parse(text)
      if (!Array.isArray(catalog)) return

      const tradKw = simplifiedToTraditional(keyword).toLowerCase()
      const simpKw = keyword.toLowerCase()
      const idIdx = Number(step.idIndex ?? 0)
      const nameIdx = Number(step.nameIndex ?? 1)

      for (const entry of catalog) {
        if (!Array.isArray(entry)) continue
        const id = String(entry[idIdx] ?? '')
        const name = String(entry[nameIdx] ?? '').trim()
        const lowerName = name.toLowerCase()
        if (lowerName.includes(tradKw) || lowerName.includes(simpKw)) {
          ctx.addSeries({
            name,
            src: `https://anime1.me/?cat=${id}`,
          })
        }
      }
    } catch (e) {
      console.warn('[anibaka-adapter] anime1Search 失败', e)
    }
  },

  async anime1Detail(step, ctx) {
    ctx.beginSink()
    const seriesId = String(ctx.vars.seriesId ?? ctx.currentString).trim()
    if (!seriesId) return
    const catId = seriesId.includes('?cat=')
      ? seriesId.split('?cat=')[1]
      : seriesId
    const firstUrl = `https://anime1.me/?cat=${catId}`

    try {
      const res = await fetchPublic(firstUrl, {}, { timeoutMs: 12_000 })
      if (!res.ok) return
      const html = await res.text()
      const $ = cheerio.load(html)
      const tokens: string[] = []
      $('video[data-apireq]').each((_, el) => {
        const token = $(el).attr('data-apireq')
        if (token) tokens.push(token)
      })
      if (tokens.length) {
        tokens.reverse() // anime1 is reverse-chronological by default
        const urls = tokens
        const names = tokens.map((_, i) => `第${i + 1}集`)
        ctx.roads.push({
          name: 'Anime1',
          data: urls,
          identifier: names,
        })
      }
    } catch (e) {
      console.warn('[anibaka-adapter] anime1Detail 失败', e)
    }
  },

  async anime1Play(step, ctx) {
    const token = String(ctx.vars.episodeId ?? ctx.currentString).trim()
    if (!token) {
      ctx.value = ''
      return
    }
    const apiUrl = 'https://v.anime1.me/api'
    try {
      const res = await fetchPublic(
        apiUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: 'https://anime1.me',
            Referer: 'https://anime1.me/',
            'User-Agent': config.defaultUserAgent,
          },
          body: new URLSearchParams({ d: decodeURIComponent(token) }),
        },
        { timeoutMs: 10_000 },
      )
      if (!res.ok) {
        ctx.value = ''
        return
      }
      const data = (await res.json()) as Record<string, unknown>
      const srcPath = String(step.sourcePath ?? 's[0].src')
      let streamUrl = String(jsonPath(data, srcPath) ?? '')
      if (streamUrl.startsWith('//')) streamUrl = `https:${streamUrl}`
      ctx.value = streamUrl
      ctx.mediaHeaders = {
        Referer: 'https://anime1.me/',
        'User-Agent': config.defaultUserAgent,
      }
    } catch {
      ctx.value = ''
    }
  },
}

// -----------------------------------------------------------------------------
// Public Adapter Exports
// -----------------------------------------------------------------------------

export async function searchAnx(
  rule: PluginRule,
  keyword: string,
): Promise<PluginSearchResult> {
  const ctx = new PipelineContext(rule, rule.baseURL, 'keyword', keyword)
  ctx.pageUrl = rule.baseURL
  try {
    await runSteps(rule.search, ctx)
    const items = Array.from(ctx.seriesById.values())
    return {
      pluginName: rule.name,
      items,
      diagnostics: items.length ? [] : ['未检索到匹配结果'],
    }
  } catch (e) {
    return {
      pluginName: rule.name,
      items: [],
      diagnostics: [e instanceof Error ? e.message : String(e)],
    }
  }
}

export async function chaptersAnx(
  rule: PluginRule,
  source: string,
): Promise<PluginChapterResult> {
  const ctx = new PipelineContext(rule, rule.baseURL, 'seriesId', source)
  ctx.pageUrl = toAbsoluteUrl(source, rule.baseURL)
  try {
    await runSteps(rule.detail, ctx)
    return {
      pluginName: rule.name,
      roads: ctx.roads,
      diagnostics: ctx.roads.length ? [] : ['未解析到分集线路'],
    }
  } catch (e) {
    return {
      pluginName: rule.name,
      roads: [],
      diagnostics: [e instanceof Error ? e.message : String(e)],
    }
  }
}

export async function resolveAnx(
  rule: PluginRule,
  pageUrl: string,
): Promise<ResolvePlayResult> {
  const ctx = new PipelineContext(rule, rule.baseURL, 'episodeId', pageUrl)
  ctx.pageUrl = toAbsoluteUrl(pageUrl, rule.baseURL)
  try {
    await runSteps(rule.play, ctx)
    const playUrl = ctx.currentString.trim()
    if (!playUrl || !HTTP_SCHEME_RE.test(playUrl)) {
      throw new Error('未解析到有效的视频直链')
    }

    const referer = ctx.mediaHeaders.Referer || rule.referer || rule.baseURL
    const params = new URLSearchParams({
      url: playUrl,
      referer,
    })
    if (rule.adBlocker) params.set('adFilter', '1')
    const proxyUrl = `/api/media/proxy?${params.toString()}`

    return {
      playUrl,
      proxyUrl,
      referer,
      headers: {
        'User-Agent': rule.userAgent || config.defaultUserAgent,
        ...ctx.mediaHeaders,
      },
      diagnostics: [],
    }
  } catch (e) {
    throw new Error(`[AniBaka] 直链解析失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}
