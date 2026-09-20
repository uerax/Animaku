import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeHtmlEntities } from './html'

test('decodeHtmlEntities: handles empty or no-entity strings', () => {
  assert.equal(decodeHtmlEntities(''), '')
  assert.equal(decodeHtmlEntities('hello world'), 'hello world')
})

test('decodeHtmlEntities: decodes common named entities', () => {
  assert.equal(decodeHtmlEntities('&lt;div&gt;&quot;test&quot;&amp;&#39;hello&#39;&nbsp;&apos;&lt;/div&gt;'), '<div>"test"&\'hello\' \'</div>')
})

test('decodeHtmlEntities: decodes decimal and hex entities (case-insensitive hex)', () => {
  assert.equal(decodeHtmlEntities('Let&#39;s Go'), "Let's Go")
  assert.equal(decodeHtmlEntities('Let&#x27;s Go'), "Let's Go")
  assert.equal(decodeHtmlEntities('Let&#X27;s Go'), "Let's Go")
  assert.equal(decodeHtmlEntities('&#12354;&#x3042;'), 'ああ')
})

test('decodeHtmlEntities: strict single-pass decoding prevents recursive decoding', () => {
  // &amp;#39; should decode ONCE to &#39;, never to '
  assert.equal(decodeHtmlEntities('&amp;#39;'), '&#39;')
  assert.equal(decodeHtmlEntities('&amp;lt;'), '&lt;')
  assert.equal(decodeHtmlEntities('Let&amp;#39;s Go'), 'Let&#39;s Go')
})

test('decodeHtmlEntities: preserves unknown entities and invalid code points safely without crash', () => {
  assert.equal(decodeHtmlEntities('&unknown;'), '&unknown;')
  assert.equal(decodeHtmlEntities('&#999999999;'), '&#999999999;')
  assert.equal(decodeHtmlEntities('&#x999999999;'), '&#x999999999;')
  assert.equal(decodeHtmlEntities('&#xyz;'), '&#xyz;')
})
