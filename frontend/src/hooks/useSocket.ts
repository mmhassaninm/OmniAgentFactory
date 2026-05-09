import { useEffect, useRef, useState, useCallback } from 'react'

interface Thought {
  type: string
  agent_id: string
  timestamp: string
  phase: string
  message: string
  model_used?: string
}

export function useAgentSocket(agentId: string | null) {
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!agentId) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    const wsUrl = `${protocol}//${host}:3001/ws/thoughts/${agentId}`

    let ws: WebSocket

    const connect = () => {
      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        // Start ping interval
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          }
        }, 30000)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'pong') return
          setThoughts(prev => [data, ...prev].slice(0, 100))
        } catch {
          // ignore non-JSON messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        if (pingRef.current) clearInterval(pingRef.current)
        // Reconnect after 3s
        setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (pingRef.current) clearInterval(pingRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect
        wsRef.current.close()
      }
    }
  }, [agentId])

  const clearThoughts = useCallback(() => setThoughts([]), [])

  return { thoughts, connected, clearThoughts }
}

export function useFactorySocket() {
  const [events, setEvents] = useState<Thought[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    const wsUrl = `${protocol}//${host}:3001/ws/factory`

    let ws: WebSocket

    const connect = () => {
      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'pong') return
          setEvents(prev => [data, ...prev].slice(0, 200))
        } catch { /* ignore */ }
      }

      ws.onclose = () => {
        setConnected(false)
        setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [])

  return { events, connected }
}
