/** Shared control-bar SVG icons (desktop + mobile). */

export function IconBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

export function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  )
}

export function IconPause() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5h3v14H7V5zm7 0h3v14h-3V5z" />
    </svg>
  )
}

export function IconPrev() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z" />
    </svg>
  )
}

export function IconNext() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 6h2v12h-2V6zM6 6v12l8.5-6L6 6z" />
    </svg>
  )
}

// zakoni 客户端高精工 Bilibili 官方矢量底模（包含 TV 屏外框、居中矢量「弹」字与猫耳）
const BILI_SETTINGS_PATH =
  'M15.645 4.881 L16.705 3.408 A0.998 0.998 0 1 0 15.083 2.242 L13.22 4.835 A110.67 110.67 0 0 0 12.120 4.828 L11.989 4.828 C11.519 4.828, 11.014 4.832, 10.474 4.840 L8.783 2.3 A0.998 0.998 0 0 0 7.120 3.408 L8.108 4.892 C7.420 4.911, 6.690 4.934, 5.920 4.961 A4.013 4.013 0 0 0 2.090 8.401 C1.925 9.551, 1.845 10.946, 1.845 12.586 C1.845 14.551, 1.960 16.256, 2.195 17.702 A4.012 4.012 0 0 0 5.958 21.065 C7.861 21.159, 9.275 21.206, 11.471 21.206 A0.988 0.988 0 0 0 11.471 19.231 A97.58 97.58 0 0 1 6.055 19.092 A2.037 2.037 0 0 1 4.145 17.384 C3.929 16.060, 3.820 14.460, 3.820 12.586 C3.820 11.023, 3.896 9.722, 4.045 8.682 C4.185 7.705, 5.005 6.969, 5.990 6.935 C8.434 6.848, 10.455 6.805, 12.053 6.804 C13.651 6.804, 15.673 6.848, 18.117 6.934 C19.077 6.968, 19.827 7.744, 19.972 8.748 C20.047 9.272, 20.085 10.710, 20.113 11.813 L20.113 11.815 C20.118 11.998, 20.123 11.885, 20.127 11.777 C20.131 11.681, 20.135 11.588, 20.138 11.696 A0.987 0.987 0 1 0 22.112 11.627 C22.108 11.522, 22.105 11.618, 22.101 11.717 C22.099 11.773, 22.097 11.829, 22.094 11.852 L22.092 11.862 A0.574 0.574 0 0 1 22.087 11.771 L22.087 11.744 C22.057 10.626, 22.014 9.081, 21.927 8.468 C21.654 6.562, 20.144 5.030, 18.187 4.961 C17.282 4.929, 16.435 4.903, 15.644 4.882 Z M12.532 9.584 L11.225 9.584 L11.225 14.227 L13.425 14.227 L13.425 14.267 L14.076 13.033 C14.189 12.818, 14.357 12.644, 14.558 12.524 L14.558 12.414 L14.793 12.414 C14.930 12.365, 15.076 12.340, 15.226 12.340 L16.779 12.340 L16.779 9.584 L15.515 9.584 A8.5 8.5 0 0 0 16.256 8.179 L15.178 7.798 C14.938 8.429, 14.677 9.028, 14.372 9.584 L12.869 9.584 L13.555 9.279 C13.327 8.778, 13.055 8.320, 12.749 7.885 L11.715 8.233 C12.009 8.625, 12.281 9.072, 12.532 9.583 Z M10.832 15.086 L12.992 15.086 L12.428 16.154 L10.833 16.154 L10.833 15.086 Z M8.334 13.223 L8.486 11.662 L10.446 11.662 L10.446 8.289 L7.277 8.289 L7.277 9.258 L9.325 9.258 L9.325 10.693 L7.485 10.693 L7.179 14.203 L9.433 14.203 C9.433 15.358, 9.390 16.109, 9.313 16.458 C9.237 16.806, 8.933 16.981, 8.388 16.981 C8.083 16.981, 7.778 16.959, 7.495 16.926 L7.789 17.982 L7.850 17.987 C8.132 18.007, 8.396 18.026, 8.660 18.026 C9.651 17.961, 10.207 17.612, 10.337 16.980 C10.447 16.349, 10.512 15.097, 10.512 13.223 L8.334 13.223 Z M13.424 12.423 L13.424 13.273 L12.236 13.273 L12.236 12.423 L13.423 12.423 Z M12.236 11.468 L13.423 11.468 L13.423 10.575 L12.236 10.575 L12.236 11.468 Z M14.558 11.475 L14.558 10.582 L15.799 10.582 L15.799 11.475 L14.558 11.475 Z M15.086 14.232 A1.26 1.26 0 0 1 16.173 13.605 L20.176 13.596 A1.26 1.26 0 0 1 21.270 14.226 L22.991 17.208 C23.217 17.598, 23.216 18.080, 22.990 18.471 L21.247 21.471 A1.26 1.26 0 0 1 20.161 22.099 L16.158 22.108 A1.26 1.26 0 0 1 15.064 21.478 L13.342 18.496 A1.26 1.26 0 0 1 13.344 17.233 L15.086 14.233 Z M17.053 15.090 A1.26 1.26 0 0 0 15.973 15.704 L15.070 17.217 A1.26 1.26 0 0 0 15.068 18.506 L15.953 19.998 C16.180 20.382, 16.593 20.618, 17.039 20.616 L19.231 20.611 A1.26 1.26 0 0 0 20.311 19.996 L21.215 18.478 A1.26 1.26 0 0 0 21.216 17.190 L20.332 15.701 A1.26 1.26 0 0 0 19.246 15.085 L17.053 15.090 Z M19.570 17.850 A1.4 1.4 0 1 1 16.770 17.850 A1.4 1.4 0 0 1 19.570 17.850 Z'

