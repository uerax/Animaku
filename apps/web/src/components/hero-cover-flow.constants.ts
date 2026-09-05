import type { CSSProperties } from 'react'

/**
 * 3D Cover Flow 共享视口与透视常量
 */
export const HERO_PERSPECTIVE = {
  desktop: '1700px',
  mobile: '1200px',
} as const

export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'

/**
 * 舞台最外层包裹样式（负责上下自然渐变羽化与水平边界内边距）
 */
export const HERO_SECTION_WRAPPER_CLASS =
  'relative -mx-4 overflow-hidden touch-pan-y px-4 pt-6 pb-6 sm:mx-0 sm:px-6 sm:pt-8 sm:pb-8'

/**
 * 3D 舞台容器类名（严格锁定多端高度断点与最大宽度）
 */
export const HERO_STAGE_CONTAINER_CLASS =
  'relative mx-auto flex h-[270px] w-full items-center justify-center sm:h-[340px] md:h-[370px] lg:h-[390px] xl:h-[410px] max-w-5xl lg:max-w-6xl xl:max-w-[1360px] 2xl:max-w-[1480px]'

/**
 * 单个海报卡片基础几何类名（锁定 2:3 宽高比与圆角尺寸）
 */
export const HERO_CARD_DIMENSIONS_CLASS =
  'absolute top-3 bottom-3 sm:top-4 sm:bottom-4 flex aspect-[2/3] items-center justify-center overflow-hidden rounded-2xl sm:rounded-3xl shadow-xl [isolation:isolate]'

/**
 * 骨架屏立体渲染卡片的偏移列表（中央聚焦 + 左右各 2 张透视卡片）
 */
export const HERO_SKELETON_OFFSETS = [-2, -1, 0, 1, 2] as const

/**
 * 核心 3D 变换样式计算函数（共享给真实轮播与拟真骨架屏）
 * 集中管理 transform / zIndex / opacity / pointerEvents，防止双端配置漂移
 */
export function getHeroCardTransformStyle(
  offset: number,
  isDesktop: boolean,
): CSSProperties {
  if (offset === 0) {
    return {
      transform: 'translateX(0%) scale(1.08) translateZ(48px)',
      zIndex: 30,
      opacity: 1,
    }
  }

  if (isDesktop) {
    switch (offset) {
      case -1:
        return {
          transform:
            'translateX(-90%) scale(0.90) rotateY(15deg) translateZ(10px)',
          zIndex: 22,
          opacity: 0.88,
        }
      case 1:
        return {
          transform:
            'translateX(90%) scale(0.90) rotateY(-15deg) translateZ(10px)',
          zIndex: 22,
          opacity: 0.88,
        }
      case -2:
        return {
          transform:
            'translateX(-176%) scale(0.76) rotateY(25deg) translateZ(-35px)',
          zIndex: 15,
          opacity: 0.62,
        }
      case 2:
        return {
          transform:
            'translateX(176%) scale(0.76) rotateY(-25deg) translateZ(-35px)',
          zIndex: 15,
          opacity: 0.62,
        }
      case -3:
        return {
          transform:
            'translateX(-256%) scale(0.64) rotateY(33deg) translateZ(-75px)',
          zIndex: 8,
          opacity: 0.36,
        }
      case 3:
        return {
          transform:
            'translateX(256%) scale(0.64) rotateY(-33deg) translateZ(-75px)',
          zIndex: 8,
          opacity: 0.36,
        }
      case -4:
        return {
          transform:
            'translateX(-326%) scale(0.50) rotateY(38deg) translateZ(-115px)',
          zIndex: 2,
          opacity: 0,
          pointerEvents: 'none',
        }
      case 4:
        return {
          transform:
            'translateX(326%) scale(0.50) rotateY(-38deg) translateZ(-115px)',
          zIndex: 2,
          opacity: 0,
          pointerEvents: 'none',
        }
      default:
        return {
          transform: 'translateX(0%) scale(0.3)',
          zIndex: 0,
          opacity: 0,
          pointerEvents: 'none',
        }
    }
  }

  // 移动端排版
  switch (offset) {
    case -1:
      return {
        transform: 'translateX(-58%) scale(0.86) rotateY(16deg) translateZ(0px)',
        zIndex: 20,
        opacity: 0.65,
      }
    case 1:
      return {
        transform: 'translateX(58%) scale(0.86) rotateY(-16deg) translateZ(0px)',
        zIndex: 20,
        opacity: 0.65,
      }
    case -2:
      return {
        transform:
          'translateX(-108%) scale(0.72) rotateY(26deg) translateZ(-40px)',
        zIndex: 10,
        opacity: 0.32,
      }
    case 2:
      return {
        transform:
          'translateX(108%) scale(0.72) rotateY(-26deg) translateZ(-40px)',
        zIndex: 10,
        opacity: 0.32,
      }
    case -3:
      return {
        transform:
          'translateX(-158%) scale(0.58) rotateY(34deg) translateZ(-75px)',
        zIndex: 2,
        opacity: 0,
        pointerEvents: 'none',
      }
    case 3:
      return {
        transform:
          'translateX(158%) scale(0.58) rotateY(-34deg) translateZ(-75px)',
        zIndex: 2,
        opacity: 0,
        pointerEvents: 'none',
      }
    default:
      return {
        transform: 'translateX(0%) scale(0.4)',
        zIndex: 0,
        opacity: 0,
        pointerEvents: 'none',
      }
  }
}
