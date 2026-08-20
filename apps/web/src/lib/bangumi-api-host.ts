/**
 * Bangumi API 接口源：构建期默认值（`VITE_BANGUMI_API_HOST` / `BANGUMI_API`）+ 设置页可覆盖。
 * 导入时立刻写进 shared 状态，保证 store 水合前也用对源。
 */
import {
  BANGUMI_API_HOST_MIRROR,
  BANGUMI_API_HOST_BANGUMI,
  resolveBangumiApiPreset,
  normalizeBangumiApiHost,
  setBangumiApiHost,
} from '@animaku/shared'

/** `.env` 里的默认 API 源；缺省使用反代镜像。 */
export const DEFAULT_BANGUMI_API_HOST =
  resolveBangumiApiPreset(
    import.meta.env.VITE_BANGUMI_API_HOST as string | undefined,
  ) || BANGUMI_API_HOST_MIRROR

export const BANGUMI_API_HOST_OPTIONS: { host: string; label: string }[] = [
  { host: BANGUMI_API_HOST_MIRROR, label: '反代 (推荐 · 针对国内免翻)' },
  { host: BANGUMI_API_HOST_BANGUMI, label: '官方 (直连 · 需翻墙)' },
]

// 如果 .env 配置了自定义第三方反代（如 api.temp.cn），自动注入为可选列表中的默认项
if (!BANGUMI_API_HOST_OPTIONS.some((o) => o.host === DEFAULT_BANGUMI_API_HOST)) {
  BANGUMI_API_HOST_OPTIONS.unshift({
    host: DEFAULT_BANGUMI_API_HOST,
    label: `自定义 (${DEFAULT_BANGUMI_API_HOST})`,
  })
}

/** 校验设置里存的值；非法回落到默认源。 */
export function resolveBangumiApiHost(raw?: unknown): string {
  const h = normalizeBangumiApiHost(typeof raw === 'string' ? raw : '')
  return h || DEFAULT_BANGUMI_API_HOST
}

setBangumiApiHost(DEFAULT_BANGUMI_API_HOST)