const BILI_TOGGLE_PATH =
  'M11.989 4.828 C11.519 4.828, 11.014 4.832, 10.474 4.840 L8.764 2.274 A1.008 1.008 0 0 0 7.086 3.392 L8.085 4.892 C7.404 4.910, 6.682 4.932, 5.921 4.960 A4.013 4.013 0 0 0 2.091 8.400 C1.926 9.550, 1.846 10.945, 1.846 12.585 C1.846 14.550, 1.961 16.255, 2.196 17.701 A4.012 4.012 0 0 0 5.959 21.064 L6.865 21.110 C8.070 21.173, 8.673 21.205, 10.472 21.205 A0.988 0.988 0 0 0 10.472 19.230 C8.714 19.230, 8.133 19.200, 6.971 19.138 L6.056 19.091 A2.037 2.037 0 0 1 4.146 17.383 C3.930 16.059, 3.821 14.459, 3.821 12.585 C3.821 11.022, 3.897 9.721, 4.046 8.681 C4.186 7.704, 5.006 6.968, 5.991 6.934 C8.435 6.847, 10.456 6.804, 12.054 6.803 C13.652 6.803, 15.674 6.847, 18.118 6.933 C19.078 6.967, 19.828 7.743, 19.973 8.747 C20.048 9.271, 20.086 10.709, 20.114 11.812 L20.114 11.814 C20.124 12.156, 20.131 12.464, 20.139 12.694 A0.987 0.987 0 1 0 22.113 12.626 C22.105 12.400, 22.097 12.103, 22.088 11.770 L22.088 11.743 C22.058 10.625, 22.015 9.080, 21.928 8.467 C21.655 6.561, 20.145 5.029, 18.188 4.960 C17.288 4.928, 16.445 4.902, 15.657 4.882 L16.707 3.422 A1.008 1.008 0 0 0 15.069 2.245 L13.207 4.835 C12.827 4.831, 12.463 4.828, 12.119 4.828 L11.989 4.828 Z M12.510 9.603 L11.190 9.603 L11.190 14.234 L13.412 14.234 L13.412 15.081 L10.794 15.081 L10.794 16.159 L13.412 16.159 L13.415 16.837 C13.775 16.863, 14.129 17.000, 14.425 17.244 L14.535 17.244 L14.535 16.159 L17.229 16.159 L17.229 15.081 L14.534 15.081 L14.534 14.234 L16.800 14.234 L16.800 9.604 L15.524 9.604 A8.59 8.59 0 0 0 16.272 8.184 L15.183 7.800 A14.232 14.232 0 0 1 14.369 9.604 L12.851 9.604 L13.544 9.296 A8.862 8.862 0 0 0 12.730 7.888 L11.685 8.240 C11.982 8.636, 12.257 9.087, 12.510 9.604 Z M8.330 13.167 L8.484 11.682 L10.464 11.682 L10.464 8.294 L7.264 8.294 L7.264 9.274 L9.330 9.274 L9.330 10.704 L7.472 10.704 L7.164 14.157 L9.441 14.157 C9.441 15.323, 9.397 16.082, 9.321 16.434 C9.243 16.786, 8.935 16.962, 8.385 16.962 C8.077 16.962, 7.769 16.940, 7.483 16.907 L7.780 17.974 L7.842 17.979 C8.127 17.999, 8.393 18.019, 8.660 18.019 C9.661 17.952, 10.222 17.600, 10.354 16.962 C10.464 16.324, 10.530 15.059, 10.530 13.167 L8.330 13.167 Z M15.788 13.277 L15.788 12.419 L14.534 12.419 L14.534 13.277 L15.788 13.277 Z M13.412 12.419 L13.412 13.277 L12.213 13.277 L12.213 12.419 L13.413 12.419 Z M12.213 11.473 L13.413 11.473 L13.413 10.571 L12.213 10.571 L12.213 11.473 Z M14.534 11.473 L14.534 10.571 L15.788 10.571 L15.788 11.473 L14.534 11.473 Z'

