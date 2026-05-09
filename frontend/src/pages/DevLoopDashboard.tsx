import React, { useState, useEffect } from 'react'
import { 
  Play, 
  Workflow, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  History, 
  XCircle, 
  ChevronRight, 
  ChevronDown, 
  Cpu, 
  Check, 
  X,
  Gauge,
  Sparkles,
  Search,
  Shield,
  Activity,
  Code,
  Zap,
  BookOpen,
  Sliders,
  TrendingUp,
  BrainCircuit,
  Settings
} from 'lucide-react'

interface PendingImprovement {
  _id: string
  cycle_id: string
  problem_description: string
  proposed_fix: string
  fix_type: string
  target_agent_id: string
  estimated_impact: number
  risk_level: string
  status: string
  created_at: string
}

interface DevLoopStatus {
  status: string
  current_phase: string
  last_execution_time: string | null
  next_execution_time: string | null
  problems_found: number
  improvements_applied: number
  regressions_caught: number
  total_cycles_completed: number
  current_cycle_id: string | null
}

interface CycleLog {
  _id: string
  cycle_id: string
  timestamp: string
  phases_completed: string[]
  problems: any[]
  improvements: any[]
  ideas: any[]
}

interface Signal {
  _id: string
  agent_id: string
  session_id: string
  signal_type: string
  value: number
  tool_name: string | null
  raw_evidence: string
  duration_ms: number
  created_at: string
}

interface Skill {
  _id: string
  name: string
  file_path: string
  status: string
  success_rate: number
  usage_count: number
  last_used: string | null
  version: number
  content?: string
}

interface WatcherDecision {
  _id: string
  improvement_id: string
  decision: string
  rule_triggered: string | null
  confidence: number
  test_generated: boolean
  created_at: string
}

interface SoulHistory {
  agent_id: string
  name: string
  goal: string
  current_soul: string
  score: number
  history: Array<{
    _id: string
    version: number
    soul_text: string
    score: number
    replaced_at: string
    failure_patterns_fixed: string[]
    success_patterns_reinforced: string[]
  }>
}

interface AutonomyScore {
  autonomy_score: number
  autonomous_actions: number
  human_actions: number
  total_actions: number
}

interface BootstrapStatus {
  state: string
  progress: {
    tasks_completed: number
    tasks_total: number
    current_task: string
    skills_synthesized_so_far: number
    estimated_minutes_remaining: number
  }
  result: any
}

