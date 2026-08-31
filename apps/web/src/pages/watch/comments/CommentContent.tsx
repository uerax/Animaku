import { memo } from 'react'
import { tokenizeCommentText } from '@animaku/shared'

/**
 * 评论区敏感与外链黑幕遮掩组件 (Comment Redacted Text / Spoiler Bar)
 *
 * 1. 内容保持 100% 原始文本形态，不做超链接或额外格式化改动；
 * 2. 默认状态：黑色遮罩 (color: transparent)，完全隐藏文字内容，防止划词偷看；
 * 3. 鼠标悬浮 (:hover) / 移动端按住 (:active)：文字浮现显示；
 * 4. 鼠标移开：恢复遮罩状态。
 */
export const CommentContent = memo(function CommentContent({
  content,
}: {
  content: string
}) {
  if (!content) return null

  const tokens = tokenizeCommentText(content)

  return (
    <>
      {tokens.map((token, index) => {
        if (!token.redacted || token.type === 'text') {
          return <span key={index}>{token.raw}</span>
        }

        return (
          <span
            key={index}
            className="kz-heimu"
            title="黑幕遮掩（悬浮查看）"
          >
            {token.raw}
          </span>
        )
      })}
    </>
  )
})
