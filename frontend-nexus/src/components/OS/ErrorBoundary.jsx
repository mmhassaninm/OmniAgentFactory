import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div className="flex flex-col items-center justify-center w-screen h-screen bg-[#050810] text-red-500 font-mono p-8 selection:bg-red-500/30">
                    <div className="bg-red-500/10 border border-red-500/50 p-6 rounded-xl max-w-2xl w-full shadow-2xl backdrop-blur-md">
                        <h1 className="text-2xl font-black mb-4 flex items-center gap-3">
                            <span className="text-3xl">⚠️</span> Fatal NexusOS UI Crash
                        </h1>
                        <p className="text-slate-300 mb-4 whitespace-pre-wrap">
                            {this.state.error?.toString()}
                        </p>
                        <div className="bg-black/40 p-4 rounded-lg overflow-auto max-h-[40vh] text-xs text-slate-400 border border-white/5">
                            {this.state.errorInfo?.componentStack}
                        </div>
                        <button
                            className="mt-6 px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold transition-colors"
                            onClick={() => window.location.reload()}
                        >
                            Reboot Interface
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
