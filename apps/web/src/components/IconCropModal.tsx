import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'

interface IconCropModalProps {
  imageSrc: string
  fileName: string
  onConfirm: (croppedFile: File, previewUrl: string) => void
  onCancel: () => void
}

export function IconCropModal({
  imageSrc,
  fileName,
  onConfirm,
  onCancel,
}: IconCropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const imageRef = useRef<HTMLImageElement | null>(null)

  // 视口尺寸 (固定正方形 280px)
  const CROP_SIZE = 280

  // 变换状态：缩放比例与中心偏移量
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })

  // 图像原始尺寸
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const img = new Image()
    img.src = imageSrc
    img.onload = () => {
      imageRef.current = img
      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
      setImageLoaded(true)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
  }, [imageSrc])

  // 计算图片基准显示尺寸（等比包含在 CROP_SIZE 内）
  const baseScale =
    imgNaturalSize.w && imgNaturalSize.h
      ? Math.max(CROP_SIZE / imgNaturalSize.w, CROP_SIZE / imgNaturalSize.h)
      : 1

  const currentScale = baseScale * zoom
  const currentDisplayW = imgNaturalSize.w * currentScale
  const currentDisplayH = imgNaturalSize.h * currentScale

  // 拖拽平移事件处理
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setOffset({
      x: dragStartRef.current.offsetX + dx,
      y: dragStartRef.current.offsetY + dy,
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      try {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
    }
  }

  // 滚轮缩放处理
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = -e.deltaY * 0.002
    setZoom((prev) => Math.min(3, Math.max(0.5, Number((prev + delta).toFixed(2)))))
  }

  // 执行最终 Canvas 裁剪渲染与输出 File / Blob
  const handleCropAndConfirm = () => {
    if (!imageRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 启用最高质量双线性/双三次重采样平滑插值
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // 计算源图片映射到最终 512x512 画布中的尺寸与相对原点位置
    const scaleRatio = 512 / CROP_SIZE
    const finalW = currentDisplayW * scaleRatio
    const finalH = currentDisplayH * scaleRatio
    const finalX = (offset.x + (CROP_SIZE - currentDisplayW) / 2) * scaleRatio
    const finalY = (offset.y + (CROP_SIZE - currentDisplayH) / 2) * scaleRatio

    ctx.drawImage(imageRef.current, finalX, finalY, finalW, finalH)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], fileName.replace(/\.[^/.]+$/, '.png'), {
          type: 'image/png',
        })
        const previewUrl = URL.createObjectURL(blob)
        onConfirm(file, previewUrl)
      },
      'image/png',
      1.0,
    )
  }

  return (
    <Modal
      open={true}
      onClose={onCancel}
      ariaLabel="调整与裁切站点图标"
      backdropClassName="bg-black/70 backdrop-blur-sm"
      className="w-full max-w-sm rounded-2xl border border-[var(--kz-border)] bg-[var(--kz-bg)] p-5 shadow-2xl space-y-4"
    >
      <div className="flex items-center justify-between border-b border-[var(--kz-border)]/50 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">✂️</span>
          <h3 className="text-sm font-bold text-[var(--kz-fg)]">调整与裁切站点图标</h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] text-lg leading-none cursor-pointer"
          aria-label="关闭"
        >
          ×
        </button>
      </div>

      <p className="text-[11px] text-[var(--kz-fg-muted)]">
        拖拽平移图片，拖动滑块缩放，将核心 Logo / 头像对齐至正中央。
      </p>

      {/* 裁切预览视口 */}
      <div className="flex justify-center">
        <div
          ref={containerRef}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ width: CROP_SIZE, height: CROP_SIZE }}
          className="relative overflow-hidden rounded-2xl border-2 border-dashed border-[var(--kz-accent)]/80 bg-neutral-900/60 cursor-grab active:cursor-grabbing select-none touch-none shadow-inner"
        >
          {imageLoaded && (
            <img
              src={imageSrc}
              alt="Crop preview"
              draggable={false}
              style={{
                width: `${currentDisplayW}px`,
                height: `${currentDisplayH}px`,
                transform: `translate(${offset.x + (CROP_SIZE - currentDisplayW) / 2}px, ${
                  offset.y + (CROP_SIZE - currentDisplayH) / 2
                }px)`,
                maxWidth: 'none',
              }}
              className="absolute pointer-events-none will-change-transform"
            />
          )}

          {/* 辅助参考网格与圆形取景遮罩 */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* 圆形取景示意虚线圈 */}
            <div className="h-[92%] w-[92%] rounded-full border border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            {/* 中心十字辅助线 */}
            <div className="absolute h-3 w-[1px] bg-white/50" />
            <div className="absolute h-[1px] w-3 bg-white/50" />
          </div>
        </div>
      </div>

      {/* 缩放滑动控制 */}
      <div className="space-y-1.5 px-2">
        <div className="flex justify-between text-[11px] text-[var(--kz-fg-muted)]">
          <span>缩放大小</span>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
            className="text-xs text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] p-1 cursor-pointer"
          >
            🔍-
          </button>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full accent-[var(--kz-accent)] cursor-pointer"
          />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
            className="text-xs text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] p-1 cursor-pointer"
          >
            🔍+
          </button>
        </div>
      </div>

      {/* 底部操作按钮 */}
      <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--kz-border)]/50">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-[var(--kz-border)] bg-[var(--kz-bg-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--kz-fg-muted)] hover:text-[var(--kz-fg)] transition-colors cursor-pointer"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleCropAndConfirm}
          className="rounded-xl bg-[var(--kz-accent)] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[var(--kz-accent-hover)] transition-all active:scale-95 cursor-pointer"
        >
          确认裁切并应用
        </button>
      </div>
    </Modal>
  )
}
