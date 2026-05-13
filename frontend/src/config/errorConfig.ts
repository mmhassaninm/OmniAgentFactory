import type { LucideIcon } from 'lucide-react'
import {
    SearchX,
    ServerCrash,
    ShieldOff,
    Ban,
    Clock,
    Gauge,
    WifiOff,
    Unplug,
    AlertTriangle,
    Bug,
    Timer,
    Lock,
    AlertOctagon,
    FileWarning,
} from 'lucide-react'

export type ErrorCode = number | string

export interface ErrorConfigEntry {
    icon: LucideIcon
    color: 'cyan' | 'red' | 'orange' | 'yellow' | 'purple' | 'emerald' | 'indigo'
    title: string
    message: string
    action: 'go_back_or_home' | 'retry_or_home' | 'refresh' | 'wait_and_retry' | 'retry' | 'auto_retry' | 'contact_support'
    canRetry: boolean
    animation: 'float' | 'pulse' | 'shake' | 'bounce' | 'fade'
    retryAfter?: boolean
    showBackButton?: boolean
    showHomeButton?: boolean
    severity: 'critical' | 'warning' | 'info'
}

const errorConfig: Record<string, ErrorConfigEntry> = {
    // ── HTTP / Route Errors ────────────────────────────────────────────────
    400: {
        icon: FileWarning,
        color: 'orange',
        title: 'Bad Request',
        message: 'The request was malformed or contained invalid data. Please check your input and try again.',
        action: 'go_back_or_home',
        canRetry: true,
        animation: 'shake',
        severity: 'warning',
    },
    401: {
        icon: ShieldOff,
        color: 'orange',
        title: 'Session Expired',
        message: 'Your session has expired or you are not logged in. Please refresh to continue.',
        action: 'refresh',
        canRetry: true,
        animation: 'shake',
        severity: 'warning',
    },
    403: {
        icon: Ban,
        color: 'orange',
        title: 'Access Denied',
        message: 'You don\'t have permission to access this resource. Contact your administrator if you believe this is a mistake.',
        action: 'go_back_or_home',
        canRetry: false,
        animation: 'shake',
        severity: 'warning',
    },
    404: {
        icon: SearchX,
        color: 'cyan',
        title: 'Page Not Found',
        message: 'The page or resource you\'re looking for doesn\'t exist or has been moved.',
        action: 'go_back_or_home',
        canRetry: false,
        animation: 'float',
        severity: 'info',
    },
    408: {
        icon: Timer,
        color: 'orange',
        title: 'Request Timeout',
        message: 'The request took too long to complete. Please check your connection and try again.',
        action: 'retry_or_home',
        canRetry: true,
        animation: 'pulse',
        severity: 'warning',
    },
    429: {
        icon: Gauge,
        color: 'yellow',
        title: 'Rate Limit Exceeded',
        message: 'Too many requests. The AI provider rate limit has been hit. Please wait and retry.',
        action: 'wait_and_retry',
        canRetry: true,
        animation: 'pulse',
        retryAfter: true,
        severity: 'warning',
    },
    500: {
        icon: ServerCrash,
        color: 'red',
        title: 'Server Error',
        message: 'Something went wrong on our end. The system has been notified and we\'re working on it.',
        action: 'retry_or_home',
        canRetry: true,
        animation: 'pulse',
        severity: 'critical',
    },
    502: {
        icon: ServerCrash,
        color: 'red',
        title: 'Bad Gateway',
        message: 'The backend service is currently unreachable. This might be due to maintenance or a temporary outage.',
        action: 'retry_or_home',
        canRetry: true,
        animation: 'pulse',
        severity: 'critical',
    },
    503: {
        icon: AlertOctagon,
        color: 'red',
        title: 'Service Unavailable',
        message: 'The server is currently overloaded or in maintenance mode. Please try again shortly.',
        action: 'retry_or_home',
        canRetry: true,
        animation: 'pulse',
        severity: 'critical',
    },

    // ── App-Level Errors ────────────────────────────────────────────────────
    ChunkLoadError: {
        icon: Bug,
        color: 'red',
        title: 'Application Update',
        message: 'A new version of the application was deployed. Please refresh your browser to get the latest version.',
        action: 'refresh',
        canRetry: true,
        animation: 'bounce',
        severity: 'critical',
    },
    NetworkError: {
        icon: WifiOff,
        color: 'purple',
        title: 'No Connection',
        message: 'Cannot reach the server. Please check your internet connection and try again.',
        action: 'retry',
        canRetry: true,
        animation: 'bounce',
        severity: 'critical',
    },
    WebSocketError: {
        icon: Unplug,
        color: 'orange',
        title: 'Connection Lost',
        message: 'Real-time connection was interrupted. Attempting to reconnect automatically...',
        action: 'auto_retry',
        canRetry: true,
        animation: 'pulse',
        severity: 'warning',
    },
    RenderError: {
        icon: AlertTriangle,
        color: 'red',
        title: 'Something Broke',
        message: 'A component crashed unexpectedly. Please try again or contact support if the problem persists.',
        action: 'retry_or_home',
        canRetry: true,
        animation: 'shake',
        severity: 'critical',
    },
    DataError: {
        icon: FileWarning,
        color: 'orange',
        title: 'Data Error',
        message: 'The API returned unexpected or malformed data. The issue has been logged.',
        action: 'retry_or_home',
        canRetry: true,
        animation: 'shake',
        severity: 'warning',
    },
    TimeoutError: {
        icon: Clock,
        color: 'orange',
        title: 'Loading Timeout',
        message: 'The page took too long to load data. The backend might be starting up or experiencing high load.',
        action: 'retry_or_home',
        canRetry: true,
        animation: 'pulse',
        severity: 'warning',
    },
    AuthExpired: {
        icon: Lock,
        color: 'orange',
        title: 'Authentication Expired',
        message: 'Your authentication token has expired mid-session. Please log in again to continue.',
        action: 'refresh',
        canRetry: true,
        animation: 'shake',
        severity: 'warning',
    },
}

