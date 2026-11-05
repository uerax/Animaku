import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { bangumiOAuthUrl } from '@animaku/shared'
import { Modal } from './Modal'
import { KzButton, KzInput } from './ui'
import { useAuthStore } from '../stores/auth'
import { useSiteBranding } from '../lib/site-branding'

/**
 * 随机生成 4 位验证码
 */
function generateRandomCaptcha(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let res = ''
  for (let i = 0; i < 4; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return res
}

/**
 * 萌系猫咪头像 SVG（参考设计图顶部圆形猫咪图标）
 */
function CuteCatAvatar({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <div
      className={`relative rounded-full p-1 bg-gradient-to-b from-pink-50 to-pink-100 dark:from-pink-950/40 dark:to-neutral-900 border-2 border-pink-200/80 dark:border-pink-800/40 shadow-sm flex items-center justify-center shrink-0 ${className}`}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full drop-shadow-xs"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 猫耳外侧 */}
        <polygon points="20,40 12,12 42,24" fill="#FFE4E8" stroke="#F48FB1" strokeWidth="2.5" strokeLinejoin="round" />
        <polygon points="80,40 88,12 58,24" fill="#FFE4E8" stroke="#F48FB1" strokeWidth="2.5" strokeLinejoin="round" />
        {/* 猫耳内耳 */}
        <polygon points="23,36 18,18 38,25" fill="#F8BBD0" />
        <polygon points="77,36 82,18 62,25" fill="#F8BBD0" />
        {/* 头部圆轮廓 */}
        <ellipse cx="50" cy="55" rx="38" ry="34" fill="#FFFFFF" stroke="#F48FB1" strokeWidth="2.5" />
        {/* 头顶毛发微小装饰 */}
        <path d="M47,23 Q50,18 53,23" stroke="#F48FB1" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* 腮红 */}
        <circle cx="27" cy="62" r="6.5" fill="#FF80AB" opacity="0.45" />
        <circle cx="73" cy="62" r="6.5" fill="#FF80AB" opacity="0.45" />
        {/* 眼睛（灵动开心弧度） */}
        <circle cx="36" cy="52" r="4.2" fill="#4A1525" />
        <circle cx="34.5" cy="50.5" r="1.5" fill="#FFFFFF" />
        <circle cx="64" cy="52" r="4.2" fill="#4A1525" />
        <circle cx="62.5" cy="50.5" r="1.5" fill="#FFFFFF" />
        {/* 鼻子 */}
        <polygon points="48,60 52,60 50,62.5" fill="#F06292" />
        {/* 嘴巴（小猫 W 微笑） */}
        <path
          d="M44,64 Q47,68 50,64 Q53,68 56,64"
          fill="none"
          stroke="#4A1525"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* 胡须 */}
        <line x1="16" y1="57" x2="26" y2="59" stroke="#F48FB1" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="15" y1="64" x2="25" y2="63" stroke="#F48FB1" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="84" y1="57" x2="74" y2="59" stroke="#F48FB1" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="85" y1="64" x2="75" y2="63" stroke="#F48FB1" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function LoginModal() {
  const isOpen = useAuthStore((s) => s.isLoginModalOpen)
  const closeModal = useAuthStore((s) => s.closeLoginModal)
  const login = useAuthStore((s) => s.login)
  const b = useSiteBranding()

  // 选项卡：'bangumi' 为默认的 Bangumi Token，'account' 为账号密码
  const [activeTab, setActiveTab] = useState<'bangumi' | 'account'>('bangumi')

  // Bangumi Token 表单状态
  const [tokenInput, setTokenInput] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // 账号登录表单占位状态
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [captchaCode, setCaptchaCode] = useState(() => generateRandomCaptcha())

  // 轻提示 Toast 状态
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
  }

  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => {
      setToastMessage(null)
    }, 2800)
    return () => clearTimeout(timer)
  }, [toastMessage])

  // 打开弹窗时重置错误与刷新验证码
  useEffect(() => {
    if (isOpen) {
      setLoginError(null)
      setCaptchaCode(generateRandomCaptcha())
      setCaptcha('')
    }
  }, [isOpen])

  // Bangumi Token 登录提交
  const handleBangumiLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = tokenInput.trim()
    if (!trimmed) {
      setLoginError('请输入有效的 Access Token')
      return
    }

    setLoginLoading(true)
    setLoginError(null)
    try {
      await login(trimmed, 'bangumi')
      setTokenInput('')
      closeModal()
    } catch (err: unknown) {
      let msg = 'Token 校验失败，请检查后重试'
      if (err instanceof Error) {
        if (
          err.message.includes('Unauthorized') ||
          err.message.includes('need Login') ||
          err.message.includes('expired')
        ) {
          msg = 'Token 无效或已过期，请检查后重试'
        } else {
          msg = err.message
        }
      }
      setLoginError(msg)
    } finally {
      setLoginLoading(false)
    }
  }

  // 账号登录占位提交
  const handleAccountLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!account.trim()) {
      showToast('请输入账号或已绑定邮箱')
      return
    }
    if (!password) {
      showToast('请输入密码')
      return
    }
    if (!captcha.trim()) {
      showToast('请输入验证码')
      return
    }
    // 暂未开放自建账号请求出口，友好提示切换到 Bangumi Token
    showToast('自建账号系统建设中，请使用 Bangumi 令牌登录')
  }

  return (
    <Modal
      open={isOpen}
      onClose={closeModal}
      ariaLabel="登录与账号绑定"
      containerClassName="p-4"
      className="w-full max-w-[390px]"
    >
      <div className="relative w-full rounded-3xl border border-[var(--kz-border)] bg-[var(--kz-bg-elevated)] p-5 sm:p-6 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10 transition-all overflow-hidden">
        {/* 轻提示浮层 */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-neutral-900/90 dark:bg-white/95 px-4 py-2 text-xs font-semibold text-white dark:text-neutral-900 shadow-xl border border-white/10 dark:border-black/10 select-none whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5 text-pink-400 dark:text-pink-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 右上角关闭按钮 */}
        <button
          type="button"
          onClick={closeModal}
          className="absolute right-5 top-5 rounded-full p-1.5 text-[var(--kz-fg-muted)] hover:bg-[var(--kz-bg-hover)] hover:text-[var(--kz-fg)] transition-all cursor-pointer active:scale-90"
          aria-label="关闭控制面板"
        >
          <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 顶部萌宠头像 */}
        <div className="flex justify-center">
          <CuteCatAvatar className="w-[72px] h-[72px]" />
        </div>

        {/* 标题与欢迎语 */}
        <div className="text-left mt-4 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--kz-fg)]">
            欢迎回到{b.productName || 'Kazumi'}
          </h2>
          <p className="mt-1 text-xs sm:text-[13px] text-[var(--kz-fg-muted)] leading-relaxed">
            登录后，收藏喜欢的番剧，参与评分与讨论。
          </p>
        </div>

        {/* 切换药丸 (Pill Tabs) */}
        <div className="flex p-1 rounded-full bg-[var(--kz-bg-soft)] border border-[var(--kz-border)]/60 mb-5 select-none">
          <button
            type="button"
            onClick={() => {
              setActiveTab('bangumi')
              setLoginError(null)
            }}
            className={`flex-1 py-1.5 text-xs sm:text-sm font-semibold rounded-full transition-all duration-200 cursor-pointer ${
              activeTab === 'bangumi'
                ? 'bg-[var(--kz-accent)] text-white shadow-sm'
                : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]'
            }`}
          >
            Bangumi 令牌
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('account')
              setLoginError(null)
            }}
            className={`flex-1 py-1.5 text-xs sm:text-sm font-semibold rounded-full transition-all duration-200 cursor-pointer ${
              activeTab === 'account'
                ? 'bg-[var(--kz-accent)] text-white shadow-sm'
                : 'text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)]'
            }`}
          >
            账号登录
          </button>
        </div>

        {/* Tab 1: Bangumi Access Token */}
        {activeTab === 'bangumi' && (
          <form onSubmit={handleBangumiLogin} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs sm:text-[13px] font-semibold text-[var(--kz-fg)]">
                  Bangumi Access Token
                </label>
                <a
                  href={bangumiOAuthUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[var(--kz-accent)] hover:underline inline-flex items-center gap-0.5"
                >
                  <span>获取 Token</span>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                </a>
              </div>
              <KzInput
                type="password"
                showPasswordToggle
                data-clarity-mask="True"
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value)
                  if (loginError) setLoginError(null)
                }}
                placeholder="粘贴 Bangumi 个人访问令牌…"
                disabled={loginLoading}
              />
              <p className="mt-1.5 text-[11px] text-[var(--kz-fg-dim)] leading-tight">
                令牌保存在本地浏览器，用于同步个人追番、评分与吐槽。
              </p>
            </div>

            {loginError && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs text-rose-500 flex items-center gap-1.5">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{loginError}</span>
              </div>
            )}

            {/* 登录主按钮 */}
            <KzButton
              type="submit"
              variant="primary"
              loading={loginLoading}
              disabled={!tokenInput.trim()}
              className="w-full mt-2"
            >
              登录
            </KzButton>
          </form>
        )}

        {/* Tab 2: 账号密码与验证码登录（完全还原截图界面，做占位与交互） */}
        {activeTab === 'account' && (
          <form onSubmit={handleAccountLogin} className="space-y-3.5">
            {/* 账号/邮箱 */}
            <div>
              <label className="block text-xs sm:text-[13px] font-semibold text-[var(--kz-fg)] mb-1">
                账号 / 邮箱
              </label>
              <KzInput
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="请输入账号或已绑定邮箱"
              />
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-xs sm:text-[13px] font-semibold text-[var(--kz-fg)] mb-1">
                密码
              </label>
              <KzInput
                type="password"
                showPasswordToggle
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
              />
            </div>

            {/* 验证码 */}
            <div>
              <label className="block text-xs sm:text-[13px] font-semibold text-[var(--kz-fg)] mb-1">
                验证码
              </label>
              <div className="flex items-center gap-2">
                <KzInput
                  type="text"
                  maxLength={6}
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                  placeholder="验证码"
                  containerClassName="min-w-0 flex-1"
                />
                {/* 仿制彩色图形验证码块，点击刷新 */}
                <button
                  type="button"
                  onClick={() => setCaptchaCode(generateRandomCaptcha())}
                  title="点击更换验证码"
                  className="w-24 sm:w-28 h-9 sm:h-10 shrink-0 rounded-xl border border-pink-200/60 dark:border-pink-900/40 bg-gradient-to-r from-pink-50 via-rose-50 to-purple-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900 flex items-center justify-center cursor-pointer select-none shadow-xs group"
                >
                  <span className="font-serif italic text-base sm:text-lg tracking-widest text-[#881743] dark:text-[#f48fb1] font-black group-hover:scale-105 transition-transform">
                    {captchaCode}
                  </span>
                </button>
              </div>
            </div>

            {/* 登录按钮 */}
            <KzButton
              type="submit"
              variant="primary"
              className="w-full mt-2"
            >
              登录
            </KzButton>
          </form>
        )}

        {/* 底部注册引导 */}
        <div className="mt-5 text-center text-xs sm:text-[13px] text-[var(--kz-fg-muted)] select-none">
          <span>还没有账号？</span>{' '}
          <button
            type="button"
            onClick={() => showToast('目前不支持新用户注册')}
            className="font-semibold text-[var(--kz-accent)] hover:underline inline-flex items-center gap-0.5 cursor-pointer ml-1"
          >
            <span>注册账号</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
