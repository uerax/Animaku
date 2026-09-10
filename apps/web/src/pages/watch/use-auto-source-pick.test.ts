import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { PluginMeta, SearchItem } from '@animaku/shared'
import {
  getPluginRank,
  resolveAutoSourceDecision,
} from './use-auto-source-pick'
import type { AggregatedSourceState } from '../../lib/use-source-aggregator'

describe('use-auto-source-pick: Adaptive Grace & Priority Inversion Protection', () => {
  const pluginOrder = ['cycani', 'xifan', 'tvtfun', 'lzizy', 'moonci']

  function createMockPlugin(name: string, weight = 100): PluginMeta {
    return {
      name,
      version: '1.0.0',
      weight,
      enabled: true,
    }
  }

  function createMockItem(name: string, src: string): SearchItem {
    return { name, src }
  }

  it('getPluginRank respects configured order and unlisted fallback', () => {
    assert.strictEqual(getPluginRank('cycani', pluginOrder), 0)
    assert.strictEqual(getPluginRank('xifan', pluginOrder), 1)
    assert.strictEqual(getPluginRank('lzizy', pluginOrder), 3)
    assert.strictEqual(getPluginRank('unknown_plugin', pluginOrder), pluginOrder.length + 999)
  })

  it('returns action none when no sources are ready', () => {
    const sources: Record<string, AggregatedSourceState> = {
      cycani: {
        plugin: createMockPlugin('cycani'),
        status: 'empty',
        items: [],
        searched: true,
      },
      xifan: {
        plugin: createMockPlugin('xifan'),
        status: 'probing',
        items: [],
        searched: true,
      },
    }
    const decision = resolveAutoSourceDecision(sources, ['xifan'], pluginOrder)
    assert.strictEqual(decision.action, 'none')
  })

  it('returns action immediate when top-ranked available source is ready and no higher priority is in flight', () => {
    const sources: Record<string, AggregatedSourceState> = {
      cycani: {
        plugin: createMockPlugin('cycani'),
        status: 'empty', // Default source failed
        items: [],
        searched: true,
      },
      xifan: {
        plugin: createMockPlugin('xifan'),
        status: 'ready', // Priority #1 in available list
        items: [createMockItem('番剧 X', '/play/1')],
        matchedItem: createMockItem('番剧 X', '/play/1'),
        searched: true,
      },
      tvtfun: {
        plugin: createMockPlugin('tvtfun'),
        status: 'probing',
        items: [],
        searched: true,
      },
    }
    // 'tvtfun' (rank 2) is in flight, but 'xifan' (rank 1) is already ready!
    // No source higher than 'xifan' is in-flight!
    const decision = resolveAutoSourceDecision(sources, ['tvtfun'], pluginOrder)
    assert.strictEqual(decision.action, 'immediate')
    assert.strictEqual(decision.candidate?.plugin.name, 'xifan')
  })

  it('returns action wait_grace when a lower-priority source finishes fast but higher-priority source is still in flight (Priority Inversion Protection)', () => {
    const sources: Record<string, AggregatedSourceState> = {
      cycani: {
        plugin: createMockPlugin('cycani'),
        status: 'empty',
        items: [],
        searched: true,
      },
      xifan: {
        plugin: createMockPlugin('xifan'), // Rank 1
        status: 'probing',
        items: [],
        searched: true,
      },
      lzizy: {
        plugin: createMockPlugin('lzizy'), // Rank 3 (finished very fast in 200ms)
        status: 'ready',
        items: [createMockItem('番剧 X', '/play/lzizy')],
        matchedItem: createMockItem('番剧 X', '/play/lzizy'),
        searched: true,
      },
    }

    // 'xifan' (rank 1) is still in-flight!
    const decision = resolveAutoSourceDecision(sources, ['xifan'], pluginOrder)
    assert.strictEqual(decision.action, 'wait_grace')
    assert.strictEqual(decision.candidate?.plugin.name, 'lzizy')
    assert.deepStrictEqual(decision.higherPriorityInFlight, ['xifan'])
  })

  it('early-settles to immediate when all higher-priority sources fail (empty/error) and leave flight', () => {
    // Following up previous test: xifan finished with 'empty' and is no longer in inFlightPlugins!
    const sources: Record<string, AggregatedSourceState> = {
      cycani: {
        plugin: createMockPlugin('cycani'),
        status: 'empty',
        items: [],
        searched: true,
      },
      xifan: {
        plugin: createMockPlugin('xifan'),
        status: 'empty',
        items: [],
        searched: true,
      },
      lzizy: {
        plugin: createMockPlugin('lzizy'),
        status: 'ready',
        items: [createMockItem('番剧 X', '/play/lzizy')],
        matchedItem: createMockItem('番剧 X', '/play/lzizy'),
        searched: true,
      },
    }

    // Now inFlightPlugins is empty (or only lower priority sources)
    const decision = resolveAutoSourceDecision(sources, [], pluginOrder)
    assert.strictEqual(decision.action, 'immediate')
    assert.strictEqual(decision.candidate?.plugin.name, 'lzizy')
  })

  it('selects the higher-priority source when it becomes ready during the grace window', () => {
    // Both xifan (rank 1) and lzizy (rank 3) are ready!
    const sources: Record<string, AggregatedSourceState> = {
      xifan: {
        plugin: createMockPlugin('xifan'),
        status: 'ready',
        items: [createMockItem('番剧 X', '/play/xifan')],
        matchedItem: createMockItem('番剧 X', '/play/xifan'),
        searched: true,
      },
      lzizy: {
        plugin: createMockPlugin('lzizy'),
        status: 'ready',
        items: [createMockItem('番剧 X', '/play/lzizy')],
        matchedItem: createMockItem('番剧 X', '/play/lzizy'),
        searched: true,
      },
    }

    const decision = resolveAutoSourceDecision(sources, [], pluginOrder)
    assert.strictEqual(decision.action, 'immediate')
    assert.strictEqual(decision.candidate?.plugin.name, 'xifan')
  })

  it('all-fallbacks-failed scenario allows manual user collapsing without being re-opened in infinite loop', () => {
    // When all sources are empty
    const sources: Record<string, AggregatedSourceState> = {
      cycani: {
        plugin: createMockPlugin('cycani'),
        status: 'empty',
        items: [],
        searched: true,
      },
      xifan: {
        plugin: createMockPlugin('xifan'),
        status: 'empty',
        items: [],
        searched: true,
      },
    }

    const decision = resolveAutoSourceDecision(sources, [], pluginOrder)
    assert.strictEqual(decision.action, 'none')
  })
})