export default function DevLoopDashboard() {
  const [status, setStatus] = useState<DevLoopStatus | null>(null)
  const [pending, setPending] = useState<PendingImprovement[]>([])
  const [history, setHistory] = useState<CycleLog[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [watcherLogs, setWatcherLogs] = useState<WatcherDecision[]>([])
  const [souls, setSouls] = useState<SoulHistory[]>([])
  const [autonomy, setAutonomy] = useState<AutonomyScore | null>(null)
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null)
  
  const [activeTab, setActiveTab] = useState<'skills' | 'souls' | 'history'>('skills')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  
  const [loading, setLoading] = useState<boolean>(true)
  const [triggering, setTriggering] = useState<boolean>(false)
  const [expandedFix, setExpandedFix] = useState<string | null>(null)
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null)

  const fetchTelemetry = async () => {
    try {
      const BASE_URL = 'http://localhost:3001'
      const [
        statusRes,
        pendingRes,
        historyRes,
        skillsRes,
        watcherRes,
        soulsRes,
        autonomyRes,
        bootstrapRes
      ] = await Promise.all([
        fetch(`${BASE_URL}/api/dev-loop/status`),
        fetch(`${BASE_URL}/api/dev-loop/pending`),
        fetch(`${BASE_URL}/api/dev-loop/history`),
        fetch(`${BASE_URL}/api/dev-loop/skills`),
        fetch(`${BASE_URL}/api/dev-loop/watcher/log`),
        fetch(`${BASE_URL}/api/dev-loop/souls`),
        fetch(`${BASE_URL}/api/dev-loop/autonomy-score`),
        fetch(`${BASE_URL}/api/dev-loop/bootstrap/status`)
      ])

      if (statusRes.ok) setStatus(await statusRes.json())
      if (pendingRes.ok) setPending(await pendingRes.json())
      if (historyRes.ok) setHistory(await historyRes.json())
      if (skillsRes.ok) setSkills(await skillsRes.json())
      if (watcherRes.ok) setWatcherLogs(await watcherRes.json())
      if (soulsRes.ok) {
        const soulsData = await soulsRes.json()
        setSouls(soulsData)
        if (soulsData.length > 0 && !selectedAgentId) {
          setSelectedAgentId(soulsData[0].agent_id)
        }
      }
      if (autonomyRes.ok) setAutonomy(await autonomyRes.json())
      if (bootstrapRes.ok) setBootstrapStatus(await bootstrapRes.json())

    } catch (err) {
      console.error('Error fetching dev loop telemetry:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch signals when selected agent changes or on interval
  const fetchAgentSignals = async () => {
    if (!selectedAgentId) return
    try {
      const res = await fetch(`http://localhost:3001/api/dev-loop/signals/${selectedAgentId}`)
      if (res.ok) {
        setSignals(await res.json())
      }
    } catch (err) {
      console.error('Error fetching agent signals:', err)
    }
  }

  // Fetch individual skill content on demand
  const viewSkillDetail = async (skillName: string) => {
    try {
      const res = await fetch(`http://localhost:3001/api/dev-loop/skills/${skillName}`)
      if (res.ok) {
        setSelectedSkill(await res.json())
      }
    } catch (err) {
      console.error('Error viewing skill detail:', err)
    }
  }

  useEffect(() => {
    fetchTelemetry()
    const timer = setInterval(fetchTelemetry, 8000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetchAgentSignals()
  }, [selectedAgentId])

  const handleTriggerCycle = async () => {
    setTriggering(true)
    try {
      const res = await fetch('http://localhost:3001/api/dev-loop/trigger', {
        method: 'POST'
      })
      if (res.ok) {
        await fetchTelemetry()
      }
    } catch (err) {
      console.error('Error triggering cycle:', err)
    } finally {
      setTriggering(false)
    }
  }

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:3001/api/dev-loop/approve/${id}`, {
        method: 'POST'
      })
      if (res.ok) {
        setPending(prev => prev.filter(p => p._id !== id))
        fetchTelemetry()
      }
    } catch (err) {
      console.error('Error approving improvement:', err)
    }
  }

  const handleReject = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:3001/api/dev-loop/reject/${id}`, {
        method: 'POST'
      })
      if (res.ok) {
        setPending(prev => prev.filter(p => p._id !== id))
        fetchTelemetry()
      }
    } catch (err) {
      console.error('Error rejecting improvement:', err)
    }
  }

  if (bootstrapStatus?.state === 'running') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-cyan-400 font-mono p-8 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-neutral-950 to-neutral-950 z-0"></div>
        
        <div className="z-10 w-full max-w-3xl bg-neutral-900/50 border border-cyan-500/30 p-10 rounded-2xl backdrop-blur-md shadow-2xl flex flex-col items-center">
          <Sparkles className="w-16 h-16 text-cyan-400 mb-6 animate-pulse" />
          <h1 className="text-3xl font-bold text-white mb-2 tracking-widest text-center">🧬 SYNTHETIC SELF-PLAY BOOTSTRAP IN PROGRESS</h1>
          <p className="text-neutral-400 mb-10 text-center text-lg">The system is training itself on the codebase. This takes ~15 minutes. Once.</p>
          
          <div className="w-full bg-neutral-950 border border-neutral-800 rounded-lg h-8 mb-4 overflow-hidden relative">
            <div 
              className="absolute top-0 left-0 h-full bg-cyan-600 transition-all duration-1000 ease-out"
              style={{ width: `${(bootstrapStatus.progress.tasks_completed / Math.max(1, bootstrapStatus.progress.tasks_total)) * 100}%` }}
            >
              <div className="absolute inset-0 bg-white/20 w-full h-full"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white drop-shadow-md z-10">
              {bootstrapStatus.progress.tasks_completed} / {bootstrapStatus.progress.tasks_total} TASKS SEEDED
            </div>
          </div>

          <div className="w-full bg-neutral-950 border border-neutral-800 p-6 rounded-lg text-left mt-4 shadow-inner">
            <p className="text-cyan-500 text-sm font-bold mb-2 uppercase tracking-wider">Currently Running</p>
            <p className="text-white text-xl mb-6">{bootstrapStatus.progress.current_task}</p>
            
            <div className="grid grid-cols-2 gap-4 border-t border-neutral-800 pt-6">
              <div>
                <p className="text-neutral-500 text-sm">Skills Synthesized</p>
                <p className="text-2xl text-emerald-400 font-bold">{bootstrapStatus.progress.skills_synthesized_so_far}</p>
              </div>
              <div>
                <p className="text-neutral-500 text-sm">Estimated Time Remaining</p>
                <p className="text-2xl text-amber-400 font-bold">{bootstrapStatus.progress.estimated_minutes_remaining} min</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#03060c] text-[#f0f4f8] font-sans">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin shadow-[0_0_30px_rgba(99,102,241,0.3)]"></div>
        <p className="mt-6 text-slate-400 font-mono text-sm tracking-widest animate-pulse uppercase">Connecting Cybernetic Core Telemetry...</p>
      </div>
    )
  }

  // Calculate Autonomy Percentage
  const autonomyPct = autonomy ? Math.round(autonomy.autonomy_score * 100) : 100

  return (
    <div className="p-8 min-h-screen bg-[#03060c] text-[#f0f4f8] font-sans overflow-x-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* ── Background Cyber-Grid Aesthetic ── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#09101d_1px,transparent_1px),linear-gradient(to_bottom,#09101d_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none opacity-40" />

      {/* ── Title Header ── */}
      <header className="relative mb-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-white/[0.03] pb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.15)] animate-pulse">
              <BrainCircuit size={20} />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-cyan-400 uppercase font-mono bg-cyan-500/5 px-3 py-1 rounded-full border border-cyan-500/20">
              True Self-Improvement Loop Active
            </span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Autonomous Dev Orchestrator
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            A self-improving sandbox executing data-driven optimization, safety checkpoints, and vector skill synthesis. Zero human intervention needed.
          </p>
        </div>

        {/* Action Button Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleTriggerCycle}
            disabled={status?.status === 'running' || triggering}
            className={`px-6 py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-300 flex items-center gap-3 border shadow-[0_4px_20px_rgba(0,0,0,0.3)] ${
              status?.status === 'running'
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400/50 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 border-indigo-400/20 text-white hover:shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            {status?.status === 'running' ? (
              <>
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Cycle Running...</span>
              </>
            ) : (
              <>
                <Play size={15} fill="currentColor" />
                <span>Trigger Optimization Cycle</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Layer 1 & 3: Autonomy Meter & Watcher Safety Ledger ── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* Autonomy Dial Dial Gauge */}
        <div className="bg-[#050b14]/90 border border-white/[0.04] p-6 rounded-2xl relative overflow-hidden backdrop-blur-md flex flex-col justify-between min-h-[220px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">System Autonomy Index</span>
              <Gauge size={16} className="text-indigo-400" />
            </div>
            <p className="text-[10px] text-slate-500 mt-1 font-semibold leading-relaxed">
              Ratio of Watcher Agent auto-resolutions vs human intervention approvals.
            </p>
          </div>

          <div className="flex items-center gap-6 mt-4">
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-24 h-24 transform -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.02)" strokeWidth="8" fill="transparent" />
                <circle cx="48" cy="48" r="40" stroke="url(#indigoGrad)" strokeWidth="8" fill="transparent"
                  strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * autonomyPct) / 100} strokeLinecap="round" />
                <defs>
                  <linearGradient id="indigoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute text-xl font-black font-mono tracking-tighter text-indigo-200">{autonomyPct}%</span>
            </div>

            <div className="space-y-1 text-xs font-mono">
              <p className="text-slate-400 font-semibold">Autonomous: <span className="text-indigo-400 font-bold">{autonomy?.autonomous_actions || 0}</span></p>
              <p className="text-slate-400 font-semibold">Human HIP: <span className="text-slate-500 font-bold">{autonomy?.human_actions || 0}</span></p>
              <p className="text-slate-400 font-semibold">Decisions Made: <span className="text-slate-300 font-bold">{autonomy?.total_actions || 0}</span></p>
            </div>
          </div>
        </div>

        {/* Watcher Safety Audit Logs */}
        <div className="lg:col-span-2 bg-[#050b14]/90 border border-white/[0.04] p-6 rounded-2xl backdrop-blur-md flex flex-col h-[220px]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Shield size={16} className="text-emerald-400" />
              <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider font-mono">Watcher Safety Verdict Ledger</h2>
            </div>
            <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full font-mono uppercase">
              5 Security Rules Active
            </span>
          </div>

          <div className="overflow-y-auto space-y-2.5 flex-1 pr-1 custom-scrollbar">
            {watcherLogs.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-8">No security decisions resolved yet.</p>
            ) : (
              watcherLogs.map((log) => (
                <div key={log._id} className="flex items-center justify-between p-2.5 bg-white/[0.01] border border-white/[0.03] rounded-lg hover:bg-white/[0.02] transition-colors text-xs">
                  <div className="flex items-center gap-3">
                    {log.decision === 'approve' ? (
                      <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle size={14} className="text-rose-500 shrink-0" />
                    )}
                    <span className="font-mono text-slate-400">Imp ID: <code className="text-slate-200">{log.improvement_id.substring(0, 8)}</code></span>
                    {log.rule_triggered && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/5 border border-rose-500/10 text-rose-400 font-mono">
                        {log.rule_triggered}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-slate-500 font-mono text-[10px]">
                    <span>Conf: <code className="text-slate-300 font-bold">{Math.round(log.confidence * 100)}%</code></span>
                    <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── Core Stats Section ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#050b14]/60 border border-white/[0.03] p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10 text-cyan-400"><Search size={20} /></div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Bottlenecks Scanned</span>
            <p className="text-2xl font-black mt-0.5 text-cyan-400 font-mono">{status?.problems_found || 0}</p>
          </div>
        </div>
        <div className="bg-[#050b14]/60 border border-white/[0.03] p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-400"><CheckCircle size={20} /></div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Optims Applied</span>
            <p className="text-2xl font-black mt-0.5 text-emerald-400 font-mono">{status?.improvements_applied || 0}</p>
          </div>
        </div>
        <div className="bg-[#050b14]/60 border border-white/[0.03] p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-400"><AlertTriangle size={20} /></div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Regressions Blocked</span>
            <p className="text-2xl font-black mt-0.5 text-rose-400 font-mono">{status?.regressions_caught || 0}</p>
          </div>
        </div>
        <div className="bg-[#050b14]/60 border border-white/[0.03] p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-indigo-400"><Gauge size={20} /></div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Cycles Competed</span>
            <p className="text-2xl font-black mt-0.5 text-indigo-400 font-mono">{status?.total_cycles_completed || 0}</p>
          </div>
        </div>
      </section>

      {/* ── Main Panel Grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Left column content: Skills, SOUL tuning and history */}
        <div className="xl:col-span-2 space-y-8">
          
          {/* Navigation Tab Header */}
          <div className="flex border-b border-white/[0.03] gap-6">
            <button
              onClick={() => setActiveTab('skills')}
              className={`pb-3.5 text-sm font-black tracking-wide uppercase transition-all duration-200 border-b-2 flex items-center gap-2 ${
                activeTab === 'skills' ? 'text-indigo-400 border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              <Code size={14} />
              <span>Active Skills ({skills.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('souls')}
              className={`pb-3.5 text-sm font-black tracking-wide uppercase transition-all duration-200 border-b-2 flex items-center gap-2 ${
                activeTab === 'souls' ? 'text-indigo-400 border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              <Sparkles size={14} />
              <span>SOUL Personas ({souls.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-3.5 text-sm font-black tracking-wide uppercase transition-all duration-200 border-b-2 flex items-center gap-2 ${
                activeTab === 'history' ? 'text-indigo-400 border-indigo-500' : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              <History size={14} />
              <span>Cycle Logs ({history.length})</span>
            </button>
          </div>

          {/* Tab Content 1: Synthesized Skills Grid */}
          {activeTab === 'skills' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {skills.length === 0 ? (
                  <div className="col-span-2 text-center py-12 bg-[#050b14]/30 border border-white/[0.03] rounded-xl text-slate-500 text-xs">
                    No active synthesized procedural skills found. Run loops to discover and compile procedural templates.
                  </div>
                ) : (
                  skills.map((skill) => (
                    <div key={skill._id} className="bg-[#050b14]/70 border border-white/[0.04] rounded-xl p-5 hover:border-white/[0.08] transition-all duration-300 relative group overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-[0.01] group-hover:opacity-[0.03] transition-opacity text-white pointer-events-none">
                        <Code size={80} />
                      </div>
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-mono text-sm font-black text-indigo-300 uppercase tracking-wide">
                          {skill.name}
                        </h3>
                        <span className="text-[9px] font-mono font-bold bg-white/[0.02] border border-white/[0.05] text-slate-400 px-2 py-0.5 rounded">
                          v{skill.version}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 mb-4 bg-white/[0.01] p-2.5 rounded border border-white/[0.02]">
                        <p>Usage: <span className="text-slate-200 font-bold">{skill.usage_count}</span></p>
                        <p>Rate: <span className="text-emerald-400 font-bold">{Math.round(skill.success_rate * 100)}%</span></p>
                        <p className="col-span-2 text-[9px]">Last: <span className="text-slate-500">{skill.last_used ? new Date(skill.last_used).toLocaleTimeString() : 'Never'}</span></p>
                      </div>
                      <button
                        onClick={() => viewSkillDetail(skill.name)}
                        className="w-full py-2 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 hover:border-indigo-500/20 rounded-lg text-xs font-bold text-indigo-400 tracking-wide transition-all"
                      >
                        Inspect Procedural SKILL.md
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Render Selected Skill Procedural Text Codeblock */}
              {selectedSkill && (
                <div className="bg-[#040810] border border-white/[0.05] rounded-xl p-6 relative">
                  <button 
                    onClick={() => setSelectedSkill(null)}
                    className="absolute top-4 right-4 p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300"
                  >
                    <X size={16} />
                  </button>
                  <div className="flex items-center gap-2 mb-4 border-b border-white/[0.04] pb-3">
                    <BookOpen size={16} className="text-indigo-400" />
                    <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider font-mono">Viewing Procedural Source: {selectedSkill.name}.md</h3>
                  </div>
                  <pre className="p-4 bg-[#020408] rounded-lg border border-white/[0.02] text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
                    {selectedSkill.content}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Tab Content 2: SOUL Prompt Engineering & Lineage */}
          {activeTab === 'souls' && (
            <div className="space-y-6">
              <div className="flex flex-col lg:flex-row gap-6">
                
                {/* Selector */}
                <div className="w-full lg:w-1/3 bg-[#050b14]/50 border border-white/[0.03] rounded-xl p-4 space-y-2 shrink-0">
                  <span className="text-[10px] font-black uppercase text-slate-500 font-mono tracking-wider block mb-2">Select Agent Platform</span>
                  {souls.map((s) => (
                    <button
                      key={s.agent_id}
                      onClick={() => {
                        setSelectedAgentId(s.agent_id)
                        setExpandedFix(null)
                      }}
                      className={`w-full p-3 rounded-lg text-left transition-all flex justify-between items-center ${
                        selectedAgentId === s.agent_id 
                          ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300' 
                          : 'bg-white/[0.01] hover:bg-white/[0.02] border border-transparent text-slate-400'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-bold">{s.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {s.agent_id.substring(0, 8)}</p>
                      </div>
                      <span className="text-[10px] font-bold font-mono bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10">
                        {s.score.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Right detail of selected soul */}
                {(() => {
                  const currentAgent = souls.find(s => s.agent_id === selectedAgentId)
                  if (!currentAgent) return null
                  return (
                    <div className="flex-1 bg-[#050b14]/70 border border-white/[0.03] rounded-xl p-6 space-y-6">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Current Agent Goal</span>
                        <h3 className="text-lg font-black tracking-tight mt-0.5">{currentAgent.name}</h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{currentAgent.goal}</p>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono block mb-2">Evolved SOUL Prompt</span>
                        <div className="p-4 bg-[#020408] rounded-lg border border-white/[0.03] font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap max-h-[250px] overflow-y-auto">
                          {currentAgent.current_soul}
                        </div>
                      </div>

                      {/* Prompt Lineage Timeline */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono block mb-3">Prompt Evolution Lineage</span>
                        {currentAgent.history.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">No prompt tuning iterations registered yet. Cycles every 10 complete iterations.</p>
                        ) : (
                          <div className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-white/[0.05]">
                            {currentAgent.history.map((h, i) => (
                              <div key={h._id} className="flex gap-4 relative pl-6">
                                <span className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border border-indigo-500 bg-[#03060c] flex items-center justify-center text-[8px] font-bold font-mono text-indigo-400`}>
                                  {h.version}
                                </span>
                                <div className="flex-1 p-3 bg-white/[0.01] border border-white/[0.02] rounded-lg hover:border-white/[0.04] transition-colors">
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-indigo-300 font-mono">SOUL v{h.version} Upgrade</span>
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/5 px-2 py-0.5 border border-emerald-500/10 rounded font-mono">
                                      Score: {h.score.toFixed(2)}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-relaxed mt-2 italic font-mono whitespace-pre-wrap">
                                    {h.soul_text.substring(0, 180)}...
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

              </div>
            </div>
          )}

          {/* Tab Content 3: Historical Cycle Logs */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No historical log runs registered.</div>
              ) : (
                history.map((log) => {
                  const isExpanded = expandedHistory === log._id
                  const formattedTime = new Date(log.timestamp).toLocaleString()
                  return (
                    <div key={log._id} className="bg-[#050b14]/70 border border-white/[0.04] rounded-xl p-5 hover:border-white/[0.08] transition-all">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-3 mb-1.5">
                            <span className="text-sm font-black text-slate-200 font-mono">{log.cycle_id}</span>
                            <span className="text-[10px] font-bold text-slate-500 font-mono">{formattedTime}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {log.phases_completed.map((phase, i) => (
                              <span key={i} className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-white/[0.02] border border-white/[0.04] px-2 py-0.5 rounded">
                                {phase}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right text-xs font-mono text-slate-400 font-semibold">
                          <p>Problems Resolved: <span className="text-cyan-400 font-bold">{log.problems?.length || 0}</span></p>
                          <p>Wild Ideas Seeded: <span className="text-indigo-400 font-bold">{log.ideas?.length || 0}</span></p>
                        </div>
                      </div>

                      <div className="border-t border-white/[0.04] pt-4">
                        <button 
                          onClick={() => setExpandedHistory(isExpanded ? null : log._id)}
                          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-400"
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <span>View Cyber-Autopsy Run Summary</span>
                        </button>
                        
                        {isExpanded && (
                          <div className="mt-3 p-4 bg-[#020408] rounded-lg border border-white/[0.03] space-y-4 text-xs font-semibold leading-relaxed">
                            <div>
                              <h4 className="text-xs font-black uppercase text-cyan-400 font-mono tracking-wider mb-2">Problems Detected</h4>
                              {log.problems?.length === 0 ? (
                                <p className="text-xs text-slate-500 italic">None</p>
                              ) : (
                                <ul className="list-disc pl-4 space-y-1 text-slate-300">
                                  {log.problems?.map((p: any, i: number) => (
                                    <li key={i}>{p.description}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <h4 className="text-xs font-black uppercase text-indigo-400 font-mono tracking-wider mb-2">Genetic Improvement Ideas Seeded</h4>
                              {log.ideas?.length === 0 ? (
                                <p className="text-xs text-slate-500 italic">None</p>
                              ) : (
                                <ul className="list-disc pl-4 space-y-1 text-slate-300">
                                  {log.ideas?.map((idea: any, i: number) => (
                                    <li key={i}>
                                      <span className="font-bold font-mono text-indigo-300 mr-2">[{idea.priority_score.toFixed(1)} Impact]</span>
                                      {idea.idea_text}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

        </div>

        {/* Right column content: Harvested Signals & Override queue */}
        <div className="space-y-8">
          
          {/* Panel: Core Signal Harvester (Layer 1 Feed) */}
          <div className="bg-[#050b14] border border-white/[0.04] rounded-2xl p-6">
            <div className="flex items-center justify-between border-b border-white/[0.03] pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <Activity size={16} className="text-cyan-400" />
                <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider font-mono">Harvested Trace Signals</h2>
              </div>
              <span className="text-[9px] font-mono font-bold bg-cyan-500/5 px-2.5 py-0.5 border border-cyan-500/20 text-cyan-400 rounded">
                Real-Time Data Feed
              </span>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {signals.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs italic">
                  No execution trace signals found. Select an active agent to load metrics.
                </div>
              ) : (
                signals.map((sig) => (
                  <div key={sig._id} className="p-3 bg-white/[0.01] border border-white/[0.02] hover:border-white/[0.04] rounded-lg transition-colors text-xs font-mono">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`font-black uppercase tracking-wider ${
                        sig.signal_type === 'penalty' 
                          ? 'text-rose-400' 
                          : sig.signal_type === 'test' 
                          ? 'text-indigo-400' 
                          : 'text-emerald-400'
                      }`}>
                        {sig.signal_type}
                      </span>
                      <span className={`font-bold ${sig.value < 0 ? 'text-rose-400' : sig.value === 0 ? 'text-slate-500' : 'text-emerald-400'}`}>
                        {sig.value > 0 ? `+${sig.value.toFixed(1)}` : sig.value.toFixed(1)}
                      </span>
                    </div>
                    {sig.tool_name && (
                      <p className="text-[10px] text-slate-400 font-semibold">Tool: <code className="text-slate-200">{sig.tool_name}</code></p>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1 truncate leading-relaxed">
                      {sig.raw_evidence}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Panel: Manual Override Gateway */}
          <div className="bg-[#050b14] border border-white/[0.04] rounded-2xl p-6">
            <div className="flex items-center gap-2.5 mb-4 border-b border-white/[0.03] pb-4">
              <Sliders size={16} className="text-indigo-400" />
              <h2 className="text-sm font-black text-slate-200 uppercase tracking-wider font-mono">Manual Overrides</h2>
            </div>

            {pending.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-6">Override queue empty. System running 100% autonomously.</p>
            ) : (
              <div className="space-y-4">
                {pending.slice(0, 3).map((item) => (
                  <div key={item._id} className="p-3.5 bg-white/[0.01] border border-white/[0.02] rounded-xl text-xs">
                    <p className="font-bold text-slate-200">Agent {item.target_agent_id.substring(0, 8)}</p>
                    <p className="text-slate-500 text-[10px] mt-0.5 leading-relaxed font-semibold truncate">{item.problem_description}</p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleApprove(item._id)}
                        className="flex-1 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 rounded-md font-bold text-[10px] uppercase transition-all"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(item._id)}
                        className="flex-1 py-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 rounded-md font-bold text-[10px] uppercase transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  )
}
