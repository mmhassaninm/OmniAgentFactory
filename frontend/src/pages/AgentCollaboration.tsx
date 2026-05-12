import { useEffect, useState, useCallback, useRef } from 'react'
import { 
  Users, Bot, Gavel, ShieldAlert, Sparkles, BrainCircuit, 
  Construction, Zap, CreditCard, Database, ShieldCheck, 
  Send, RefreshCw, AlertCircle, CheckCircle2 
} from 'lucide-react'
import { BASE_URL } from '../config'

interface Message {
  sender: 'visionary' | 'critic' | 'pragmatist' | 'moderator'
  name: string
  avatar: string
  message: string
  timestamp: string
}

interface Conversation {
  id: string
  title: string
  topic: string
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED'
  created_at: string
  messages: Message[]
}

interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  date: string
  category: string
}

interface FocusTopic {
  topic: string
  status: string
}

export default function AgentCollaboration() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [focusTopics, setFocusTopics] = useState<FocusTopic[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string>('')
  const [newTopic, setNewTopic] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  // Fetch all endpoints
  const fetchData = useCallback(async () => {
    try {
      const [cRes, aRes, fRes] = await Promise.all([
        fetch(`${BASE_URL}/api/collaboration/conversations`),
        fetch(`${BASE_URL}/api/collaboration/achievements`),
        fetch(`${BASE_URL}/api/collaboration/focus`)
      ])

      if (cRes.ok) {
        const cData = await cRes.json()
        setConversations(cData)
        if (cData.length > 0 && !selectedSessionId) {
          setSelectedSessionId(cData[0].id)
        }
      }
      if (aRes.ok) {
        setAchievements(await aRes.json())
      }
      if (fRes.ok) {
        setFocusTopics(await fRes.json())
      }
    } catch (err) {
      console.error('Failed to fetch collaboration data:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedSessionId])

  useEffect(() => {
    fetchData()
    // Rapid polling (every 4 seconds) so users can see live messages stream in during an active brainstorm session!
    const interval = setInterval(fetchData, 4000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedSessionId, conversations])

  const selectedSession = conversations.find(c => c.id === selectedSessionId)

  // Start new brainstorming
  const handleLaunchBrainstorm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`${BASE_URL}/api/collaboration/brainstorm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: newTopic || undefined })
      })
      if (res.ok) {
        const data = await res.json()
        setSelectedSessionId(data.session_id)
        setNewTopic('')
        // Refresh instantly
        await fetchData()
      }
    } catch (err) {
      console.error('Failed to launch brainstorm:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Map participant role to icons and styles
  const getAgentStyling = (role: string) => {
    switch (role) {
      case 'visionary':
        return {
          icon: <BrainCircuit className="w-5 h-5 text-amber-400" />,
          bg: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
          badge: 'bg-amber-400/20 text-amber-300 border-amber-400/30',
          label: 'Visionary Mind'
        }
      case 'critic':
        return {
          icon: <ShieldAlert className="w-5 h-5 text-rose-400" />,
          bg: 'bg-rose-500/10 border-rose-500/20 text-rose-200',
          badge: 'bg-rose-400/20 text-rose-300 border-rose-400/30',
          label: 'Critical Mind'
        }
      case 'pragmatist':
        return {
          icon: <Construction className="w-5 h-5 text-emerald-400" />,
          bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200',
          badge: 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30',
          label: 'Pragmatic Mind'
        }
      case 'moderator':
      default:
        return {
          icon: <Gavel className="w-5 h-5 text-blue-400" />,
          bg: 'bg-blue-500/10 border-blue-500/20 text-blue-200',
          badge: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
          label: 'Moderator'
        }
    }
  }

  // Map achievement icons
  const renderAchievementIcon = (icon: string) => {
    switch (icon) {
      case 'zap':
        return <Zap className="w-5 h-5 text-yellow-400" />
      case 'credit-card':
        return <CreditCard className="w-5 h-5 text-emerald-400" />
      case 'database':
        return <Database className="w-5 h-5 text-cyan-400" />
      case 'shield-check':
        return <ShieldCheck className="w-5 h-5 text-indigo-400" />
      default:
        return <Sparkles className="w-5 h-5 text-purple-400" />
    }
  }

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 flex flex-col font-sans select-text">
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <header className="p-6 border-b border-white/[0.04] bg-[#080c14]/60 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
              <Users size={22} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Agent Collaboration Hub
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">
                An advanced interactive environment where AI agents brainstorm, debate, and formulate self-evolution decisions for the project.
              </p>
            </div>
          </div>
        </div>
        <button 
          onClick={fetchData} 
          className="flex items-center gap-2 text-xs bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-medium py-2 px-4 rounded-lg border border-white/[0.06] transition-all duration-200"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-400' : ''} />
          Refresh Hub
        </button>
      </header>

      {/* ── Main Layout ── Three Columns ───────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-89px)] overflow-hidden">
        
        {/* ━━ COL 1: Sessions Sidebar (Left) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <aside className="w-full lg:w-[320px] shrink-0 border-r border-white/[0.04] bg-[#070c14]/40 flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-white/[0.04]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 font-mono flex items-center gap-2">
              <Bot size={13} className="text-indigo-400" />
              Brainstorming Sessions ({conversations.length})
            </h2>
            <p className="text-[11px] text-slate-500 leading-snug">
              Browse previous semantic discussions or launch a new live brainstorm below.
            </p>
          </div>

          <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
            {conversations.map(session => {
              const isSelected = session.id === selectedSessionId
              return (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex flex-col gap-2 ${
                    isSelected 
                      ? 'bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.05)]' 
                      : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                      session.status === 'ACTIVE' 
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 animate-pulse' 
                        : session.status === 'FAILED'
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                        : 'bg-slate-500/10 text-slate-400 border border-white/[0.06]'
                    }`}>
                      {session.status}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(session.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                  <h3 className={`text-xs font-semibold leading-relaxed line-clamp-2 ${
                    isSelected ? 'text-indigo-300' : 'text-slate-200'
                  }`}>
                    {session.title}
                  </h3>
                </button>
              )
            })}
          </div>

          {/* Create new brainstorm (Bottom of sidebar) */}
          <div className="p-4 border-t border-white/[0.04] bg-[#05090f]/60">
            <form onSubmit={handleLaunchBrainstorm} className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Custom Brainstorm
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Integrate Stripe payment gateway..."
                  value={newTopic}
                  onChange={e => setNewTopic(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full text-xs bg-black/40 border border-white/10 rounded-lg py-2.5 pl-9 pr-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="absolute left-2 top-2 text-slate-400 hover:text-indigo-400 transition-colors"
                >
                  {isSubmitting ? (
                    <RefreshCw size={14} className="animate-spin text-indigo-400" />
                  ) : (
                    <Send size={14} />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 text-center leading-snug pt-1">
                Leave blank to let the Agent Council choose an optimized autonomous topic.
              </p>
            </form>
          </div>
        </aside>

        {/* ━━ COL 2: Active Chat / Deliberations Panel (Center) ━━━━━━━━━━━━ */}
        <section className="flex-1 flex flex-col h-full bg-[#060a12]/20 overflow-hidden">
          {selectedSession ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              
              {/* Active Session Info Banner */}
              <div className="p-4 bg-[#080c14]/40 border-b border-white/[0.04] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Topic Currently Under Deliberation
                  </span>
                  <h2 className="text-sm font-bold text-slate-200 mt-0.5 leading-snug">
                    {selectedSession.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    selectedSession.status === 'ACTIVE' ? 'bg-emerald-500 animate-ping' : 'bg-slate-500'
                  }`} />
                  <span className="text-xs font-semibold font-mono text-slate-400">
                    {selectedSession.status === 'ACTIVE' ? 'Active Deliberation' : 'Archived & Completed'}
                  </span>
                </div>
              </div>

              {/* Chat Message Scroll Container */}
              <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                {selectedSession.messages.map((msg, i) => {
                  const style = getAgentStyling(msg.sender)
                  return (
                    <div 
                      key={i} 
                      className={`flex gap-4 items-start ${
                        msg.sender === 'moderator' ? 'max-w-3xl mx-auto w-full' : ''
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 transition-shadow ${style.bg}`}>
                        {style.icon}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200">{msg.name}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${style.badge}`}>
                            {style.label}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 leading-relaxed bg-[#080c14]/50 border border-white/[0.03] rounded-2xl p-4 shadow-sm relative">
                          {msg.message}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Blinking Live Deliberating status if ACTIVE */}
                {selectedSession.status === 'ACTIVE' && (
                  <div className="flex gap-4 items-start max-w-xl">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-center shrink-0">
                      <RefreshCw size={18} className="animate-spin text-indigo-400/40" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-xs text-slate-400 font-medium italic animate-pulse">
                        Formulating response and analyzing proposal by the next mind...
                      </p>
                      <div className="flex gap-1.5 pt-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-indigo-500/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-indigo-500/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center text-slate-500">
                <Users size={32} />
              </div>
              <div>
                <p className="text-base font-bold text-slate-300">No Session Selected</p>
                <p className="text-xs text-slate-500 mt-1">Please select or trigger an active brainstorming session from the sidebar on the left.</p>
              </div>
            </div>
          )}
        </section>

        {/* ━━ COL 3: Achievements & Focus Side Panel (Right) ━━━━━━━━━━━━━━ */}
        <aside className="w-full lg:w-[350px] shrink-0 border-l border-white/[0.04] bg-[#070c14]/30 flex flex-col overflow-y-auto">
          
          {/* Section A: Achievements / Accomplishments */}
          <div className="p-5 border-b border-white/[0.04] flex-1 overflow-y-auto flex flex-col min-h-[300px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2 font-mono">
              <CheckCircle2 size={13} className="text-indigo-400" />
              Council’s Latest Technical Achievements ({achievements.length})
            </h3>

            <div className="space-y-4 flex-1">
              {achievements.map((ach, idx) => (
                <div 
                  key={ach.id || idx} 
                  className="group rounded-xl border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.02] p-4 flex gap-3.5 transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/[0.02] group-hover:bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 transition-colors">
                    {renderAchievementIcon(ach.icon)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 justify-between">
                      <span className="text-[10px] font-bold text-indigo-400 font-mono tracking-wide uppercase">
                        {ach.category}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">
                        {new Date(ach.date).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-200 group-hover:text-indigo-300 transition-colors leading-snug">
                      {ach.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-sans pr-0.5">
                      {ach.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section B: Current Focus Area */}
          <div className="p-5 bg-black/10">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2 font-mono">
              <AlertCircle size={13} className="text-indigo-400" />
              Council’s Current Focus & Research Topics
            </h3>

            <div className="space-y-2">
              {focusTopics.map((item, idx) => (
                <div 
                  key={idx} 
                  className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 flex items-center justify-between text-xs"
                >
                  <span className="text-[11px] font-mono text-slate-300 line-clamp-1 pr-2">
                    {item.topic}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono uppercase">
                    {item.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </aside>

      </div>
    </div>
  )
}
