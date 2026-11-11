/**
 * DanmuBox Archive Helper
 * Note: Server-side archive downloading and 7z extraction have been completely deprecated
 * and moved to client-side WebAssembly execution to eliminate server resource and legal risks.
 */

export function sanitizeFileHash(fileHash: string): string {
  return fileHash.replace(/[/\\]/g, '_').trim()
}
