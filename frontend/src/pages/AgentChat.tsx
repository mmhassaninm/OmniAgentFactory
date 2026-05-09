import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { useAgent, useRunAgent, useAgentConversations, useEvolveAgent, useAgentRules } from '../hooks/useAgent'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  version?: number
  execution_time_ms?: number
}

export default function AgentChat() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const { data: agent } = useAgent(agentId || '')
  const { data: historyData } = useAgentConversations(agentId || '')
  const runAgent = useRunAgent()
  const evolveMut = useEvolveAgent()
  const { data: rulesData } = useAgentRules(agentId || '')
  const pendingRulesCount = rulesData?.rules?.filter((r: any) => r.status === 'pending').length || 0

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [goalOpen, setGoalOpen] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const historyLoaded = useRef(false)

  // Seed messages from history on first load
  useEffect(() => {
    if (!historyLoaded.current && historyData?.messages?.length) {
      setMessages(historyData.messages as ChatMessage[])
      historyLoaded.current = true
    }
  }, [historyData])

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isTyping) return

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    try {
      const res = await runAgent.mutateAsync({ agentId: agentId!, message: text })
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.result,
        timestamp: new Date().toISOString(),
        version: res.version,
        execution_time_ms: res.execution_time_ms,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠ Failed to reach agent: ${err.message || 'Unknown error'}`,
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setIsTyping(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleExport = () => {
    const lines = messages.map(m => {
      const who = m.role === 'user' ? 'You' : `Agent (v${m.version ?? '?'})`
      const ts = new Date(m.timestamp).toLocaleString()
      return `[${ts}] ${who}:\n${m.content}`
    })
    const blob = new Blob([lines.join('\n\n---\n\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agent?.name ?? 'agent'}-chat.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const score = Math.round((agent?.score || 0) * 100)
  const scoreColor = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  const isEvolving = agent?.status === 'evolving'
  const noCode = !agent?.agent_code || agent?.version === 0

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-bg-surface/95 backdrop-blur-sm border-b border-border-default/30 px-4 py-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors group shrink-0"
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span>
          Back to Factory
        </button>

        <div className="flex-1 flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-lg">🤖</span>
          <h1 className="text-sm font-black truncate">{agent?.name ?? '…'}</h1>
          <span className="text-[10px] font-mono text-text-muted bg-bg-panel px-1.5 py-0.5 rounded shrink-0">
            v{agent?.version ?? 0}
          </span>
          <span className="text-[10px] font-bold shrink-0" style={{ color: scoreColor }}>
            {score}%
          </span>
          {agent?.status && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider status-evolving shrink-0"
              style={{
                background: isEvolving ? 'rgba(124,58,237,0.15)' : 'rgba(100,116,139,0.1)',
                color: isEvolving ? '#a78bfa' : '#94a3b8',
              }}
            >
              {agent.status}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => agent && evolveMut.mutate(agent.id)}
            disabled={evolveMut.isPending}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
          >
            ⚡ Evolve
          </button>
          <button
            onClick={() => navigate(`/agent/${agentId}`)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-bg-panel text-text-muted hover:text-text-primary transition-colors"
          >
            View Detail
          </button>
        </div>
      </div>

      {/* ── Banners ─────────────────────────────────────────────────────── */}
      {pendingRulesCount > 0 && (
        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs text-indigo-300 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="animate-pulse">💡</span>
            <span>
              Evolve Engine has <span className="text-accent-primary font-bold">{pendingRulesCount} pending conversational rule{pendingRulesCount > 1 ? 's' : ''}</span> queued for the next evolution cycle.
            </span>
          </span>
          <button
            onClick={() => navigate(`/agent/${agentId}`)}
            className="text-[10px] bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 font-bold px-2 py-1 rounded transition-colors shrink-0"
          >
            Manage Rules →
          </button>
        </div>
      )}
      {isEvolving && (
        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-purple-950/40 border border-purple-500/20 text-xs text-purple-300 flex items-center gap-2">
          <span>⚡</span>
          <span>
            This agent is currently evolving (v{agent!.version} → v{agent!.version + 1}). You are talking to v{agent!.version}. Refresh after evolution completes.
          </span>
        </div>
      )}
      {!isEvolving && noCode && (
        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-amber-950/30 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
          <span>⚠</span>
          <span>
            This agent hasn&apos;t evolved yet. Click Evolve to improve it first, or chat with the base version.
          </span>
        </div>
      )}

      {/* ── Goal Panel ──────────────────────────────────────────────────── */}
      {agent?.goal && (
        <div className="mx-4 mt-3">
          <button
            onClick={() => setGoalOpen(o => !o)}
            className="w-full flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-wider hover:text-text-primary transition-colors text-left px-3 py-2 rounded-t-xl bg-bg-surface border border-border-default/30"
          >
            <span>💡</span>
            <span>Agent Goal</span>
            <span className="ml-auto opacity-40">{goalOpen ? '▼' : '▶'}</span>
          </button>
          {goalOpen && (
            <div className="px-4 py-3 bg-bg-surface/60 border border-t-0 border-border-default/30 rounded-b-xl text-sm text-text-secondary leading-relaxed">
              {agent.goal}
            </div>
          )}
        </div>
      )}

      {/* ── Conversation Area ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 mt-3">
        {messages.length === 0 && !isTyping && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-text-muted">
            <span className="text-3xl">💬</span>
            <p className="text-sm">Send a message to start chatting with this agent.</p>
          </div>
        )}

        {messages.map((msg, idx) =>
          msg.role === 'user' ? (
            <div key={idx} className="flex justify-end">
              <div className="max-w-[70%] rounded-2xl rounded-tr-sm px-4 py-2.5 bg-accent-primary/20 border border-accent-primary/30">
                <p className="text-sm text-text-primary whitespace-pre-wrap break-words">{msg.content}</p>
                <p className="text-[10px] text-text-muted mt-1 text-right">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ) : (
            <div key={idx} className="flex justify-start">
              <div className="max-w-[75%] rounded-2xl rounded-tl-sm px-4 py-3 bg-bg-surface border border-border-default/30 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">🤖</span>
                  <span className="text-[10px] font-bold text-text-muted">{agent?.name ?? 'Agent'}</span>
                  {msg.version !== undefined && (
                    <span className="text-[9px] font-mono text-text-muted bg-bg-base px-1 rounded">v{msg.version}</span>
                  )}
                  {msg.execution_time_ms !== undefined && (
                    <span className="text-[9px] text-text-muted ml-auto">
                      {msg.execution_time_ms < 1000
                        ? `${msg.execution_time_ms}ms`
                        : `${(msg.execution_time_ms / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>
                <div className="prose prose-sm prose-invert max-w-none text-text-secondary text-sm leading-relaxed">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
                <p className="text-[10px] text-text-muted mt-2">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          )
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-bg-surface border border-border-default/30 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🤖</span>
                <div className="flex gap-1">
                  {[0, 150, 300].map(delay => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input Area ──────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-bg-surface/95 backdrop-blur-sm border-t border-border-default/30 px-4 py-3">
        <div className="flex gap-2 mb-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message here…"
            rows={2}
            disabled={isTyping}
            className="flex-1 bg-bg-base border border-border-default/40 rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent-primary/50 transition-colors disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 self-end"
          >
            Send ▶
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMessages([])}
            className="text-[10px] text-text-muted hover:text-text-secondary transition-colors"
          >
            Clear Chat
          </button>
          <button
            onClick={handleExport}
            disabled={messages.length === 0}
            className="text-[10px] text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40"
          >
            Export Conversation
          </button>
          <span className="text-[10px] text-text-muted ml-auto">Ctrl+Enter to send</span>
        </div>
      </div>
    </div>
  )
}
