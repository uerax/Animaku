const HTML_ENTITY_RE = /&(?:#(?:[xX]([0-9a-fA-F]+)|(\d+))|([a-zA-Z]+));/g

/**
 * Single-pass HTML entity decoder.
 * Prevents recursive multi-pass decoding (e.g. `&amp;#39;` -> `&#39;`, never to `'`).
 * Safely handles decimal, hex (`&#x..;` / `&#X..;`), and common named entities.
 * Unrecognized entities or invalid code points are preserved as-is.
 */
export function decodeHtmlEntities(s: string): string {
  if (!s || !s.includes('&')) return s
  return s.replace(HTML_ENTITY_RE, (match, hex, dec, named) => {
    if (dec) {
      try {
        const code = Number(dec)
        if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
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
        if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
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
