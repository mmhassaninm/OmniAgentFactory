import React from 'react'
import ErrorPage from '../pages/errors/ErrorPage'
import { generateErrorId } from '../lib/errorId'
import { type ErrorCode } from '../config/errorConfig'

interface ErrorBoundaryProps {
    children: React.ReactNode
    fallbackCode?: ErrorCode
    pageName?: string
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
    errorInfo: React.ErrorInfo | null
    errorId: string
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    private devMode: boolean

    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            errorId: generateErrorId(),
        }
        this.devMode = import.meta.env.DEV || false
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return {
            hasError: true,
            error,
            errorId: generateErrorId(),
        }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        this.setState({ errorInfo })

        // Log error details to console in a structured format
        const page = this.props.pageName || 'Unknown'
        const errId = this.state.errorId
        console.error(
            `[ErrorBoundary][${errId}] Component crashed in "${page}":`,
            {
                error: error.message,
                name: error.name,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                page,
                errorId: errId,
                timestamp: new Date().toISOString(),
            }
        )
    }

    handleRetry = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            errorId: generateErrorId(),
        })
    }

    render(): React.ReactNode {
        if (this.state.hasError) {
            const { error, errorInfo, errorId } = this.state
            const page = this.props.pageName || 'Component'

            // Build technical details string
            const detailParts: string[] = []
            detailParts.push(`Error ID: ${errorId}`)
            detailParts.push(`Page: ${page}`)
            detailParts.push(`Type: ${error?.name || 'RenderError'}`)
            detailParts.push(`Time: ${new Date().toLocaleString()}`)
            detailParts.push('')
            if (error?.message) {
                detailParts.push(`Message: ${error.message}`)
            }
            if (error?.stack && this.devMode) {
                detailParts.push('')
                detailParts.push('Stack Trace:')
                detailParts.push(error.stack)
            }
            if (errorInfo?.componentStack && this.devMode) {
                detailParts.push('')
                detailParts.push('Component Stack:')
                detailParts.push(errorInfo.componentStack)
            }

            return (
                <ErrorPage
                    code={this.props.fallbackCode || 'RenderError'}
                    title={`Something broke in ${page}`}
                    message={error?.message || 'A component crashed unexpectedly.'}
                    detail={detailParts.join('\n')}
                    errorId={errorId}
                    onRetry={this.handleRetry}
                    showBackButton={true}
                    showHomeButton={true}
                    fullPage={false}
                />
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary