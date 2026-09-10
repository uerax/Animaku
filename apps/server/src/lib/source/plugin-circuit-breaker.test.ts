import test from 'node:test'
import assert from 'node:assert/strict'
import { pluginCircuitBreaker, BREAKER_CONFIG } from './plugin-circuit-breaker'

test('plugin-circuit-breaker: initially allows search', () => {
  pluginCircuitBreaker.reset()
  const check = pluginCircuitBreaker.checkBeforeSearch('cycani')
  assert.equal(check.allowed, true)
})

test('plugin-circuit-breaker: soft timeout requires 2 consecutive failures within 30s to trip', () => {
  pluginCircuitBreaker.reset()

  // First timeout: should not trip immediately
  pluginCircuitBreaker.recordFailure('cycani', new Error('fetch timed out after 5000ms'))
  let check = pluginCircuitBreaker.checkBeforeSearch('cycani')
  assert.equal(check.allowed, true)
  assert.equal(pluginCircuitBreaker.getState('cycani')?.failureCount, 1)

  // Second timeout within 30s: should trip!
  pluginCircuitBreaker.recordFailure('cycani', new Error('源站超时 (504)'))
  check = pluginCircuitBreaker.checkBeforeSearch('cycani')
  assert.equal(check.allowed, false)
  assert.match(check.reason || '', /熔断冷却中/)
})

test('plugin-circuit-breaker: hard network failure trips immediately in 1 failure', () => {
  pluginCircuitBreaker.reset()

  // Hard error (e.g. ECONNREFUSED)
  pluginCircuitBreaker.recordFailure('lzizy', new Error('connect ECONNREFUSED 127.0.0.1:80'))
  const check = pluginCircuitBreaker.checkBeforeSearch('lzizy')
  assert.equal(check.allowed, false)
  assert.match(check.reason || '', /熔断冷却中/)
})

test('plugin-circuit-breaker: single-flight half-open prevents concurrent stampede', () => {
  pluginCircuitBreaker.reset()

  // Trip the breaker for 'tvtfun'
  pluginCircuitBreaker.recordFailure('tvtfun', new Error('ENOTFOUND api.tvtfun.com'))
  assert.equal(pluginCircuitBreaker.checkBeforeSearch('tvtfun').allowed, false)

  // Manually fast-forward trippedUntil to simulate cooldown expiration (Half-Open window)
  const state = pluginCircuitBreaker.getState('tvtfun')!
  state.trippedUntil = Date.now() - 100

  // 1. First probe request arrives -> Should be ALLOWED and acquire halfOpenProbing lock
  const probe1 = pluginCircuitBreaker.checkBeforeSearch('tvtfun')
  assert.equal(probe1.allowed, true)
  assert.equal(pluginCircuitBreaker.getState('tvtfun')?.halfOpenProbing, true)

  // 2. Concurrent requests arriving while probe1 is in-flight -> MUST BE BLOCKED!
  const concurrentProbe2 = pluginCircuitBreaker.checkBeforeSearch('tvtfun')
  assert.equal(concurrentProbe2.allowed, false)
  assert.match(concurrentProbe2.reason || '', /半开探活测试中/)

  const concurrentProbe3 = pluginCircuitBreaker.checkBeforeSearch('tvtfun')
  assert.equal(concurrentProbe3.allowed, false)
  assert.match(concurrentProbe3.reason || '', /半开探活测试中/)

  // 3a. Scenario A: If probe1 succeeds -> breaker is completely reset
  pluginCircuitBreaker.recordSuccess('tvtfun')
  assert.equal(pluginCircuitBreaker.getState('tvtfun'), undefined)
  assert.equal(pluginCircuitBreaker.checkBeforeSearch('tvtfun').allowed, true)
})

test('plugin-circuit-breaker: half-open probe failure re-trips cooldown for 90s', () => {
  pluginCircuitBreaker.reset()

  pluginCircuitBreaker.recordFailure('tvtfun', new Error('ECONNREFUSED'))
  const state = pluginCircuitBreaker.getState('tvtfun')!
  state.trippedUntil = Date.now() - 100

  // Acquire half-open lock
  assert.equal(pluginCircuitBreaker.checkBeforeSearch('tvtfun').allowed, true)
  assert.equal(pluginCircuitBreaker.getState('tvtfun')?.halfOpenProbing, true)

  // Probe fails
  pluginCircuitBreaker.recordFailure('tvtfun', new Error('timeout during half-open probe'))
  const updatedState = pluginCircuitBreaker.getState('tvtfun')!
  assert.equal(updatedState.halfOpenProbing, false)
  assert.ok(updatedState.trippedUntil > Date.now() + 80_000)

  // Subsequent check should be blocked by the new cooldown
  const check = pluginCircuitBreaker.checkBeforeSearch('tvtfun')
  assert.equal(check.allowed, false)
  assert.match(check.reason || '', /熔断冷却中/)
})

test('plugin-circuit-breaker: unrelated 400 errors do not trip breaker', () => {
  pluginCircuitBreaker.reset()

  pluginCircuitBreaker.recordFailure('cycani', new Error('缺少 rule'))
  pluginCircuitBreaker.recordFailure('cycani', new Error('参数错误 400'))
  const check = pluginCircuitBreaker.checkBeforeSearch('cycani')
  assert.equal(check.allowed, true)
})
