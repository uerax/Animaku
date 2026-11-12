import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { searchJzacg, chaptersJzacg, resolveJzacg, JZACG_BASE_URL } from './jzacg'
import { fetchPublic } from './private-host'

const JZACG_RULE = {
  name: 'jzacg',
  version: '1.0.0',
  baseURL: JZACG_BASE_URL,
}

describe('jzacg (橘子动漫) 多线路提取与端到端秒播直链测试', () => {
  it('端到端全链路验证：搜索 -> 完整保留5条线路 -> 可用线路解密与HTTP 206秒播', async () => {
    // 1. 搜索《FX战士久留美》
    console.log('1. 正在测试搜索...')
    const searchRes = await searchJzacg(JZACG_RULE, 'FX战士')
    assert.ok(searchRes.items.length > 0, '搜索结果不应为空')
    const item = searchRes.items.find((i) => i.name.includes('FX战士') || i.name.includes('久留美'))
    assert.ok(item, '应包含FX战士久留美结果')
    assert.ok(item.src.startsWith('http'), `详情链接应为完整URL: ${item.src}`)

    // 2. 详情页解析全部 5 条线路（完整保留官方全部线路，包括已下线）
    console.log('2. 正在获取《FX战士久留美》全部线路...')
    const chapterRes = await chaptersJzacg(JZACG_RULE, `${JZACG_BASE_URL}/media/1670/`)
    assert.equal(chapterRes.roads.length, 5, `线路数量应为官方全部5条，实际得到: ${chapterRes.roads.length}`)

    const roadNames = chapterRes.roads.map((r) => r.name)
    console.log('测试识别出的全部线路列表:', roadNames)
    assert.ok(roadNames.some((n) => n.includes('云端')), '应包含云端线路')
    assert.ok(roadNames.some((n) => n.includes('新番')), '应包含新番线路')
    assert.ok(roadNames.some((n) => n.includes('Mahoo')), '应包含Mahoo线路')
    assert.ok(roadNames.some((n) => n.includes('存储')), '应包含存储线路')
    assert.ok(roadNames.some((n) => n.includes('已下线')), '应忠实保留已下线线路')

    for (const road of chapterRes.roads) {
      assert.ok(road.data.length > 0, `线路 [${road.name}] 剧集列表不应为空`)
    }

    // 3. 逐条验证可用线路的第1集解密与 206 秒播
    const playableRoads = chapterRes.roads.filter((r) => !r.name.includes('已下线'))
    assert.equal(playableRoads.length, 4)

    for (const road of playableRoads) {
      const firstEpUrl = road.data[0]
      console.log(`3. 正在测试线路 [${road.name}] 第1集: ${firstEpUrl}`)

      const playRes = await resolveJzacg(JZACG_RULE, firstEpUrl)
      assert.ok(playRes.playUrl.startsWith('http'), `线路 [${road.name}] 直链不是有效的HTTP地址: ${playRes.playUrl}`)
      assert.equal(playRes.format, 'mp4', `线路 [${road.name}] 格式应为 mp4`)
      assert.equal(playRes.requiresProxy, false, `线路 [${road.name}] 应当直接直连无需走代理`)

      const probeRes = await fetchPublic(playRes.playUrl, {
        headers: {
          Range: 'bytes=0-1024',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          ...(playRes.headers || {}),
        },
      })

      assert.ok(
        probeRes.status === 200 || probeRes.status === 206,
        `线路 [${road.name}] 分片响应状态异常: HTTP ${probeRes.status}`,
      )
      console.log(` 线路 [${road.name}] 测试通过，HTTP 状态: ${probeRes.status}, Content-Range: ${probeRes.headers.get('content-range')}`)
    }
  })
})
