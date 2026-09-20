const HTML_ENTITY_RE = /&(?:#(?:[xX]([0-9a-fA-F]+)|(\d+))|([a-zA-Z]+));/g

/**
 * XML 1.0 (Fifth Edition) valid character range:
 * Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
 * Excludes #x0, C0 control characters (except TAB, LF, CR), surrogates (#xD800-#xDFFF),
 * and noncharacters (#xFFFE, #xFFFF).
 */
function isXmlSafeCodePoint(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0x10ffff && code !== 0xfffe && code !== 0xffff)
  )
}

/**
 * Single-pass HTML entity decoder.
 * Prevents recursive multi-pass decoding (e.g. `&amp;#39;` -> `&#39;`, never to `'`).
 * Safely handles decimal, hex (`&#x..;` / `&#X..;`), and common named entities.
 * Unrecognized entities, invalid code points, and XML 1.0 illegal control/surrogate characters
 * are safely preserved as-is without crashing or breaking XML serialization.
 */
export function decodeHtmlEntities(s: string): string {
  if (!s || !s.includes('&')) return s
  return s.replace(HTML_ENTITY_RE, (match, hex, dec, named) => {
    if (dec) {
      try {
        const code = Number(dec)
        if (Number.isFinite(code) && isXmlSafeCodePoint(code)) {
          return String.fromCodePoint(code)
        }
      } catch {
        /* fallback to match */
      }
      return match
    }
    if (hex) {
      try {
        const code = parseInt(hex, 16)
        if (Number.isFinite(code) && isXmlSafeCodePoint(code)) {
          return String.fromCodePoint(code)
        }
      } catch {
        /* fallback to match */
      }
      return match
    }
    switch (named) {
      case 'amp':
        return '&'
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'quot':
        return '"'
      case 'apos':
        return "'"
      case 'nbsp':
        return ' '
      default:
        return match
    }
  })
}

