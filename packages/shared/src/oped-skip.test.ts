import test from 'node:test'
import assert from 'node:assert/strict'
import { determineOpedAction, type OpedSkipContext } from './oped-skip.ts'
import { defaultPlayerSettings } from './player.ts'

const basePlayer = {
  ...defaultPlayerSettings,
  preferBangumiOped: true,
  firstEpisodeProtect: true,
  skipOp: { enabled: true, start: 10, duration: 90 }, // [10s, 100s]
  skipEd: { enabled: true, start: 1250, duration: 90 }, // [1250s, 1340s]
}

const baseContext: OpedSkipContext = {
  currentTime: 0,
  prevTime: 0,
  duration: 1400,
  episodeIndex: 0,
  episodeNumber: 1,
  playerSettings: basePlayer,
  promptTriggeredThisEp: false,
  keepWholeEpisode: false,
}

test('OP/ED 首集保护与跳过判定引擎测试', async (t) => {
  await t.test('场景 1: 首集 (index 0) 正常起播跨越 OP 起点 -> 触发 OP 5s 提示', () => {
    const action = determineOpedAction({
      ...baseContext,
      prevTime: 9.8,
      currentTime: 10.1,
    })
    assert.deepEqual(action, {
      action: 'prompt',
      type: 'op',
      targetTime: 100,
    })
  })

  await t.test('场景 2: 首集用户点击跳过 OP 后，继续播放跨越 ED 起点 -> 自动跳过 ED (无漏跳 Bug)', () => {
    const action = determineOpedAction({
      ...baseContext,
      promptTriggeredThisEp: true, // 已在 OP 点击跳过
      keepWholeEpisode: false,
      prevTime: 1249.5,
      currentTime: 1250.2,
    })
    assert.deepEqual(action, {
      action: 'skip',
      type: 'ed',
      targetTime: 1340,
      hint: '已跳过片尾',
    })
  })

  await t.test('场景 3: 首集用户在 OP 提示时选择忽略/超时 -> 整集完整播放 (OP与ED均不跳过)', () => {
    // 到达 OP 起点
    const opAction = determineOpedAction({
      ...baseContext,
      keepWholeEpisode: true, // 用户在 5s 提示超时或点击 ✕
      prevTime: 9.8,
      currentTime: 10.1,
    })
    assert.deepEqual(opAction, { action: 'none' })

    // 到达 ED 起点
    const edAction = determineOpedAction({
      ...baseContext,
      keepWholeEpisode: true,
      prevTime: 1249.5,
      currentTime: 1250.2,
    })
    assert.deepEqual(edAction, { action: 'none' })
  })

  await t.test('场景 4: 首集一开局拖动进度条越过 OP 到达 ED 起点 -> 作为兜底点触发 ED 提示', () => {
    const action = determineOpedAction({
      ...baseContext,
      promptTriggeredThisEp: false, // 越过了 OP，此前从未触发过提示
      prevTime: 1249.0,
      currentTime: 1250.1,
    })
    assert.deepEqual(action, {
      action: 'prompt',
      type: 'ed',
      targetTime: 1340,
    })
  })

  await t.test('场景 5: 后续集数 (index > 0) -> 全自动跳过 OP 和 ED，不弹提示', () => {
    // 第 2 集 (index 1) 到达 OP
    const opAction = determineOpedAction({
      ...baseContext,
      episodeIndex: 1,
      episodeNumber: 2,
      prevTime: 9.8,
      currentTime: 10.1,
    })
    assert.deepEqual(opAction, {
      action: 'skip',
      type: 'op',
      targetTime: 100,
      hint: '已跳过片头',
    })

    // 第 2 集 (index 1) 到达 ED
    const edAction = determineOpedAction({
      ...baseContext,
      episodeIndex: 1,
      episodeNumber: 2,
      prevTime: 1249.5,
      currentTime: 1250.2,
    })
    assert.deepEqual(edAction, {
      action: 'skip',
      type: 'ed',
      targetTime: 1340,
      hint: '已跳过片尾',
    })
  })

  await t.test('场景 6: 全局关闭 OP/ED 跳过 (preferBangumiOped = false) -> 均不跳过也不弹提示', () => {
    const action = determineOpedAction({
      ...baseContext,
      playerSettings: {
        ...basePlayer,
        preferBangumiOped: false,
      },
      prevTime: 9.8,
      currentTime: 10.1,
    })
    assert.deepEqual(action, { action: 'none' })
  })

  await t.test('场景 7: 全局关闭首集保护 (firstEpisodeProtect = false) -> 首集直接全自动跳过', () => {
    const opAction = determineOpedAction({
      ...baseContext,
      playerSettings: {
        ...basePlayer,
        firstEpisodeProtect: false,
      },
      prevTime: 9.8,
      currentTime: 10.1,
    })
    assert.deepEqual(opAction, {
      action: 'skip',
      type: 'op',
      targetTime: 100,
      hint: '已跳过片头',
    })
  })

  await t.test('场景 8: 开头即是 OP (start <= 0.5s) -> 初始播放窗口正确触发', () => {
    const zeroStartPlayer = {
      ...basePlayer,
      skipOp: { enabled: true, start: 0, duration: 90 },
    }
    const action = determineOpedAction({
      ...baseContext,
      playerSettings: zeroStartPlayer,
      prevTime: 0.1,
      currentTime: 0.3,
    })
    assert.deepEqual(action, {
      action: 'prompt',
      type: 'op',
      targetTime: 90,
    })
  })

  await t.test('场景 9: 非自然播放 (倒退拖动 / Seeking / 繁忙中) -> 忽略，绝对不回跳', () => {
    // 倒退
    const seekBack = determineOpedAction({
      ...baseContext,
      prevTime: 15.0,
      currentTime: 10.0,
    })
    assert.deepEqual(seekBack, { action: 'none' })

    // isSeeking 期间
    const seeking = determineOpedAction({
      ...baseContext,
      isSeeking: true,
      prevTime: 9.8,
      currentTime: 10.1,
    })
    assert.deepEqual(seeking, { action: 'none' })

    // isSkipBusy 防抖期间
    const busy = determineOpedAction({
      ...baseContext,
      isSkipBusy: true,
      prevTime: 9.8,
      currentTime: 10.1,
    })
    assert.deepEqual(busy, { action: 'none' })
  })
})
