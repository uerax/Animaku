#!/usr/bin/env tsx
/**
 * 视频源自动化探查与指纹识别工具 (Automated Video Source Prober)
 *
 * 用法:
 *   npx tsx scripts/probe-source.ts <URL> [keyword]
 *
 * 示例:
 *   npx tsx scripts/probe-source.ts https://www.tvtfun.net/videos 从零开始
 *   npx tsx scripts/probe-source.ts https://www.cycani.org 鬼灭之刃
 */

const targetUrl = process.argv[2]
const testKeyword = process.argv[3] || '从零开始'

if (!targetUrl) {
  console.log(`\n用法: npx tsx scripts/probe-source.ts <URL> [keyword]`)
  console.log(`示例: npx tsx scripts/probe-source.ts https://www.tvtfun.net/videos 从零开始\n`)
  process.exit(1)
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

interface Fingerprint {
  framework: string
  isMacCMS: boolean
  isNextRSC: boolean
  isViteSPA: boolean
  isSupabase: boolean
  hasAntiDebug: boolean
  antiDebugDetails: string[]
  apiEndpoints: string[]
  cookies: string[]
  recommendedShape: 'A (MacCMS JSON)' | 'B (Release Page)' | 'C (Dedicated Adapter)'
}

async function probe() {
  console.log(`\n======================================================`)
  console.log(`🔍 开始探查视频源: ${targetUrl}`)
  console.log(`🔑 测试关键词: "${testKeyword}"`)
  console.log(`======================================================\n`)

  const u = new URL(targetUrl)
  const origin = u.origin

  const fp: Fingerprint = {
    framework: 'Unknown',
    isMacCMS: false,
    isNextRSC: false,
    isViteSPA: false,
    isSupabase: false,
    hasAntiDebug: false,
    antiDebugDetails: [],
    apiEndpoints: [],
    cookies: [],
    recommendedShape: 'C (Dedicated Adapter)',
  }

  // 1. Fetch Landing Page
  console.log(`[1/5] 正在抓取站点首页与 HTTP 响应头...`)
  let html = ''
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    })
    console.log(`  -> HTTP 状态码: ${res.status}`)
    const setCookies =
      res.headers.getSetCookie?.() || [res.headers.get('set-cookie') || '']
    fp.cookies = setCookies
      .flatMap((c) => c.split(','))
      .map((c) => c.trim().split(';')[0])
      .filter(Boolean)
    if (fp.cookies.length) {
      console.log(`  -> 捕获 Set-Cookie:`, fp.cookies)
    }
    html = await res.text()
  } catch (e) {
    console.error(`  ❌ 首页请求失败:`, e)
    return
  }

  // 2. Detect Technology Fingerprints
  console.log(`\n[2/5] 分析前端架构与反爬特征...`)
  if (html.includes('self.__next_f') || html.includes('/_next/static/')) {
    fp.isNextRSC = true
    fp.framework = 'Next.js (App Router / RSC)'
  } else if (html.includes('id="__next"') || html.includes('__NEXT_DATA__')) {
    fp.framework = 'Next.js (Pages Router / SSR)'
  } else if (html.includes('/@vite/client') || html.includes('vite/assets')) {
    fp.isViteSPA = true
    fp.framework = 'Vite + React/Vue SPA'
  } else if (html.includes('maccms') || html.includes('player_aaaa') || html.includes('MacPlayer')) {
    fp.isMacCMS = true
    fp.framework = 'MacCMS 传统模板引擎'
  }

  if (html.includes('supabase.co') || html.includes('sb_publishable_')) {
    fp.isSupabase = true
    console.log(`  -> 发现 Supabase BaaS 依赖`)
  }

  // Check Anti-debugging / DevTools Blockers
  const antiDebugKeywords = [
    'disable-devtool',
    'devtools-detector',
    'redirectUrl',
    'console.clear()',
    'debugger',
    'window.location.href',
  ]
  for (const kw of antiDebugKeywords) {
    if (html.includes(kw)) {
      fp.hasAntiDebug = true
      fp.antiDebugDetails.push(kw)
    }
  }

  console.log(`  -> 技术栈识别: ${fp.framework}`)
  if (fp.hasAntiDebug) {
    console.log(`  ⚠️ 监测到 F12 反调试/重定向标记:`, fp.antiDebugDetails)
  } else {
    console.log(`  -> 未发现明显前端 F12 拦截`)
  }

  // 3. Search Common API Endpoints
  console.log(`\n[3/5] 探查常用搜索与 RESTful API 接口...`)
  const candidateSearchApis = [
    `${origin}/api/videos/search?q=${encodeURIComponent(testKeyword)}`,
    `${origin}/api/videos?keyword=${encodeURIComponent(testKeyword)}`,
    `${origin}/api/videos?q=${encodeURIComponent(testKeyword)}`,
    `${origin}/api/search?keyword=${encodeURIComponent(testKeyword)}`,
    `${origin}/api/v1/search?q=${encodeURIComponent(testKeyword)}`,
    `${origin}/vodsearch/**----------?wd=${encodeURIComponent(testKeyword)}`,
    `${origin}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(testKeyword)}`,
  ]

  for (const apiUrl of candidateSearchApis) {
    try {
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json, text/html, */*',
          Referer: origin,
        },
        signal: AbortSignal.timeout(5_000),
      })
      const ct = res.headers.get('content-type') || ''
      if (res.ok && ct.includes('json')) {
        const json = await res.json().catch(() => null)
        if (json) {
          fp.apiEndpoints.push(apiUrl)
          console.log(`  ✅ 发现有效 JSON 搜索接口: ${apiUrl}`)
          console.log(`     数据样本:`, JSON.stringify(json).slice(0, 150) + '...')
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 4. Determine Recommended Integration Shape
  console.log(`\n[4/5] 架构决策矩阵判定...`)
  if (fp.isMacCMS && !fp.hasAntiDebug && !fp.isNextRSC) {
    fp.recommendedShape = 'A (MacCMS JSON)'
  } else if (html.includes('release') || html.includes('最新发布页') || html.includes('防封')) {
    fp.recommendedShape = 'B (Release Page)'
  } else {
    fp.recommendedShape = 'C (Dedicated Adapter)'
  }

  console.log(`  🎯 建议接入模式: 【形态 ${fp.recommendedShape}】`)

  // 5. Output Summary & Next Actions
  console.log(`\n[5/5] 接入指南与执行建议:`)
  console.log(`------------------------------------------------------`)
  if (fp.recommendedShape === 'A (MacCMS JSON)') {
    console.log(`- 模式：零修改代码，纯 JSON 规则配置`)
    console.log(`- 步骤：在 apps/web/src/data/default-plugins/ 新建 JSON 并配置 searchList / chapterRoads XPath 规则`)
  } else if (fp.recommendedShape === 'B (Release Page)') {
    console.log(`- 模式：动态发布页镜像追踪规则`)
    console.log(`- 步骤：配置 release.pageUrl 与解密字段，使用 resolveReleaseBaseUrl 自动追踪有效域名`)
  } else {
    console.log(`- 模式：TypeScript 专有适配器 (Dedicated Adapter)`)
    console.log(`- 步骤：`)
    console.log(`  1. 新建 apps/server/src/lib/${u.hostname.replace(/\./g, '_')}.ts`)
    console.log(`  2. 实现 isRule / search / chapters / resolve 四大导出函数`)
    console.log(`  3. 若含一次性 Nonce 或短效凭证，采用 JIT (按需即用) 签发模式`)
    console.log(`  4. 在 apps/server/src/rule-engine/index.ts 挂载分流`)
    console.log(`  5. 注册 default-plugins/${u.hostname.replace(/\./g, '_')}.json 并递增 PLUGIN_DEFAULTS_VERSION`)
  }
  console.log(`======================================================\n`)
}

probe().catch(console.error)
