/** True when a source needs the server's full media proxy (for example cookie MP4). */
export function pluginNeedsFullMediaProxy(p: {
  name?: string
  baseURL?: string
  requiresFullMediaProxy?: boolean
}): boolean {
  if (p.requiresFullMediaProxy === true) return true
  if (p.requiresFullMediaProxy === false) return false

  // Compatibility for rules saved before the explicit capability field existed.
  const name = (p.name || '').toLowerCase()
  const base = (p.baseURL || '').toLowerCase()
  return (
    name === 'anime1' ||
    name.includes('anime1') ||
    base.includes('anime1.me') ||
    name === 'libvio' ||
    name.includes('libvio') ||
    base.includes('libvio')
  )
}



/**
 * Can a plugin appear in the watch session at all?
 * Normal sources always qualify; full-proxy sources need the server MEDIA_FULL_PROXY=1.
 */
export function isFullProxySourceUsable(
  plugin: { requiresFullMediaProxy?: boolean; name?: string; baseURL?: string },
  mediaFullProxy: boolean,
): boolean {
  return !pluginNeedsFullMediaProxy(plugin) || mediaFullProxy
}

/**
 * Should this plugin's media flow through the server proxy?
 * Requires server MEDIA_FULL_PROXY=1, and rule explicitly requires it.
 */
export function pluginShouldUseProxy(
  plugin: { proxy?: boolean },
  mediaFullProxy: boolean,
): boolean {
  if (!mediaFullProxy) return false
  return Boolean(plugin.proxy)
}
