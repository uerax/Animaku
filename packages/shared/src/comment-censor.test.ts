import test from 'node:test'
import assert from 'node:assert/strict'
import {
  tokenizeCommentText,
  DEFAULT_CENSOR_RULES,
  type CensorRule,
} from './comment-censor.ts'

test('tokenizeCommentText: parses standard HTTP/HTTPS links', () => {
  const text = '详情请查看 https://bgm.tv/subject/100403 和 http://example.com/test?a=1'
  const tokens = tokenizeCommentText(text)

  assert.equal(tokens.length, 4)
  assert.deepEqual(tokens[0], { type: 'text', raw: '详情请查看 ', redacted: false })
  assert.deepEqual(tokens[1], {
    type: 'link',
    raw: 'https://bgm.tv/subject/100403',
    url: 'https://bgm.tv/subject/100403',
    label: '外部链接',
    redacted: true,
  })
  assert.deepEqual(tokens[2], { type: 'text', raw: ' 和 ', redacted: false })
  assert.deepEqual(tokens[3], {
    type: 'link',
    raw: 'http://example.com/test?a=1',
    url: 'http://example.com/test?a=1',
    label: '外部链接',
    redacted: true,
  })
})

test('tokenizeCommentText: parses bare domains and short links without protocol (e.g. tt.vg/jmxz, b23.tv)', () => {
  const text = '网盘资源在 tt.vg/jmxz ，另外 b23.tv/ep86012 也可以看'
  const tokens = tokenizeCommentText(text)

  assert.equal(tokens.length, 5)
  assert.deepEqual(tokens[0], { type: 'text', raw: '网盘资源在 ', redacted: false })
  assert.deepEqual(tokens[1], {
    type: 'link',
    raw: 'tt.vg/jmxz',
    url: 'https://tt.vg/jmxz', // 自动补齐 https://
    label: '外部链接',
    redacted: true,
  })
  assert.deepEqual(tokens[2], { type: 'text', raw: ' ，另外 ', redacted: false })
  assert.deepEqual(tokens[3], {
    type: 'link',
    raw: 'b23.tv/ep86012',
    url: 'https://b23.tv/ep86012',
    label: '外部链接',
    redacted: true,
  })
  assert.deepEqual(tokens[4], { type: 'text', raw: ' 也可以看', redacted: false })
})

test('tokenizeCommentText: strict defense against natural Chinese punctuation (no false positives on "好看.但是" or slash comparisons)', () => {
  // 1. 中文标点代替句号
  const text1 = '这作剧情太棒了.但是结尾略仓促。作画.音乐都很神。'
  const tokens1 = tokenizeCommentText(text1)
  assert.equal(tokens1.length, 1)
  assert.equal(tokens1[0].type, 'text')
  assert.equal(tokens1[0].raw, text1)

  // 2. 斜杠维度对比与分数
  const text2 = '画风/音乐/演出都很神，个人评分 8.5/10 分，是 2024/10月新番最佳，第 12 集 1080P 很爽'
  const tokens2 = tokenizeCommentText(text2)
  assert.equal(tokens2.length, 1)
  assert.equal(tokens2[0].type, 'text')
  assert.equal(tokens2[0].raw, text2)
})

test('tokenizeCommentText: parses Chinese social group leads (QQ, WeChat, TG)', () => {
  const text = '交流请加 Q群: 12345678 ，或者加企鹅裙 987654321 ，也可以+vx: anime_vip'
  const tokens = tokenizeCommentText(text)

  const socialTokens = tokens.filter((t) => t.type === 'social_lead')
  assert.equal(socialTokens.length, 3)
  assert.equal(socialTokens[0].raw, 'Q群: 12345678')
  assert.equal(socialTokens[1].raw, '企鹅裙 987654321')
  assert.equal(socialTokens[2].raw, 'vx: anime_vip')
})

test('tokenizeCommentText: catches isolated 6-11 digit numbers without false positives on 4-digit years', () => {
  const text = '2024年的番，暗号 83749281 ，另外第 24 话神作'
  const tokens = tokenizeCommentText(text)

  assert.equal(tokens.length, 3)
  assert.deepEqual(tokens[0], { type: 'text', raw: '2024年的番，暗号 ', redacted: false })
  assert.deepEqual(tokens[1], {
    type: 'number',
    raw: '83749281',
    label: '串码',
    redacted: true,
  })
  assert.deepEqual(tokens[2], { type: 'text', raw: ' ，另外第 24 话神作', redacted: false })
})

test('tokenizeCommentText: supports custom plugin rules (Open-Closed Principle)', () => {
  // 自定义扩展一条剧透规则: [spoiler]...[/spoiler]
  const spoilerRule: CensorRule = {
    name: 'spoiler_tag',
    pattern: /\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi,
    type: 'spoiler',
    label: '剧透警告',
    transform: (match) => ({
      meta: { innerContent: match[1] },
    }),
  }

  const text = '这集最后 [spoiler]男主牺牲了[/spoiler] 太刀了，看 tt.vg/demo'
  const tokens = tokenizeCommentText(text, [spoilerRule, ...DEFAULT_CENSOR_RULES])

  assert.equal(tokens.length, 4)
  assert.deepEqual(tokens[0], { type: 'text', raw: '这集最后 ', redacted: false })
  assert.deepEqual(tokens[1], {
    type: 'spoiler',
    raw: '[spoiler]男主牺牲了[/spoiler]',
    label: '剧透警告',
    redacted: true,
    meta: { innerContent: '男主牺牲了' },
  })
  assert.deepEqual(tokens[2], { type: 'text', raw: ' 太刀了，看 ', redacted: false })
  assert.deepEqual(tokens[3], {
    type: 'link',
    raw: 'tt.vg/demo',
    url: 'https://tt.vg/demo',
    label: '外部链接',
    redacted: true,
  })
})
