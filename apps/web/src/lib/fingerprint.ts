import FingerprintJS from '@fingerprintjs/fingerprintjs'

const SESSION_STORAGE_KEY = 'animaku_browser_fp'

// In-memory cache for fastest synchronous non-blocking access (0ms overhead)
let memoryFp: string | null = null
let fpPromise: Promise<string> | null = null

/**
 * Lightweight native canvas/webgl fallback fingerprint in case FingerprintJS fails or is blocked.
 */
function getNativeFallbackFingerprint(): string {
  try {
    const parts: string[] = []

    // 1. Screen & hardware profile
    parts.push(`${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 0}`)
    parts.push(String(navigator.hardwareConcurrency || 0))
    parts.push(String(navigator.maxTouchPoints || 0))
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '')

    // 2. WebGL physical renderer probe
    const glCanvas = document.createElement('canvas')
    const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl')
    if (gl && gl instanceof WebGLRenderingContext) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      if (ext) {
        parts.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
      }
    }

    // 3. Canvas 2D sub-pixel rendering nuance (must use a separate canvas from WebGL)
    const canvas2d = document.createElement('canvas')
    const ctx = canvas2d.getContext('2d')
    if (ctx) {
      canvas2d.width = 200
      canvas2d.height = 40
      ctx.textBaseline = 'top'
      ctx.font = "14px 'Arial'"
      ctx.fillStyle = '#f60'
      ctx.fillRect(100, 1, 62, 20)
      ctx.fillStyle = '#069'
      ctx.fillText('Animaku,fp! 😃', 2, 12)
      parts.push(canvas2d.toDataURL().slice(-40))
    }

    // 4. Dual-seed 64-bit FNV-1a hash to guarantee >=16 hex chars and strong collision resistance
    let h1 = 2166136261
    let h2 = 2166136261 ^ 0x5a5a5a5a
    const str = parts.join('||')
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i)
      h1 = Math.imul(h1 ^ code, 16777619)
      h2 = Math.imul(h2 ^ (code + i), 16777619)
    }
    const hex1 = ('00000000' + (h1 >>> 0).toString(16)).slice(-8)
    const hex2 = ('00000000' + (h2 >>> 0).toString(16)).slice(-8)
    return hex1 + hex2
  } catch {
    return ''
  }
}

/**
 * Read synchronously from memory or sessionStorage without blocking execution.
 * Returns null if calculation is still pending in background.
 */
export function getCachedBrowserFingerprint(): string | null {
  if (memoryFp) return memoryFp
  if (typeof window === 'undefined') return null

  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (stored && /^[a-zA-Z0-9_-]{16,64}$/.test(stored)) {
      memoryFp = stored
      return memoryFp
    }
  } catch {
    // Ignore storage quota / access restriction errors
  }

  return null
}

/**
 * Asynchronously compute the hardware/browser environment fingerprint.
 * Uses official @fingerprintjs/fingerprintjs with automatic fallback to native WebGL/Canvas probe.
 */
export async function getBrowserFingerprint(): Promise<string> {
  const cached = getCachedBrowserFingerprint()
  if (cached) return cached

  if (fpPromise) return fpPromise

  fpPromise = (async () => {
    let fp = ''
    try {
      const agent = await FingerprintJS.load()
      const result = await agent.get()
      if (result?.visitorId && /^[a-zA-Z0-9_-]{16,64}$/.test(result.visitorId)) {
        fp = result.visitorId
      }
    } catch (err) {
      console.warn('[fingerprint] FingerprintJS error, falling back to native probe:', err)
    }

    // Fallback to native probe if library didn't produce a valid fingerprint
    if (!fp) {
      fp = getNativeFallbackFingerprint()
    }

    if (fp) {
      memoryFp = fp
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, fp)
      } catch {
        // Ignore session storage error
      }
    }

    return fp
  })()

  return fpPromise
}

/**
 * Non-blocking background pre-warmer.
 * Schedules fingerprint computation in idle periods (requestIdleCallback)
 * so it never contends with critical-path DOM rendering or network requests.
 */
export function initBrowserFingerprint(): void {
  if (typeof window === 'undefined') return
  if (getCachedBrowserFingerprint()) return

  const schedule = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 100))
  schedule(() => {
    getBrowserFingerprint().catch(() => {
      /* ignore idle background errors */
    })
  })
}

// Auto-schedule background pre-warm on module evaluation in browser
if (typeof window !== 'undefined') {
  initBrowserFingerprint()
}
