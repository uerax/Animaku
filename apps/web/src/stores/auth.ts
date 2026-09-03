import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  type AuthProviderType,
  type IAuthProvider,
  type UserProfile,
  type UserSession,
  GUEST_USER_PROFILE,
  isGuestUser,
} from '@animaku/shared'
import { bangumiApi } from '../lib/bangumi'
import { useSettingsStore } from './settings'

/**
 * Bangumi 认证提供方适配器 (Bangumi Auth Adapter)
 *
 * 桥接现有的 Bangumi Access Token 机制至通用用户领域模型。
 */
export class BangumiAuthProvider implements IAuthProvider {
  readonly type: AuthProviderType = 'bangumi'
  readonly name = 'Bangumi 账号'

  async restoreSession(): Promise<UserSession | null> {
    const token = useSettingsStore.getState().bangumiToken?.trim()
    if (!token) return null

    try {
      const profile = await this.fetchProfile(token)
      return {
        token,
        provider: this.type,
        profile,
      }
    } catch {
      // 网络离线或 Token 校验异常时返回 null，调用方可选择使用离线快照
      return null
    }
  }

  async login(credentials: unknown): Promise<UserSession> {
    const token = typeof credentials === 'string' ? credentials.trim() : ''
    if (!token) {
      throw new Error('请输入有效的 Bangumi Access Token')
    }

    // 先写入 settingsStore 保证底层 API 即时可用
    useSettingsStore.getState().setBangumiToken(token)

    try {
      const profile = await this.fetchProfile(token)
      return {
        token,
        provider: this.type,
        profile,
      }
    } catch (err) {
      // 若获取资料失败，清理 token 避免脏状态
      useSettingsStore.getState().setBangumiToken('')
      throw err
    }
  }

  async logout(): Promise<void> {
    useSettingsStore.getState().setBangumiToken('')
  }

  async fetchProfile(token?: string): Promise<UserProfile> {
    const activeToken = token ?? useSettingsStore.getState().bangumiToken?.trim()
    if (!activeToken) {
      throw new Error('未配置 Bangumi Token')
    }

    const res = await bangumiApi.me()
    const user = res.data
    const avatar =
      user.avatar?.large ||
      user.avatar?.medium ||
      user.avatar?.small ||
      undefined

    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname || user.username,
      avatarUrl: avatar,
      provider: 'bangumi',
      extra: {
        bangumiUser: user,
      },
    }
  }
}

/**
 * 自建用户系统认证提供方（预留架构骨架，待后端用户服务就绪后快速接入）
 */
export class SelfHostedAuthProvider implements IAuthProvider {
  readonly type: AuthProviderType = 'local'
  readonly name = 'Animaku 账号'

  async restoreSession(): Promise<UserSession | null> {
    // 待接入：检查自建系统的 HTTP-Only Cookie 或本地 JWT 凭据
    return null
  }

  async login(_credentials: unknown): Promise<UserSession> {
    // 待接入：调用自建 /api/auth/login
    throw new Error('自建用户系统正在建设中，敬请期待')
  }

  async logout(): Promise<void> {
    // 待接入：调用自建 /api/auth/logout
  }

  async fetchProfile(_token: string): Promise<UserProfile> {
    // 待接入：调用自建 /api/auth/me
    throw new Error('自建用户系统正在建设中，敬请期待')
  }
}

// 策略注册表
const authProviders: Record<AuthProviderType, IAuthProvider> = {
  bangumi: new BangumiAuthProvider(),
  local: new SelfHostedAuthProvider(),
  guest: {
    type: 'guest',
    name: '访客',
    async restoreSession() {
      return null
    },
  },
}

export function getAuthProvider(type: AuthProviderType): IAuthProvider {
  return authProviders[type] || authProviders.bangumi
}

interface AuthState {
  /** 当前激活的认证策略类型 */
  providerType: AuthProviderType
  /** 当前登录会话（包含凭据与资料） */
  session: UserSession | null
  /** 缓存的脱机用户资料快照（避免未水合或网络请求瞬间头像闪烁） */
  profileSnapshot: UserProfile | null
  /** 是否正在登录/拉取资料 */
  isLoading: boolean
  /** 错误信息 */
  error: string | null

