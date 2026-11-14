import test from 'node:test'
import assert from 'node:assert/strict'
import { useCooldownCallback, useKeyedCooldownCallback } from './use-cooldown'

test('useCooldownCallback: exported as function', () => {
  assert.equal(typeof useCooldownCallback, 'function')
})

test('useKeyedCooldownCallback: exported as function', () => {
  assert.equal(typeof useKeyedCooldownCallback, 'function')
})
