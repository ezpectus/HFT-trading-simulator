import { Component } from 'react'
import { AlertTriangle, RotateCcw, Ban } from 'lucide-react'

export default class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, errorCount: 0 }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState(prev => ({
      errorInfo,
      errorCount: prev.errorCount + 1,
    }))
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleDisable = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, disabled: true })
  }

  render() {
    if (this.state.disabled) {
      const { panelName } = this.props
      return (
        <div className="bg-bg-700  p-2.5 border border-bg-600 opacity-50">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-1">
            <Ban size={12} />
            {panelName || 'Panel'} Disabled
          </div>
          <button
            onClick={() => this.setState({ disabled: false })}
            className="text-[8px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Re-enable
          </button>
        </div>
      )
    }

    if (this.state.hasError) {
      const { panelName } = this.props
      const tooManyErrors = this.state.errorCount >= 3
      return (
        <div className="bg-bg-700  p-2.5 border border-accent-red/20">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
            <AlertTriangle size={12} className="text-accent-red" />
            {panelName || 'Panel'} Error{this.state.errorCount > 1 && ` (${this.state.errorCount}x)`}
          </div>
          <div className="text-[9px] text-accent-red bg-accent-red/5  px-2 py-1 mb-2 font-mono break-all">
            {this.state.error?.message || 'Unknown render error'}
          </div>
          <div className="flex gap-1">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1 text-[8px] text-gray-400 hover:text-gray-300 bg-bg-600 hover:bg-bg-500  px-2 py-0.5 transition-colors"
            >
              <RotateCcw size={9} />
              Retry
            </button>
            {tooManyErrors && (
              <button
                onClick={this.handleDisable}
                className="flex items-center gap-1 text-[8px] text-gray-500 hover:text-gray-400 bg-bg-600 hover:bg-bg-500  px-2 py-0.5 transition-colors"
              >
                <Ban size={9} />
                Disable
              </button>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
