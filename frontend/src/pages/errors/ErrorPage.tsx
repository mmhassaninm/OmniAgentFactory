import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
    ArrowLeft,
    Home,
    RefreshCw,
    ChevronDown,
    Copy,
} from 'lucide-react'
import { getErrorConfig, errorColorMap, type ErrorCode } from '../../config/errorConfig'
import { generateErrorId } from '../../lib/errorId'

interface ErrorPageProps {
    code?: ErrorCode
    title?: string
    message?: string
    detail?: string
    showBackButton?: boolean
    showHomeButton?: boolean
    onRetry?: () => void
    errorId?: string
    retryAfterSeconds?: number
    fullPage?: boolean
}

export default function ErrorPage({
    code = 500,
    title,
    message,
    detail,
    showBackButton = true,
    showHomeButton = true,
    onRetry,
    errorId,
    retryAfterSeconds,
    fullPage = true,
}: ErrorPageProps) {
    const navigate = useNavigate()
    const config = getErrorConfig(code)
    const colors = errorColorMap[config.color]
    const [showDetail, setShowDetail] = useState(false)
    const [copied, setCopied] = useState(false)
    const [retryCountdown, setRetryCountdown] = useState(retryAfterSeconds || 0)
    const [isRetrying, setIsRetrying] = useState(false)

    // Generate unique error ID if not provided
    const displayErrorId = errorId || generateErrorId()
    const displayTitle = title || config.title
    const displayMessage = message || config.message

    // Retry countdown for 429 errors
    useEffect(() => {
        if (!retryAfterSeconds || retryAfterSeconds <= 0) return
        setRetryCountdown(retryAfterSeconds)
        const interval = setInterval(() => {
            setRetryCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(interval)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(interval)
    }, [retryAfterSeconds])

    const handleRetry = useCallback(async () => {
        if (!onRetry) return
        setIsRetrying(true)
        try {
            await onRetry()
        } finally {
            setIsRetrying(false)
        }
    }, [onRetry])

    const handleCopyErrorId = useCallback(() => {
        navigator.clipboard.writeText(displayErrorId)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [displayErrorId])

    // Animation variants
    const iconVariants: Variants = {
        float: {
            y: [0, -10, 0],
            transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
        },
        pulse: {
            scale: [1, 1.1, 1],
            opacity: [0.8, 1, 0.8],
            transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
        },
        shake: {
            x: [0, -5, 5, -5, 5, 0],
            transition: { duration: 0.5, repeat: Infinity, repeatDelay: 3 },
        },
        bounce: {
            y: [0, -15, 0],
            transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
        },
        fade: {
            opacity: [0.5, 1, 0.5],
            transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
        },
    }

    const IconComponent = config.icon

    const content = (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={`flex flex-col items-center text-center max-w-lg mx-auto ${fullPage ? 'p-8' : 'p-6'}`}
        >
            {/* Animated Icon */}
            <div className="relative mb-8">
                {/* Glow ring */}
                <div className={`absolute inset-0 rounded-full ${colors.bg} blur-xl animate-pulse`} />
                <motion.div
                    variants={iconVariants}
                    animate={config.animation as string}
                    className={`relative w-24 h-24 rounded-2xl ${colors.bg} border ${colors.border} ${colors.glow} flex items-center justify-center`}
                >
                    <IconComponent size={48} className={colors.icon} />
                </motion.div>
            </div>

            {/* Error Code */}
            <h1 className={`text-8xl font-black font-mono ${colors.text} leading-none mb-4 tracking-tighter`}>
                {code}
            </h1>

            {/* Title */}
            <h2 className="text-2xl font-bold text-[#f0f4f8] mb-3">
                {displayTitle}
            </h2>

            {/* Message */}
            <p className="text-sm text-[#94a3b8] leading-relaxed mb-6 max-w-md">
                {displayMessage}
            </p>

            {/* Error ID & Timestamp */}
            <div className="flex items-center gap-2 mb-6">
                <button
                    onClick={handleCopyErrorId}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors group"
                    title="Copy error ID"
                >
                    <span className="text-[10px] font-mono text-[#64748b] group-hover:text-[#94a3b8] transition-colors">
                        {displayErrorId}
                    </span>
                    {copied ? (
                        <span className="text-[9px] text-emerald-400 font-bold">Copied!</span>
                    ) : (
                        <Copy size={10} className="text-[#475569] group-hover:text-[#64748b]" />
                    )}
                </button>
            </div>

            <div className="text-[10px] font-mono text-[#475569] mb-6">
                {new Date().toLocaleTimeString()}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 justify-center">
                {config.canRetry && onRetry && (
                    <button
                        onClick={handleRetry}
                        disabled={isRetrying || retryCountdown > 0}
                        className={`px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase font-mono
                            ${colors.bg} ${colors.text} border ${colors.border}
                            hover:opacity-90 active:scale-95 transition-all
                            disabled:opacity-40 disabled:cursor-not-allowed
                            flex items-center gap-2`}
                    >
                        <RefreshCw size={14} className={isRetrying ? 'animate-spin' : ''} />
                        {isRetrying ? 'Retrying...' : retryCountdown > 0 ? `Retry in ${retryCountdown}s` : 'Try Again'}
                    </button>
                )}

                {showBackButton && (
                    <button
                        onClick={() => navigate(-1)}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase font-mono
                            bg-white/[0.04] hover:bg-white/[0.08] text-[#94a3b8] border border-white/[0.06]
                            active:scale-95 transition-all flex items-center gap-2"
                    >
                        <ArrowLeft size={14} />
                        Go Back
                    </button>
                )}

                {showHomeButton && (
                    <button
                        onClick={() => navigate('/')}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase font-mono
                            bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30
                            active:scale-95 transition-all flex items-center gap-2"
                    >
                        <Home size={14} />
                        Dashboard
                    </button>
                )}

                {config.action === 'refresh' && !onRetry && (
                    <button
                        onClick={() => window.location.reload()}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase font-mono
                            bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30
                            active:scale-95 transition-all flex items-center gap-2"
                    >
                        <RefreshCw size={14} />
                        Refresh Page
                    </button>
                )}
            </div>

            {/* Technical Details (collapsible) */}
            {detail && (
                <div className="w-full mt-8">
                    <button
                        onClick={() => setShowDetail(!showDetail)}
                        className="flex items-center gap-2 text-[10px] font-mono text-[#475569] hover:text-[#64748b] transition-colors mx-auto"
                    >
                        <motion.div
                            animate={{ rotate: showDetail ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <ChevronDown size={12} />
                        </motion.div>
                        {showDetail ? 'Hide Technical Details' : 'Technical Details'}
                    </button>

                    <AnimatePresence>
                        {showDetail && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <pre className="mt-3 p-4 rounded-xl bg-[#020408] border border-white/[0.05] text-[10px] font-mono text-[#64748b] text-left whitespace-pre-wrap max-h-48 overflow-y-auto">
                                    {detail}
                                </pre>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </motion.div>
    )

    if (!fullPage) {
        return (
            <div className="flex items-center justify-center h-full w-full bg-transparent">
                {content}
            </div>
        )
    }

    return (
        <div className="min-h-screen w-full bg-[#060a12] flex items-center justify-center relative overflow-hidden">
            {/* Background grid effect */}
            <div className="absolute inset-0 bg-grid opacity-40" />

            {/* Ambient glows */}
            <div className={`absolute top-1/4 left-1/3 w-96 h-96 rounded-full ${colors.bg} blur-[120px] pointer-events-none opacity-30`} />
            <div className={`absolute bottom-1/4 right-1/3 w-96 h-96 rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none`} />

            {/* Content */}
            <div className="relative z-10 w-full">
                {content}
            </div>
        </div>
    )
}