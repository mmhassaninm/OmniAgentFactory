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

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              <span className="gradient-text">OmniBot</span>
              <span className="text-text-muted font-light ml-2 text-lg sm:text-xl">{t('factory.title')}</span>
            </h1>
            <p className="text-text-muted text-sm mt-1">
              {t('factory.subtitle_real')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Night mode indicator */}
            {isNightMode && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                             bg-indigo-950/50 text-indigo-300 border border-indigo-500/30">
                🌙 {t('factory.night_mode')}
              </span>
            )}

            {/* WebSocket status */}
            <span className={`flex items-center gap-1.5 text-xs ${wsConnected ? 'text-emerald-400' : 'text-text-muted'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse-glow' : 'bg-slate-600'}`} />
              {wsConnected ? t('factory.live') : t('factory.connecting')}
            </span>

            {/* Active agents counter */}
            <div className="glass px-3 py-1.5 rounded-lg text-xs">
              <span className="text-accent-primary font-bold">{activeCount}</span>
              <span className="text-text-muted">/{maxConcurrent} {t('agent.status.evolving').toLowerCase()}</span>
            </div>

            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                         bg-bg-panel border border-border-default text-text-secondary
                         hover:border-accent-primary/40 hover:text-accent-primary
                         transition-all duration-200"
              style={{ fontFamily: lang === "ar" ? "'Cairo', sans-serif" : "inherit" }}
            >
              <span>🌐</span>
              <span>{lang === "en" ? "عربي" : "English"}</span>
            </button>

            {/* Settings button */}
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                         bg-bg-panel border border-border-default text-text-secondary
                         hover:border-accent-primary/40 hover:text-accent-primary
                         transition-all duration-200"
            >
              <span>⚙</span>
              <span>{t('factory.settings_btn')}</span>
            </button>

            {/* Key Vault button */}
            <button
              onClick={() => navigate('/vault')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                         bg-bg-panel border border-border-default text-text-secondary
                         hover:border-[#00d4ff]/40 hover:text-[#00d4ff]
                         transition-all duration-200 shadow-[0_0_10px_rgba(0,212,255,0.02)] hover:shadow-[0_0_15px_rgba(0,212,255,0.1)]"
            >
              <span>🔑</span>
              <span>Vault</span>
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
              <span>{t('factory.new_agent')}</span>
            </button>
          </div>
        </div>
      </header>

      {allProvidersDown && (
        <div className="mb-6 p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-xl animate-bounce">⚠️</span>
            <div>
              <strong className="font-extrabold text-rose-400">{t('factory.critical_warning')}</strong>
              <p className="text-xs text-rose-300/80 mt-0.5">
                {t('factory.critical_desc')}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/settings/keys')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-rose-500 text-black hover:bg-rose-400 active:scale-[0.98] transition-all shrink-0 ml-4 shadow-[0_0_15px_rgba(244,63,94,0.4)] border border-rose-400"
          >
            {t('factory.configure_keys')}
          </button>
        </div>
      )}

      {/* ── Model Router Health ────────────────────────────────────────── */}
      <div className="mb-6">
        <ModelRouter />
      </div>

      {/* ── Factory Pulse (Self-Awareness Layer) ───────────────────────── */}
      <FactoryPulse />

      {/* ── Central Autonomous Command Panel ──────────────────────────── */}
      <div className="mb-6 glass-strong p-6 rounded-2xl border border-accent-secondary/20 relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent-secondary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent-tertiary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          {/* Title bar */}
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl animate-pulse">🧠</span>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-text-primary">
                  🧠 {t('autonomous.title') || 'Central Autonomous Commander'}
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  {t('autonomous.subtitle') || 'Unleash the central intelligence loop to autonomously spawn and optimize agents'}
                </p>
              </div>
            </div>

            {/* Toggle controls */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Interval:</span>
                <input
                  type="number"
                  min={1}
                  value={autoInterval}
                  disabled={factoryStatus?.autonomous?.running}
                  onChange={(e) => setAutoInterval(parseInt(e.target.value) || 5)}
                  className="w-16 px-2 py-1 text-xs text-center rounded-lg bg-bg-panel border border-border-default text-text-primary focus:outline-none"
                />
                <span className="text-xs text-text-muted">min</span>
              </div>

              <button
                onClick={handleToggleAuto}
                disabled={autoToggling}
                className={`relative flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-extrabold text-sm transition-all duration-300 shadow-md ${
                  factoryStatus?.autonomous?.running
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                    : 'bg-gradient-to-r from-accent-secondary to-accent-tertiary text-white hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]'
                }`}
              >
                {autoToggling ? (
                  <span className="animate-spin text-sm">⚙</span>
                ) : factoryStatus?.autonomous?.running ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    <span>ACTIVE · STOP ENGINE</span>
                  </>
                ) : (
                  <span>ENGAGE ENGINE</span>
                )}
              </button>
            </div>
          </div>

          {/* Configuration and Live logs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Core Goal Input */}
            <div className="lg:col-span-1 space-y-3">
              <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider">
                Autonomous Mission Objective
              </label>
              <textarea
                value={autoGoal}
                disabled={factoryStatus?.autonomous?.running}
                onChange={(e) => setAutoGoal(e.target.value)}
                placeholder="Describe what you want the factory to build autonomously (e.g. 'Build a directory of the best open-source AI tools and write a research paper on them')"
                rows={4}
                className="w-full p-3.5 rounded-xl bg-bg-panel border border-border-default text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-secondary/40 transition-colors resize-none"
              />
            </div>

            {/* Current Thought Log */}
            <div className="lg:col-span-1 flex flex-col justify-between p-4 rounded-xl bg-bg-panel border border-border-default/50 relative">
              <span className="absolute top-3 right-3 text-2xl opacity-10 select-none">💭</span>
              <div>
                <span className="block text-xs font-bold text-accent-secondary uppercase tracking-wider mb-2">
                  Central Brain State
                </span>
                <p className="text-sm font-medium text-text-primary italic leading-relaxed">
                  "{factoryStatus?.autonomous?.last_thought || 'Central intelligence loop is idling. Set a goal and engage the engine to begin.'}"
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-xs text-text-muted">
                <span className={`w-1.5 h-1.5 rounded-full ${factoryStatus?.autonomous?.running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span>
                  {factoryStatus?.autonomous?.running ? 'Looping and thinking continuously' : 'Engine standby'}
                </span>
              </div>
            </div>

            {/* Recent Autonomous Actions Table */}
            <div className="lg:col-span-1 flex flex-col justify-between p-4 rounded-xl bg-bg-panel border border-border-default/50">
              <div>
                <span className="block text-xs font-bold text-accent-tertiary uppercase tracking-wider mb-2">
                  Recent Decisions & Log
                </span>
                <div className="space-y-2 max-h-28 overflow-y-auto pr-1">
                  {autoLogs.length === 0 ? (
                    <p className="text-xs text-text-muted italic py-4 text-center">No decisions logged yet.</p>
                  ) : (
                    autoLogs.map((log, index) => (
                      <div key={index} className="p-2 rounded bg-bg-elevated/40 border border-border-default/20 text-xs">
                        <div className="flex items-center justify-between font-mono text-[10px] text-text-muted mb-1">
                          <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                          <span className={`font-black uppercase tracking-wider ${
                            log.action === 'CREATE' ? 'text-cyan-400' : log.action === 'EVOLVE' ? 'text-purple-400' : 'text-slate-400'
                          }`}>
                            {log.action}
                          </span>
                        </div>
                        <p className="text-text-secondary leading-normal truncate">{log.thought}</p>
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
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="text-4xl animate-spin-slow mb-4">⚙</div>
            <p className="text-text-muted">{t('factory.loading')}</p>
          </div>
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4 opacity-30">🏭</div>
          <h2 className="text-xl font-bold text-text-primary mb-2">{t('factory.no_agents_title')}</h2>
          <p className="text-text-muted mb-6 max-w-md">
            {t('factory.no_agents_desc')}
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-6 py-3 rounded-xl font-semibold
                       bg-gradient-to-r from-accent-secondary to-accent-tertiary text-white
                       hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]
                       transition-all duration-300"
          >
            {t('factory.create_first')}
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
              <h2 className="text-lg font-bold gradient-text">{t('create.title')}</h2>
              <p className="text-xs text-text-muted mt-1">{t('create.subtitle')}</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('create.name')}</label>
                <input
                  type="text"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                  placeholder={t('create.name_placeholder')}
                  className="w-full px-4 py-2.5 rounded-lg bg-bg-panel border border-border-default
                             text-text-primary text-sm placeholder:text-text-muted
                             focus:outline-none focus:border-accent-secondary/50 transition-colors"
                  autoFocus
                />
              </div>

              {/* Goal */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('create.goal')}</label>
                <textarea
                  value={newAgent.goal}
                  onChange={(e) => setNewAgent({ ...newAgent, goal: e.target.value })}
                  placeholder={t('create.goal_placeholder')}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg bg-bg-panel border border-border-default
                             text-text-primary text-sm placeholder:text-text-muted resize-none
                             focus:outline-none focus:border-accent-secondary/50 transition-colors"
                />
              </div>

              {/* Template */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('create.template')}</label>
                <div className="grid grid-cols-4 gap-2">
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
                      <div className="text-lg mb-1">{tmpl.emoji}</div>
                      <div className="text-[10px] text-text-muted">{t(tmpl.descKey)}</div>
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
                {t('create.cancel')}
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
                {createAgent.isPending ? t('create.creating') : t('create.submit')}
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
