import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Monorepo root (…/animaku) — where `.env` / `.env.example` live */
const repoRoot = path.resolve(__dirname, '../..')

function resolvePackageVersion(): string {
  try {
    const pkgPath = path.resolve(repoRoot, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (pkg.version) return `v${pkg.version}`
    }
  } catch {}
  return 'v1.1.1'
}

function envInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export default defineConfig(({ mode }) => {
  // Merge: shell env > apps/web/.env* > repo-root/.env* (later loadEnv does not override)
  const fileEnv = {
    ...loadEnv(mode, repoRoot, ''),
    ...loadEnv(mode, __dirname, ''),
  }
  const get = (key: string) => process.env[key] ?? fileEnv[key]

  const webPort = envInt(get('WEB_DEV_PORT'), 5173)
  // Bind address (0.0.0.0 = all interfaces). Default loopback for safer local dev.
  const webHost = get('WEB_HOST') || '127.0.0.1'
  // HMR websocket must be a host the browser can open — not 0.0.0.0
  const hmrHost =
    get('WEB_HMR_HOST') ||
    (webHost === '0.0.0.0' || webHost === '::' ? '127.0.0.1' : webHost)

  // Bangumi 封面图片源（支持 official | mirror | 自定义域名）
  // 走 define 而不是 import.meta.env，这样 repo-root/.env 里的值也能生效（envDir 只认 apps/web）。
  function resolveImageHostPreset(raw?: string): string {
    const v = (raw || '').trim().toLowerCase()
    if (!v || v === 'mirror' || v === 'proxy' || v === '1' || v.includes('bgmimg')) {
      return 'bgmimg.anibt.net'
    }
    if (
      v === 'official' ||
      v === 'direct' ||
      v === '0' ||
      v.includes('lain') ||
      v.includes('bgm.tv')
    ) {
      return 'lain.bgm.tv'
    }
    return v.replace(/^https?:\/\//i, '').replace(/\/.*$/, '') || 'bgmimg.anibt.net'
  }

  const bangumiImageHost = resolveImageHostPreset(
    get('BANGUMI_IMAGE') || get('VITE_BANGUMI_IMAGE_HOST') || get('BANGUMI_IMAGE_HOST'),
  )

  const siteUrl = (get('VITE_SITE_URL') || get('SITE_URL') || '').trim().replace(/\/+$/, '')

  const apiPort = envInt(get('PORT'), 8787)
  // Proxy connects to the API process; 0.0.0.0 is not a valid client target
  const apiProxyHost = get('API_PROXY_HOST') || '127.0.0.1'
  const apiProxyTarget =
    get('API_PROXY_TARGET') || `http://${apiProxyHost}:${apiPort}`

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Inject preconnect/dns-prefetch for the configured cover host.
        name: 'animaku-bangumi-image-preconnect',
        transformIndexHtml(html: string) {
          return html.replace(
            '<!--bangumi-image-preconnect-->',
            [
              `<link rel="preconnect" href="https://${bangumiImageHost}" crossorigin />`,
              `    <link rel="dns-prefetch" href="https://${bangumiImageHost}" />`,
            ].join('\n'),
          )
        },
      },
      {
        // Inject Google WebSite structured data (Site Name) dynamically from siteUrl if configured.
        name: 'animaku-seo-website-jsonld',
        transformIndexHtml(html: string) {
          const jsonLd: Record<string, unknown> = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Animaku',
            alternateName: ['Animaku 动漫', 'Animaku动漫'],
            description:
              'Animaku 提供海量日漫番剧、剧场版动画在线观看，支持高性能自研弹幕播放、1080P 高清画质、画质超分、OP / ED智能跳过、Bangumi 每日更新时间表与追番历史，打造轻快稳定的二次元追番体验。',
            ...(siteUrl ? { url: `${siteUrl}/` } : {}),
          }
          const formatted = JSON.stringify(jsonLd, null, 2)
            .split('\n')
            .map((line, idx) => (idx === 0 ? line : '      ' + line))
            .join('\n')
          const scriptTag = [
            '    <!-- Google 网站名称结构化数据 (Site Name) -->',
            '    <script type="application/ld+json" data-animaku-jsonld="1">',
            `      ${formatted}`,
            '    </script>',
          ].join('\n')
          return html.replace('<!--website-jsonld-->', scriptTag)
        },
      },
    ],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(
        get('VITE_APP_VERSION') || resolvePackageVersion(),
      ),
      'import.meta.env.VITE_BANGUMI_IMAGE_HOST': JSON.stringify(bangumiImageHost),
      'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        // Workspace package exports raw TS; pin path so Vite always finds it
        // even if node_modules links are stale after rename/reinstall.
        '@animaku/shared': path.resolve(repoRoot, 'packages/shared/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('hls.js')) return 'hls'
            if (id.includes('anime4k-webgpu')) return 'anime4k'
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/') ||
              id.includes('react-router')
            ) {
              return 'react-vendor'
            }
            if (id.includes('@tanstack/react-query') || id.includes('zustand')) {
              return 'data-vendor'
            }
          },
        },
      },
    },
    server: {
      host: webHost,
      port: webPort,
      strictPort: true,
      // Explicit HMR so the client always targets the same host:port as the page
      // (avoids wrong websocket host when opened via localhost vs 127.0.0.1)
      hmr: {
        protocol: 'ws',
        host: hmrHost,
        port: webPort,
        clientPort: webPort,
      },
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: webHost,
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
