import React from 'react';

// Phase 32.3: Step 12 - Global Error Boundary
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    backgroundColor: '#450a0a',
                    color: '#fecaca',
                    height: '100vh',
                    width: '100vw',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'system-ui, sans-serif'
                }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>NexusOS Renderer Crash</h1>
                    <p>A fatal React error occurred.</p>
                    <pre style={{
                        backgroundColor: '#000',
                        padding: '10px',
                        marginTop: '20px',
                        borderRadius: '5px',
                        overflowX: 'auto',
                        maxWidth: '80%',
                        fontSize: '12px'
                    }}>
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                    <button
                        style={{
                            marginTop: '20px',
                            padding: '10px 20px',
                            backgroundColor: '#b91c1c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer'
                        }}
                        onClick={() => window.location.reload()}
                    >
                        Reload Interface
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
