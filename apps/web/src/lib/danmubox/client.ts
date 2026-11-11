/**
 * DanmuBox Client Helpers (Pure Download & Search Mode)
 * Server and client no longer decompress 7z archives.
 * Users download the archive via CDN and import XML locally.
 */

export const DANMUBOX_CDN_BASE = 'https://cdn.jsdelivr.net/gh/dmrepository/'
export const DANMUBOX_DIRECT_BASE = 'https://dmrepository.github.io/'

export function getDanmuBoxCdnDownloadUrl(repo: string, fileHash: string): string {
  return `${DANMUBOX_CDN_BASE}${repo}/${fileHash}.7z`
}

export function getDanmuBoxDirectDownloadUrl(repo: string, fileHash: string): string {
  return `${DANMUBOX_DIRECT_BASE}${repo}/${fileHash}.7z`
}
