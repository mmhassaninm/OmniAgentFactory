import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAgents, useCreateAgent, useFactoryStatus } from '../hooks/useAgent'
import { useFactorySocket } from '../hooks/useSocket'
import AgentCard from '../components/AgentCard'
import AgentCatalog from '../components/AgentCatalog'
import ModelRouter from '../components/ModelRouter'
import FactoryPulse from '../components/FactoryPulse'
import ActivityFeed from '../components/ActivityFeed'
import { useLang } from '../i18n/LanguageContext'
import { Layers, Play, StopCircle, RefreshCw, Zap, ShieldAlert, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react'

interface ProviderHealth {
  provider: string
  status: 'online' | 'offline' | 'unconfigured'
  latency_ms: number
  keys_active: number
  keys_exhausted: number
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    throw new Error(res.statusText)
  }
  return res.json()
}

export default function Factory() {
  const navigate = useNavigate()
  const { lang, setLang, t } = useLang()
  const { data: agentsData, isLoading } = useAgents()
  const { data: factoryStatus } = useFactoryStatus()
  const { connected: wsConnected, events: factoryEvents } = useFactorySocket()
  const createAgent = useCreateAgent()

  const [showCreate, setShowCreate] = useState(false)
  const [catalogAgentId, setCatalogAgentId] = useState<string | null>(null)
  const [newAgent, setNewAgent] = useState({ name: '', goal: '', template: 'general' })

  // Autonomous central state
  const [autoGoal, setAutoGoal] = useState('')
  const [autoInterval, setAutoInterval] = useState(5)
  const [autoLogs, setAutoLogs] = useState<any[]>([])
  const [autoToggling, setAutoToggling] = useState(false)

  const fetchAutoLogs = async () => {
    try {
      const res = await fetch('/api/factory/autonomous/log')
      if (res.ok) {
        const d = await res.json()
        setAutoLogs(d.logs || [])
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchAutoLogs()
    const intv = setInterval(fetchAutoLogs, 5000)
    return () => clearInterval(intv)
  }, [])

  useEffect(() => {
    if (factoryStatus?.autonomous) {
      setAutoGoal(factoryStatus.autonomous.goal || '')
      setAutoInterval(factoryStatus.autonomous.interval_minutes || 5)
    }
  }, [factoryStatus?.autonomous])

  const handleToggleAuto = async () => {
    setAutoToggling(true)
    const running = factoryStatus?.autonomous?.running
    try {
      if (running) {
        await fetch('/api/factory/autonomous/stop', { method: 'POST' })
      } else {
        await fetch('/api/factory/autonomous/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal: autoGoal.trim() || 'Create specialized agents to solve problems', interval_minutes: autoInterval })
        })
      }
      fetchAutoLogs()
    } catch (e) {
      console.error(e)
    } finally {
      setAutoToggling(false)
    }
  }

  const { data: healthData } = useQuery<ProviderHealth[]>({
    queryKey: ['provider-health'],
    queryFn: () => fetchJson('/api/factory/settings/provider-health'),
    refetchInterval: 30000,
  })

  const allProvidersDown = healthData && healthData.length > 0 && healthData.every(
    h => h.status !== 'online' || h.keys_active === 0
  )

  const agents = agentsData?.agents || []
  const activeCount = factoryStatus?.factory?.active_evolutions || 0
  const maxConcurrent = factoryStatus?.factory?.max_concurrent || 5
  const isNightMode = factoryStatus?.night_mode || false

  // Compute stats dynamically
  const totalAgentsCount = agents.length
  const activeAgentsCount = agents.filter((a: any) => a.status !== 'stopped' && a.status !== 'error' && a.status !== 'idle').length
  const evolvingAgentsCount = agents.filter((a: any) => a.status === 'evolving').length
  const completedAgentsCount = agents.filter((a: any) => a.version >= 10 || a.status === 'complete').length

  const handleCreate = async () => {
    if (!newAgent.name.trim() || !newAgent.goal.trim()) return
    await createAgent.mutateAsync({
      name: newAgent.name.trim(),
      goal: newAgent.goal.trim(),
      template: newAgent.template,
    })
    setNewAgent({ name: '', goal: '', template: 'general' })
    setShowCreate(false)
  }

  const TEMPLATES = [
    { value: 'general', emoji: '🤖', label: 'General Purpose', descKey: 'create.template.general' },
    { value: 'code', emoji: '💻', label: 'Code Generator', descKey: 'create.template.code' },
    { value: 'research', emoji: '🔬', label: 'Research Agent', descKey: 'create.template.research' },
    { value: 'revenue', emoji: '💰', label: 'Revenue Agent', descKey: 'create.template.revenue' },
  ]

  // Dynamic status details
  const isAutonomousOn = !!factoryStatus?.autonomous?.running
  const isRunning = activeCount > 0

  let statusText = 'IDLE'
  let statusBadgeStyle = 'bg-slate-800 text-slate-400 border-slate-700'
  let statusDotColor = 'bg-slate-400'

  if (isAutonomousOn) {
    statusText = 'AUTONOMOUS'
    statusBadgeStyle = 'bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
    statusDotColor = 'bg-green-400'
  } else if (isRunning) {
    statusText = 'RUNNING'
    statusBadgeStyle = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
    statusDotColor = 'bg-indigo-400'
  }

  return (
    <div className="min-h-screen p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* ── Header Bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              🏭 Agent Factory
            </h1>
            
            {/* Security Indicator */}
            <div 
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono bg-green-500/10 text-green-400 border border-green-500/25 shadow-[0_0_12px_rgba(16,185,129,0.08)] cursor-help"
              title="All agent code runs in isolated Docker containers"
            >
              <span>🔒</span>
              <span>Sandbox Mode: Active</span>
            </div>
            
            {/* System Status Banner */}
            <span className={`inline-flex items-center gap-1 text-[11px] font-mono ${wsConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              {wsConnected ? 'LIVE' : 'CONNECTING'}
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Autonomous Evolution Engine · Self-Aware Intelligence
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Night mode indicator */}
          {isNightMode && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-950/40 text-indigo-300 border border-indigo-500/25 font-mono">
              🌙 Night Shift Active
            </span>
          )}

          {/* Factory Status Badge */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${statusBadgeStyle} font-mono uppercase tracking-wider`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor} animate-pulse`} />
            {statusText}
          </span>

          {/* Language Toggle */}
          <button
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#0d1117] border border-white/[0.06] text-slate-300 hover:border-indigo-500/30 hover:text-white transition-all font-mono"
            style={{ fontFamily: lang === "ar" ? "'Cairo', sans-serif" : "inherit" }}
          >
            <span>🌐</span>
            <span>{lang === "en" ? "عربي" : "English"}</span>
          </button>

          {/* Add New Agent Button */}
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-indigo-500/10 flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span>
            <span>New Agent</span>
          </button>
        </div>
      </div>

      {allProvidersDown && (
        <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <strong className="font-extrabold text-rose-400">Critical: All LLM Credentials Down</strong>
              <p className="text-xs text-rose-300/80 mt-0.5">
                No active provider credentials detected in your vault.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/settings/keys')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-rose-500 text-black hover:bg-rose-400 active:scale-[0.98] transition-all shrink-0 ml-4 shadow-[0_0_15px_rgba(244,63,94,0.4)] border border-rose-400"
          >
            Configure Keys
          </button>
        </div>
      )}

      {/* ── Statistics Row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Agents */}
        <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-mono font-bold uppercase tracking-wider">Total Agents</p>
            <p className="text-2xl font-black mt-1 font-mono text-white">{totalAgentsCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-center text-indigo-400">
            🤖
          </div>
        </div>

        {/* Card 2: Active */}
        <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-mono font-bold uppercase tracking-wider">Active Run</p>
            <p className="text-2xl font-black mt-1 font-mono text-emerald-400">{activeAgentsCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center text-emerald-400">
            ⚡
          </div>
        </div>

        {/* Card 3: Evolving */}
        <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-mono font-bold uppercase tracking-wider">Evolving</p>
            <p className="text-2xl font-black mt-1 font-mono text-indigo-400">{evolvingAgentsCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/5 border border-purple-500/10 flex items-center justify-center text-indigo-400 animate-spin-slow">
            🔄
          </div>
        </div>

        {/* Card 4: Completed */}
        <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-slate-500 text-xs font-mono font-bold uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-black mt-1 font-mono text-cyan-400">{completedAgentsCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-500/5 border border-cyan-500/10 flex items-center justify-center text-cyan-400">
            🏆
          </div>
        </div>
      </div>

      {/* ── Model Router & Self-Awareness ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ModelRouter />
        </div>
        <div className="lg:col-span-1">
          <FactoryPulse />
        </div>
      </div>

      {/* ── Central Autonomous Command Panel ──────────────────────────── */}
      <div className={`p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden bg-[#0d1117] ${
        isAutonomousOn
          ? 'border-indigo-500/40 shadow-[0_0_30px_rgba(99,102,241,0.1)]'
          : 'border-white/[0.06]'
      }`}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-6">
          {/* Header row */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl animate-pulse">🧠</span>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  Central Autonomous Commander
                  {isAutonomousOn && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      ON-CHAIN
                    </span>
                  )}
                </h2>
                <p className="text-slate-500 text-xs">
                  Unleash autonomous loops to continuously build and optimize enclaves
                </p>
              </div>
            </div>

            {/* Toggle controls */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">Interval:</span>
                <input
                  type="number"
                  min={1}
                  value={autoInterval}
                  disabled={isAutonomousOn}
                  onChange={(e) => setAutoInterval(parseInt(e.target.value) || 5)}
                  className="w-16 px-2 py-1 text-xs text-center rounded bg-[#080c14] border border-white/[0.06] text-white focus:outline-none focus:border-indigo-500/30 font-mono"
                />
                <span className="text-xs text-slate-400 font-mono">min</span>
              </div>

              <button
                onClick={handleToggleAuto}
                disabled={autoToggling}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg font-extrabold text-xs tracking-wider uppercase font-mono transition-all duration-300 ${
                  isAutonomousOn
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/10'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                }`}
              >
                {autoToggling ? (
                  <span className="animate-spin">⚙</span>
                ) : isAutonomousOn ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    <span>STOP ENGINE</span>
                  </>
                ) : (
                  <span>ENGAGE ENGINE</span>
                )}
              </button>
            </div>
          </div>

          {/* Objective, logs and brain state */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4 border-t border-white/[0.04]">
            {/* Objective Input */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Autonomous Mission Objective
              </label>
              <textarea
                value={autoGoal}
                disabled={isAutonomousOn}
                onChange={(e) => setAutoGoal(e.target.value)}
                placeholder="Describe what the factory should build autonomously..."
                rows={3}
                className="w-full p-3.5 rounded-xl bg-[#080c14] border border-white/[0.06] text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/30 transition-all resize-none font-mono"
              />
            </div>

            {/* Central Brain State */}
            <div className="flex flex-col justify-between p-4 rounded-xl bg-[#080c14] border border-white/[0.04] relative">
              <span className="absolute top-3 right-3 text-2xl opacity-5 select-none">💭</span>
              <div>
                <span className="block text-[10px] font-bold text-indigo-400 uppercase tracking-wider font-mono mb-2">
                  Central Brain State
                </span>
                <p className="text-xs font-medium text-slate-300 italic leading-relaxed">
                  "{factoryStatus?.autonomous?.last_thought || 'Central intelligence loop is idling. Engage engine to launch.'}"
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                <span className={`w-1.5 h-1.5 rounded-full ${isAutonomousOn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span>
                  {isAutonomousOn ? 'Thinking continuously' : 'Standby'}
                </span>
              </div>
            </div>

            {/* Recent Decisions & Logs */}
            <div className="flex flex-col justify-between p-4 rounded-xl bg-[#080c14] border border-white/[0.04]">
              <div>
                <span className="block text-[10px] font-bold text-cyan-400 uppercase tracking-wider font-mono mb-2">
                  Recent Decisions & Log
                </span>
                <div className="space-y-2 max-h-24 overflow-y-auto pr-1">
                  {autoLogs.length === 0 ? (
                    <p className="text-xs text-slate-600 italic py-2 text-center font-mono">No decisions logged yet.</p>
                  ) : (
                    autoLogs.map((log, index) => (
                      <div key={index} className="p-2 rounded bg-black/30 border border-white/[0.03] text-[11px] font-mono text-slate-400">
                        <div className="flex items-center justify-between text-[9px] text-slate-500 mb-0.5">
                          <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                          <span className={`font-black tracking-wider uppercase ${
                            log.action === 'CREATE' ? 'text-cyan-400' : log.action === 'EVOLVE' ? 'text-purple-400' : 'text-slate-500'
                          }`}>
                            {log.action}
                          </span>
                        </div>
                        <p className="text-slate-400 leading-normal truncate">{log.thought}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Live Activity Feed ─────────────────────────────────────────── */}
      <ActivityFeed liveEvents={factoryEvents} agents={agents} />

      {/* ── Agent Grid ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider font-mono">
          Evolved Agents Collection
        </h2>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-20 bg-[#0d1117] border border-white/[0.06] rounded-xl">
            <div className="text-center space-y-2">
              <div className="text-2xl animate-spin text-indigo-500">⚙</div>
              <p className="text-xs font-mono text-slate-500 animate-pulse">Retrieving agent catalog...</p>
            </div>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-[#0d1117] border border-white/[0.06] border-dashed rounded-xl text-center">
            <div className="text-4xl mb-4 opacity-40">🏭</div>
            <h3 className="text-base font-bold text-white mb-1">No Agents Configured</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6">
              Create your very first autonomous intelligence enclave. Let the evolution engine design its code and workflows dynamically!
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-500/10"
            >
              Create First Agent
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {agents.map((agent: any) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onShowCatalog={(id) => setCatalogAgentId(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Create Agent Modal ─────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl max-w-lg w-full animate-slide-up shadow-2xl">
            <div className="px-6 py-4 border-b border-white/[0.04]">
              <h2 className="text-lg font-bold text-white">Create New Agent</h2>
              <p className="text-xs text-slate-500 mt-1">Specify your agent mission objectives and select templates</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1.5">Agent Name</label>
                <input
                  type="text"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                  placeholder="e.g. CodeEnforcer, EgyptianScribe..."
                  className="w-full px-4 py-2.5 rounded-lg bg-[#080c14] border border-white/[0.06] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/30 transition-all font-mono"
                  autoFocus
                />
              </div>

              {/* Goal */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1.5">Agent Goal / Mission</label>
                <textarea
                  value={newAgent.goal}
                  onChange={(e) => setNewAgent({ ...newAgent, goal: e.target.value })}
                  placeholder="Describe your agent mission goal in full detail..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg bg-[#080c14] border border-white/[0.06] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/30 transition-all resize-none font-mono"
                />
              </div>

              {/* Template */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1.5">Behavioral Template</label>
                <div className="grid grid-cols-4 gap-2">
                  {TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.value}
                      onClick={() => setNewAgent({ ...newAgent, template: tmpl.value })}
                      className={`p-3 rounded-lg border text-center transition-all duration-200 ${
                        newAgent.template === tmpl.value
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_12px_rgba(99,102,241,0.1)]'
                          : 'border-white/[0.06] bg-[#080c14] hover:border-white/[0.12]'
                      }`}
                    >
                      <div className="text-lg mb-1">{tmpl.emoji}</div>
                      <div className="text-[10px] font-bold text-slate-400 truncate">{tmpl.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-white/[0.04] flex justify-end gap-2.5 bg-[#05080f]/40">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newAgent.name.trim() || !newAgent.goal.trim() || createAgent.isPending}
                className="px-5 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all font-mono"
              >
                {createAgent.isPending ? 'Creating...' : 'Initialize Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Catalog Modal ──────────────────────────────────────────────── */}
      {catalogAgentId && (
        <AgentCatalog agentId={catalogAgentId} onClose={() => setCatalogAgentId(null)} />
      )}
    </div>
  )
}
