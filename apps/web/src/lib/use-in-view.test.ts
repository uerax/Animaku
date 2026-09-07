import test from 'node:test'
import assert from 'node:assert/strict'
import { useInView } from './use-in-view'

test('useInView: exported as function and callable', () => {
  assert.equal(typeof useInView, 'function')
})
