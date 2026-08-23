import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class TopErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[TopErrorBoundary] Uncaught error:', error, errorInfo)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-lg p-6 text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle size={48} className="text-red-400" />
            </div>
            <h1 className="text-lg font-semibold text-slate-200 mb-2">
              Application Error
            </h1>
            <p className="text-sm text-slate-400 mb-4">
              The dashboard encountered an unexpected error and cannot continue.
            </p>
            <div className="text-xs text-red-400 bg-red-950/30 px-3 py-2 mb-4 font-mono break-all rounded">
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded transition-colors"
            >
              <RotateCcw size={16} />
              Reload Application
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
