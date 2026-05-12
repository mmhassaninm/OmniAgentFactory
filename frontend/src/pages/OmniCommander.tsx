import React, { useState, useEffect, useRef } from 'react'
import {
  Zap,
  Play,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Terminal,
  Compass,
  Image as ImageIcon,
  ChevronRight,
  Send,
  Loader2,
  Trash2,
  Sparkles,
  Paperclip,
  Check,
  ShieldCheck,
  Globe,
  FileText,
  Mail,
  BarChart4,
  ShoppingBag,
  Code
} from 'lucide-react'

// Define interfaces for session logs and states
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  results_metadata?: {
    results?: any[]
  }
}

interface ActionStep {
  type: 'file' | 'browser' | 'email' | 'analysis' | 'shopify' | 'code' | 'chat'
  params: any
  description: string
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'blocked'
  result?: any
}

interface ActionPlan {
  intent: string
  steps: ActionStep[]
  requires_confirmation: boolean
  estimated_duration: string
  tools_needed: string[]
}

interface SessionSummary {
  id: string
  status: string
  last_message: string
  created_at: string
  updated_at: string
  step_count: number
}

export default function OmniCommander() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState<string>('')
  const [activePlan, setActivePlan] = useState<ActionPlan | null>(null)
  
  // Real-time tracking progress
  const [progressPct, setProgressPct] = useState<number>(0)
  const [progressMessage, setProgressMessage] = useState<string>('')
  const [terminalLogs, setTerminalLogs] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)

  
  // Confirmation state
  const [confirmationNeeded, setConfirmationNeeded] = useState<{
    index: number
    reason: string
    step: ActionStep
  } | null>(null)
  
  // File uploads
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // ── LOAD HISTORICAL SESSIONS ──────────────────────────────────────────

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/commander/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
        if (data.length > 0 && !activeSessionId) {
          selectSession(data[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to load commander sessions:', err)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [])

  const selectSession = async (id: string) => {
    setActiveSessionId(id)
    setActivePlan(null)
    setTerminalLogs([])
    setProgressPct(0)
    setProgressMessage('')
    setConfirmationNeeded(null)
    
    try {
      const res = await fetch(`/api/commander/sessions/${id}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        if (data.active_plan) {
          // Rebuild action plan steps state mapping execution metadata
          const plan: ActionPlan = data.active_plan
          const historyWithResults = data.messages?.filter((m: any) => m.role === 'assistant' && m.results_metadata)
          if (historyWithResults && historyWithResults.length > 0) {
            const results = historyWithResults[historyWithResults.length - 1].results_metadata?.results || []
            plan.steps = plan.steps.map((step, sIdx) => {
              const matchedRes = results.find((r: any) => r.step_index === sIdx)
              if (matchedRes) {
                return {
                  ...step,
                  status: matchedRes.success ? 'completed' : 'failed',
                  result: matchedRes.result
                }
              }
              return step
            })
          }
          setActivePlan(plan)
        }
      }
    } catch (err) {
      console.error('Error fetching session:', err)
    }
  }

  const startNewSession = () => {
    const newId = `sess_${Math.random().toString(36).substring(2, 11)}`
    setActiveSessionId(newId)
    setMessages([])
    setActivePlan(null)
    setTerminalLogs([])
    setProgressPct(0)
    setProgressMessage('')
    setConfirmationNeeded(null)
    setSelectedFiles([])
  }

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this session?')) return
    
    try {
      const res = await fetch(`/api/commander/sessions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        if (activeSessionId === id) {
          setActiveSessionId('')
          setMessages([])
          setActivePlan(null)
        }
        fetchSessions()
      }
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  // ── SEND & STREAM COMMAND (SSE + WS) ───────────────────────────────────

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() && selectedFiles.length === 0) return
    if (isLoading) return

    const userPrompt = prompt
    setPrompt('')
    setIsLoading(true)
    setProgressPct(0)
    setProgressMessage('Contacting commander core...')
    setTerminalLogs(['[SYSTEM] Orchestration handshake initiated.'])
    setConfirmationNeeded(null)
    
    // Optimistic UI push
    const tempUserMsg: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userPrompt,
      timestamp: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempUserMsg])
    
    // Construct Multi-part FormData for files + text
    const formData = new FormData()
    formData.append('prompt', userPrompt)
    formData.append('session_id', activeSessionId || `sess_${Math.random().toString(36).substring(2, 11)}`)
    selectedFiles.forEach(file => {
      formData.append('files', file)
    })
    
    setSelectedFiles([])
    
    try {
      const response = await fetch('/api/commander/chat', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`)
      }
      
      await handleStreamReader(response.body)
      
    } catch (err: any) {
      console.error('Stream failure:', err)
      setTerminalLogs(prev => [...prev, `[ERROR] Failed to run: ${err.message}`])
      setIsLoading(false)
    }
  }

  // ── RESUME PLAN (CONFIRMATION BIND) ────────────────────────────────────

  const handleConfirmation = async (approve: boolean) => {
    if (!confirmationNeeded) return
    
    const targetIdx = confirmationNeeded.index
    setConfirmationNeeded(null)
    setIsLoading(true)
    setProgressMessage(approve ? 'Manual approval confirmed. Resuming...' : 'Execution cancelled.')
    setTerminalLogs(prev => [
      ...prev,
      approve ? `[SYSTEM] Step ${targetIdx + 1} Approved by user.` : `[SYSTEM] Pipeline cancelled by user.`
    ])
    
    // Optimistically update current step status in plan
    if (activePlan) {
      const updatedSteps = [...activePlan.steps]
      updatedSteps[targetIdx].status = approve ? 'running' : 'failed'
      setActivePlan({ ...activePlan, steps: updatedSteps })
    }

    try {
      const response = await fetch('/api/commander/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSessionId,
          approve: approve
        })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP Confirm Error ${response.status}`)
      }
      
      await handleStreamReader(response.body)
      
    } catch (err: any) {
       console.error('Confirmation stream failure:', err)
       setTerminalLogs(prev => [...prev, `[ERROR] Resume Failed: ${err.message}`])
       setIsLoading(false)
    }
  }

  // ── HELPER: PARSE SSE STREAM CHUNKS ────────────────────────────────────

  const handleStreamReader = async (stream: ReadableStream<Uint8Array> | null) => {
    if (!stream) return
    
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const raw = line.slice(6)
            const event = JSON.parse(raw)
            processSSEEvent(event)
          } catch (e) {
            console.warn('JSON parse error in SSE stream chunk', e)
          }
        }
      }
    }
    
    setIsLoading(false)
    fetchSessions()
  }

  const processSSEEvent = (event: any) => {
    const { type, pct, message, plan, index, reason, step, result, error, summary, results } = event
    
    switch (type) {
      case 'progress':
        setProgressPct(pct)
        if (message) {
          setProgressMessage(message)
          setTerminalLogs(prev => [...prev, `[INFO] ${message}`])
        }
        break
        
      case 'plan_created':
        // Map steps with pending status initially
        const mappedPlan: ActionPlan = plan
        mappedPlan.steps = mappedPlan.steps.map(s => ({ ...s, status: 'pending' }))
        setActivePlan(mappedPlan)
        setTerminalLogs(prev => [
          ...prev,
          `[SYSTEM] Intent router compiled plan: "${mappedPlan.intent}" with ${mappedPlan.steps.length} sequential operations.`
        ])
        break
        
      case 'step_started':
        if (activePlan) {
          const updatedSteps = [...activePlan.steps]
          if (updatedSteps[index]) {
            updatedSteps[index].status = 'running'
            setActivePlan({ ...activePlan, steps: updatedSteps })
          }
        }
        setTerminalLogs(prev => [...prev, `[RUNNING] Step ${index + 1}: ${step.description}...`])
        break
        
      case 'step_completed':
        if (activePlan) {
          const updatedSteps = [...activePlan.steps]
          if (updatedSteps[index]) {
            updatedSteps[index].status = 'completed'
            updatedSteps[index].result = result
            setActivePlan({ ...activePlan, steps: updatedSteps })
          }
        }
        setTerminalLogs(prev => [
          ...prev,
          `[COMPLETED] Step ${index + 1} finished successfully. Outcome details attached.`
        ])
        break
        
      case 'step_failed':
        if (activePlan) {
          const updatedSteps = [...activePlan.steps]
          if (updatedSteps[index]) {
            updatedSteps[index].status = 'failed'
            setActivePlan({ ...activePlan, steps: updatedSteps })
          }
        }
        setTerminalLogs(prev => [...prev, `[FAILED] Step ${index + 1} aborted: ${error}`])
        break
        
      case 'step_blocked':
        if (activePlan) {
          const updatedSteps = [...activePlan.steps]
          if (updatedSteps[index]) {
            updatedSteps[index].status = 'blocked'
            setActivePlan({ ...activePlan, steps: updatedSteps })
          }
        }
        setTerminalLogs(prev => [...prev, `[SECURITY BLOCKED] Step ${index + 1}: ${reason}`])
        break
        
      case 'confirmation_required':
        setConfirmationNeeded({ index, reason, step })
        if (activePlan) {
          const updatedSteps = [...activePlan.steps]
          if (updatedSteps[index]) {
            updatedSteps[index].status = 'pending'
            setActivePlan({ ...activePlan, steps: updatedSteps })
          }
        }
        setTerminalLogs(prev => [...prev, `[PAUSED] Awaiting user safety clearance: ${reason}`])
        setIsLoading(false)
        break
        
      case 'finished':
        setTerminalLogs(prev => [...prev, `[SUCCESS] Plan completed. Final summaries updated.`])
        // Push final assistant summary message
        const tempSummaryMsg: Message = {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: summary,
          timestamp: new Date().toISOString(),
          results_metadata: { results }
        }
        setMessages(prev => [...prev, tempSummaryMsg])
        setProgressPct(100)
        setProgressMessage('Plan execution completed successfully!')
        break
        
      case 'error':
        setTerminalLogs(prev => [...prev, `[ERROR] Pipeline failure: ${event.message}`])
        setProgressMessage(`Error: ${event.message}`)
        setIsLoading(false)
        break
    }
  }

  // ── AUTO-SCROLL TO BOTTOMS ─────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLogs])

  // ── FILE DROP ATTACHMENT HANDLERS ──────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const removeFile = (idx: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx))
  }

  // Helper mapping icon per step type
  const getStepIcon = (type: string, size = 16) => {
    switch (type) {
      case 'file': return <FileText size={size} className="text-cyan-400" />
      case 'browser': return <Globe size={size} className="text-blue-400" />
      case 'email': return <Mail size={size} className="text-purple-400" />
      case 'analysis': return <BarChart4 size={size} className="text-indigo-400" />
      case 'shopify': return <ShoppingBag size={size} className="text-pink-400" />
      case 'code': return <Code size={size} className="text-emerald-400" />
      default: return <Sparkles size={size} className="text-slate-400" />
    }
  }

  return (
    <div className="flex h-full w-full bg-[#060a12] text-slate-100 overflow-hidden font-sans p-6 gap-6">
      
      {/* ── LEFT DRAWER: SESSION LISTS ───────────────────────────────────── */}
      <div className="w-[300px] shrink-0 bg-[#080d1a]/80 backdrop-blur-xl border border-white/[0.04] rounded-2xl flex flex-col overflow-hidden h-full shadow-2xl">
        <div className="p-4 border-b border-white/[0.05] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-cyan-400" />
            <span className="font-bold text-sm tracking-wide">Sessions Library</span>
          </div>
          <button 
            onClick={startNewSession}
            className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-colors text-xs font-semibold flex items-center gap-1 border border-cyan-500/20"
          >
            <Plus size={12} />
            <span>New</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No historical operations.
            </div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                onClick={() => selectSession(s.id)}
                className={`p-3 rounded-xl cursor-pointer border transition-all flex flex-col gap-1.5 ${
                  activeSessionId === s.id
                    ? 'bg-cyan-500/10 border-cyan-500/35 shadow-[inset_0_0_12px_rgba(6,182,212,0.08)]'
                    : 'bg-white/[0.01] border-white/[0.03] hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-400 font-bold max-w-[120px] truncate">
                    {s.id}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                      s.status === 'finished' ? 'bg-emerald-500/10 text-emerald-400' :
                      s.status === 'paused' ? 'bg-amber-500/10 text-amber-400 animate-pulse' :
                      s.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-cyan-500/10 text-cyan-400'
                    }`}>
                      {s.status}
                    </span>
                    <button 
                      onClick={(e) => deleteSession(s.id, e)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-0.5 rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p className="text-slate-300 text-xs truncate font-medium">
                  {s.last_message}
                </p>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold font-mono">
                  <span>{s.step_count} steps</span>
                  <span>{new Date(s.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── CENTER COLUMN: CHAT INTERFACE ─────────────────────────────────── */}
      <div className="flex-1 bg-[#080d1a]/80 backdrop-blur-xl border border-white/[0.04] rounded-2xl flex flex-col overflow-hidden h-full shadow-2xl">
        <div className="p-4 border-b border-white/[0.05] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500/10 to-indigo-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Sparkles size={16} className="animate-spin-slow" />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-wide">OMNI COMMANDER</h2>
            <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest font-mono">
              Autonomous Multimodal Action Pipeline v2.0
            </p>
          </div>
        </div>

        {/* MESSAGES CHAT LOGS */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-3 max-w-md mx-auto">
              <Zap size={32} className="text-cyan-500/30 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-300">Awaiting your command</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Type any automated natural language request. Omni Commander will construct an interactive action plan, scan security locks, and carry out executions right inside the dashboard.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-4 p-4 rounded-xl max-w-[85%] ${
                  m.role === 'user'
                    ? 'ml-auto bg-cyan-500/10 border border-cyan-500/20 text-cyan-100 flex-row-reverse'
                    : 'mr-auto bg-white/[0.02] border border-white/[0.04] text-slate-200'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-extrabold text-xs select-none ${
                  m.role === 'user' ? 'bg-cyan-500 text-slate-900' : 'bg-slate-800 text-cyan-400'
                }`}>
                  {m.role === 'user' ? 'U' : 'AI'}
                </div>
                <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                  <p className="text-xs font-semibold leading-relaxed whitespace-pre-wrap">
                    {m.content}
                  </p>
                  
                  {/* Inline visual renders of execution metadata output attachments */}
                  {m.results_metadata?.results && (
                    <div className="mt-3 border border-white/[0.04] bg-[#050811] rounded-lg p-3 space-y-3 overflow-x-auto">
                      <div className="flex items-center gap-1.5 border-b border-white/[0.04] pb-2 text-[10px] font-bold text-slate-500 uppercase font-mono">
                        <Terminal size={12} />
                        <span>Execution Outputs Artifacts</span>
                      </div>
                      
                      {m.results_metadata.results.map((resItem: any, rIdx: number) => {
                        const sResult = resItem.result;
                        if (!sResult || !sResult.success) return null;
                        
                        return (
                          <div key={rIdx} className="text-xs flex flex-col gap-1.5">
                            {/* Browser Screenshot Capture Output */}
                            {sResult.screenshot_base64 && (
                              <div className="space-y-1.5 max-w-sm">
                                <span className="text-[10px] font-semibold text-slate-400 font-mono">Screenshot:</span>
                                <div className="rounded-lg overflow-hidden border border-white/[0.08] shadow-md bg-slate-900">
                                  <img 
                                    src={`data:image/png;base64,${sResult.screenshot_base64}`} 
                                    alt="Browser Screenshot" 
                                    className="w-full h-auto cursor-zoom-in hover:opacity-90 transition-opacity"
                                  />
                                </div>
                              </div>
                            )}
                            
                            {/* Browser Google Search Outputs */}
                            {sResult.results && sResult.results.length > 0 && (
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-semibold text-slate-400 font-mono">Google Matches:</span>
                                <div className="flex flex-col gap-2">
                                  {sResult.results.map((item: any, iIdx: number) => (
                                    <a 
                                      href={item.url} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      key={iIdx} 
                                      className="p-2 rounded bg-slate-900 border border-white/[0.04] hover:bg-slate-800 transition-colors block"
                                    >
                                      <h4 className="text-xs font-bold text-cyan-400 flex items-center gap-1">
                                        <Globe size={11} />
                                        <span>{item.title}</span>
                                      </h4>
                                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{item.snippet}</p>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Code execution console output */}
                            {(sResult.stdout || sResult.stderr) && (
                              <div className="space-y-1 bg-[#010409] border border-white/[0.05] p-2 rounded-lg font-mono text-[10px] leading-relaxed max-h-48 overflow-y-auto">
                                <span className="text-[9px] text-slate-500 block uppercase font-bold">Process Logs:</span>
                                {sResult.stdout && <pre className="text-emerald-400">{sResult.stdout}</pre>}
                                {sResult.stderr && <pre className="text-red-400">{sResult.stderr}</pre>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  
                  <span className="text-[9px] text-slate-500 font-semibold font-mono self-start mt-1">
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT FORM + FILES CONTAINER */}
        <div className="p-4 border-t border-white/[0.05] bg-[#070b16]">
          {/* File previews bar */}
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedFiles.map((f, fIdx) => (
                <div key={fIdx} className="bg-slate-900 border border-white/[0.08] px-2 py-1 rounded-lg flex items-center gap-2 text-[10px] font-semibold text-slate-300">
                  <span className="truncate max-w-[120px]">{f.name}</span>
                  <button 
                    type="button" 
                    onClick={() => removeFile(fIdx)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <XCircle size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSend} className="flex gap-2">
            <input 
              type="file" 
              multiple 
              onChange={handleFileChange}
              ref={fileInputRef}
              className="hidden" 
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-white/[0.02] hover:bg-white/[0.06] rounded-xl border border-white/[0.04] text-slate-400 hover:text-slate-100 transition-colors shrink-0"
              title="Attach dataset, images or text reviews"
            >
              <Paperclip size={18} />
            </button>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Type your command in English or Arabic (e.g. 'pytest', 'read main.py', etc.)..."
              disabled={isLoading || !!confirmationNeeded}
              className="flex-1 bg-white/[0.01] hover:bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 text-xs placeholder-slate-500 text-slate-100 font-semibold focus:outline-none focus:border-cyan-500/50 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || (!prompt.trim() && selectedFiles.length === 0) || !!confirmationNeeded}
              className="p-3 rounded-xl bg-cyan-500 text-slate-900 hover:bg-cyan-400 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center shrink-0 disabled:opacity-40 disabled:hover:scale-100"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>

      {/* ── RIGHT COLUMN: TELEMETRY & EXECUTION STEPS TRACKER ─────────────── */}
      <div className="w-[380px] shrink-0 flex flex-col gap-6 h-full overflow-hidden">
        
        {/* PARSED ACTION STEPS CARD */}
        <div className="bg-[#080d1a]/80 backdrop-blur-xl border border-white/[0.04] rounded-2xl p-5 flex flex-col h-1/2 overflow-hidden shadow-2xl relative">
          <div className="flex items-center gap-2 mb-4 border-b border-white/[0.04] pb-3 shrink-0">
            <Compass size={16} className="text-cyan-400" />
            <h3 className="text-xs font-black tracking-wide uppercase">Structured Execution Sequence</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {!activePlan ? (
              <div className="h-full flex items-center justify-center text-center p-4 text-slate-500 text-xs">
                No active execution plan. Formulate a command to build steps.
              </div>
            ) : (
              activePlan.steps.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border flex gap-3 transition-all ${
                    step.status === 'running' ? 'bg-cyan-500/5 border-cyan-500/20' :
                    step.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/15' :
                    step.status === 'failed' ? 'bg-red-500/5 border-red-500/15' :
                    step.status === 'blocked' ? 'bg-red-950/15 border-red-900/30 opacity-70' :
                    'bg-white/[0.01] border-white/[0.03]'
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {getStepIcon(step.type, 16)}
                  </div>
                  <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase font-mono tracking-wider text-slate-400">
                        Step {idx + 1}: {step.type}
                      </span>
                      {step.status === 'running' && <Loader2 size={11} className="text-cyan-400 animate-spin" />}
                      {step.status === 'completed' && <CheckCircle2 size={11} className="text-emerald-400" />}
                      {step.status === 'failed' && <XCircle size={11} className="text-red-400" />}
                      {step.status === 'blocked' && <AlertOctagon size={11} className="text-red-500" />}
                    </div>
                    <p className="text-xs font-semibold text-slate-300 leading-normal">
                      {step.description}
                    </p>
                    
                    {/* Render specific parameter details for ease */}
                    {step.params && (
                      <span className="text-[9px] font-mono text-slate-500 truncate mt-0.5">
                        Args: {JSON.stringify(step.params)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* DYNAMIC CONFIRMATION POPUP OVERLAY */}
          {confirmationNeeded && (
            <div className="absolute inset-x-4 bottom-4 bg-[#14120a] border border-amber-500/30 rounded-xl p-4 flex flex-col gap-3 shadow-xl backdrop-blur-md animate-slide-up z-10">
              <div className="flex gap-2.5 items-start">
                <AlertOctagon size={16} className="text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                <div className="flex-1">
                  <h4 className="text-[10px] font-black tracking-wider uppercase text-amber-300">Clearance Lock Triggered</h4>
                  <p className="text-xs font-semibold text-slate-300 mt-1 leading-normal">
                    {confirmationNeeded.reason}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 font-semibold">
                <button
                  type="button"
                  onClick={() => handleConfirmation(true)}
                  className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 transition-colors text-xs flex items-center justify-center gap-1"
                >
                  <Check size={14} />
                  <span>Approve Step</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmation(false)}
                  className="flex-1 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.05] transition-colors text-xs flex items-center justify-center gap-1"
                >
                  <XCircle size={14} />
                  <span>Cancel Pipeline</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* TERMINAL EMULATOR / STREAM LOGS */}
        <div className="bg-[#020408] border border-white/[0.05] rounded-2xl p-5 flex flex-col h-1/2 overflow-hidden shadow-inner font-mono">
          <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-emerald-400" />
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Master Telemetry Stream</span>
            </div>
            {isLoading && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-cyan-400 animate-pulse">{progressPct}%</span>
                <div className="w-12 h-1 bg-slate-800 rounded overflow-hidden">
                  <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto text-[10px] leading-relaxed p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-white/[0.05] pr-1">
            {terminalLogs.length === 0 ? (
              <span className="text-slate-600 block italic py-4">Terminal silent...</span>
            ) : (
              terminalLogs.map((log, idx) => {
                let colorClass = 'text-slate-400'
                if (log.startsWith('[SYSTEM]')) colorClass = 'text-cyan-400 font-bold'
                else if (log.startsWith('[RUNNING]')) colorClass = 'text-blue-400'
                else if (log.startsWith('[COMPLETED]')) colorClass = 'text-emerald-400'
                else if (log.startsWith('[FAILED]')) colorClass = 'text-red-400 font-bold'
                else if (log.startsWith('[SECURITY BLOCKED]')) colorClass = 'text-red-500 font-extrabold underline'
                else if (log.startsWith('[PAUSED]')) colorClass = 'text-amber-400 animate-pulse'
                else if (log.startsWith('[ERROR]')) colorClass = 'text-red-400 font-black'
                
                return (
                  <div key={idx} className={`${colorClass} whitespace-pre-wrap break-all`}>
                    {log}
                  </div>
                )
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>

      </div>

    </div>
  )
}

// Inline Plus icon component to resolve any import dependencies
function Plus({ size = 16, className = "" }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  )
}
