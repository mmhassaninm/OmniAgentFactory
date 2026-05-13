import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Clock, Home, RefreshCw, AlertCircle } from 'lucide-react'

interface PageLoaderProps {
    name: string
    progress?: number
    message?: string
    timeout?: number // seconds before showing timeout UI (default: 10)
    onRetry?: () => void
    children?: React.ReactNode
}

export default function PageLoader({
    name,
    progress,
    message,
    timeout = 10,
    onRetry,
    children,
}: PageLoaderProps) {
    const navigate = useNavigate()
    const [elapsed, setElapsed] = useState(0)
    const [isTimeout, setIsTimeout] = useState(false)
    const [isSlow, setIsSlow] = useState(false)
    const [counter, setCounter] = useState(0)
    const [hasLoaded, setHasLoaded] = useState(false)

    // Set hasLoaded to true shortly after mounting to prevent long-session hijacking
    useEffect(() => {
        const timer = setTimeout(() => {
            setHasLoaded(true)
        }, 1500)
        return () => clearTimeout(timer)
    }, [])

    // Elapsed seconds counter
    useEffect(() => {
        if (hasLoaded) return
        const interval = setInterval(() => {
            setCounter(prev => prev + 1)
        }, 1000)
        return () => clearInterval(interval)
    }, [hasLoaded])

    useEffect(() => {
        if (hasLoaded) return
        setElapsed(counter)
        if (counter >= timeout && !isTimeout) {
            setIsTimeout(true)
        }
        if (counter >= 3 && !isSlow) {
            setIsSlow(true)
        }
    }, [counter, timeout, isTimeout, isSlow, hasLoaded])


    const handleRetry = useCallback(() => {
        setCounter(0)
        setIsTimeout(false)
        setIsSlow(false)
        if (onRetry) onRetry()
    }, [onRetry])

    // If we timed out, show the timeout UI
    if (isTimeout) {
        return (
            <div className="flex items-center justify-center h-full w-full min-h-[300px] bg-[#060a12]">
                <div className="flex flex-col items-center text-center max-w-sm p-8">
                    {/* Clock icon */}
                    <div className="relative mb-6">
                        <div className="absolute inset-0 rounded-full bg-orange-500/10 blur-xl animate-pulse" />
                        <div className="relative w-20 h-20 rounded-2xl bg-orange-500/10 border border-orange-500/30 shadow-[0_0_30px_rgba(255,140,0,0.1)] flex items-center justify-center">
                            <Clock size={40} className="text-orange-400 animate-pulse" />
                        </div>
                    </div>

                    <h2 className="text-lg font-bold text-[#f0f4f8] mb-2">
                        Taking longer than expected...
                    </h2>

                    <p className="text-sm text-[#94a3b8] mb-6 leading-relaxed">
                        {name} is still loading. The backend might be starting up or experiencing high load.
                        ({elapsed}s elapsed)
                    </p>

                    {/* Backend status indicator */}
                    <div className="flex items-center gap-2 mb-6 px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_#f59e0b]" />
                        <span className="text-[10px] font-mono text-[#64748b]">Backend status: Checking...</span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-3 justify-center">
                        {onRetry && (
                            <button
                                onClick={handleRetry}
                                className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase font-mono
                                    bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30
                                    active:scale-95 transition-all flex items-center gap-2"
                            >
                                <RefreshCw size={14} />
                                Retry
                            </button>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase font-mono
                                bg-white/[0.04] hover:bg-white/[0.08] text-[#94a3b8] border border-white/[0.06]
                                active:scale-95 transition-all flex items-center gap-2"
                        >
                            <RefreshCw size={14} />
                            Refresh
                        </button>

                        <button
                            onClick={() => navigate('/')}
                            className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase font-mono
                                bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30
                                active:scale-95 transition-all flex items-center gap-2"
                        >
                            <Home size={14} />
                            Go Home
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Show children if done loading
    if (children) {
        return <>{children}</>
    }

    // Default loading UI
    return (
        <div className="flex flex-col items-center justify-center h-full w-full min-h-[300px] bg-[#060a12] gap-4 p-8">
            {/* Spinner */}
            <div className="relative">
                <div className="absolute inset-0 rounded-full bg-cyan-500/10 blur-xl animate-pulse" />
                <div className="relative w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_30px_rgba(0,212,255,0.1)] flex items-center justify-center">
                    <Loader2 size={32} className="text-cyan-400 animate-spin" />
                </div>
            </div>

            {/* Loading message */}
            <div className="text-center">
                <p className="text-sm font-bold text-[#f0f4f8]">
                    {message || `Loading ${name}...`}
                </p>
            </div>

            {/* Progress bar */}
            {progress !== undefined && (
                <div className="w-full max-w-xs">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-[#64748b]">{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Slow warning */}
            {isSlow && !isTimeout && (
                <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <Clock size={12} className="text-amber-400" />
                    <span className="text-[10px] font-mono text-amber-400">Loading... ({elapsed}s)</span>
                </div>
            )}
        </div>
    )
}