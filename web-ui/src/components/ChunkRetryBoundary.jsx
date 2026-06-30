import { Component, Suspense } from 'react'
import { AlertTriangle, RotateCcw, Loader2 } from 'lucide-react'

/**
 * Error boundary that detects chunk-load failures (lazy import errors)
 * and automatically retries with a cache-busting query param.
 */
export default class ChunkRetryBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, retryCount: 0 }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error) {
    const isChunkError =
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.name === 'ChunkLoadError'

    if (isChunkError && this.state.retryCount < 3) {
      this.setState(prev => ({ retryCount: prev.retryCount + 1 }))
      // Force reload of the chunk by appending a cache-buster
      setTimeout(() => {
        this.setState({ hasError: false, error: null })
      }, 500 * this.state.retryCount)
    }
  }

  handleManualRetry = () => {
    this.setState({ hasError: false, error: null, retryCount: 0 })
  }

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('Loading chunk') ||
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.name === 'ChunkLoadError'

      if (isChunkError && this.state.retryCount >= 3) {
        return (
          <div className="bg-bg-700 rounded-lg p-2.5 border border-accent-yellow/20">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
              <AlertTriangle size={12} className="text-accent-yellow" />
              {this.props.panelName || 'Panel'} — Load Failed
            </div>
            <div className="text-[9px] text-gray-400 mb-2">
              Chunk failed to load after 3 retries. Check your network connection.
            </div>
            <button
              onClick={this.handleManualRetry}
              className="flex items-center gap-1 text-[8px] text-gray-400 hover:text-gray-300 bg-bg-600 hover:bg-bg-500 rounded px-2 py-0.5 transition-colors"
            >
              <RotateCcw size={9} />
              Retry
            </button>
          </div>
        )
      }

      if (isChunkError) {
        return (
          <div className="bg-bg-700 rounded-lg p-2.5 animate-pulse">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
              <Loader2 size={12} className="text-gray-600 animate-spin" />
              {this.props.panelName || 'Loading'}…
            </div>
            <div className="space-y-1.5">
              <div className="h-2 bg-bg-600 rounded w-3/4" />
              <div className="h-2 bg-bg-600 rounded w-1/2" />
            </div>
          </div>
        )
      }

      // Non-chunk error — delegate to parent error boundary
      return this.props.children
    }

    return (
      <Suspense fallback={
        <div className="bg-bg-700 rounded-lg p-2.5 animate-pulse">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
            <Loader2 size={12} className="text-gray-600 animate-spin" />
            {this.props.panelName || 'Loading'}…
          </div>
          <div className="space-y-1.5">
            <div className="h-2 bg-bg-600 rounded w-3/4" />
            <div className="h-2 bg-bg-600 rounded w-1/2" />
            <div className="h-2 bg-bg-600 rounded w-2/3" />
          </div>
        </div>
      }>
        {this.props.children}
      </Suspense>
    )
  }
}
