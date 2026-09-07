/** Subset of GET /api/health used for settings. */
export type ServerHealth = {
  ok?: boolean
  version?: string
  danmakuConfigured?: boolean
  danmakuUsingFallback?: boolean
}

export async function fetchServerHealth(
  signal?: AbortSignal,
): Promise<ServerHealth> {
  const res = await fetch('/api/health', { signal })
  if (!res.ok) throw new Error(`health ${res.status}`)
  return (await res.json()) as ServerHealth
}