const CAT_EAR_STROKES_PATH =
  'M4.6 5.0 C5.2 3.6, 6.2 2.6, 7.4 2.3 M19.4 5.0 C18.8 3.6, 17.8 2.6, 16.6 2.3'

const CHECKMARK_PATH = 'M13.8 16.5 L16.0 18.7 L20.8 13.9'

export function IconDanmakuOn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={BILI_TOGGLE_PATH}
        fill="currentColor"
        fillRule="evenodd"
      />
      <path
        d={CAT_EAR_STROKES_PATH}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d={CHECKMARK_PATH}
        stroke="var(--kz-seek-fill, #38bdf8)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconDanmakuSimplify() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={BILI_TOGGLE_PATH}
        fill="currentColor"
        fillRule="evenodd"
      />
      <path
        d={CAT_EAR_STROKES_PATH}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14.5 17.5 H20.5"
        stroke="var(--kz-seek-fill, #38bdf8)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconDanmakuOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g opacity="0.42">
        <path
          d={BILI_TOGGLE_PATH}
          fill="currentColor"
          fillRule="evenodd"
        />
        <path
          d={CAT_EAR_STROKES_PATH}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </g>
      <line
        x1="3"
        y1="3"
        x2="21"
        y2="21"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconDanmakuSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={BILI_SETTINGS_PATH}
        fill="currentColor"
        fillRule="evenodd"
      />
      <path
        d={CAT_EAR_STROKES_PATH}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export const IconDanmaku = IconDanmakuSettings

/** 纯矢量「倍速」字形路径（零系统字体依赖，全平台绝对像素对齐） */
export const BEISU_ICON_PATH =
  'M6.82 8.91 L10.45 8.91 C9.72 7.8, 9.13 6.97, 8.7 6.4 L10.11 5.48 L7.57 5.48 L7.57 2.81 L13.14 2.81 C12.85 2.12, 12.52 1.4, 12.16 0.63 L15.66 0 C16.04 0.72, 16.47 1.66, 16.96 2.81 L22.48 2.81 L22.48 5.48 L19.66 5.48 L21.23 6.38 C20.65 7.17, 20 8.02, 19.3 8.91 L23.32 8.91 L23.32 11.67 L6.82 11.67 Z M13.83 8.23 L12.74 8.91 L16.59 8.91 L15.89 8.46 C16.57 7.59, 17.29 6.59, 18.06 5.48 L11.73 5.48 C12.57 6.53, 13.27 7.45, 13.83 8.23 Z M4.8 0.05 L7.8 0.94 C7.18 2.86, 6.51 4.68, 5.79 6.4 L5.79 23.11 L2.7 23.11 L2.7 12.64 C2.16 13.55, 1.62 14.41, 1.05 15.23 C0.77 13.94, 0.42 12.46, 0 10.8 C2.05 7.57, 3.65 3.98, 4.8 0.05 Z M8.04 23.06 L8.04 13.41 L21.87 13.41 L21.87 23.06 L18.68 23.06 L18.68 21.89 L11.23 21.89 L11.23 23.06 Z M18.68 16.08 L11.23 16.08 L11.23 19.22 L18.68 19.22 Z M41.85 13.43 C43.94 14.45, 45.94 15.48, 47.85 16.55 L46.35 19.01 C44.38 17.8, 42.55 16.75, 40.86 15.84 L40.86 19.5 L37.89 19.5 L37.89 15.61 C36.48 17.08, 34.89 18.26, 33.11 19.15 C32.61 18.32, 31.96 17.43, 31.18 16.48 C33.34 15.84, 35.28 14.75, 37 13.22 L32.33 13.22 L32.33 6.47 L37.89 6.47 L37.89 5.02 L31.54 5.02 L31.54 2.2 L37.89 2.2 L37.89 0.19 L40.86 0.19 L40.86 2.2 L47.29 2.2 L47.29 5.02 L40.86 5.02 L40.86 6.47 L46.44 6.47 L46.44 13.22 L40.86 13.22 L40.86 15.02 Z M35 19.99 C38.13 20.09, 42.48 20.07, 48.06 19.95 C47.61 21.1, 47.23 22.09, 46.93 22.9 C42.37 22.9, 38.17 22.86, 34.32 22.78 C31.95 22.78, 30.07 22.02, 28.68 20.51 C28.05 21.23, 27.2 22.2, 26.12 23.41 L24.81 19.92 C25.43 19.36, 26.17 18.72, 27.01 18 L27.01 11.46 L24.93 11.46 L24.93 8.37 L29.94 8.37 L29.94 18.02 C30.86 19.34, 32.55 19.99, 35 19.99 Z M28.04 0.16 C29.14 1.82, 30.08 3.35, 30.88 4.76 C29.69 5.37, 28.73 5.88, 28 6.28 C27.23 4.69, 26.38 3.11, 25.44 1.55 Z M43.82 8.91 L40.86 8.91 L40.86 10.78 L43.82 10.78 Z M34.96 10.78 L37.89 10.78 L37.89 8.91 L34.96 8.91 Z'

