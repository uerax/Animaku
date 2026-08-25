import assert from 'node:assert/strict'
import {
  CONTINUE_PLAY_MIN_THRESHOLD_SEC,
  STATS_VALID_PLAY_THRESHOLD_SEC,
} from '../packages/shared/src'

console.log('--- 1. 测试业务常量隔离 ---')
assert.equal(CONTINUE_PLAY_MIN_THRESHOLD_SEC, 15, 'CONTINUE_PLAY_MIN_THRESHOLD_SEC 应为 15')
assert.equal(STATS_VALID_PLAY_THRESHOLD_SEC, 15, 'STATS_VALID_PLAY_THRESHOLD_SEC 应为 15')
console.log('✓ 业务常量隔离测试通过')

console.log('--- 2. 模拟权威时长决断算法 (Authoritative Duration Resolution) ---')
interface MockHlsDetails {
  live: boolean
  totalduration: number
}
interface MockHlsLevel {
  details?: MockHlsDetails
}
interface MockHls {
  currentLevel: number
  levels: MockHlsLevel[]
}

function mockResolveAuthoritativeDuration(opts: {
  isHls: boolean
  hls?: MockHls | null
  videoReadyState: number
  videoDuration?: number
}): number | null {
  const { isHls, hls, videoReadyState, videoDuration } = opts

  if (isHls) {
    if (!hls) {
      const d = videoDuration ?? 0
      return Number.isFinite(d) && d > 0 ? d : null
    }
    const lvl = hls.levels[hls.currentLevel]
    const details = lvl?.details
    if (
      details &&
      !details.live &&
      Number.isFinite(details.totalduration) &&
      details.totalduration > 0
    ) {
      return details.totalduration
    }
    return null
  }

  // Progressive MP4
  if (videoReadyState >= 1 /* HAVE_METADATA */) {
    const d = videoDuration ?? 0
    return Number.isFinite(d) && d > 0 ? d : null
  }

  return null
}

// Case 2.1: MP4 处于握手期 (HAVE_NOTHING) -> 返回 null 等待
assert.equal(
  mockResolveAuthoritativeDuration({
    isHls: false,
    videoReadyState: 0,
    videoDuration: NaN,
  }),
  null,
  'MP4 未解析出元数据时应返回 null 挂起',
)

// Case 2.2: MP4 无 faststart 优化，初始 duration 为 Infinity -> 返回 null 挂起等待 durationchange
assert.equal(
  mockResolveAuthoritativeDuration({
    isHls: false,
    videoReadyState: 1,
    videoDuration: Infinity,
  }),
  null,
  'MP4 未优化流 duration=Infinity 时应返回 null 等待 durationchange 修正',
)

// Case 2.3: MP4 正常就绪 (HAVE_METADATA 且 duration=1440) -> 权威确定 1440
assert.equal(
  mockResolveAuthoritativeDuration({
    isHls: false,
    videoReadyState: 1,
    videoDuration: 1440,
  }),
  1440,
  'MP4 元数据就绪时应返回权威时长',
)

// Case 2.4: HLS 分片探测期 (levelDetails 为空) -> 返回 null 挂起等待 LEVEL_LOADED
assert.equal(
  mockResolveAuthoritativeDuration({
    isHls: true,
    hls: { currentLevel: 0, levels: [{}] },
    videoReadyState: 1,
    videoDuration: 6,
  }),
  null,
  'HLS 探测期 details 未就绪时应返回 null 挂起',
)

// Case 2.5: HLS VOD 解析完成 (totalduration=1440) -> 权威确定 1440
assert.equal(
  mockResolveAuthoritativeDuration({
    isHls: true,
    hls: {
      currentLevel: 0,
      levels: [{ details: { live: false, totalduration: 1440 } }],
    },
    videoReadyState: 1,
    videoDuration: 6,
  }),
  1440,
  'HLS VOD 解析完成时应返回权威切片总时长',
)
console.log('✓ 权威时长决断测试通过')

console.log('--- 3. 模拟续播目标安全裁剪与防越界 (Safe Target Clipping) ---')
function calculateSafeTarget(targetTime: number, authDuration: number): number {
  return Math.max(0, Math.min(targetTime, Math.max(0, authDuration - 0.5)))
}

// Case 3.1: 正常续播 (target=300s, total=1440s) -> 300s
assert.equal(calculateSafeTarget(300, 1440), 300, '正常续播位置应保持不变')

// Case 3.2: 换了删减版 / 目标时间超出真实总时长 (target=2000s, total=1440s) -> 裁剪至 1439.5s
assert.equal(
  calculateSafeTarget(2000, 1440),
  1439.5,
  '超出视频总时长时应严格裁剪至 duration - 0.5s，防止触发 ended',
)

// Case 3.3: 极短切片 (total=0.3s) -> 安全下限 0s
assert.equal(calculateSafeTarget(10, 0.3), 0, '超短视频应安全回退至 0s')
console.log('✓ 续播安全裁剪测试通过')

console.log('--- 4. 模拟 Stale Instance Guard 失效守卫 ---')
function checkResumeAllowed(opts: {
  targetTime: number
  continuePlay: boolean
  resumed: boolean
  authRetry: boolean
  loadFailed: boolean
  mediaError: string
  authDuration: number | null
}): boolean {
  if (
    !opts.continuePlay ||
    opts.resumed ||
    opts.targetTime <= CONTINUE_PLAY_MIN_THRESHOLD_SEC
  ) {
    return false
  }
  if (opts.authRetry || opts.loadFailed || opts.mediaError !== '') {
    return false
  }
  if (opts.authDuration === null) {
    return false
  }
  return true
}

// 正常情况：允许续播
assert.equal(
  checkResumeAllowed({
    targetTime: 120,
    continuePlay: true,
    resumed: false,
    authRetry: false,
    loadFailed: false,
    mediaError: '',
    authDuration: 1440,
  }),
  true,
)

// 场景：换源重试中 (authRetry=true) -> 坚决拦截
assert.equal(
  checkResumeAllowed({
    targetTime: 120,
    continuePlay: true,
    resumed: false,
    authRetry: true,
    loadFailed: false,
    mediaError: '',
    authDuration: 1440,
  }),
  false,
  '换源重试中旧实例应处于冻结态，禁止响应 Seek',
)

// 场景：媒体报错中 (mediaError 非空) -> 拦截
assert.equal(
  checkResumeAllowed({
    targetTime: 120,
    continuePlay: true,
    resumed: false,
    authRetry: false,
    loadFailed: false,
    mediaError: 'video_error',
    authDuration: 1440,
  }),
  false,
  '媒体报错态禁止响应 Seek',
)
console.log('✓ Stale Instance Guard 守卫测试通过')

console.log('\n🎉 所有续播与播放器安全状态机单测全部通过！')
