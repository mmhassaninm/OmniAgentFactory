import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAgents, useCreateAgent, useFactoryStatus } from '../hooks/useAgent'
import { useFactorySocket } from '../hooks/useSocket'
import AgentCard from '../components/AgentCard'
import AgentCatalog from '../components/AgentCatalog'
import ModelRouter from '../components/ModelRouter'
import FactoryPulse from '../components/FactoryPulse'
import ActivityFeed from '../components/ActivityFeed'

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

const TEMPLATES = [
  { value: 'general', label: '🤖 General Purpose', desc: 'Versatile agent for any task' },
  { value: 'code', label: '💻 Code Generator', desc: 'Specialized in code generation & analysis' },
  { value: 'research', label: '🔬 Research Agent', desc: 'Web research & information synthesis' },
]

export default function Factory() {
  const navigate = useNavigate()
  const { data: agentsData, isLoading } = useAgents()
  const { data: factoryStatus } = useFactoryStatus()
  const { connected: wsConnected, events: factoryEvents } = useFactorySocket()
  const createAgent = useCreateAgent()

  const [showCreate, setShowCreate] = useState(false)
  const [catalogAgentId, setCatalogAgentId] = useState<string | null>(null)
  const [newAgent, setNewAgent] = useState({ name: '', goal: '', template: 'general' })

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

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              <span className="gradient-text">OmniBot</span>
              <span className="text-text-muted font-light ml-2 text-lg sm:text-xl">Agent Factory</span>
            </h1>
            <p className="text-text-muted text-sm mt-1">
              Create, evolve, and manage autonomous AI agents
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Night mode indicator */}
            {isNightMode && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                             bg-indigo-950/50 text-indigo-300 border border-indigo-500/30">
                🌙 Night Mode
              </span>
            )}

            {/* WebSocket status */}
            <span className={`flex items-center gap-1.5 text-xs ${wsConnected ? 'text-emerald-400' : 'text-text-muted'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse-glow' : 'bg-slate-600'}`} />
              {wsConnected ? 'Live' : 'Connecting...'}
            </span>

            {/* Active agents counter */}
            <div className="glass px-3 py-1.5 rounded-lg text-xs">
              <span className="text-accent-primary font-bold">{activeCount}</span>
              <span className="text-text-muted">/{maxConcurrent} evolving</span>
            </div>

            {/* Settings button */}
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                         bg-bg-panel border border-border-default text-text-secondary
                         hover:border-accent-primary/40 hover:text-accent-primary
                         transition-all duration-200"
            >
              <span>⚙</span>
              <span>Settings</span>
            </button>

            {/* Create button */}
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm
                         bg-gradient-to-r from-accent-secondary to-accent-tertiary text-white
                         hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]
                         transition-all duration-300 hover:translate-y-[-1px]"
            >
              <span className="text-lg leading-none">+</span>
              <span>New Agent</span>
            </button>
          </div>
        </div>
      </header>

      {allProvidersDown && (
        <div className="mb-6 p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-xl animate-bounce">⚠️</span>
            <div>
              <strong className="font-extrabold text-rose-400">CRITICAL SYSTEM WARNING: ALL PROVIDERS OFFLINE</strong>
              <p className="text-xs text-rose-300/80 mt-0.5">
                Every single API credential in your settings is either unconfigured, failed health pings, or rate-limited. Evolving agents will stall until providers recover or keys are added.
              </p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/settings')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-rose-500 text-black hover:bg-rose-400 active:scale-[0.98] transition-all shrink-0 ml-4 shadow-[0_0_15px_rgba(244,63,94,0.4)] border border-rose-400"
          >
            Configure Keys
          </button>
        </div>
      )}

      {/* ── Model Router Health ────────────────────────────────────────── */}
      <div className="mb-6">
        <ModelRouter />
      </div>

      {/* ── Factory Pulse (Self-Awareness Layer) ───────────────────────── */}
      <FactoryPulse />

      {/* ── Live Activity Feed ─────────────────────────────────────────── */}
      <ActivityFeed liveEvents={factoryEvents} agents={agents} />

      {/* ── Agent Grid ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="text-4xl animate-spin-slow mb-4">⚙</div>
            <p className="text-text-muted">Loading agents...</p>
          </div>
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4 opacity-30">🏭</div>
          <h2 className="text-xl font-bold text-text-primary mb-2">No agents yet</h2>
          <p className="text-text-muted mb-6 max-w-md">
            Create your first agent to start the factory. Agents evolve autonomously
            to improve their performance over time.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-6 py-3 rounded-xl font-semibold
                       bg-gradient-to-r from-accent-secondary to-accent-tertiary text-white
                       hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]
                       transition-all duration-300"
          >
            Create First Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent: any) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onShowCatalog={(id) => setCatalogAgentId(id)}
            />
          ))}
        </div>
      )}

      {/* ── Create Agent Modal ─────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-strong rounded-2xl max-w-lg w-full animate-slide-up">
            <div className="px-6 py-4 border-b border-border-default/50">
              <h2 className="text-lg font-bold gradient-text">Create New Agent</h2>
              <p className="text-xs text-text-muted mt-1">Define your agent's purpose and let the factory evolve it</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Agent Name</label>
                <input
                  type="text"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                  placeholder="e.g., Data Analyst, Code Reviewer"
                  className="w-full px-4 py-2.5 rounded-lg bg-bg-panel border border-border-default
                             text-text-primary text-sm placeholder:text-text-muted
                             focus:outline-none focus:border-accent-secondary/50 transition-colors"
                  autoFocus
                />
              </div>

              {/* Goal */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Agent Goal</label>
                <textarea
                  value={newAgent.goal}
                  onChange={(e) => setNewAgent({ ...newAgent, goal: e.target.value })}
                  placeholder="Describe what this agent should achieve..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg bg-bg-panel border border-border-default
                             text-text-primary text-sm placeholder:text-text-muted resize-none
                             focus:outline-none focus:border-accent-secondary/50 transition-colors"
                />
              </div>

              {/* Template */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Template</label>
                <div className="grid grid-cols-3 gap-2">
                  {TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.value}
                      onClick={() => setNewAgent({ ...newAgent, template: tmpl.value })}
                      className={`p-3 rounded-lg border text-center transition-all duration-200 ${
                        newAgent.template === tmpl.value
                          ? 'border-accent-secondary bg-accent-secondary/10 shadow-[0_0_10px_rgba(124,58,237,0.15)]'
                          : 'border-border-default bg-bg-panel hover:border-border-default/80'
                      }`}
                    >
                      <div className="text-lg mb-1">{tmpl.label.split(' ')[0]}</div>
                      <div className="text-[10px] text-text-muted">{tmpl.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-border-default/50 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary rounded-lg
                           hover:bg-bg-elevated transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newAgent.name.trim() || !newAgent.goal.trim() || createAgent.isPending}
                className="px-5 py-2 text-sm font-semibold rounded-lg
                           bg-gradient-to-r from-accent-secondary to-accent-tertiary text-white
                           hover:shadow-[0_0_15px_rgba(124,58,237,0.3)]
                           disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all duration-200"
              >
                {createAgent.isPending ? 'Creating...' : 'Create Agent'}
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
