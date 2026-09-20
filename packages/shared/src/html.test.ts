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

test('decodeHtmlEntities: preserves unknown entities, invalid code points and XML 1.0 illegal characters safely', () => {
  assert.equal(decodeHtmlEntities('&unknown;'), '&unknown;')
  assert.equal(decodeHtmlEntities('&#999999999;'), '&#999999999;')
  assert.equal(decodeHtmlEntities('&#x999999999;'), '&#x999999999;')
  assert.equal(decodeHtmlEntities('&#xyz;'), '&#xyz;')

  // XML 1.0 illegal control characters and surrogates must be preserved as-is
  assert.equal(decodeHtmlEntities('&#0;'), '&#0;', 'Preserves NUL character entity &#0;')
  assert.equal(decodeHtmlEntities('&#x0;'), '&#x0;', 'Preserves hex NUL &#x0;')
  assert.equal(decodeHtmlEntities('&#x1;'), '&#x1;', 'Preserves C0 control character &#x1;')
  assert.equal(decodeHtmlEntities('&#xD800;'), '&#xD800;', 'Preserves surrogate half &#xD800;')
  assert.equal(decodeHtmlEntities('&#xDFFF;'), '&#xDFFF;', 'Preserves surrogate half &#xDFFF;')

  // Normal valid characters (including Japanese / CJK / unicode) must still be decoded normally
  assert.equal(decodeHtmlEntities('&#x3042;'), 'あ', 'Normal valid unicode still decodes correctly')
  assert.equal(decodeHtmlEntities('&#x9;'), '\t', 'Tab is safe in XML and decodes')
  assert.equal(decodeHtmlEntities('&#xA;'), '\n', 'Newline is safe in XML and decodes')
})
