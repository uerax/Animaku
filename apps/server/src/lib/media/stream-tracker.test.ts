import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acquireStream,
  releaseStream,
  getActiveStreamsForIp,
  resetActiveStreams,
  createTrackedStream,
  MAX_CONCURRENT_MEDIA_PER_IP,
} from './stream-tracker'

test('stream-tracker: acquires and releases stream per IP within concurrency limit', () => {
  resetActiveStreams()
  const ip = '1.2.3.4'

  for (let i = 1; i <= MAX_CONCURRENT_MEDIA_PER_IP; i++) {
    assert.equal(acquireStream(ip), true)
    assert.equal(getActiveStreamsForIp(ip), i)
  }

  // Next attempt exceeds limit
  assert.equal(acquireStream(ip), false)
  assert.equal(getActiveStreamsForIp(ip), MAX_CONCURRENT_MEDIA_PER_IP)

  // Release one stream
  releaseStream(ip)
  assert.equal(getActiveStreamsForIp(ip), MAX_CONCURRENT_MEDIA_PER_IP - 1)

  // Now can acquire one more
  assert.equal(acquireStream(ip), true)
  assert.equal(getActiveStreamsForIp(ip), MAX_CONCURRENT_MEDIA_PER_IP)

  // Clean up
  resetActiveStreams()
  assert.equal(getActiveStreamsForIp(ip), 0)
})

test('stream-tracker: createTrackedStream releases stream on normal read completion', async () => {
  let doneCalled = false
  const underlying = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    },
  })

  const tracked = createTrackedStream(underlying, () => {
    doneCalled = true
  })

  const reader = tracked.getReader()
  const r1 = await reader.read()
  assert.equal(r1.done, false)
  assert.deepEqual(r1.value, new Uint8Array([1, 2, 3]))

  const r2 = await reader.read()
  assert.equal(r2.done, true)
  assert.equal(doneCalled, true)
})

test('stream-tracker: createTrackedStream releases stream on cancel', async () => {
  let doneCalled = false
  const underlying = new ReadableStream<Uint8Array>({
    start(_controller) {},
  })

  const tracked = createTrackedStream(underlying, () => {
    doneCalled = true
  })

  const reader = tracked.getReader()
  await reader.cancel('client disconnect')
  assert.equal(doneCalled, true)
})
