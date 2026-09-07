#!/usr/bin/env node
/**
 * 视频源全链路性能与老番资源覆盖度横评工具
 *
 * 用法:
 *   pnpm benchmark:sources
 *   或: pnpm --filter @animaku/server exec tsx ../../scripts/benchmark-sources.mjs [keyword]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchWithRule, chaptersWithRule, resolvePlay } from '../apps/server/src/rule-engine/index.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(rootDir, relPath), 'utf-8'))
}

const SOURCES = [
  { key: 'xifan-next', name: '稀饭 (xifan-next)', rule: loadJson('apps/web/src/data/default-plugins/xifan-next.json') },
  { key: 'cycani', name: '次元城 (cycani)', rule: loadJson('apps/web/src/data/default-plugins/cycani.json') },
  { key: 'girigiri', name: 'girigiri愛動漫', rule: loadJson('apps/web/src/data/default-plugins/girigiri.json') },
  { key: 'mifun', name: 'MiFun动漫', rule: loadJson('apps/web/src/data/default-plugins/mifun.json') },
]

// 经典老番测试集（年代跨度 1995 ~ 2011）
const OLD_ANIMES = [
  '新世纪福音战士',
  '星际牛仔',
  '钢之炼金术师',
  '凉宫春日的忧郁',
  'CLANNAD',
  '反叛的鲁路修',
  '轻音少女',
  '命运石之门',
]

async function measure(fn) {
  const t0 = performance.now()
  try {
    const result = await fn()
    const t1 = performance.now()
    return { ok: true, duration: Math.round(t1 - t0), result }
  } catch (err) {
    const t1 = performance.now()
    return { ok: false, duration: Math.round(t1 - t0), error: err instanceof Error ? err.message : String(err) }
  }
}

async function testCdn(url, referer) {
  const t0 = performance.now()
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Range': 'bytes=0-1024',
    }
    if (referer) headers.Referer = referer
    const res = await fetch(url, { headers, method: 'GET' })
    const t1 = performance.now()
    const bytes = (await res.arrayBuffer()).byteLength
    return {
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      duration: Math.round(t1 - t0),
      contentType: res.headers.get('content-type') || '',
      server: res.headers.get('server') || '',
      bytes,
    }
  } catch (err) {
    const t1 = performance.now()
    return { ok: false, duration: Math.round(t1 - t0), error: err.message, status: 0 }
  }
}

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('🏁 视频源性能与老番资源覆盖度全链路评测 (xifan-next / cycani / girigiri / mifun)')
  console.log('='.repeat(80))

  // =========================================================================
  // 阶段 1: 经典老番资源库覆盖率与检索时延
  // =========================================================================
  console.log('\n[阶段 1/2] 正在探测 8 部经典老番资源库覆盖情况与搜索延迟...\n')

  const coverageMatrix = {} // anime -> { source: { count, duration, ok } }
  const sourceStats = {}
  for (const s of SOURCES) {
    sourceStats[s.key] = {
      name: s.name,
      totalHits: 0,
      totalItems: 0,
      searchDurations: [],
    }
  }

  for (const anime of OLD_ANIMES) {
    coverageMatrix[anime] = {}
    process.stdout.write(`  🔎 检索《${anime.padEnd(8, '　')}》: `)
    const logs = []
    for (const s of SOURCES) {
      const { ok, duration, result } = await measure(() => searchWithRule(s.rule, anime))
      const count = ok && Array.isArray(result?.items) ? result.items.length : 0
      coverageMatrix[anime][s.key] = { count, duration, ok }

      sourceStats[s.key].searchDurations.push(duration)
      sourceStats[s.key].totalItems += count
      if (count > 0) sourceStats[s.key].totalHits++

      logs.push(`${s.key}: ${count > 0 ? `${count}条` : '无'}(${duration}ms)`)
    }
    console.log(logs.join(' | '))
  }

  // =========================================================================
  // 阶段 2: 实际起播与端到端延迟测试 (搜索 -> 选集 -> 直链解析 -> CDN TTFB)
  // =========================================================================
  console.log('\n[阶段 2/2] 正在进行端到端起播时延比对 (热门新番基线 vs 经典老番)...')

  const benchmarkTargets = [
    { type: '热门番基线', title: '鬼灭之刃', query: '鬼灭之刃' },
    { type: '经典老番 1', title: '命运石之门', query: '命运石之门' },
    { type: '经典老番 2', title: '反叛的鲁路修', query: '反叛的鲁路修' },
    { type: '经典老番 3', title: '钢之炼金术师', query: '钢之炼金术师' },
  ]

  const pipelineReports = []

  for (const target of benchmarkTargets) {
    console.log(`\n------------------------------------------------------------`)
    console.log(`🎯 目标番剧: 【${target.type} - ${target.title}】`)
    console.log(`------------------------------------------------------------`)

    for (const s of SOURCES) {
      process.stdout.write(`  [${s.name.padEnd(16, ' ')}] `)

      // 1. 搜索
      const sRes = await measure(() => searchWithRule(s.rule, target.query))
      if (!sRes.ok || !sRes.result?.items?.length) {
        console.log(`❌ 搜索无结果 (${sRes.duration}ms)`)
        pipelineReports.push({
          target: target.title,
          source: s.name,
          searchMs: sRes.duration,
          chaptersMs: null,
          resolveMs: null,
          cdnMs: null,
          totalMs: sRes.duration,
          format: 'N/A',
          cdnHost: 'N/A',
          status: '搜索无结果',
        })
        continue
      }
      const item = sRes.result.items[0]

      // 2. 选集
      const cRes = await measure(() => chaptersWithRule(s.rule, item.src))
      if (!cRes.ok || !cRes.result?.roads?.length || !cRes.result.roads[0]?.data?.length) {
        console.log(`❌ 选集解析失败 (${cRes.duration}ms)`)
        pipelineReports.push({
          target: target.title,
          source: s.name,
          searchMs: sRes.duration,
          chaptersMs: cRes.duration,
          resolveMs: null,
          cdnMs: null,
          totalMs: sRes.duration + cRes.duration,
          format: 'N/A',
          cdnHost: 'N/A',
          status: '选集解析失败',
        })
        continue
      }
      const firstEpUrl = cRes.result.roads[0].data[0]
      const epCount = cRes.result.roads[0].data.length
      const roadCount = cRes.result.roads.length

      // 3. 直链解析
      const rRes = await measure(() => resolvePlay(s.rule, firstEpUrl))
      if (!rRes.ok || !rRes.result?.playUrl) {
        console.log(`❌ 直链解析失败 (${rRes.duration}ms)`)
        pipelineReports.push({
          target: target.title,
          source: s.name,
          searchMs: sRes.duration,
          chaptersMs: cRes.duration,
          resolveMs: rRes.duration,
          cdnMs: null,
          totalMs: sRes.duration + cRes.duration + rRes.duration,
          format: 'N/A',
          cdnHost: 'N/A',
          status: '直链解析失败',
        })
        continue
      }
      const playUrl = rRes.result.playUrl

      // 4. CDN 直连首分片 TTFB 探测
      const cdnRes = await testCdn(playUrl, rRes.result.referer || '')
      let cdnHost = 'N/A'
      try {
        cdnHost = new URL(playUrl).hostname
      } catch {}

      // 综合起播耗时 = 选集 + 直链解析 + CDN 首分片 TTFB
      const playPipelineMs = cRes.duration + rRes.duration + cdnRes.duration

      console.log(`✅ 成功! 起播总计: ${playPipelineMs}ms`)
      console.log(`       -> 命中剧名: "${item.name}" (${roadCount}线路, 首线${epCount}集)`)
      console.log(`       -> 搜索: ${sRes.duration}ms | 选集: ${cRes.duration}ms | 解析: ${rRes.duration}ms | CDN TTFB: ${cdnRes.duration}ms`)
      console.log(`       -> 媒体格式: ${(rRes.result.format || (playUrl.includes('.m3u8') ? 'hls' : 'mp4')).toUpperCase()} | 节点: ${cdnHost} | HTTP ${cdnRes.status}`)

      pipelineReports.push({
        target: target.title,
        source: s.name,
        searchMs: sRes.duration,
        chaptersMs: cRes.duration,
        resolveMs: rRes.duration,
        cdnMs: cdnRes.duration,
        totalMs: playPipelineMs,
        format: rRes.result.format || (playUrl.includes('.m3u8') ? 'hls' : 'mp4'),
        cdnHost,
        status: `HTTP ${cdnRes.status}`,
      })
    }
  }

  // =========================================================================
  // 打印统计报表
  // =========================================================================
  console.log('\n' + '='.repeat(80))
  console.log('📊 评测总结报表 (Markdown Format)')
  console.log('='.repeat(80))

  console.log('\n### 1. 经典老番资源覆盖度与平均搜索延迟')
  console.log('| 视频源 | 8部经典老番命中部数 | 覆盖率 | 累计条目数 | 平均搜索耗时 |')
  console.log('| :--- | :---: | :---: | :---: | :---: |')
  for (const s of SOURCES) {
    const st = sourceStats[s.key]
    const avg = Math.round(st.searchDurations.reduce((a, b) => a + b, 0) / st.searchDurations.length)
    const rate = Math.round((st.totalHits / OLD_ANIMES.length) * 100)
    console.log(`| ${s.name} | ${st.totalHits} / ${OLD_ANIMES.length} | ${rate}% | ${st.totalItems} 条 | ${avg} ms |`)
  }

  console.log('\n### 2. 经典老番单项检索命中详情矩阵')
  console.log(`| 番剧名称 | ${SOURCES.map(s => s.name).join(' | ')} |`)
  console.log(`| :--- | ${SOURCES.map(() => ':---:').join(' | ')} |`)
  for (const anime of OLD_ANIMES) {
    const row = SOURCES.map(s => {
      const d = coverageMatrix[anime][s.key]
      return d.count > 0 ? `✅ ${d.count}条 (${d.duration}ms)` : `❌ 无 (${d.duration}ms)`
    })
    console.log(`| 《${anime}》 | ${row.join(' | ')} |`)
  }

  console.log('\n### 3. 端到端起播性能矩阵 (选集 -> 解析 -> CDN 首分片)')
  console.log('| 测试番剧 | 视频源 | 选集耗时 | 直链解析 | CDN TTFB | 起播总时延 | 视频流类型 | CDN 节点 | 状态 |')
  console.log('| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :---: |')
  for (const r of pipelineReports) {
    console.log(`| ${r.target} | ${r.source} | ${r.chaptersMs !== null ? `${r.chaptersMs}ms` : '-'} | ${r.resolveMs !== null ? `${r.resolveMs}ms` : '-'} | ${r.cdnMs !== null ? `${r.cdnMs}ms` : '-'} | **${r.totalMs}ms** | ${r.format.toUpperCase()} | \`${r.cdnHost}\` | ${r.status} |`)
  }

  console.log('\n' + '='.repeat(80) + '\n')
}

main().catch(console.error)
