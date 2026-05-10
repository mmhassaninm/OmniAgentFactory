import { useEffect, useRef, useState } from 'react'
import { WS_URL } from '../config'

export interface SwarmEvent {
  type: string
  agent: string
  status: string
  message: string
  cycle?: number
  theme_count?: number
  current_theme?: string
  timestamp: string
}

export function useShopifySocket() {
  const [events, setEvents] = useState<SwarmEvent[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function connect() {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const url = `${WS_URL.replace('http', 'ws')}/ws/shopify/live`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (e) => {
      try {
        const data: SwarmEvent = JSON.parse(e.data)
        if (data.type === 'pong') return
        setEvents((prev) => [data, ...prev].slice(0, 200))
      } catch (_) {}
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  useEffect(() => {
    connect()
    const ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping')
      }
    }, 30_000)

    return () => {
      clearInterval(ping)
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [])

  return { events, connected }
}
