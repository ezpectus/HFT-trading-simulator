import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      const { panelName } = this.props
      return (
        <div className="bg-bg-700 rounded-lg p-2.5 border border-accent-red/20">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase mb-2">
            <AlertTriangle size={12} className="text-accent-red" />
            {panelName || 'Panel'} Error
          </div>
          <div className="text-[9px] text-accent-red bg-accent-red/5 rounded px-2 py-1 mb-2 font-mono break-all">
            {this.state.error?.message || 'Unknown render error'}
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1 text-[8px] text-gray-400 hover:text-gray-300 bg-bg-600 hover:bg-bg-500 rounded px-2 py-0.5 transition-colors"
          >
            <RotateCcw size={9} />
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
