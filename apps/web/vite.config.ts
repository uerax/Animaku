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

  const rawSiteUrl = (get('VITE_SITE_URL') || get('SITE_URL') || '').trim().replace(/\/+$/, '')
  const siteUrl =
    rawSiteUrl && !rawSiteUrl.startsWith('http://') && !rawSiteUrl.startsWith('https://')
      ? `https://${rawSiteUrl}`
      : rawSiteUrl
  const defaultTheme =
    (get('VITE_DEFAULT_THEME') || 'light').trim().toLowerCase() === 'dark'
      ? 'dark'
      : 'light'

  const apiPort = envInt(get('PORT'), 8787)
  // Proxy connects to the API process; 0.0.0.0 is not a valid client target
  const apiProxyHost = get('API_PROXY_HOST') || '127.0.0.1'
  const apiProxyTarget =
    get('API_PROXY_TARGET') || `http://${apiProxyHost}:${apiPort}`

  const clarityId = (get('VITE_CLARITY_ID') || get('CLARITY_ID') || '').trim()
  const gaId = (get('VITE_GA_ID') || get('GA_ID') || '').trim()
  const baiduTongjiId = (
    get('VITE_BAIDU_TONGJI_ID') ||
    get('BAIDU_TONGJI_ID') ||
    ''
  ).trim()

  const safeClarityId = clarityId.replace(/[^a-zA-Z0-9_-]/g, '')
  const safeGaId = gaId.replace(/[^a-zA-Z0-9_-]/g, '')
  const safeBaiduTongjiId = baiduTongjiId.replace(/[^a-zA-Z0-9_-]/g, '')

  const analyticsSnippets: string[] = []
  if (safeClarityId) {
    analyticsSnippets.push(`    <!-- Microsoft Clarity -->
    <script type="text/javascript">
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i+"?ref=bwt";
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${safeClarityId}");
    </script>`)
  }
  if (safeGaId) {
    analyticsSnippets.push(`    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${safeGaId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${safeGaId}');
    </script>`)
  }
  if (safeBaiduTongjiId) {
    analyticsSnippets.push(`    <!-- Baidu Tongji -->
    <script>
      var _hmt = _hmt || [];
      (function() {
        var hm = document.createElement("script");
        hm.src = "https://hm.baidu.com/hm.js?${safeBaiduTongjiId}";
        var s = document.getElementsByTagName("script")[0];
        s.parentNode.insertBefore(hm, s);
      })();
    </script>`)
  }

  return {
    envDir: repoRoot,
    plugins: [
      react(),
      tailwindcss(),
      {
        // Inject early theme default based on VITE_DEFAULT_THEME to prevent FOUC.
        name: 'animaku-theme-injection',
        transformIndexHtml(html: string) {
          return html
            .replace(
              /(var|let|const)\s+theme\s*=\s*['"]light['"]/,
              `$1 theme = '${defaultTheme}'`,
            )
            .replace(
              /(setAttribute\(\s*['"]data-theme['"]\s*,\s*)['"]light['"]\s*\)/,
              `$1'${defaultTheme}')`,
            )
        },
      },
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
          let hostnameBackup = ''
          if (siteUrl) {
            try {
              const urlObj = new URL(siteUrl)
              hostnameBackup = urlObj.hostname.toLowerCase()
            } catch {
              hostnameBackup = siteUrl
                .replace(/^https?:\/\//i, '')
                .split('/')[0]
                .split(':')[0]
                .toLowerCase()
            }
          }

          const alternateName: string[] = ['Animaku 动漫', 'Animaku动漫', 'Animaku']
          if (
            hostnameBackup &&
            hostnameBackup !== 'localhost' &&
            hostnameBackup !== '127.0.0.1' &&
            !alternateName.includes(hostnameBackup)
          ) {
            alternateName.push(hostnameBackup)
          }

          const jsonLd: Record<string, unknown> = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Animaku 动漫',
            alternateName,
            description:
              'Animaku 多资源聚合的日漫番剧、剧场版动画在线观看，支持高性能自研弹幕播放、画质超分、OP / ED 智能跳过、Bangumi 每日更新时间表与追番历史。',
            ...(siteUrl ? { url: `${siteUrl}/` } : {}),
            ...(siteUrl
              ? {
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: {
                      '@type': 'EntryPoint',
                      urlTemplate: `${siteUrl}/search?q={search_term_string}`,
                    },
                    'query-input': 'required name=search_term_string',
                  },
                }
              : {}),
          }
          const safeSiteUrl = siteUrl ? siteUrl.replace(/[<>"']/g, '') : ''
          const formatted = JSON.stringify(jsonLd, null, 2)
            .replace(/<\/script/gi, '<\\/script')
            .split('\n')
            .map((line, idx) => (idx === 0 ? line : '      ' + line))
            .join('\n')
          const scriptTag = [
            '    <script type="application/ld+json" data-animaku-jsonld="1">',
            `      ${formatted}`,
            '    </script>',
          ].join('\n')

          const canonicalTag = safeSiteUrl
            ? `    <link rel="canonical" href="${safeSiteUrl}/" />\n`
            : ''

          return html
            .replace('    <!--canonical-url-->\n', canonicalTag)
            .replace('<!--canonical-url-->', canonicalTag)
            .replace('    <!--website-jsonld-->', scriptTag)
            .replace('<!--website-jsonld-->', scriptTag)
        },
      },
      {
        // Inject privacy-compliant analytics scripts (Clarity, GA4, Baidu Tongji) if configured in env.
        name: 'animaku-analytics-injection',
        transformIndexHtml(html: string) {
          const replacement =
            analyticsSnippets.length > 0 ? `${analyticsSnippets.join('\n')}\n` : ''
          return html
            .replace('    <!--analytics-scripts-->\n', replacement)
            .replace('<!--analytics-scripts-->', replacement)
        },
      },
    ],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(
        get('VITE_APP_VERSION') || resolvePackageVersion(),
      ),
      'import.meta.env.VITE_BANGUMI_IMAGE_HOST': JSON.stringify(bangumiImageHost),
      'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl),
      'import.meta.env.VITE_DEFAULT_THEME': JSON.stringify(defaultTheme),
      'import.meta.env.VITE_NAV_SHOW_USER_MENU': JSON.stringify(
        get('VITE_NAV_SHOW_USER_MENU') ?? '',
      ),
      'import.meta.env.VITE_NAV_SHOW_HISTORY': JSON.stringify(
        get('VITE_NAV_SHOW_HISTORY') ?? '',
      ),
      'import.meta.env.VITE_NAV_SHOW_THEME_TOGGLE': JSON.stringify(
        get('VITE_NAV_SHOW_THEME_TOGGLE') ?? '',
      ),
      'import.meta.env.VITE_NAV_SHOW_GITHUB': JSON.stringify(
        get('VITE_NAV_SHOW_GITHUB') ?? '',
      ),
      'import.meta.env.VITE_CLARITY_ID': JSON.stringify(safeClarityId),
      'import.meta.env.VITE_GA_ID': JSON.stringify(safeGaId),
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
