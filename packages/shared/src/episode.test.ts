import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEpisodeNumber, findMatchingEpisodeIndex } from './episode.ts'

test('parseEpisodeNumber: basic patterns', () => {
  assert.equal(parseEpisodeNumber('第01话').epNum, 1)
  assert.equal(parseEpisodeNumber('第12集 1080P').epNum, 12)
  assert.equal(parseEpisodeNumber('EP03').epNum, 3)
  assert.equal(parseEpisodeNumber('[05]').epNum, 5)
  assert.equal(parseEpisodeNumber('刽子手').epNum, null, 'pure text title has no parseable number')
})

test('parseEpisodeNumber: SP detection', () => {
  assert.equal(parseEpisodeNumber('SP01').isSP, true)
  assert.equal(parseEpisodeNumber('剧场版').isSP, true)
  assert.equal(parseEpisodeNumber('第01话').isSP, false)
})

// --- Regression test for findMatchingEpisodeIndex fallback=0/no-match collision ---

test('findMatchingEpisodeIndex: returns -1 (not 0) when nothing matches and no valid fallbackIndex given', () => {
  const candidates = ['刽子手', '迷途猫', '宵里山', '十字伤'] // pure text, no numbers at all
  const result = findMatchingEpisodeIndex('第10话 xxx', candidates, -1)
  assert.equal(
    result,
    -1,
    'Must signal "no match" as -1, not 0 — callers checking `result >= 0` would ' +
      'otherwise silently treat index 0 as a real match and reset the user to episode 1',
  )
})

test('findMatchingEpisodeIndex: still honors an explicit in-bounds fallbackIndex', () => {
  const candidates = ['刽子手', '迷途猫', '宵里山', '十字伤']
  const result = findMatchingEpisodeIndex('第10话 xxx', candidates, 2)
  assert.equal(result, 2, 'explicit fallbackIndex should still be honored when provided')
})

test('findMatchingEpisodeIndex: exact episode number match takes priority', () => {
  const candidates = ['第01话', '第02话', '第03话']
  const result = findMatchingEpisodeIndex('第02话 冬の日', candidates, -1)
  assert.equal(result, 1)
})
