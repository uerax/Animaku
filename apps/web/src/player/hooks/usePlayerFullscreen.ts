import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  canIosVideoFullscreen,
  canRequestDomFullscreen,
  enterIosVideoFullscreen,
  exitDomFullscreen,
  exitIosVideoFullscreen,
  isIosVideoFullscreen,
  isShellFullscreen,
  requestDomFullscreen,
} from '../media/fullscreen'

export interface UsePlayerFullscreenOptions {
  shellRef: RefObject<HTMLDivElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  src?: string
}

export function usePlayerFullscreen({
  shellRef,
  videoRef,
  src,
}: UsePlayerFullscreenOptions) {
  /** player shell Fullscreen API */
  const [playerFs, setPlayerFs] = useState(false)
  /** CSS fill viewport without Fullscreen API (agefans-style webpage FS) */
  const [webFs, setWebFs] = useState(false)

  const playerFsRef = useRef(playerFs)
  playerFsRef.current = playerFs
  const webFsRef = useRef(webFs)
  webFsRef.current = webFs

  /** Try locking or unlocking orientation for landscape mobile fullscreen */
  const tryLockOrientation = (lock: boolean) => {
    if (typeof screen === 'undefined' || !screen.orientation) return
    const ori = screen.orientation as unknown as {
      lock?: (orientation: string) => Promise<void>
      unlock?: () => void
    }
    try {
      if (lock) {
        void ori.lock?.('landscape').catch(() => {
          /* ignore orientation lock refusal */
        })
      } else {
        ori.unlock?.()
      }
    } catch {
      /* ignore */
    }
  }

  // Sync webFs state to document root to isolate stacking context and hide site header
  useEffect(() => {
    if (webFs) {
      document.documentElement.classList.add('kz-has-web-fs')
      document.body.classList.add('kz-has-web-fs')
    } else {
      document.documentElement.classList.remove('kz-has-web-fs')
      document.body.classList.remove('kz-has-web-fs')
    }
    return () => {
      document.documentElement.classList.remove('kz-has-web-fs')
      document.body.classList.remove('kz-has-web-fs')
    }
  }, [webFs])

  // Native fullscreen event listeners
  useEffect(() => {
    const onFs = () => {
      const isFs = isShellFullscreen(shellRef.current)
      setPlayerFs(isFs)
      if (!isFs && !webFsRef.current) {
        tryLockOrientation(false)
      }
    }
    // Standard + legacy webkit (older Safari / iPadOS)
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs as EventListener)

    // iOS native video fullscreen (video.webkitEnterFullscreen)
    const video = videoRef.current
    const onVideoFsBegin = () => {
      setPlayerFs(true)
      tryLockOrientation(true)
    }
    const onVideoFsEnd = () => {
      const isFs = isShellFullscreen(shellRef.current)
      setPlayerFs(isFs)
      if (!isFs && !webFsRef.current) {
        tryLockOrientation(false)
      }
    }
    video?.addEventListener('webkitbeginfullscreen', onVideoFsBegin)
    video?.addEventListener('webkitendfullscreen', onVideoFsEnd)

    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener(
        'webkitfullscreenchange',
        onFs as EventListener,
      )
      video?.removeEventListener('webkitbeginfullscreen', onVideoFsBegin)
      video?.removeEventListener('webkitendfullscreen', onVideoFsEnd)
    }
  }, [src, shellRef, videoRef])

  async function exitAnyFs() {
    setWebFs(false)
    setPlayerFs(false)
    tryLockOrientation(false)
    exitIosVideoFullscreen(videoRef.current)
    try {
      await exitDomFullscreen()
    } catch {
      /* ignore */
    }
  }

  /**
   * Player fullscreen:
   * 1) Standard / webkit Fullscreen API on shell (desktop / iPadOS 15+ often)
   * 2) iOS Safari: only <video> can go native FS via webkitEnterFullscreen
   * 3) Fallback: CSS webpage fullscreen (kz-web-fs) — works when FS API is missing
   */
  async function togglePlayerFs() {
    const shell = shellRef.current
    const video = videoRef.current
    if (!shell) return

    // Already in any fullscreen -> exit directly
    if (webFs || isShellFullscreen(shell) || isIosVideoFullscreen(video)) {
      await exitAnyFs()
      return
    }

    setWebFs(false)

    // Prefer DOM Fullscreen on shell when available (Chrome / desktop Safari / many iPads)
    if (canRequestDomFullscreen(shell)) {
      try {
        await exitDomFullscreen()
        await requestDomFullscreen(shell)
        setPlayerFs(true)
        tryLockOrientation(true)
        return
      } catch (e) {
        console.warn('[player] shell fullscreen failed, trying fallbacks', e)
      }
    }

    // iPhone Safari: only video element supports native fullscreen
    if (canIosVideoFullscreen(video)) {
      try {
        enterIosVideoFullscreen(video!)
        setPlayerFs(true)
        tryLockOrientation(true)
        return
      } catch (e) {
        console.warn('[player] iOS video fullscreen failed', e)
      }
    }

    // Fallback for mobile / restricted browsers: CSS webpage fullscreen
    setWebFs(true)
    tryLockOrientation(true)
  }

  /** Expand player to viewport via CSS (no Fullscreen API) */
  async function toggleWebFs() {
    if (
      webFs ||
      isShellFullscreen(shellRef.current) ||
      isIosVideoFullscreen(videoRef.current)
    ) {
      await exitAnyFs()
      return
    }
    try {
      await exitDomFullscreen()
    } catch {
      /* ignore */
    }
    exitIosVideoFullscreen(videoRef.current)
    setWebFs(true)
    tryLockOrientation(true)
  }

  /** F key / double-click: toggle fullscreen (with iOS / CSS fallbacks) */
  function toggleFs() {
    if (
      webFs ||
      isShellFullscreen(shellRef.current) ||
      isIosVideoFullscreen(videoRef.current)
    ) {
      void exitAnyFs()
    } else {
      void togglePlayerFs()
    }
  }

  return {
    playerFs,
    setPlayerFs,
    webFs,
    setWebFs,
    playerFsRef,
    webFsRef,
    togglePlayerFs,
    toggleWebFs,
    toggleFs,
    exitAnyFs,
  }
}
