import { useEffect, useState, useRef } from 'react'
import { Monitor, Terminal, Wifi, WifiOff } from 'lucide-react'
import { WS_URL } from '../config'

interface LogMessage {
  timestamp: string
  text: string
}

export default function BrowserViewer() {
  const [connected, setConnected] = useState(false)
  const [frame, setFrame] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogMessage[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const consoleEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws/browser/live`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      addLog('SYSTEM', 'Connected to live browser session.')
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'frame') {
          setFrame(msg.data)
        } else if (msg.type === 'log') {
          addLog('INFO', msg.data)
        }
      } catch (err) {
        console.error('WebSocket parse error:', err)
      }
    }

    ws.onerror = () => {
      setConnected(false)
      addLog('ERROR', 'WebSocket connection failed.')
    }

    ws.onclose = () => {
      setConnected(false)
      addLog('SYSTEM', 'Disconnected from browser session.')
    }

    // Ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping')
      }
    }, 10000)

    return () => {
      clearInterval(pingInterval)
      ws.close()
    }
  }, [])

  // Auto-scroll the logs terminal
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = (level: string, text: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev.slice(-49), { timestamp, text: `[${level}] ${text}` }])
  }

  const handleTestTrigger = async () => {
    try {
      addLog('ACTION', 'Triggering browser session research dry-run...')
      const response = await fetch(`${WS_URL.replace('ws://', 'http://').replace('wss://', 'https://')}/api/money/opportunities`)
      if (response.ok) {
        addLog('ACTION', 'Dry-run query dispatched to server successfully.')
      } else {
        addLog('ERROR', 'Failed to dispatch opportunities scan.')
      }
    } catch (err: any) {
      addLog('ERROR', `Dispatch failed: ${err.message}`)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden flex flex-col h-[520px]">
      {/* Header section */}
      <div className="bg-[#0c121e] border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor size={16} className="text-cyan-400" />
          <span className="text-xs font-bold tracking-wider uppercase font-mono text-white/80">
            Live Browser Session
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleTestTrigger}
            className="text-[10px] uppercase tracking-wider font-bold text-cyan-400 hover:text-cyan-300 border border-cyan-500/20 px-2 py-1 rounded bg-cyan-500/5 transition-colors"
          >
            Scan Opportunity
          </button>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/30 border border-white/5">
            {connected ? (
              <>
                <Wifi size={12} className="text-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold font-mono text-emerald-400">LIVE</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-rose-500" />
                <span className="text-[10px] font-bold font-mono text-rose-400">OFFLINE</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main split viewport layout */}
      <div className="flex-1 grid grid-rows-2 h-0">
        {/* Top: Image frame viewport */}
        <div className="relative bg-black flex items-center justify-center overflow-hidden border-b border-white/5">
          {frame ? (
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt="Browser Frame"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-center p-6 space-y-2">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/40">
                <Monitor size={18} />
              </div>
              <p className="text-xs font-medium text-white/40">Awaiting live viewport stream...</p>
              <p className="text-[10px] text-white/20">Viewport activates automatically during browser tasks.</p>
            </div>
          )}
          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 border border-white/10 rounded text-[9px] font-mono text-white/50">
            640x480 Viewport
          </div>
        </div>

        {/* Bottom: Console log terminal */}
        <div className="bg-[#05080f] flex flex-col overflow-hidden">
          <div className="bg-[#080d16] px-3 py-1.5 border-b border-white/5 flex items-center gap-1.5">
            <Terminal size={12} className="text-slate-400" />
            <span className="text-[9px] font-bold font-mono text-slate-400 uppercase tracking-wider">
              Telemetry Console
            </span>
          </div>
          <div className="flex-1 p-3 font-mono text-[11px] leading-relaxed overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-white/10">
            {logs.length === 0 ? (
              <p className="text-white/20 italic">No telemetry signals received.</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-slate-500 select-none shrink-0">{log.timestamp}</span>
                  <span
                    className={
                      log.text.includes('[ERROR]')
                        ? 'text-red-400'
                        : log.text.includes('[ACTION]')
                        ? 'text-cyan-400'
                        : log.text.includes('[SYSTEM]')
                        ? 'text-amber-400 font-semibold'
                        : 'text-slate-300'
                    }
                  >
                    {log.text}
                  </span>
                </div>
              ))
            )}
            <div ref={consoleEndRef} />
          </div>
        </div>
      </div>
    </div>
  )
}
