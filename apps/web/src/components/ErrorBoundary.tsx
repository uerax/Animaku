import { Component, type ErrorInfo, type ReactNode } from 'react'
import { NotFoundPage } from '../pages/NotFoundPage'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback
      }
      return (
        <div className="min-h-screen bg-[var(--kz-bg)] px-4 py-12 text-[var(--kz-fg)]">
          <NotFoundPage
            type="error"
            title="应用遇到了意外错误"
            description="页面渲染过程中发生异常，您可以尝试重新加载或返回首页。"
            statusCode={500}
            error={this.state.error}
            onRetry={() => {
              this.setState({ error: null })
              window.location.reload()
            }}
          />
        </div>
      )
    }
    return this.props.children
  }
}
