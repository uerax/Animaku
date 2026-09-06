/**
 * 媒体流并发控制与生命周期追踪器
 *
 * 限制单个 IP 的最大并发媒体流连接数（如多线程抓取、分片刷流等防范），
 * 并通过 ReadableStream 包装确保在客户端断开、流完成或异常时 100% 释放计数。
 */

/** 单 IP 允许的最大并发媒体流连接数 */
export const MAX_CONCURRENT_MEDIA_PER_IP = 8

const activeStreamsPerIp = new Map<string, number>()

/**
 * 尝试为指定 IP 申请一个媒体流并发槽位
 * @returns true 表示槽位申请成功；false 表示超过并发上限
 */
export function acquireStream(ip: string): boolean {
  const current = activeStreamsPerIp.get(ip) || 0
  if (current >= MAX_CONCURRENT_MEDIA_PER_IP) return false
  activeStreamsPerIp.set(ip, current + 1)
  return true
}

/**
 * 释放指定 IP 占用的媒体流并发槽位
 */
export function releaseStream(ip: string): void {
  const current = activeStreamsPerIp.get(ip) || 1
  if (current <= 1) {
    activeStreamsPerIp.delete(ip)
  } else {
    activeStreamsPerIp.set(ip, current - 1)
  }
}

/**
 * 获取指定 IP 当前活跃的媒体流连接数
 */
export function getActiveStreamsForIp(ip: string): number {
  return activeStreamsPerIp.get(ip) || 0
}

/**
 * 清空所有活跃连接记录（用于单元测试重置状态）
 */
export function resetActiveStreams(): void {
  activeStreamsPerIp.clear()
}

/**
 * 包装 Web 标准 ReadableStream，确保在流读取结束、取消或出错时触发释放回调
 */
export function createTrackedStream(
  body: ReadableStream<Uint8Array>,
  onDone: () => void,
): ReadableStream<Uint8Array> {
  let released = false
  const doRelease = () => {
    if (!released) {
      released = true
      onDone()
    }
  }

  const reader = body.getReader()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          doRelease()
          controller.close()
        } else {
          controller.enqueue(value)
        }
      } catch (err) {
        doRelease()
        controller.error(err)
      }
    },
    cancel(reason) {
      doRelease()
      return reader.cancel(reason)
    },
  })
}
