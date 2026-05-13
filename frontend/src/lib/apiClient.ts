/**
 * Centralized API Client for OmniBot Agent Factory
 *
 * Features:
 * - Catches ALL non-2xx responses automatically
 * - Maps status code → error type
 * - Emits global error events
 * - Handles token expiry (401) → auto-redirect to refresh
 * - Handles rate limit (429) → extracts Retry-After header
 * - Handles network failure → shows NetworkError page
 */

import { generateErrorId } from './errorId'
import { BASE_URL } from '../config'

// ── Types ─────────────────────────────────────────────────────────────

export interface ApiError {
    ok: false
    status: number
    code: string
    message: string
    errorId: string
    data?: any
    retryAfter?: number
}

export interface ApiSuccess<T = any> {
    ok: true
    status: number
    data: T
}

export type ApiResult<T = any> = ApiSuccess<T> | ApiError

// ── Global Error Event System ─────────────────────────────────────────

type GlobalErrorListener = (error: ApiError) => void
const globalErrorListeners = new Set<GlobalErrorListener>()

export function onGlobalError(listener: GlobalErrorListener): () => void {
    globalErrorListeners.add(listener)
    return () => globalErrorListeners.delete(listener)
}

function emitGlobalError(error: ApiError): void {
    globalErrorListeners.forEach(listener => {
        try {
            listener(error)
        } catch {
            // Ignore listener failures
        }
    })
}

// ── Internal Token Refresh Support ────────────────────────────────────

let tokenRefreshPromise: Promise<boolean> | null = null
let onTokenExpired: (() => Promise<boolean>) | null = null

export function setTokenRefreshHandler(handler: () => Promise<boolean>): void {
    onTokenExpired = handler
}

// ── Error Code Mapping ────────────────────────────────────────────────

function statusCodeToErrorCode(status: number): string {
    switch (status) {
        case 400: return '400'
        case 401: return '401'
        case 403: return '403'
        case 404: return '404'
        case 408: return '408'
        case 429: return '429'
        case 500: return '500'
        case 502: return '502'
        case 503: return '503'
        case 504: return '408'
        default:
            if (status >= 500) return '500'
            if (status >= 400) return '400'
            return '500'
    }
}

// ── Build Structured Error ────────────────────────────────────────────

function buildApiError(response: Response, body?: any): ApiError {
    const errorId = generateErrorId()
    const retryAfter = response.headers.get('Retry-After')
    let message = body?.message || body?.detail || response.statusText || 'Unknown error'

    // Special messages per status
    if (response.status === 429) {
        message = 'Rate limit exceeded. Please wait before retrying.'
    } else if (response.status === 401) {
        message = 'Authentication expired. Please refresh your session.'
    } else if (response.status === 502 || response.status === 503) {
        message = 'Backend service is currently unavailable.'
    } else if (response.status === 504) {
        message = 'Request timed out waiting for the server.'
    }

    return {
        ok: false,
        status: response.status,
        code: statusCodeToErrorCode(response.status),
        message,
        errorId,
        data: body,
        retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
    }
}

// ── Core Request Function ─────────────────────────────────────────────

interface RequestOptions extends RequestInit {
    params?: Record<string, string>
    timeout?: number
    skipGlobalError?: boolean
}

async function request<T = any>(
    method: string,
    endpoint: string,
    options: RequestOptions = {}
): Promise<ApiResult<T>> {
    const { params, timeout = 30000, skipGlobalError = false, ...fetchOptions } = options

    // Build URL
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    let url = `${BASE_URL}${path}`

    if (params) {
        const searchParams = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                searchParams.append(key, value)
            }
        })
        const qs = searchParams.toString()
        if (qs) url += `?${qs}`
    }

    // Default headers for JSON
    const headers = new Headers(fetchOptions.headers)
    if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json')
    }

    // AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
        const response = await fetch(url, {
            ...fetchOptions,
            method,
            headers,
            signal: controller.signal,
        })

        clearTimeout(timeoutId)

        // Attempt to parse body
        let body: any
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
            body = await response.json()
        } else if (response.status !== 204) {
            const text = await response.text()
            try {
                body = JSON.parse(text)
            } catch {
                body = { message: text }
            }
        }

        // Success
        if (response.ok) {
            return {
                ok: true,
                status: response.status,
                data: body as T,
            }
        }

        // Handle 401 → try token refresh
        if (response.status === 401 && onTokenExpired) {
            if (!tokenRefreshPromise) {
                tokenRefreshPromise = onTokenExpired()
            }
            const refreshed = await tokenRefreshPromise
            tokenRefreshPromise = null

            if (refreshed) {
                // Retry the original request
                return request<T>(method, endpoint, options)
            }
        }

        // Build error
        const apiError = buildApiError(response, body)

        // Emit global error event (unless skipped)
        if (!skipGlobalError) {
            emitGlobalError(apiError)
        }

        return apiError
    } catch (err: any) {
        clearTimeout(timeoutId)

        // Handle network errors / timeouts
        let apiError: ApiError

        if (err.name === 'AbortError') {
            apiError = {
                ok: false,
                status: 408,
                code: 'TimeoutError',
                message: 'Request timed out. The backend might be starting up or experiencing high load.',
                errorId: generateErrorId(),
            }
        } else if (err instanceof TypeError && err.message === 'Failed to fetch') {
            apiError = {
                ok: false,
                status: 0,
                code: 'NetworkError',
                message: 'Cannot reach the server. Please check your internet connection.',
                errorId: generateErrorId(),
            }
        } else {
            apiError = {
                ok: false,
                status: 0,
                code: 'NetworkError',
                message: err.message || 'An unexpected network error occurred.',
                errorId: generateErrorId(),
            }
        }

        if (!skipGlobalError) {
            emitGlobalError(apiError)
        }

        return apiError
    }
}

// ── Public API ────────────────────────────────────────────────────────

const apiClient = {
    get<T = any>(endpoint: string, options?: RequestOptions): Promise<ApiResult<T>> {
        return request<T>('GET', endpoint, options)
    },

    post<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<ApiResult<T>> {
        return request<T>('POST', endpoint, {
            ...options,
            body: body instanceof FormData ? body : JSON.stringify(body),
        })
    },

    put<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<ApiResult<T>> {
        return request<T>('PUT', endpoint, {
            ...options,
            body: JSON.stringify(body),
        })
    },

    patch<T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<ApiResult<T>> {
        return request<T>('PATCH', endpoint, {
            ...options,
            body: JSON.stringify(body),
        })
    },

    delete<T = any>(endpoint: string, options?: RequestOptions): Promise<ApiResult<T>> {
        return request<T>('DELETE', endpoint, options)
    },
}

export default apiClient