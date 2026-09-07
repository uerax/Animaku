export interface DanmakuDropOverlayProps {
  active: boolean
}

export function DanmakuDropOverlay({ active }: DanmakuDropOverlayProps) {
  if (!active) return null

  return (
    <div className="kz-drop-overlay">松开以加载本地视频或弹幕 XML</div>
  )
}