/**
 * Get error configuration for a given error code/type.
 * Falls back to a generic 500-style config for unknown errors.
 */
export function getErrorConfig(code: ErrorCode): ErrorConfigEntry {
    const config = errorConfig[String(code)] || errorConfig[code as number]
    if (config) return config

    // Fallback for unknown errors
    return {
        icon: AlertOctagon,
        color: 'red',
        title: `Error: ${code}`,
        message: 'An unexpected error occurred. Please try again or contact support.',
        action: 'retry_or_home',
        canRetry: true,
        animation: 'pulse',
        severity: 'critical',
    }
}

/**
 * Color mapping for error display
 */
export const errorColorMap: Record<string, { text: string; bg: string; border: string; glow: string; icon: string }> = {
    cyan: {
        text: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/30',
        glow: 'shadow-[0_0_30px_rgba(0,212,255,0.15)]',
        icon: 'text-cyan-400',
    },
    red: {
        text: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        glow: 'shadow-[0_0_30px_rgba(239,68,68,0.15)]',
        icon: 'text-red-400',
    },
    orange: {
        text: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        glow: 'shadow-[0_0_30px_rgba(255,140,0,0.15)]',
        icon: 'text-orange-400',
    },
    yellow: {
        text: 'text-yellow-400',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        glow: 'shadow-[0_0_30px_rgba(255,204,0,0.15)]',
        icon: 'text-yellow-400',
    },
    purple: {
        text: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/30',
        glow: 'shadow-[0_0_30px_rgba(139,92,246,0.15)]',
        icon: 'text-purple-400',
    },
    emerald: {
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        glow: 'shadow-[0_0_30px_rgba(16,185,129,0.15)]',
        icon: 'text-emerald-400',
    },
    indigo: {
        text: 'text-indigo-400',
        bg: 'bg-indigo-500/10',
        border: 'border-indigo-500/30',
        glow: 'shadow-[0_0_30px_rgba(99,102,241,0.15)]',
        icon: 'text-indigo-400',
    },
}

export default errorConfig