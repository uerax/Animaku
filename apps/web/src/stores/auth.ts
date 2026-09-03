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

    const res = await bangumiApi.me({ token: activeToken })
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

let isExplicitLoggingIn = false
let authSeq = 0

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
        // 递增序列号，使此前所有挂起的 initAuth 请求立即失效，防止旧请求覆盖新登录态
        ++authSeq
        set({ isLoading: true, error: null })
        isExplicitLoggingIn = true

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
        } finally {
          isExplicitLoggingIn = false
        }
      },

      logout: async () => {
        const { providerType } = get()
        const adapter = getAuthProvider(providerType)
        // 递增序列号，使此前所有挂起的 initAuth 请求立即失效，杜绝历史慢请求复活已退出的会话
        ++authSeq
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
        const seq = ++authSeq
        const { providerType } = get()
        const tokenFromSettings = useSettingsStore.getState().bangumiToken?.trim()

        // settingsStore.bangumiToken 为单一真理源：若未配置 token，立即重置会话，杜绝僵尸 token 复活
        if (providerType === 'bangumi' && !tokenFromSettings) {
          const { session, profileSnapshot } = get()
          if (session || profileSnapshot) {
            set({ session: null, profileSnapshot: null, isLoading: false, error: null })
          }
          return
        }

        const effectiveToken = tokenFromSettings || get().session?.token
        if (!effectiveToken) {
          set({ session: null, profileSnapshot: null, isLoading: false, error: null })
          return
        }

        const handleFailure = () => {
          const curSession = get().session
          // 若当前已有有效会话且 Token 完全未改变，视为网络抖动或离线，保留现有离线快照
          if (curSession && tokenFromSettings && curSession.token === tokenFromSettings) {
            set({ isLoading: false })
          } else {
            // 换了新 Token 但校验失败，或当前无有效会话首次输入错误 Token，必须彻底清空旧会话并明确置入错误态
            set({
              session: null,
              profileSnapshot: null,
              isLoading: false,
              error: 'Token 校验失败',
            })
          }
        }

        const adapter = getAuthProvider(providerType)
        try {
          set({ isLoading: true })
          const restored = await adapter.restoreSession?.()
          if (seq !== authSeq) return

          if (restored) {
            set({
              session: restored,
              profileSnapshot: restored.profile,
              isLoading: false,
              error: null,
            })
          } else {
            handleFailure()
          }
        } catch {
          if (seq !== authSeq) return
          handleFailure()
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

// 自动订阅 settingsStore 中的 bangumiToken 变更，保证单一真理源双向实时同步
if (typeof window !== 'undefined') {
  useSettingsStore.subscribe((state, prevState) => {
    if (state.bangumiToken !== prevState.bangumiToken) {
      const newToken = state.bangumiToken?.trim()
      if (!newToken) {
        // 用户清空了 Token：立即废弃所有挂起的异步请求并清理会话
        ++authSeq
        const cur = useAuthStore.getState()
        if (cur.session || cur.profileSnapshot) {
          useAuthStore.setState({
            session: null,
            profileSnapshot: null,
            isLoading: false,
            error: null,
          })
        }
      } else {
        // 若当前正处于外部主动 login() 事务中，由 login 负责落地状态，避免并发双重网络请求
        if (isExplicitLoggingIn) return

        const cur = useAuthStore.getState()
        // 若当前会话已有相同 Token 且已成功鉴权，跳过重复 initAuth
        if (cur.session?.token === newToken) return

        // 用户输入或修改了 Token：触发鉴权与资料拉取
        void cur.initAuth()
      }
    }
  })
}
