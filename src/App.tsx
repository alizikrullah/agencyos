import { Component, type ReactNode } from 'react'
import AppRouter from './router/AppRouter'

interface State { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', padding: 32, background: '#0d0e14', color: '#f0f0f5', fontFamily: 'monospace',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444', marginBottom: 16 }}>
            App Error
          </div>
          <div style={{
            background: '#1c1d27', border: '1px solid #ef444440', borderRadius: 8,
            padding: '16px 20px', maxWidth: 700, width: '100%', fontSize: 13,
          }}>
            <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>
              {this.state.error.name}: {this.state.error.message}
            </div>
            <pre style={{ color: '#8b8fa8', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300, overflow: 'auto' }}>
              {this.state.error.stack}
            </pre>
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{ marginTop: 20, padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  )
}
