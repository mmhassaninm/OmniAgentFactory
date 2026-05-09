import React, { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

interface TerminalOutput {
  type: 'stdout' | 'stderr' | 'input'
  text: string
  timestamp: string
}

const Terminal: React.FC = () => {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState<TerminalOutput[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isLoading, setIsLoading] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const executeCommand = async (cmd: string) => {
    if (!cmd.trim()) return

    // Add to history
    setHistory(prev => [...prev, cmd])
    setHistoryIndex(-1)

    // Add input to output
    setOutput(prev => [
      ...prev,
      { type: 'input', text: `> ${cmd}`, timestamp: new Date().toISOString() },
    ])

    setIsLoading(true)
    try {
      const response = await fetch('/api/terminal/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.stdout) {
          setOutput(prev => [
            ...prev,
            {
              type: 'stdout',
              text: data.stdout,
              timestamp: new Date().toISOString(),
            },
          ])
        }
        if (data.stderr) {
          setOutput(prev => [
            ...prev,
            {
              type: 'stderr',
              text: data.stderr,
              timestamp: new Date().toISOString(),
            },
          ])
        }
      } else {
        setOutput(prev => [
          ...prev,
          {
            type: 'stderr',
            text: `Error: ${response.statusText}`,
            timestamp: new Date().toISOString(),
          },
        ])
      }
    } catch (error) {
      setOutput(prev => [
        ...prev,
        {
          type: 'stderr',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setIsLoading(false)
      setInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(input)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setInput(history[history.length - 1 - newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setInput(history[history.length - 1 - newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setInput('')
      }
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-gray-100 font-mono">
      {/* Output Area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 text-sm"
      >
        {output.length === 0 ? (
          <div className="text-gray-600">
            Welcome to OmniBot Terminal
            <br />
            Type commands below
          </div>
        ) : (
          output.map((line, idx) => (
            <div
              key={idx}
              className={
                line.type === 'stderr'
                  ? 'text-red-400'
                  : line.type === 'input'
                    ? 'text-green-400'
                    : 'text-white'
              }
            >
              {line.text.split('\n').map((l, i) => (
                <div key={i}>{l || '\u00A0'}</div>
              ))}
            </div>
          ))
        )}
        {isLoading && (
          <div className="text-blue-400 animate-pulse">⟳ Processing...</div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-700 p-3">
        <div className="flex items-center">
          <span className="text-green-400 mr-2">❯</span>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            className="flex-1 bg-transparent text-white outline-none text-sm"
            disabled={isLoading}
            autoFocus
          />
        </div>
      </div>

      {/* Help Text */}
      <div className="border-t border-gray-700 px-4 py-2 bg-gray-950 text-xs text-gray-500">
        Built-in: help, clear, status, agents, restart
      </div>
    </div>
  )
}

export default Terminal
