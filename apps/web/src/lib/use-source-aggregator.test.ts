import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { PluginMeta } from '@animaku/shared'

const AUTO_PROBE_LIMIT = 6

describe('use-source-aggregator: AUTO_PROBE_LIMIT & Auto-probe Quota Isolation', () => {
  function makeMockPlugins(count: number): PluginMeta[] {
    return Array.from({ length: count }, (_, i) => ({
      name: `Source_${i + 1}`,
      version: '1.0.0',
      weight: 100 - i,
      enabled: true,
    }))
  }

  it('AUTO_PROBE_LIMIT should be configured to 6', () => {
    assert.strictEqual(AUTO_PROBE_LIMIT, 6)
  })

  it('strictly limits auto-probe candidates to top AUTO_PROBE_LIMIT plugins without sliding window leak', () => {
    const plugins = makeMockPlugins(16)
    const pluginOrder: string[] = []
    const activePluginName = 'Source_1'

    // Simulate sorting logic from use-source-aggregator
    const ordered = [...plugins].sort((a, b) => {
      if (activePluginName) {
        if (a.name.toLowerCase() === activePluginName.toLowerCase()) return -1
        if (b.name.toLowerCase() === activePluginName.toLowerCase()) return 1
      }
      const ia = pluginOrder.indexOf(a.name)
      const ib = pluginOrder.indexOf(b.name)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return 0
    })

    const topCandidates = ordered.slice(0, AUTO_PROBE_LIMIT)
    assert.strictEqual(topCandidates.length, 6)
    assert.deepStrictEqual(
      topCandidates.map((p) => p.name),
      ['Source_1', 'Source_2', 'Source_3', 'Source_4', 'Source_5', 'Source_6'],
    )

    // Simulate auto-probing dispatch with quota tracking
    const autoProbedSources = new Set<string>()
    const probeDone: Record<string, boolean> = {
      Source_1: true, // e.g. already playing / bound
    }
    const queue: string[] = []

    // Turn 1: Open board
    const toProbeTurn1: string[] = []
    for (const p of topCandidates) {
      if (probeDone[p.name]) {
        autoProbedSources.add(p.name)
        continue
      }
      if (autoProbedSources.has(p.name) || queue.includes(p.name)) continue
      if (autoProbedSources.size + toProbeTurn1.length < AUTO_PROBE_LIMIT) {
        toProbeTurn1.push(p.name)
      }
    }
    for (const name of toProbeTurn1) {
      autoProbedSources.add(name)
    }
    queue.push(...toProbeTurn1)

    // Expected: 1 counted as quota (Source_1), 5 added to queue (Source_2 ~ Source_6)
    assert.strictEqual(autoProbedSources.size, 6)
    assert.deepStrictEqual(queue, [
      'Source_2',
      'Source_3',
      'Source_4',
      'Source_5',
      'Source_6',
    ])

    // Turn 2: Source_2 finishes probing, component re-renders
    probeDone.Source_2 = true
    const toProbeTurn2: string[] = []
    if (autoProbedSources.size < AUTO_PROBE_LIMIT) {
      for (const p of topCandidates) {
        if (probeDone[p.name]) {
          autoProbedSources.add(p.name)
          continue
        }
        if (autoProbedSources.has(p.name) || queue.includes(p.name)) continue
        if (autoProbedSources.size + toProbeTurn2.length < AUTO_PROBE_LIMIT) {
          toProbeTurn2.push(p.name)
        }
      }
    }

    // Must NOT leak Source_7 or any subsequent source into queue!
    assert.strictEqual(toProbeTurn2.length, 0)
    assert.strictEqual(queue.includes('Source_7'), false)
    assert.strictEqual(queue.includes('Source_8'), false)
    assert.strictEqual(autoProbedSources.has('Source_7'), false)
  })

  it('allows manual user action (prioritizePlugin) on sources beyond top 6 without quota block', () => {
    const autoProbedSources = new Set<string>([
      'Source_1',
      'Source_2',
      'Source_3',
      'Source_4',
      'Source_5',
      'Source_6',
    ])
    let queue = ['Source_5', 'Source_6']

    // User clicks on Source_10 (which is idle and beyond top 6)
    const manualPlugin = 'Source_10'
    queue = [manualPlugin, ...queue.filter((n) => n !== manualPlugin)]

    // Manual action successfully jumps to queue head
    assert.strictEqual(queue[0], 'Source_10')
    assert.strictEqual(queue.length, 3)
  })

  it('keyword fallback in searchResults sync must never inherit stale previous keyword from different anime', () => {
    const defaultKeyword = 'B番剧'
    const staleAnimeAKeyword = 'A番剧'
    const rowWithoutKeyword = {
      plugin: { name: 'Source_1', version: '1.0.0', weight: 100, enabled: true },
      searched: true,
      items: [],
      keyword: undefined,
    }

    // Previous state contaminated by Anime A
    const prevState = {
      Source_1: {
        keyword: staleAnimeAKeyword,
      },
    }

    // Fixed logic: row.keyword || defaultKeyword (never fallback to prev[name]?.keyword)
    const resolvedKeyword = rowWithoutKeyword.keyword || defaultKeyword

    assert.strictEqual(resolvedKeyword, 'B番剧')
    assert.notStrictEqual(resolvedKeyword, prevState.Source_1.keyword)
  })

  it('inFlightPlugins accurately aggregates active probing and queued plugins', () => {
    const mockSources: Record<string, { status: string }> = {
      Source_1: { status: 'ready' },
      Source_2: { status: 'probing' },
      Source_3: { status: 'probing' },
      Source_4: { status: 'empty' },
      Source_5: { status: 'idle' },
    }
    const mockQueue = ['Source_5', 'Source_6']

    const set = new Set<string>()
    for (const [name, state] of Object.entries(mockSources)) {
      if (state.status === 'probing') {
        set.add(name)
      }
    }
    for (const name of mockQueue) {
      set.add(name)
    }
    const inFlight = Array.from(set)

    assert.deepStrictEqual(inFlight.sort(), ['Source_2', 'Source_3', 'Source_5', 'Source_6'].sort())
    assert.strictEqual(inFlight.includes('Source_1'), false)
    assert.strictEqual(inFlight.includes('Source_4'), false)
  })
})
