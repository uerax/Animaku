import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickPlaybackSrc,
  inferPlaybackTransit,
} from './playback-src.ts'

test('pickPlaybackSrc: ticket stream appends adFilter=1 on /stream when forceAdFilter=true', () => {
  const res = pickPlaybackSrc({
    proxyUrl: '/api/media/stream?t=ticket123',
    forceAdFilter: true,
  })

  assert.equal(res.mode, 'proxy')
  assert.equal(res.src.includes('t=ticket123'), true)
  assert.equal(res.src.includes('adFilter=1'), true)
  assert.equal(res.src.includes('token='), false)
  assert.equal(res.transit, 'playlist-proxy')
})

test('pickPlaybackSrc: ticket stream appends stream=1 when forceProxy=true and sets full-proxy transit', () => {
  const res = pickPlaybackSrc({
    proxyUrl: '/api/media/stream?t=ticket123',
    forceProxy: true,
  })

  assert.equal(res.mode, 'proxy')
  assert.equal(res.src.includes('stream=1'), true)
  assert.equal(res.transit, 'full-proxy')
})

test('pickPlaybackSrc: ticket stream on /segment with forceProxy appends stream=1', () => {
  const res = pickPlaybackSrc({
    proxyUrl: '/api/media/segment?t=ticket_mp4',
    forceProxy: true,
  })

  assert.equal(res.mode, 'proxy')
  assert.equal(res.src.includes('stream=1'), true)
  assert.equal(res.transit, 'full-proxy')
})

test('pickPlaybackSrc: ticket stream ignores proxyToken completely', () => {
  const res = pickPlaybackSrc({
    proxyUrl: '/api/media/stream?t=ticket123',
    proxyToken: 'secret-admin-token',
  })

  assert.equal(res.src.includes('token='), false)
  assert.equal(res.src, '/api/media/stream?t=ticket123')
})

test('pickPlaybackSrc: direct CDN preferred when clean', () => {
  const res = pickPlaybackSrc({
    playUrl: 'https://cdn.example.com/ep1.mp4',
    proxyUrl: '/api/media/stream?t=ticket123',
  })

  assert.equal(res.mode, 'direct')
  assert.equal(res.src, 'https://cdn.example.com/ep1.mp4')
  assert.equal(res.transit, 'direct')
})