export function IconSpeedText({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 49 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        width: '24px',
        height: '12px',
        flexShrink: 0,
      }}
    >
      <path d={BEISU_ICON_PATH} fillRule="evenodd" />
    </svg>
  )
}

export function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-3.5 h-3.5">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-3.5 h-3.5">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function IconCheck({ className = 'w-3.5 h-3.5' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.15 7.15 0 0 0-1.63-.94l-.36-2.54A.48.48 0 0 0 14 2h-4a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.49.49 0 0 0-.59.22L2.25 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.37 14.5a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.39.3.59.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.41.48.41h4c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
    </svg>
  )
}

export function IconFullscreenExit() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
  )
}

export function IconFullscreen() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
  )
}

export function IconWebFsExit() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V10h14v8zm0-10H5V6h14v2z" />
    </svg>
  )
}

export function IconWebFs() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 3.5h16V6H4v1.5zm0 2V18h16V9.5H4zm2 2h4v1.5H6V11.5zm0 3h7v1.5H6V14.5z" />
    </svg>
  )
}

/** Wide screen / Theater mode toggle (Bilibili-style top full-width cinema) */
export function IconWidescreen() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8zM8.5 13.5l-2-1.5 2-1.5v3zm7 0v-3l2 1.5-2 1.5z" />
    </svg>
  )
}

/** Exit wide screen / Back to standard two-column cinema */
export function IconWidescreenExit() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8zM6.5 10.5l2 1.5-2 1.5v-3zm11 0v3l-2-1.5 2-1.5z" />
    </svg>
  )
}

/** Speaker with waves — volume > 0 */
export function IconVolume() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  )
}

/** Muted speaker */
export function IconVolumeMute() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v4h4l5 4v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
    </svg>
  )
}

/** Stats / Activity for Nerds */
export function IconStats({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  )
}

/** Horizontal mirror flip */
export function IconMirror({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 3v18" strokeDasharray="3 3" />
      <path d="M3 7l5 5-5 5V7z" />
      <path d="M21 7l-5 5 5 5V7z" />
    </svg>
  )
}

/** Loop / Repeat */
export function IconLoop({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

/** Picture-in-Picture */
export function IconPip({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <rect x="12" y="11" width="8" height="7" rx="1" fill="currentColor" />
    </svg>
  )
}

/** Camera / Screenshot */
export function IconCamera({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

/** Copy / Duplicate */
export function IconCopy({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

/** Link */
export function IconLink({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

/** Aspect ratio / Crop */
export function IconAspectRatio({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h2v2H7zM15 7h2v2h-2z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Speed / Gauge */
export function IconSpeed({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 14l3-3" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  )
}

/** Sparkles / Magic / Super Resolution */
export function IconSparkles({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 3l1.912 5.885L20 10l-5.088 3.115L13 21l-1.912-7.885L6 10l6.088-1.115z" />
      <path d="M19 16l.9 1.9 2.1.4-1.6 1.4.5 2.1-1.9-1.1-1.9 1.1.5-2.1-1.6-1.4 2.1-.4z" />
    </svg>
  )
}

/** OP/ED Marker Assistant Icon (Flag / Timeline pin) */
export function IconOpedMarker({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}

/** Close / Cross */
export function IconClose({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

/** Video Source / TV Screen */
export function IconSource({ className = 'w-4 h-4' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
      <polyline points="17 2 12 7 7 2" />
    </svg>
  )
}

export function IconChevronUp({ className = 'w-3.5 h-3.5' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

export function IconChevronDown({ className = 'w-3.5 h-3.5' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function IconReset({ className = 'w-3.5 h-3.5' }: { className?: string } = {}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}