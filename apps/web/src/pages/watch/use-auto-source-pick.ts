import { useEffect, useRef, useState, useCallback } from 'react'
import type { PluginMeta, SearchItem } from '@animaku/shared'
import type { AggregatedSourceState } from '../../lib/use-source-aggregator'

export interface AutoSourcePickDecision {
  action: 'none' | 'immediate' | 'wait_grace'
  candidate?: AggregatedSourceState
  higherPriorityInFlight?: string[]
}

/** 计算插件在用户优先级列表中的排名（越小优先级越高） */
export function getPluginRank(pluginName: string, pluginOrder: string[]): number {
  const idx = pluginOrder.findIndex(
    (n) => n.toLowerCase() === pluginName.toLowerCase(),
  )
  return idx >= 0 ? idx : pluginOrder.length + 999
}

/**
 * 纯函数裁决逻辑（可独立单测）：
 * 在当前 ready 的候选源中找出最优解，并结合当前正在 probing/排队中的源做出裁决：
 * 1. 无 ready 候选 -> 'none'
 * 2. 有 ready 候选，且无更高优先级的源在排队/探测中 -> 'immediate' (0ms 秒提)
 * 3. 有 ready 候选，但有更高优先级的源在排队/探测中 -> 'wait_grace' (需进入自适应宽限窗口)
 */
export function resolveAutoSourceDecision(
  sources: Record<string, AggregatedSourceState>,
  inFlightPlugins: string[],
  pluginOrder: string[],
): AutoSourcePickDecision {
  const readyCandidates = Object.values(sources).filter(
    (s) => s.status === 'ready' && s.matchedItem && s.plugin,
  )

  if (readyCandidates.length === 0) {
    return { action: 'none' }
  }

  // 按用户配置优先级从高到低排序，排名第 1 的为当前就绪最优源
  readyCandidates.sort((a, b) => {
    const rankA = getPluginRank(a.plugin.name, pluginOrder)
    const rankB = getPluginRank(b.plugin.name, pluginOrder)
    if (rankA !== rankB) return rankA - rankB
    return (b.plugin.weight || 0) - (a.plugin.weight || 0)
  })

  const bestCandidate = readyCandidates[0]
  const bestRank = getPluginRank(bestCandidate.plugin.name, pluginOrder)

  // 检查在 flight 中是否有优先级高于 bestCandidate 的源
  const higherPriorityInFlight = inFlightPlugins.filter((name) => {
    if (name.toLowerCase() === bestCandidate.plugin.name.toLowerCase()) return false
    return getPluginRank(name, pluginOrder) < bestRank
  })

  if (higherPriorityInFlight.length === 0) {
    return {
      action: 'immediate',
      candidate: bestCandidate,
    }
  }

  return {
    action: 'wait_grace',
    candidate: bestCandidate,
    higherPriorityInFlight,
  }
}

export interface UseAutoSourcePickOptions {
  bangumiId: number
  enabled: boolean
  sources: Record<string, AggregatedSourceState>
  pluginOrder: string[]
  inFlightPlugins: string[]
  allFallbacksExhausted?: boolean
  onSwitchSource: (
    plugin: PluginMeta,
    targetItem?: SearchItem,
    opts?: { autoFallback?: boolean },
  ) => void
  onAllFallbacksFailed?: () => void
  gracePeriodMs?: number
}

export function useAutoSourcePick({
  bangumiId,
  enabled,
  sources,
  pluginOrder,
  inFlightPlugins,
  allFallbacksExhausted = false,
  onSwitchSource,
  onAllFallbacksFailed,
  gracePeriodMs = 1200,
}: UseAutoSourcePickOptions) {
  const userLockedRef = useRef(false)
  const autoPickedRef = useRef(false)
  const allFallbacksTriggeredRef = useRef(false)
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevBangumiIdRef = useRef(bangumiId)
  const [pendingCandidateName, setPendingCandidateName] = useState<string | null>(null)

  // 番剧切换时重置所有锁与定时器
  if (prevBangumiIdRef.current !== bangumiId) {
    prevBangumiIdRef.current = bangumiId
    userLockedRef.current = false
    autoPickedRef.current = false
    allFallbacksTriggeredRef.current = false
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current)
      graceTimerRef.current = null
    }
    setPendingCandidateName(null)
  }

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current)
      graceTimerRef.current = null
    }
  }, [])

  // 用户操作互斥锁：用户手动点击任意源或操作关键词时，立即永久废除当次自动切源
  const onUserAction = useCallback(() => {
    userLockedRef.current = true
    clearGraceTimer()
    setPendingCandidateName(null)
  }, [clearGraceTimer])

  useEffect(() => {
    return () => {
      clearGraceTimer()
    }
  }, [clearGraceTimer])

  useEffect(() => {
    // 未开启（非默认源失败场景）或用户已手动操作或已自动选过源，不执行
    if (!enabled || userLockedRef.current || autoPickedRef.current) {
      clearGraceTimer()
      setPendingCandidateName(null)
      return
    }

    const decision = resolveAutoSourceDecision(sources, inFlightPlugins, pluginOrder)

    if (decision.action === 'none') {
      clearGraceTimer()
      setPendingCandidateName(null)
      // 如果所有保底源均已探测完毕（全灭，无就绪可用源），且尚未触发过，且用户未加锁未选源，仅单次触发保底失败回调（展开面板）
      if (
        allFallbacksExhausted &&
        !autoPickedRef.current &&
        !userLockedRef.current &&
        !allFallbacksTriggeredRef.current
      ) {
        allFallbacksTriggeredRef.current = true
        onAllFallbacksFailed?.()
      }
      return
    }

    const candidate = decision.candidate!

    // Case 1: 0ms 秒提（无更高优先级源在探测）
    if (decision.action === 'immediate') {
      clearGraceTimer()
      setPendingCandidateName(null)
      autoPickedRef.current = true
      onSwitchSource(candidate.plugin, candidate.matchedItem, { autoFallback: true })
      return
    }

    // Case 2: 存在更高优先级源在探测，进入自适应宽限
    // 如果当前 candidate 与正在等待的 candidate 不一致，重置计时器为新的最优候选
    setPendingCandidateName(candidate.plugin.name)

    if (!graceTimerRef.current) {
      graceTimerRef.current = setTimeout(() => {
        if (userLockedRef.current || autoPickedRef.current) return
        autoPickedRef.current = true
        clearGraceTimer()
        setPendingCandidateName(null)
        onSwitchSource(candidate.plugin, candidate.matchedItem, { autoFallback: true })
      }, gracePeriodMs)
    }
  }, [
    enabled,
    sources,
    inFlightPlugins,
    pluginOrder,
    allFallbacksExhausted,
    onAllFallbacksFailed,
    gracePeriodMs,
    onSwitchSource,
    clearGraceTimer,
  ])

  return {
    onUserAction,
    pendingCandidateName,
  }
}
