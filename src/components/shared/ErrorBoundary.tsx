import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-8">
          <div className="bg-[#1a1a1a] border border-red-500/20 rounded-2xl p-8 max-w-md w-full flex flex-col items-center gap-4">
            <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white mb-2">Une erreur est survenue</h2>
              <p className="text-sm text-white/40 font-mono break-all">{this.state.error.message}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Recharger la page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
