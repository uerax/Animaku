import assert from 'node:assert/strict'
import type { PluginRule } from '../packages/shared/src/plugin'
import { isAnxRule, parsePluginRule } from '../packages/shared/src/plugin'
import { searchAnx, chaptersAnx, resolveAnx } from '../apps/server/src/lib/anibaka-adapter'

async function runTests() {
  console.log('🧪 开始测试 AniBaka 规则适配器与流水线解释器...')

  // Test 1: 格式与类型识别
  console.log('1. 测试 isAnxRule 与 parsePluginRule 识别')
  const anxRuleJson = {
    format: 'anx-rule/2',
    id: 'test-source',
    name: '测试源',
    baseUrl: 'https://example.com',
    headers: {
      'User-Agent': 'TestAgent',
    },
    search: [
      { op: 'template', value: 'https://example.com/search?q={keyword}' },
    ],
    detail: [
      { op: 'follow' },
    ],
    play: [
      { op: 'template', value: '{episodeId:raw}' },
    ],
  }
  assert.equal(isAnxRule(anxRuleJson), true, '应该正确识别 anx-rule/2')
  const parsed = parsePluginRule(anxRuleJson)
  assert.equal(parsed.format, 'anx-rule/2')
  assert.equal(parsed.name, '测试源')
  assert.equal(parsed.baseURL, 'https://example.com')
  assert.equal(Array.isArray(parsed.search), true)

  const legacyKazumiJson = {
    api: '1',
    name: '传统源',
    baseURL: 'https://legacy.com',
    searchURL: 'https://legacy.com/search?q=@keyword',
  }
  assert.equal(isAnxRule(legacyKazumiJson), false, '传统 Kazumi 规则不应误判为 anx-rule')

  // Test 2: 模板插值与 setVar
  console.log('2. 测试模板变量与 setVar 算子')
  const templateRule: PluginRule = {
    name: 'template-test',
    version: '1.0',
    baseURL: 'https://example.com',
    format: 'anx-rule/2',
    search: [
      { op: 'setVar', name: 'mySlug', value: 'anime-slug-123' },
      { op: 'template', value: '/video/{mySlug:raw}/detail' },
    ],
  }
  const searchRes = await searchAnx(templateRule, '从零开始')
  assert.ok(searchRes, '搜索结果对象应存在')

  // Test 3: 加解密算子 (crypto, base64, md5, aes-cbc)
  console.log('3. 测试 crypto 算子 (MD5, Base64, AES-CBC)')
  const cryptoRule: PluginRule = {
    name: 'crypto-test',
    version: '1.0',
    baseURL: 'https://example.com',
    format: 'anx-rule/2',
    play: [
      // 1. 设置明文
      { op: 'setVar', name: 'secretText', value: 'https://cdn.example.com/live/1080p.m3u8' },
      // 2. AES-CBC 加密
      {
        op: 'crypto',
        algo: 'aes-cbc',
        mode: 'encrypt',
        input: '{secretText:raw}',
        key: '1234567890123456',
        iv: '1234567890123456',
        keyEncoding: 'utf8',
        ivEncoding: 'utf8',
        outputEncoding: 'base64',
      },
      // 3. 把密文存入变量
      { op: 'setVar', name: 'cipherBase64', value: '{url:raw}' },
      // 4. AES-CBC 解密
      {
        op: 'crypto',
        algo: 'aes-cbc',
        mode: 'decrypt',
        input: '{cipherBase64:raw}',
        key: '1234567890123456',
        iv: '1234567890123456',
        keyEncoding: 'utf8',
        ivEncoding: 'utf8',
        inputEncoding: 'base64',
      },
    ],
  }
  const playRes = await resolveAnx(cryptoRule, 'ep1')
  assert.equal(playRes.playUrl, 'https://cdn.example.com/live/1080p.m3u8', 'AES 解密后的直链应与明文完全一致')
  assert.ok(playRes.proxyUrl.includes('/api/media/proxy'), '应正确生成 proxyUrl')

  // Test 4: JSON 结构化提取 (jsonSeries & jsonEpisodes)
  console.log('4. 测试 JSON 结构化提取算子 (jsonSeries & jsonEpisodes)')
  const jsonRule: PluginRule = {
    name: 'json-test',
    version: '1.0',
    baseURL: 'https://api.example.com',
    format: 'anx-rule/2',
    search: [
      // 构造模拟 JSON 数据
      {
        op: 'setVar',
        name: 'mockApiJson',
        value: JSON.stringify({
          code: 200,
          data: {
            videos: [
              { id: '101', name: '葬送的芙莉莲', pic: '/cover/101.jpg' },
              { id: '102', name: '鬼灭之刃', pic: '/cover/102.jpg' },
            ],
          },
        }),
      },
      { op: 'template', value: '{mockApiJson:raw}' },
      {
        op: 'jsonSeries',
        listPath: 'data.videos',
        idKey: 'id',
        nameKey: 'name',
        imageKey: 'pic',
        detailUrlTemplate: '/anime/{id}',
      },
    ],
    detail: [
      {
        op: 'setVar',
        name: 'mockDetailJson',
        value: JSON.stringify({
          data: {
            playSources: [
              {
                id: 'line1',
                name: '超清线路',
                episodes: [
                  { id: 'ep_1', name: '第01集' },
                  { id: 'ep_2', name: '第02集' },
                ],
              },
            ],
          },
        }),
      },
      { op: 'template', value: '{mockDetailJson:raw}' },
      {
        op: 'jsonEpisodes',
        sourcesPath: 'data.playSources',
        episodesKey: 'episodes',
        sourceNameKey: 'name',
        episodeNameKey: 'name',
        episodeIdTemplate: '/play?ep={id}&source={source_id}',
      },
    ],
  }

  const sResult = await searchAnx(jsonRule, '芙莉莲')
  assert.equal(sResult.items.length, 2)
  assert.equal(sResult.items[0].name, '葬送的芙莉莲')
  assert.equal(sResult.items[0].src, 'https://api.example.com/anime/101')

  const dResult = await chaptersAnx(jsonRule, 'https://api.example.com/anime/101')
  assert.equal(dResult.roads.length, 1)
  assert.equal(dResult.roads[0].name, '超清线路')
  assert.equal(dResult.roads[0].data.length, 2)
  assert.equal(dResult.roads[0].identifier[0], '第01集')
  assert.equal(dResult.roads[0].data[0], '/play?ep=ep_1&source=line1')

  // Test 5: first 算子分支回退
  console.log('5. 测试 first 算子多分支容灾回退')
  const firstRule: PluginRule = {
    name: 'first-test',
    version: '1.0',
    baseURL: 'https://example.com',
    format: 'anx-rule/2',
    play: [
      {
        op: 'first',
        branches: [
          // 分支 1 故意返回空/失败
          [
            { op: 'template', value: '' },
          ],
          // 分支 2 成功返回直链
          [
            { op: 'template', value: 'https://cdn.example.com/fallback.mp4' },
          ],
        ],
      },
    ],
  }
  const firstPlayRes = await resolveAnx(firstRule, 'ep1')
  assert.equal(firstPlayRes.playUrl, 'https://cdn.example.com/fallback.mp4', 'first 应成功命中分支 2')

  console.log('🎉 所有 AniBaka 流水线算子测试全部通过！\n')
}

runTests().catch((e) => {
  console.error('❌ 测试失败:', e)
  process.exit(1)
})
