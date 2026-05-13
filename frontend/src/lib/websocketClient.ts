/**
 * Centralized WebSocket client with reconnection logic and error handling.
 * 
 * Features:
 * - Automatic reconnection with exponential backoff (up to 3 retries)
 * - Ping/pong keepalive
 * - Connection state tracking
 * - Error event emission for GlobalErrorHandler
 * - Toast notifications for connection state changes
 */

import { generateErrorId } from './errorId'

// ── Types ─────────────────────────────────────────────────────────────

export type WsConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed'

export interface WsConfig {
    url: string
    maxRetries?: number
    baseDelay?: number
    maxDelay?: number
    pingInterval?: number
}

export interface WsEventHandlers {
    onMessage?: (data: any) => void
    onStateChange?: (state: WsConnectionState) => void
    onError?: (error: { code: string; message: string; errorId: string }) => void
}

// ── WebSocket Client Class ─────────────────────────────────────────────

export class ReconnectingWebSocket {
    private ws: WebSocket | null = null
    private config: Required<WsConfig>
    private handlers: WsEventHandlers
    private retryCount = 0
    private retryTimer: ReturnType<typeof setTimeout> | null = null
    private pingTimer: ReturnType<typeof setInterval> | null = null
    private destroyed = false
    private state: WsConnectionState = 'disconnected'

    constructor(config: WsConfig, handlers: WsEventHandlers = {}) {
        this.config = {
            url: config.url,
            maxRetries: config.maxRetries ?? 3,
            baseDelay: config.baseDelay ?? 1000,
            maxDelay: config.maxDelay ?? 10000,
            pingInterval: config.pingInterval ?? 30000,
        }
        this.handlers = handlers
    }

    connect(): void {
        if (this.destroyed) return
        if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return

        this.setState('connecting')

        try {
            this.ws = new WebSocket(this.config.url)

            this.ws.onopen = () => {
                if (this.destroyed) return
                this.retryCount = 0
                this.setState('connected')
                this.startPing()
            }

            this.ws.onmessage = (event: MessageEvent) => {
                if (this.destroyed) return
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === 'pong') return
                    this.handlers.onMessage?.(data)
                } catch {
                    // Non-JSON messages (like raw 'pong' strings)
                    if (event.data === 'pong') return
                    this.handlers.onMessage?.(event.data)
                }
            }

            this.ws.onclose = (event: CloseEvent) => {
                if (this.destroyed) return
                this.stopPing()

                // Check if this was a clean close (intentional)
                if (event.code === 1000 || event.code === 1001) {
                    this.setState('disconnected')
                    return
                }

                // Attempt reconnection
                this.attemptReconnect(event)
            }

            this.ws.onerror = () => {
                if (this.destroyed) return
                // The onclose handler will fire after this
            }
        } catch (err: any) {
            this.setState('disconnected')
            this.handlers.onError?.({
                code: 'WebSocketError',
                message: `Failed to create WebSocket connection: ${err.message}`,
                errorId: generateErrorId(),
            })
        }
    }

    private attemptReconnect(closeEvent: CloseEvent): void {
        if (this.destroyed) return

        this.retryCount++

        if (this.retryCount > this.config.maxRetries) {
            this.setState('failed')
            this.handlers.onError?.({
                code: 'WebSocketError',
                message: `WebSocket connection failed after ${this.config.maxRetries} retries. Last close code: ${closeEvent.code}`,
                errorId: generateErrorId(),
            })
            return
        }

        this.setState('reconnecting')

        // Calculate delay with exponential backoff + jitter
        const delay = Math.min(
            this.config.baseDelay * Math.pow(2, this.retryCount - 1),
            this.config.maxDelay
        )
        const jitter = Math.random() * 500
        const totalDelay = delay + jitter

        this.retryTimer = setTimeout(() => {
            if (!this.destroyed) {
                this.connect()
            }
        }, totalDelay)
    }

    private startPing(): void {
        this.stopPing()
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send('ping')
            }
        }, this.config.pingInterval)
    }

    private stopPing(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer)
            this.pingTimer = null
        }
    }

    private setState(state: WsConnectionState): void {
        if (this.state !== state) {
            this.state = state
            this.handlers.onStateChange?.(state)
        }
    }

    send(data: string | object): boolean {
        if (this.ws?.readyState !== WebSocket.OPEN) return false

        const payload = typeof data === 'string' ? data : JSON.stringify(data)
        try {
            this.ws.send(payload)
            return true
        } catch {
            return false
        }
    }

    disconnect(): void {
        this.destroyed = true
        this.stopPing()
        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
            this.retryTimer = null
        }
        if (this.ws) {
            this.ws.onclose = null // Prevent reconnect
            this.ws.onerror = null
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close(1000, 'Client disconnecting')
            }
            this.ws = null
        }
        this.setState('disconnected')
    }

    getState(): WsConnectionState {
        return this.state
    }

    isConnected(): boolean {
        return this.state === 'connected'
    }

    getRetryCount(): number {
        return this.retryCount
    }
}

// ── React Hook ─────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react'

export function useReconnectingWebSocket(
    config: WsConfig,
    handlers: WsEventHandlers = {}
) {
    const [state, setState] = useState<WsConnectionState>('disconnected')
    const [lastMessage, setLastMessage] = useState<any>(null)
    const clientRef = useRef<ReconnectingWebSocket | null>(null)

    useEffect(() => {
        const client = new ReconnectingWebSocket(config, {
            ...handlers,
            onStateChange: (newState) => {
                setState(newState)
                handlers.onStateChange?.(newState)
            },
            onMessage: (data) => {
                setLastMessage(data)
                handlers.onMessage?.(data)
            },
        })

        clientRef.current = client
        client.connect()

        return () => {
            client.disconnect()
            clientRef.current = null
        }
    }, [config.url])

    const send = useCallback((data: string | object): boolean => {
        return clientRef.current?.send(data) ?? false
    }, [])

    const reconnect = useCallback(() => {
        clientRef.current?.disconnect()
        const client = new ReconnectingWebSocket(config, {
            ...handlers,
            onStateChange: (newState) => {
                setState(newState)
                handlers.onStateChange?.(newState)
            },
            onMessage: (data) => {
                setLastMessage(data)
                handlers.onMessage?.(data)
            },
        })
        clientRef.current = client
        client.connect()
    }, [config.url])

    return { state, isConnected: state === 'connected', lastMessage, send, reconnect }
}