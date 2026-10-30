import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { CollectType } from '@animaku/shared'
import { parseBangumiCommentRow, bangumiRoutes } from './bangumi'

test('parseBangumiCommentRow: parses complete row with valid fields', () => {
  const row = {
    id: 52975924,
    user: {
      id: 1247839,
      username: 'megumin',
      nickname: '惠惠',
      avatar: {
        large: 'https://lain.bgm.tv/pic/user/l/001/24/78/1247839.jpg',
      },
      group: 10,
      sign: 'Explosion!',
    },
    type: 2,
    rate: 9,
    comment: '神作不解释',
    updatedAt: 1788108863,
  }

  const result = parseBangumiCommentRow(row, 0)

  assert.equal(result.id, 52975924)
  assert.equal(result.source, 'bangumi')
  assert.equal(result.author.id, 1247839)
  assert.equal(result.author.username, 'megumin')
  assert.equal(result.author.nickname, '惠惠')
  assert.equal(result.author.avatar, 'https://lain.bgm.tv/pic/user/l/001/24/78/1247839.jpg')
  assert.equal(result.author.userGroup, 10)
  assert.equal(result.author.sign, 'Explosion!')
  assert.equal(result.content, '神作不解释')
  assert.equal(result.rate, 9)
  assert.equal(result.collectionType, CollectType.watched)
  assert.equal(result.createdAt, new Date(1788108863 * 1000).toISOString())
})

test('parseBangumiCommentRow: handles missing fields and fallbacks', () => {
  const row = {
    user: {},
    comment: '  带前后空格的短评  ',
  }

  const result = parseBangumiCommentRow(row, 42)

  assert.equal(result.id, 'anon-42')
  assert.equal(result.author.id, 0)
  assert.equal(result.author.nickname, '匿名用户')
  assert.equal(result.author.avatar, '')
  assert.equal(result.content, '带前后空格的短评')
  assert.equal(result.rate, undefined)
  assert.equal(result.collectionType, undefined)
  assert.equal(result.createdAt, '')
})

test('parseBangumiCommentRow: handles rating bounds (1-10 clamped)', () => {
  assert.equal(parseBangumiCommentRow({ rate: 0 }, 1).rate, undefined)
  assert.equal(parseBangumiCommentRow({ rate: -1 }, 1).rate, undefined)
  assert.equal(parseBangumiCommentRow({ rate: 11 }, 1).rate, undefined)
  assert.equal(parseBangumiCommentRow({ rate: 1 }, 1).rate, 1)
  assert.equal(parseBangumiCommentRow({ rate: 10 }, 1).rate, 10)
})

test('parseBangumiCommentRow: handles string and number updatedAt timestamps', () => {
  const numTime = parseBangumiCommentRow({ updatedAt: 1700000000 }, 1)
  assert.equal(numTime.createdAt, new Date(1700000000 * 1000).toISOString())

  const strTime = parseBangumiCommentRow({ updatedAt: '2026-08-31T12:00:00Z' }, 1)
  assert.equal(strTime.createdAt, '2026-08-31T12:00:00Z')
})

test('parseBangumiCommentRow: preserves empty comment string without throwing', () => {
  const result = parseBangumiCommentRow({ rate: 8, comment: '' }, 5)
  assert.equal(result.content, '')
  assert.equal(result.rate, 8)
})

test('GET /subjects/:id/comments: blocks bots, scripts and empty UA with 403', async () => {
  const app = new Hono()
  app.route('/api/bangumi', bangumiRoutes)

  // 1. Googlebot / ByteSpider / WebBot
  const resBot = await app.request('/api/bangumi/subjects/165589/comments', {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    },
  })
  assert.equal(resBot.status, 403)
  const jsonBot = (await resBot.json()) as { error: string }
  assert.equal(jsonBot.error, 'forbidden')

  // 2. Python / cURL / Axios
  const resScript = await app.request('/api/bangumi/subjects/165589/comments', {
    headers: {
      'user-agent': 'python-requests/2.31.0',
    },
  })
  assert.equal(resScript.status, 403)

  // 3. Empty User-Agent
  const resEmptyUa = await app.request('/api/bangumi/subjects/165589/comments', {
    headers: {
      'user-agent': '',
    },
  })
  assert.equal(resEmptyUa.status, 403)
})
