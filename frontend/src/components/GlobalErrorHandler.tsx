import { useEffect, useState, useCallback } from 'react'
import { onGlobalError, type ApiError } from '../lib/apiClient'
import { ErrorToastContainer, apiErrorToToast, type Toast } from './ErrorToast'
import ErrorPage from '../pages/errors/ErrorPage'

interface GlobalErrorHandlerProps {
    children?: React.ReactNode
}

/**
 * GlobalErrorHandler listens for global error events from apiClient
 * and displays them either as toast notifications or full-page errors
 * depending on severity.
 */
export default function GlobalErrorHandler({ children }: GlobalErrorHandlerProps) {
    const [toasts, setToasts] = useState<Toast[]>([])
    const [fullPageError, setFullPageError] = useState<ApiError | null>(null)
    const [isRetrying, setIsRetrying] = useState(false)

    // Subscribe to global error events
    useEffect(() => {
        const unsubscribe = onGlobalError((error: ApiError) => {
            // Critical errors (500+, network errors, chunk load errors) → full page
            if (
                error.status >= 500 ||
                error.code === 'NetworkError' ||
                error.status === 0
            ) {
                // Only show full-page if there's not already one displayed
                setFullPageError(prev => prev || error)
            } else {
                // Non-critical errors → toast
                setToasts(prev => {
                    // Avoid duplicate toasts for same error ID
                    if (prev.some(t => t.id === error.errorId)) return prev
                    return [...prev, apiErrorToToast(error)]
                })
            }
        })

        return () => {
            unsubscribe()
        }
    }, [])

    const handleDismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const handleFullPageRetry = useCallback(async () => {
        if (!fullPageError) return
        setIsRetrying(true)
        try {
            // Simply dismiss the full-page error and let the app retry naturally
            setFullPageError(null)
            window.location.reload()
        } finally {
            setIsRetrying(false)
        }
    }, [fullPageError])

    // If we have a full-page critical error, render it over everything
    if (fullPageError) {
        const code = fullPageError.code || fullPageError.status || 500
        return (
            <ErrorPage
                code={code}
                message={fullPageError.message}
                errorId={fullPageError.errorId}
                onRetry={handleFullPageRetry}
                showBackButton={true}
                showHomeButton={true}
                fullPage={true}
            />
        )
    }

    return (
        <>
            {/* Children (the app) */}
            {children}

            {/* Toast notifications */}
            <ErrorToastContainer toasts={toasts} onDismiss={handleDismissToast} />
        </>
    )
}