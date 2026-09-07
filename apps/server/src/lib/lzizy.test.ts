import test from 'node:test'
import assert from 'node:assert/strict'
import type { PluginRule } from '@animaku/shared'
import {
  isLzizyRule,
  isUsefulVodItem,
  parseLzizyRoads,
  resolveLzizy,
  type LzizyVodItem,
} from './lzizy'

test('lzizy: isLzizyRule matches rules correctly', () => {
  const dummyRule: PluginRule = {
    name: 'lzizy',
    baseURL: 'https://lzizy.net/',
    version: '1.0',
  }
  assert.equal(isLzizyRule(dummyRule), true)

  const cnRule: PluginRule = {
    name: '量子资源',
    baseURL: 'https://lzizy.net/',
    version: '1.0',
  }
  assert.equal(isLzizyRule(cnRule), true)

  const apiBaseRule: PluginRule = {
    name: 'custom',
    baseURL: 'https://cj.lziapi.com/api.php/provide/vod/',
    version: '1.0',
  }
  assert.equal(isLzizyRule(apiBaseRule), true)

  const otherRule: PluginRule = {
    name: 'cycani',
    baseURL: 'https://cycani.org/',
    version: '1.0',
  }
  assert.equal(isLzizyRule(otherRule), false)
})

test('lzizy: isUsefulVodItem filters junk and preserves feature films/series/anime', () => {
  // 1. 允许的主干品类（电影、电视剧、动漫、短剧、AI漫剧、综艺）
  const animeItem: LzizyVodItem = {
    vod_id: 1499,
    vod_name: '鬼灭之刃',
    type_id: 30,
    type_pid: 4,
    type_name: '日韩动漫',
  }
  assert.equal(isUsefulVodItem(animeItem), true)

  const dramaItem: LzizyVodItem = {
    vod_id: 47346,
    vod_name: '三体2023',
    type_id: 13,
    type_pid: 2,
    type_name: '国产剧',
  }
  assert.equal(isUsefulVodItem(dramaItem), true)

  const movieItem: LzizyVodItem = {
    vod_id: 99999,
    vod_name: '流浪地球2',
    type_id: 9,
    type_pid: 1,
    type_name: '科幻片',
  }
  assert.equal(isUsefulVodItem(movieItem), true)

  const shortDramaItem: LzizyVodItem = {
    vod_id: 88888,
    vod_name: '都市至尊',
    type_id: 46,
    type_name: '短剧',
  }
  assert.equal(isUsefulVodItem(shortDramaItem), true)

  const aiDramaItem: LzizyVodItem = {
    vod_id: 77777,
    vod_name: '未来漫游记',
    type_id: 52,
    type_name: 'AI漫剧',
  }
  assert.equal(isUsefulVodItem(aiDramaItem), true)

  // 2. 严格剔除的黑名单与杂质
  const commentaryItem: LzizyVodItem = {
    vod_id: 61531,
    vod_name: '间谍过家家第二季[电影解说]',
    type_id: 35,
    type_name: '电影解说',
  }
  assert.equal(isUsefulVodItem(commentaryItem), false)

  const trailerItem: LzizyVodItem = {
    vod_id: 84985,
    vod_name: '间谍过家家 代号：白[预告片]',
    type_id: 45,
    type_pid: 1,
    type_name: '预告片',
  }
  assert.equal(isUsefulVodItem(trailerItem), false)

  const sportsItem: LzizyVodItem = {
    vod_id: 95404,
    vod_name: '亚冠二级赛 东方体育会vs广岛三箭20241003',
    type_id: 37,
    type_pid: 36,
    type_name: '足球',
  }
  assert.equal(isUsefulVodItem(sportsItem), false)

  const adultItem: LzizyVodItem = {
    vod_id: 11111,
    vod_name: '测试伦理内容',
    type_id: 34,
    type_pid: 1,
    type_name: '伦理片',
  }
  assert.equal(isUsefulVodItem(adultItem), false)

  // 3. 标题正则剔除（即使分类被伪装）
  const maskedCommentary: LzizyVodItem = {
    vod_id: 22222,
    vod_name: '火影忍者疾风传 深度解说',
    type_id: 30,
    type_pid: 4,
    type_name: '日韩动漫',
  }
  assert.equal(isUsefulVodItem(maskedCommentary), false)
})

test('lzizy: parseLzizyRoads extracts lzm3u8 direct streams and drops web share lines', () => {
  const playFrom = 'liangzi$$$lzm3u8'
  const playUrl =
    '第01集$https://vip1.lz-cdn5.com/share/abc123#第02集$https://vip1.lz-cdn5.com/share/def456$$$第01集$https://vip1.lz-cdn5.com/20220326/1046_82a1022a/index.m3u8#第02集$https://vip1.lz-cdn5.com/20220326/1047_3f7ca0e7/index.m3u8'

  const roads = parseLzizyRoads(playFrom, playUrl)
  assert.equal(roads.length, 1)
  assert.equal(roads[0]?.name, '量子极速(直链)')
  assert.equal(roads[0]?.identifier.length, 2)
  assert.equal(roads[0]?.identifier[0], '第01集')
  assert.equal(roads[0]?.identifier[1], '第02集')
  assert.equal(
    roads[0]?.data[0],
    'https://vip1.lz-cdn5.com/20220326/1046_82a1022a/index.m3u8',
  )
  assert.equal(
    roads[0]?.data[1],
    'https://vip1.lz-cdn5.com/20220326/1047_3f7ca0e7/index.m3u8',
  )
})

test('lzizy: resolveLzizy immediately resolves m3u8 direct link with zero roundtrip', async () => {
  const rule: PluginRule = {
    name: 'lzizy',
    baseURL: 'https://lzizy.net/',
    version: '1.0',
  }
  const streamUrl =
    'https://vip1.lz-cdn5.com/20220326/1046_82a1022a/index.m3u8'

  const result = await resolveLzizy(rule, streamUrl)
  assert.equal(result.playUrl, streamUrl)
  assert.equal(result.format, 'hls')
  assert.equal(result.requiresProxy, false)
  assert.ok(result.proxyUrl.includes('/api/media/proxy?'))
  assert.ok(result.headers?.['Referer']?.includes('https://lzizy.net'))
})
