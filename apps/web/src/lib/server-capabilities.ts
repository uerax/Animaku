/** Subset of GET /api/health used for settings + source gating. */
export type ServerHealth = {
  ok?: boolean
  version?: string
  danmakuConfigured?: boolean
  danmakuUsingFallback?: boolean
  publicProxy?: boolean
  /** false = only m3u8 proxy (default); true = full media tunnel allowed */
  mediaFullProxy?: boolean
  /** true when server has configured PROXY_TOKEN in .env */
  proxyTokenRequired?: boolean
}

export async function fetchServerHealth(
  signal?: AbortSignal,
): Promise<ServerHealth> {
  const res = await fetch('/api/health', { signal })
  if (!res.ok) throw new Error(`health ${res.status}`)
  return (await res.json()) as ServerHealth
}

/** Treat missing field as false (safe default aligned with server). */
export function mediaFullProxyEnabled(h: ServerHealth | undefined | null): boolean {
  return Boolean(h?.mediaFullProxy)
}
