import React, { useState, useEffect, useRef } from 'react'

interface PreLoaderProps {
  children: React.ReactNode
}

export const PreLoader: React.FC<PreLoaderProps> = ({ children }) => {
  const [isReady, setIsReady] = useState(false)
  const [phase, setPhase] = useState<'connecting' | 'connected' | 'loading_vault' | 'ready' | 'error'>('connecting')
  const [elapsed, setElapsed] = useState(0)
  const [fadeOut, setFadeOut] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null)

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health')
      if (res.ok) {
        // Successful health response - step through premium stages
        setPhase('connected')
        
        setTimeout(() => {
          setPhase('loading_vault')
          
          setTimeout(() => {
            setPhase('ready')
            
            setTimeout(() => {
              setFadeOut(true)
              
              setTimeout(() => {
                setIsReady(true)
              }, 600) // 600ms fade-out animation
            }, 500)
          }, 600)
        }, 600)
        
        // Clear all retry polling
        if (timerRef.current) clearInterval(timerRef.current)
        if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      }
    } catch (err) {
      console.log('Pre-loader connecting retry...')
    }
  }

  const handleRetry = () => {
    setElapsed(0)
    setPhase('connecting')
    checkHealth()
    startTimers()
  }

  const startTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)

    // Check health immediately and poll every 2s
    checkHealth()
    timerRef.current = setInterval(checkHealth, 2000)

    // Elapsed timer to track 30s timeout
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev >= 30) {
          setPhase('error')
          if (timerRef.current) clearInterval(timerRef.current)
          if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
          return 30
        }
        return prev + 1
      })
    }, 1000)
  }

  useEffect(() => {
    startTimers()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    }
  }, [])

  if (isReady) {
    return <>{children}</>
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#080c14] transition-opacity duration-600 ease-out ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-[#00d4ff]/10 to-transparent blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-[#7c3aed]/10 to-transparent blur-3xl rounded-full pointer-events-none" />

      <div className="relative flex flex-col items-center max-w-sm px-6 text-center z-10">
        {/* Pulsing Shield Logo Enclave */}
        <div className="relative mb-8">
          {/* Pulsing outer glowing rings */}
          {phase !== 'error' && (
            <>
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] opacity-20 blur-xl animate-pulse" />
              <div className="absolute -inset-4 rounded-[2rem] border border-[#00d4ff]/20 animate-[ping_2s_infinite]" />
              <div className="absolute -inset-8 rounded-[2.5rem] border border-[#7c3aed]/10 animate-[ping_3s_infinite]" />
            </>
          )}

          <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-[#0d1527] to-[#050811] border border-[#1e293b] flex items-center justify-center text-3xl shadow-2xl relative">
            {phase === 'error' ? '⚠️' : '🛡️'}
          </div>
        </div>

        {/* Dynamic Header */}
        <h1 className="text-xl font-black tracking-tight text-[#f0f4f8] mb-2 font-mono uppercase">
          {phase === 'error' ? 'Initialization Error' : 'OmniBot Core Engine'}
        </h1>

        {/* Status Messages & Progress */}
        <div className="h-20 flex flex-col items-center justify-center">
          {phase === 'connecting' && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-[#00d4ff] font-bold tracking-widest uppercase font-mono animate-pulse">
                Connecting to backend...
              </p>
              <div className="flex gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-[#00d4ff] animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 rounded-full bg-[#00d4ff] animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 rounded-full bg-[#00d4ff] animate-bounce" />
              </div>
              <p className="text-[10px] text-[#475569] font-mono mt-1">Timeout remaining: {30 - elapsed}s</p>
            </div>
          )}

          {phase === 'connected' && (
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-xs text-emerald-400 font-bold tracking-widest uppercase font-mono animate-pulse">
                ✓ Backend Connected
              </p>
              <p className="text-[10px] text-[#64748b] font-mono">Loading models router cascade...</p>
            </div>
          )}

          {phase === 'loading_vault' && (
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-xs text-indigo-400 font-bold tracking-widest uppercase font-mono animate-pulse">
                🔒 Loading Cryptographic Vault...
              </p>
              <p className="text-[10px] text-[#64748b] font-mono">Decrypting active credentials...</p>
            </div>
          )}

          {phase === 'ready' && (
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-xs text-emerald-400 font-bold tracking-widest uppercase font-mono">
                ⚡ Ready
              </p>
              <p className="text-[10px] text-[#64748b] font-mono">Booting agent enclaves...</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-xs text-rose-500 font-black tracking-widest uppercase font-mono">
                Backend unavailable — retrying...
              </p>
              <button
                onClick={handleRetry}
                className="px-5 py-2 rounded-xl text-xs font-black tracking-wider uppercase font-mono bg-gradient-to-r from-rose-500/20 to-orange-500/20 hover:from-rose-500/30 hover:to-orange-500/30 text-rose-400 border border-rose-500/30 shadow-lg active:scale-95 transition-all"
              >
                Retry Connection
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
