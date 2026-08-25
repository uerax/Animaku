/**
 * 封面图片源：构建期默认值（`VITE_BANGUMI_IMAGE_HOST` / `BANGUMI_IMAGE`）+ 设置页可覆盖。
 * 导入时立刻写进 shared 状态，保证 store 水合前的首屏也用对源。
 */
import {
  BANGUMI_IMAGE_HOST_MIRROR,
  BANGUMI_IMAGE_HOST_BANGUMI,
  resolveBangumiImagePreset,
  normalizeBangumiImageHost,
  setBangumiImageHost,
} from '@animaku/shared'

/** `.env` 里的默认源；缺省用镜像。 */
export const DEFAULT_BANGUMI_IMAGE_HOST =
  resolveBangumiImagePreset(
    import.meta.env.VITE_BANGUMI_IMAGE_HOST as string | undefined,
  ) || BANGUMI_IMAGE_HOST_MIRROR

export const BANGUMI_IMAGE_HOST_OPTIONS: { host: string; label: string }[] = [
  { host: BANGUMI_IMAGE_HOST_MIRROR, label: '代理 (针对国内优化)' },
  { host: BANGUMI_IMAGE_HOST_BANGUMI, label: '官方 (国内不稳定)' },
]

// 如果 .env 配置了自定义第三方图片反代（如 img.temp.cn），自动注入为可选列表中的默认项
if (!BANGUMI_IMAGE_HOST_OPTIONS.some((o) => o.host === DEFAULT_BANGUMI_IMAGE_HOST)) {
  BANGUMI_IMAGE_HOST_OPTIONS.unshift({
    host: DEFAULT_BANGUMI_IMAGE_HOST,
    label: `自定义 (${DEFAULT_BANGUMI_IMAGE_HOST})`,
  })
}

/** 校验设置里存的值；非法回落到 .env 默认。 */
export function resolveBangumiImageHost(raw?: unknown): string {
  const h = normalizeBangumiImageHost(typeof raw === 'string' ? raw : '')
  return h || DEFAULT_BANGUMI_IMAGE_HOST
}

setBangumiImageHost(DEFAULT_BANGUMI_IMAGE_HOST)
