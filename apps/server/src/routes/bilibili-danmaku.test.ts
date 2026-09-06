import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { bilibiliDanmakuRoutes } from './bilibili-danmaku'

test('bilibiliDanmakuRoutes: strictly rejects empty or invalid inputs with 400', async () => {
  const app = new Hono()
  app.route('/api/danmaku', bilibiliDanmakuRoutes)

  const res = await app.request('/api/danmaku/bilibili')
  assert.equal(res.status, 400)
  const json = (await res.json()) as { error: string; message: string }
  assert.equal(json.error, 'bad_request')
  assert.match(json.message, /请提供有效的 B 站链接/)
})

test('bilibiliDanmakuRoutes: parses BV input format correctly', async () => {
  const app = new Hono()
  app.route('/api/danmaku', bilibiliDanmakuRoutes)

  // Non-existent dummy BV returns upstream 502 with error details
  const res = await app.request('/api/danmaku/bilibili?input=BV9999999999&p=1')
  assert.equal(res.status, 502)
  const json = (await res.json()) as { error: string }
  assert.equal(json.error, 'upstream')
})
