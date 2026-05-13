s import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, AlertCircle, Info, CheckCircle2, Clock } from 'lucide-react'
import type { ApiError } from '../lib/apiClient'

// ── Toast Types ───────────────────────────────────────────────────────

export type ToastType = 'error' | 'warning' | 'info' | 'success'

export interface Toast {
    id: string
    type: ToastType
    title: string
    message: string
    autoDismissMs?: number
    retryAfter?: number
    onRetry?: () => void
    onDismiss?: () => void
}

// ── Toast Color Map ──────────────────────────────────────────────────

const toastColors: Record<ToastType, {
    bg: string
    border: string
    icon: string
    iconBg: string
    text: string
    progress: string
}> = {
    error: {
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        icon: 'text-red-400',
        iconBg: 'bg-red-500/10',
        text: 'text-red-300',
        progress: 'bg-red-500',
    },
    warning: {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        icon: 'text-yellow-400',
        iconBg: 'bg-yellow-500/10',
        text: 'text-yellow-300',
        progress: 'bg-yellow-500',
    },
    info: {
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/30',
        icon: 'text-cyan-400',
        iconBg: 'bg-cyan-500/10',
        text: 'text-cyan-300',
        progress: 'bg-cyan-500',
    },
    success: {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        icon: 'text-emerald-400',
        iconBg: 'bg-emerald-500/10',
        text: 'text-emerald-300',
        progress: 'bg-emerald-500',
    },
}

const toastIcons = {
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
    success: CheckCircle2,
}

// ── Individual Toast ──────────────────────────────────────────────────

interface ToastItemProps {
    toast: Toast
    onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
    const [countdown, setCountdown] = useState(toast.retryAfter || 0)
    const colors = toastColors[toast.type]
    const Icon = toastIcons[toast.type]

    // Auto-dismiss timer
    useEffect(() => {
        if (!toast.autoDismissMs || toast.autoDismissMs <= 0) return
        const timer = setTimeout(() => onDismiss(toast.id), toast.autoDismissMs)
        return () => clearTimeout(timer)
    }, [toast.id, toast.autoDismissMs, onDismiss])

    // Retry-after countdown
    useEffect(() => {
        if (!toast.retryAfter || toast.retryAfter <= 0) return
        setCountdown(toast.retryAfter)
        const interval = setInterval(() => {
            setCountdown(prev => Math.max(0, prev - 1))
        }, 1000)
        return () => clearInterval(interval)
    }, [toast.retryAfter])

    return (
        <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`w-full max-w-sm ${colors.bg} backdrop-blur-xl border ${colors.border} rounded-xl p-4 shadow-2xl`}
        >
            <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`w-8 h-8 rounded-lg ${colors.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon size={16} className={colors.icon} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <h4 className={`text-xs font-bold ${colors.text} leading-tight`}>
                            {toast.title}
                        </h4>
                        <button
                            onClick={() => onDismiss(toast.id)}
                            className="text-[#475569] hover:text-[#94a3b8] transition-colors shrink-0"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    <p className="text-[10px] font-semibold text-[#94a3b8] mt-1 leading-relaxed">
                        {toast.message}
                    </p>

                    {/* Retry after countdown */}
                    {countdown > 0 && (
                        <div className="flex items-center gap-1.5 mt-2">
                            <Clock size={10} className="text-[#64748b]" />
                            <span className="text-[9px] font-mono text-[#64748b]">
                                Retry in: {String(Math.floor(countdown / 60)).padStart(2, '0')}:{String(countdown % 60).padStart(2, '0')}
                            </span>
                        </div>
                    )}

                    {/* Retry button */}
                    {toast.onRetry && (
                        <button
                            onClick={toast.onRetry}
                            disabled={countdown > 0}
                            className={`mt-2 px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider font-mono
                                ${colors.bg} ${colors.text} border ${colors.border}
                                hover:opacity-90 active:scale-95 transition-all
                                disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            {countdown > 0 ? `Wait ${countdown}s` : 'Retry'}
                        </button>
                    )}
                </div>
            </div>

            {/* Progress bar for auto-dismiss */}
            {toast.autoDismissMs && toast.autoDismissMs > 0 && (
                <motion.div
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: toast.autoDismissMs / 1000, ease: 'linear' }}
                    className={`h-0.5 mt-3 rounded-full ${colors.progress} origin-left`}
                />
            )}
        </motion.div>
    )
}

// ── Toast Container ───────────────────────────────────────────────────

interface ErrorToastContainerProps {
    toasts: Toast[]
    onDismiss: (id: string) => void
}

export function ErrorToastContainer({ toasts, onDismiss }: ErrorToastContainerProps) {
    return (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
            <AnimatePresence>
                {toasts.map(t => (
                    <div key={t.id} className="pointer-events-auto">
                        <ToastItem toast={t} onDismiss={onDismiss} />
                    </div>
                ))}
            </AnimatePresence>
        </div>
    )
}

// ── Helper to convert ApiError → Toast ────────────────────────────────

export function apiErrorToToast(error: ApiError): Toast {
    const type: ToastType = error.status >= 500 ? 'error' : error.status === 429 ? 'warning' : 'warning'
    return {
        id: error.errorId,
        type,
        title: error.code === 'NetworkError' ? 'Connection Error' : `Error ${error.status}`,
        message: error.message,
        autoDismissMs: type === 'warning' ? 8000 : 0, // Don't auto-dismiss errors
        retryAfter: error.retryAfter,
        onRetry: error.status === 429 ? undefined : undefined, // Could wire up retry logic
    }
}