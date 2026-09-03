/**
 * 统一用户模块领域模型与认证适配器契约 (User Domain Model & Auth Contracts)
 *
 * 采用适配器模式与策略模式，解耦前端表现层与具体的认证提供方（Bangumi / 自建用户系统 / 第三方 OAuth）。
 */

/** 认证提供方类型 */
export type AuthProviderType = 'bangumi' | 'local' | 'guest'

/** 统一用户实体资料（中立模型，屏蔽各平台特有结构差异） */
export interface UserProfile {
  /** 用户唯一标识（第三方数字 ID 或自建系统 UUID/ID） */
  id: string | number
  /** 用户登录名/唯一 handle */
  username: string
  /** 用户显示昵称 */
  nickname: string
  /** 头像 URL */
  avatarUrl?: string
  /** 电子邮箱（可选，自建系统使用） */
  email?: string
  /** 账号来源认证提供方 */
  provider: AuthProviderType
  /** 扩展属性（存储特定平台的原始结构或附加信息） */
  extra?: Record<string, unknown>
}

/** 统一用户会话 */
export interface UserSession {
  /** 访问凭证（Token / JWT） */
  token: string
  /** 当前认证策略类型 */
  provider: AuthProviderType
  /** 用户资料快照 */
  profile: UserProfile
  /** 会话过期时间戳（UNIX 毫秒，可选） */
  expiresAt?: number
}

/**
 * 认证提供方适配器标准契约 (Auth Provider Strategy Contract)
 *
 * 无论当前基于 Bangumi Token 还是后续自建用户系统，均实现此接口。
 */
export interface IAuthProvider {
  /** 认证提供方类型标识 */
  readonly type: AuthProviderType
  /** 界面友好的提供方名称（如 "Bangumi 账号"、"Animaku 本地账号"） */
  readonly name: string

  /** 从本地凭证恢复会话 */
  restoreSession?(): Promise<UserSession | null>

  /** 登录/绑定鉴权 */
  login?(credentials?: unknown): Promise<UserSession>

  /** 登出/解绑鉴权 */
  logout?(): Promise<void>

  /** 获取或刷新最新用户资料 */
  fetchProfile?(token: string): Promise<UserProfile>
}

/** 默认匿名/未登录访客资料 */
export const GUEST_USER_PROFILE: Readonly<UserProfile> = Object.freeze({
  id: 'guest',
  username: 'guest',
  nickname: '未登录',
  provider: 'guest',
})

/** 判断是否为访客（未登录） */
export function isGuestUser(profile?: UserProfile | null): boolean {
  if (!profile) return true
  return profile.provider === 'guest' || profile.id === 'guest'
}
