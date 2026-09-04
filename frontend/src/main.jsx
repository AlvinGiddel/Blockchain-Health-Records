import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary Caught An Error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#F8FAFC',
          color: '#0F172A',
          fontFamily: 'system-ui, sans-serif',
          padding: '20px',
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: '650px',
            width: '100%',
            padding: '32px',
            borderRadius: '16px',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 16px rgba(11, 37, 69, 0.08)'
          }}>
            <h2 style={{ color: '#ef4444', marginBottom: '12px', fontSize: '1.4rem' }}>Application Encountered An Issue</h2>
            <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '16px', lineHeight: 1.5 }}>
              A temporary interface error occurred. Details below:
            </p>

            <div style={{
              background: '#F1F5F9',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '12px',
              textAlign: 'left',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              color: '#dc2626',
              maxHeight: '180px',
              overflowY: 'auto',
              marginBottom: '20px',
              wordBreak: 'break-all',
              whiteSpace: 'pre-wrap'
            }}>
              {this.state.error ? this.state.error.toString() : 'Unknown Error'}
              {this.state.errorInfo?.componentStack}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null });
                }}
                style={{
                  backgroundColor: '#E2E8F0',
                  color: '#0F172A',
                  border: '1px solid #CBD5E1',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Try Re-rendering
              </button>

              <button
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                }}
                style={{
                  backgroundColor: '#0F766E',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Reset Session & Clear Storage
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { ThemeProvider } from './context/ThemeContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
