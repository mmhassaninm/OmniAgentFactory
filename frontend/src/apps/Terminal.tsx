import React, { useState, useRef, useEffect } from 'react'
import { Terminal as TerminalIcon, ShieldAlert, CheckCircle2 } from 'lucide-react'

interface TerminalHistoryItem {
  type: 'input' | 'stdout' | 'stderr' | 'system'
  text: string
}

export const Terminal: React.FC = () => {
  const [history, setHistory] = useState<TerminalHistoryItem[]>([
    { type: 'system', text: 'NexusOS Kernel v1.0.0 (Secure Sandbox Shell)' },
    { type: 'system', text: 'Type "help" for a list of valid local actions.' },
  ])
  const [inputValue, setInputValue] = useState<string>('')
  const [executing, setExecuting] = useState<boolean>(false)

  const historyEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Scroll to bottom on history change
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  // Refocus input on clicking container
  const handleContainerClick = () => {
    inputRef.current?.focus()
  }

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cmd = inputValue.trim()
    if (!cmd) return

    // Record typing input
    setHistory(prev => [...prev, { type: 'input', text: `omnibot@nexus:~$ ${cmd}` }])
    setInputValue('')

    // Client-side local filters
    if (cmd.toLowerCase() === 'clear') {
      setHistory([])
      return
    }

    if (cmd.toLowerCase() === 'help') {
      setHistory(prev => [
        ...prev,
        {
          type: 'stdout',
          text: `Available local commands:
  help       - Display this assistance list
  clear      - Empty the terminal buffer
  about      - Display kernel release information
  
Any other command is piped to the host system shell safely with traversal security checks.`
        }
      ])
      return
    }

    if (cmd.toLowerCase() === 'about') {
      setHistory(prev => [
        ...prev,
        {
          type: 'stdout',
          text: `Nexus OS v1.0.0 -- Autonomous Agent CLI
System target: Ubuntu 22.04 LTS (Docker instance)
Runtime engine: Python 3.11 / FastAPI`
        }
      ])
      return
    }

    // Server-side backend pipe
    setExecuting(true)
    try {
      const response = await fetch('/api/terminal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      })

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`)
      }

      const result = await response.json()

      if (result.stdout) {
        setHistory(prev => [...prev, { type: 'stdout', text: result.stdout }])
      }
      if (result.stderr) {
        setHistory(prev => [...prev, { type: 'stderr', text: result.stderr }])
      }
      if (!result.stdout && !result.stderr) {
        setHistory(prev => [...prev, { type: 'stdout', text: `Command completed with code ${result.returncode || 0}` }])
      }
    } catch (err: any) {
      setHistory(prev => [...prev, { type: 'stderr', text: `System execution failed: ${err.message}` }])
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div
      onClick={handleContainerClick}
      className="flex flex-col h-full bg-[#030508] p-4 text-[#33ff33] font-mono text-xs select-text overflow-hidden relative cursor-text"
    >
      {/* Scrollable output buffer */}
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
        {history.map((item, idx) => {
          if (item.type === 'input') {
            return (
              <div key={idx} className="text-white font-semibold">
                {item.text}
              </div>
            )
          }
          if (item.type === 'stderr') {
            return (
              <div key={idx} className="text-red-400 flex items-start gap-2 whitespace-pre-wrap">
                <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                <span>{item.text}</span>
              </div>
            )
          }
          if (item.type === 'system') {
            return (
              <div key={idx} className="text-cyan-400 italic">
                {item.text}
              </div>
            )
          }
          // Stdout
          return (
            <div key={idx} className="text-[#33ff33]/80 whitespace-pre-wrap leading-relaxed">
              {item.text}
            </div>
          )
        })}

        {executing && (
          <div className="text-cyan-400 animate-pulse flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
            <span>Processing sub-shell payload...</span>
          </div>
        )}

        <div ref={historyEndRef} />
      </div>

      {/* Input row */}
      <form onSubmit={handleCommandSubmit} className="mt-3 flex items-center gap-1.5 border-t border-white/[0.03] pt-2 shrink-0">
        <span className="text-white select-none">omnibot@nexus:~$</span>
        <div className="flex-1 flex items-center relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={executing}
            className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-white font-mono text-xs caret-[#33ff33] w-full"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </form>
    </div>
  )
}

export default Terminal
