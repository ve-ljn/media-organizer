import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '40px', color: '#ff5555', fontFamily: 'monospace', background: '#141414', height: '100vh' }}>
          <h2 style={{ marginBottom: '12px' }}>Something went wrong</h2>
          <pre style={{ color: '#888', fontSize: '12px', marginBottom: '24px', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: '8px 16px', background: '#1e1e1e', border: '1px solid #333', color: '#ccc', borderRadius: '6px', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
