import {
  defaultDanmakuSettings,
  defaultPlayerSettings,
} from '@animaku/shared'
import { defaultNavSettings } from '../stores/settings'

/** Stable empty refs for zustand selectors (avoid infinite re-render) */
export const EMPTY_ARRAY: never[] = []

export const FALLBACK_DANMAKU = { ...defaultDanmakuSettings }

export const FALLBACK_PLAYER = { ...defaultPlayerSettings }

export const FALLBACK_NAV = { ...defaultNavSettings }
