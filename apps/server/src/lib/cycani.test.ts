import test from 'node:test'
import assert from 'node:assert/strict'
import type { PluginRule, ResolvePlayResult } from '@animaku/shared'
import { isCycaniRule } from './cycani'
import { wrapResolveWithTicket } from '../rule-engine'
import { cycaniAdapter } from './source/adapters/cycani'

test('cycani: isCycaniRule matches rules correctly', () => {
  const rule1: PluginRule = {
    name: 'cycani',
    baseURL: 'https://www.cycani.org/',
    version: '1.0',
  }
  assert.equal(isCycaniRule(rule1), true)

  const rule2: PluginRule = {
    name: 'cyc_web',
    baseURL: 'https://example.com/',
    version: '1.0',
  }
  assert.equal(isCycaniRule(rule2), true)

  const rule3: PluginRule = {
    name: 'custom',
    baseURL: 'https://cycr2.top/',
    version: '1.0',
  }
  assert.equal(isCycaniRule(rule3), true)

  const otherRule: PluginRule = {
    name: 'mifun',
    baseURL: 'https://mifun.tv/',
    version: '1.0',
  }
  assert.equal(isCycaniRule(otherRule), false)
})

test('cycani: wrapResolveWithTicket correctly resolves disguised .mp3 streams as mp4', () => {
  const rule: PluginRule = {
    name: 'cycani',
    baseURL: 'https://www.cycani.org/',
    version: '1.0',
  }

  // 1. 模拟 CYCani 当前包含 .mp3 伪装后缀与 base64 文件名的真实直链
  const disguisedResult: ResolvePlayResult = {
    playUrl:
      'https://vgw.cycstream.com/W05la29tb2Uga2lzc2F0ZW5dW1NvdXNvdSBubyBGcmllcmVuXVsyOV1bMTA4MHBdW0pQU0NdLm1wNA==.mp3?expires=1788867795&md5=QWPWchY97cLXediUc0ZbDA',
    proxyUrl: '/api/media/proxy?url=test',
    format: 'mp4',
    contentType: 'video/mp4',
  }

  const wrapped = wrapResolveWithTicket(rule, disguisedResult)
  assert.equal(wrapped.format, 'mp4')
  assert.ok(wrapped.proxyUrl?.startsWith('/api/media/segment'))
  assert.ok(!wrapped.proxyUrl?.startsWith('/api/media/stream'))

  // 2. 兜底测试：即使第三方规则未显式提供 format / contentType，但 URL 来自 cycstream.com
  const fallbackResult: ResolvePlayResult = {
    playUrl:
      'https://q8t.cycstream.com/W01pbmdZXSBCb2NjaGkgdGhlIFJvY2sgUmUgW01vdmllXVsxMDgwcF1bQ0hTJkpQTl0ubXA0.mp3?expires=1788868538&md5=94NaAT4hZT90a_1RTlf4Vw',
    proxyUrl: '/api/media/proxy?url=test',
  }
  const fallbackWrapped = wrapResolveWithTicket(rule, fallbackResult)
  assert.equal(fallbackWrapped.format, 'mp4')
  assert.ok(fallbackWrapped.proxyUrl?.startsWith('/api/media/segment'))

  // 3. 对照组：常规 M3U8 流必须依然准确解析为 hls
  const hlsResult: ResolvePlayResult = {
    playUrl: 'https://example.com/live/playlist.m3u8',
    proxyUrl: '/api/media/proxy?url=test',
  }
  const hlsWrapped = wrapResolveWithTicket(rule, hlsResult)
  assert.equal(hlsWrapped.format, 'hls')
  assert.ok(hlsWrapped.proxyUrl?.startsWith('/api/media/stream'))
})