  // Actions
  /** 获取当前有效资料（未登录时返回访客资料） */
  getUser: () => UserProfile
  /** 是否已认证登录 */
  isAuthenticated: () => boolean
  /** 登录/绑定鉴权 */
  login: (credentials: unknown, provider?: AuthProviderType) => Promise<void>
  /** 退出登录/解除绑定 */
  logout: () => Promise<void>
  /** 刷新当前用户资料 */
  refreshProfile: () => Promise<void>
  /** 切换认证策略 */
  setProviderType: (type: AuthProviderType) => void
  /** 从本地 Token / 持久化恢复最新会话 */
  initAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      providerType: 'bangumi',
      session: null,
      profileSnapshot: null,
      isLoading: false,
      error: null,

      getUser: () => {
        const { session, profileSnapshot } = get()
        if (session?.profile && !isGuestUser(session.profile)) {
          return session.profile
        }
        if (profileSnapshot && !isGuestUser(profileSnapshot)) {
          return profileSnapshot
        }
        return GUEST_USER_PROFILE
      },

      isAuthenticated: () => {
        const { session, profileSnapshot } = get()
        const profile = session?.profile || profileSnapshot
        return !isGuestUser(profile)
      },

      setProviderType: (type: AuthProviderType) => {
        set({ providerType: type, error: null })
      },

      login: async (credentials: unknown, provider?: AuthProviderType) => {
        const pType = provider || get().providerType
        const adapter = getAuthProvider(pType)
        set({ isLoading: true, error: null })

        try {
          if (!adapter.login) {
            throw new Error(`认证提供方 ${adapter.name} 不支持直接登录`)
          }
          const session = await adapter.login(credentials)
          set({
            session,
            profileSnapshot: session.profile,
            providerType: pType,
            isLoading: false,
            error: null,
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : '登录失败'
          set({ isLoading: false, error: msg })
          throw e
        }
      },

      logout: async () => {
        const { providerType } = get()
        const adapter = getAuthProvider(providerType)
        set({ isLoading: true, error: null })

        try {
          if (adapter.logout) {
            await adapter.logout()
          }
        } finally {
          set({
            session: null,
            profileSnapshot: null,
            isLoading: false,
            error: null,
          })
        }
      },

      refreshProfile: async () => {
        const { session, providerType } = get()
        const token = session?.token || useSettingsStore.getState().bangumiToken?.trim()
        if (!token) return

        const adapter = getAuthProvider(providerType)
        if (!adapter.fetchProfile) return

        try {
          const profile = await adapter.fetchProfile(token)
          set((s) => ({
            session: s.session
              ? { ...s.session, profile }
              : { token, provider: providerType, profile },
            profileSnapshot: profile,
          }))
        } catch (e) {
          console.warn('[useAuthStore] 刷新用户资料失败:', e)
        }
      },

      initAuth: async () => {
        const { providerType, session } = get()
        const tokenFromSettings = useSettingsStore.getState().bangumiToken?.trim()

        // 若 settingsStore 没有 token，但 session 有，则双向对齐
        if (!tokenFromSettings && session?.token && providerType === 'bangumi') {
          useSettingsStore.getState().setBangumiToken(session.token)
        }

        const effectiveToken = tokenFromSettings || session?.token
        if (!effectiveToken) {
          if (session) {
            set({ session: null, profileSnapshot: null })
          }
          return
        }

        const adapter = getAuthProvider(providerType)
        try {
          set({ isLoading: true })
          const restored = await adapter.restoreSession?.()
          if (restored) {
            set({
              session: restored,
              profileSnapshot: restored.profile,
              isLoading: false,
            })
          } else {
            set({ isLoading: false })
          }
        } catch {
          set({ isLoading: false })
        }
      },
    }),
    {
      name: 'animaku-auth-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        providerType: state.providerType,
        profileSnapshot: state.profileSnapshot,
        session: state.session,
      }),
    },
  ),
)
