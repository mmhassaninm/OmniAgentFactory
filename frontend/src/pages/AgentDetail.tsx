import { useParams, useNavigate } from 'react-router-dom'
import {
  useAgent,
  useAgentThoughts,
  useAgentVersions,
  useControlAgent,
  useEvolveAgent,
  useResumeAgent,
  useFixAgent,
  useDeleteAgent,
  useAgentBudget,
  useUpdateAgentBudget,
} from '../hooks/useAgent'
import { useAgentSocket } from '../hooks/useSocket'
import ThoughtLog from '../components/ThoughtLog'
import KillSwitch from '../components/KillSwitch'
import GenealogyTree from '../components/GenealogyTree'
import { useState } from 'react'
import { useLang } from '../i18n/LanguageContext'

const STATUS_CLASSES: Record<string, string> = {
  evolving: 'status-evolving',
  paused: 'status-paused',
  paused_safe: 'status-paused',
  paused_unsafe: 'status-paused',
  stopped: 'status-stopped',
  idle: 'status-idle',
  testing: 'status-testing',
  error: 'status-error',
}

export default function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const { t } = useLang()
  const { data: agent, isLoading } = useAgent(agentId || '')
  const { data: thoughtsData } = useAgentThoughts(agentId || '')
  const { data: versionsData } = useAgentVersions(agentId || '')
  const { thoughts: liveThoughts } = useAgentSocket(agentId || null)
  const controlMut = useControlAgent()
  const evolveMut = useEvolveAgent()
  const resumeMut = useResumeAgent()
  const fixMut = useFixAgent()
  const deleteMut = useDeleteAgent()
  const updateBudgetMut = useUpdateAgentBudget()

  const [isEditingBudget, setIsEditingBudget] = useState(false)
  const [editedBudgetLimit, setEditedBudgetLimit] = useState<number | ''>('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    mission: false,
    metrics: false,
    provider: false,
    thoughts: false,
    timeline: false,
    code: false,
    limitations: false,
    catalog: true,
  })
  const [selectedVersionCode, setSelectedVersionCode] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const toggle = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  if (isLoading || !agent) {
    return (
      <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="h-6 w-24 bg-bg-surface rounded animate-pulse mb-6" />
        <div className="h-36 bg-bg-surface rounded-2xl animate-pulse mb-4" />
        <div className="h-28 bg-bg-surface rounded-2xl animate-pulse mb-4" />
        <div className="h-52 bg-bg-surface rounded-2xl animate-pulse mb-4" />
        <div className="h-72 bg-bg-surface rounded-2xl animate-pulse mb-4" />
        <div className="h-24 bg-bg-surface rounded-2xl animate-pulse mb-4" />
      </div>
    )
  }

  const score = Math.round((agent.score || 0) * 100)
  const scoreColor = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  const versions: any[] = (agent.version_history as any[]) || versionsData?.versions || []
  const allThoughts: any[] = liveThoughts.length > 0 ? liveThoughts : (thoughtsData?.thoughts || [])
  const thoughtSummary = (agent.thought_summary as any) || { draft: 0, test: 0, commit: 0, error: 0, cascade: 0 }
  const catalogParsed = (agent.catalog_parsed as any) || {}
  const cascadeStats = (agent.cascade_stats as any) || { total_switches: 0, last_provider: null }

  const filteredThoughts =
    activeFilter === 'all'
      ? allThoughts
      : activeFilter === 'cascade'
        ? allThoughts.filter(th =>
            (th.message || '').toLowerCase().includes('cascade') ||
            (th.message || '').toLowerCase().includes('fallback'),
          )
        : allThoughts.filter(th => th.phase === activeFilter)

  const errorThoughts = allThoughts.filter(th => th.phase === 'error')

  const getFilterCount = (f: string) => {
    if (f === 'testing') return thoughtSummary.test || 0
    if (f === 'cascade') return thoughtSummary.cascade || 0
    return thoughtSummary[f] || 0
  }

  const handleDelete = async () => {
    await deleteMut.mutateAsync(agent.id)
    navigate('/')
  }

  const SectionHeader = ({
    title,
    sectionKey,
    icon,
  }: {
    title: string
    sectionKey: string
    icon: string
  }) => (
    <button
      onClick={() => toggle(sectionKey)}
      className="w-full flex items-center justify-between text-sm font-bold text-text-muted uppercase tracking-wider mb-4 hover:text-text-primary transition-colors"
    >
      <span className="flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
      </span>
      <span className="text-xs opacity-40">{collapsed[sectionKey] ? '▶' : '▼'}</span>
    </button>
  )

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary mb-6 transition-colors group"
      >
        <span className="group-hover:-translate-x-1 transition-transform">←</span>
        {t('detail.back')}
      </button>

      {/* ── SECTION 1: Identity Card (sticky) ──────────────────────────── */}
      <div className="sticky top-4 z-10 bg-bg-surface/95 backdrop-blur-sm rounded-2xl border border-border-default/40 p-5 mb-6 shadow-xl">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-black truncate">{agent.name}</h1>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ${STATUS_CLASSES[agent.status] || 'status-idle'}`}>
                {agent.status}
              </span>
            </div>
            <p className="text-[10px] text-text-muted font-mono mb-3 truncate">{agent.id}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-text-secondary">
                {t('detail.template_label')}{' '}
                <span className="text-text-primary font-medium">{agent.template || 'general'}</span>
              </span>
              <span className="text-text-secondary">
                {t('detail.created_label')}{' '}
                <span className="text-text-primary font-medium">
                  {new Date(agent.created_at).toLocaleDateString()}
                </span>
              </span>
              <span className="text-text-secondary">
                {t('detail.version_label')} <span className="text-accent-primary font-bold">v{agent.version}</span>
              </span>
              <span className="text-text-secondary">
                {t('detail.score_label')}{' '}
                <span className="font-bold" style={{ color: scoreColor }}>
                  {score}%
                </span>
              </span>
              <span className="text-text-secondary">
                {t('detail.cycles_label')}{' '}
                <span className="text-text-primary font-medium">{agent.cycles_completed || 0}</span>
              </span>
            </div>
          </div>
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(100,116,139,0.1)" strokeWidth="2" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={scoreColor} strokeWidth="2.5"
                strokeDasharray={`${score} ${100 - score}`}
                strokeLinecap="round" className="transition-all duration-1000"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-black" style={{ color: scoreColor }}>
              {score}%
            </span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border-default/30">
          <div className="mb-3">
            <button
              onClick={() => navigate(`/agent/${agent.id}/chat`)}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold transition-colors flex items-center gap-2"
            >
              <span>💬</span>
              <span>{t('detail.use_chat')}</span>
            </button>
          </div>
          <KillSwitch
            agentId={agent.id}
            status={agent.status}
            onControl={mode => controlMut.mutate({ agentId: agent.id, mode })}
            onEvolve={() => evolveMut.mutate(agent.id)}
            onResume={() => resumeMut.mutate(agent.id)}
            onFix={instruction => fixMut.mutate({ agentId: agent.id, instruction })}
            isLoading={controlMut.isPending || evolveMut.isPending}
          />
        </div>
      </div>

      {/* ── SECTION 2: Mission Brief ─────────────────────────────────────── */}
      <div className="bg-bg-surface rounded-2xl border border-border-default/20 p-5 mb-4">
        <SectionHeader title={t('detail.mission')} sectionKey="mission" icon="🎯" />
        {!collapsed.mission && (
          <div className="space-y-4">
            <div className="bg-bg-base/50 rounded-xl p-4 border border-border-default/20">
              <p className="text-text-secondary text-sm leading-relaxed">{agent.goal}</p>
            </div>
            {catalogParsed.summary && (
              <div>
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-2">
                  {t('detail.summary')}
                </p>
                <p className="text-text-secondary text-sm leading-relaxed">{catalogParsed.summary}</p>
              </div>
            )}
            {catalogParsed.how_it_works && (
              <div>
                <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-2">
                  {t('detail.how_it_works')}
                </p>
                <ol className="space-y-1.5">
                  {(Array.isArray(catalogParsed.how_it_works)
                    ? catalogParsed.how_it_works
                    : [catalogParsed.how_it_works]
                  ).map((step: string, i: number) => (
                    <li key={i} className="flex gap-2 text-sm text-text-secondary">
                      <span className="text-accent-primary font-bold shrink-0 w-5">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 3: Performance Metrics (2×3 grid) ────────────────────── */}
      <div className="bg-bg-surface rounded-2xl border border-border-default/20 p-5 mb-4">
        <SectionHeader title={t('detail.metrics')} sectionKey="metrics" icon="📊" />
        {!collapsed.metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Score Ring */}
            <div className="bg-bg-base/50 rounded-xl p-4 border border-border-default/20 flex flex-col items-center">
              <div className="relative w-14 h-14 mb-2">
                <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(100,116,139,0.1)" strokeWidth="2.5" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreColor} strokeWidth="2.5" strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-black" style={{ color: scoreColor }}>
                  {score}%
                </span>
              </div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider">{t('detail.score')}</div>
            </div>

            {/* Evolution Cycles */}
            <div className="bg-bg-base/50 rounded-xl p-4 border border-border-default/20 flex flex-col items-center justify-center">
              <div className="text-3xl font-black text-accent-primary">{agent.cycles_completed || 0}</div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mt-1">{t('detail.cycles')}</div>
            </div>

            {/* Total Tokens */}
            <div className="bg-bg-base/50 rounded-xl p-4 border border-border-default/20 flex flex-col items-center justify-center">
              <div className="text-3xl font-black text-text-primary">
                {((agent.total_tokens_used || 0) / 1000).toFixed(1)}K
              </div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mt-1">{t('detail.tokens_today')}</div>
            </div>

            {/* Daily Budget Progress */}
            <div className="bg-bg-base/50 rounded-xl p-4 border border-border-default/20 col-span-2 sm:col-span-1 flex flex-col justify-between min-h-[120px]">
              <div className="flex items-center justify-between mb-3 w-full">
                <div className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">{t('detail.daily_budget')}</div>
                {!isEditingBudget ? (
                  <button
                    onClick={() => {
                      setEditedBudgetLimit(agent.budget?.max_daily || 500000)
                      setIsEditingBudget(true)
                    }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-all flex items-center gap-1 font-semibold bg-indigo-500/10 hover:bg-indigo-500/25 px-2 py-0.5 rounded-md border border-indigo-500/10"
                  >
                    {t('detail.edit_limit')}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        if (editedBudgetLimit !== '') {
                          await updateBudgetMut.mutateAsync({
                            agentId: agent.id,
                            dailyTokenLimit: Number(editedBudgetLimit),
                          })
                        }
                        setIsEditingBudget(false)
                      }}
                      disabled={updateBudgetMut.isPending}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold bg-emerald-500/10 hover:bg-emerald-500/25 px-2 py-0.5 rounded-md transition-colors disabled:opacity-50 border border-emerald-500/10"
                    >
                      {updateBudgetMut.isPending ? t('detail.saving') : t('detail.save')}
                    </button>
                    <button
                      onClick={() => setIsEditingBudget(false)}
                      className="text-[10px] text-text-muted hover:text-text-primary font-medium bg-bg-base/50 border border-border-default/15 px-2 py-0.5 rounded-md transition-colors"
                    >
                      {t('detail.cancel')}
                    </button>
                  </div>
                )}
              </div>
              {isEditingBudget ? (
                <div className="space-y-3 w-full">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={editedBudgetLimit}
                      onChange={(e) => setEditedBudgetLimit(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-bg-base border border-border-default/30 rounded-lg px-2.5 py-1 text-sm font-semibold text-text-primary focus:outline-none focus:border-accent-primary transition-all"
                      placeholder="Limit (e.g. 100000)"
                      min="0"
                    />
                    <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">{t('detail.tokens')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditedBudgetLimit(prev => Math.max(0, (Number(prev) || 0) - 50000))}
                      className="flex-1 text-[10px] py-1 bg-bg-base/60 hover:bg-bg-base border border-border-default/20 rounded-lg text-text-muted hover:text-text-primary transition-colors font-semibold"
                    >
                      -50K
                    </button>
                    <button
                      onClick={() => setEditedBudgetLimit(prev => (Number(prev) || 0) + 50000)}
                      className="flex-1 text-[10px] py-1 bg-bg-base/60 hover:bg-bg-base border border-border-default/20 rounded-lg text-text-muted hover:text-text-primary transition-colors font-semibold"
                    >
                      +50K
                    </button>
                    <button
                      onClick={() => setEditedBudgetLimit(prev => (Number(prev) || 0) + 200000)}
                      className="flex-1 text-[10px] py-1 bg-bg-base/60 hover:bg-bg-base border border-border-default/20 rounded-lg text-text-muted hover:text-text-primary transition-colors font-semibold"
                    >
                      +200K
                    </button>
                  </div>
                </div>
              ) : (
                agent.budget ? (
                  <div className="w-full">
                    <div className="w-full bg-bg-base rounded-full h-2 overflow-hidden border border-border-default/10 mb-2">
                      <div
                        className="bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, agent.budget.utilization_pct || 0)}%` }}
                      />
                    </div>
                    <div className="text-xs text-text-muted flex justify-between font-medium">
                      <span>{agent.budget.utilization_pct || 0}% {t('detail.used')}</span>
                      <span>{(agent.budget.max_daily || 0).toLocaleString()} {t('detail.tokens')}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-text-muted italic">{t('detail.budget_none')}</div>
                )
              )}
            </div>

            {/* Success Rate */}
            <div className="bg-bg-base/50 rounded-xl p-4 border border-border-default/20 flex flex-col items-center justify-center">
              <div className="text-3xl font-black text-emerald-400">{agent.success_rate || 0}%</div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mt-1">{t('detail.success_rate')}</div>
            </div>

            {/* Interval */}
            <div className="bg-bg-base/50 rounded-xl p-4 border border-border-default/20 flex flex-col items-center justify-center">
              <div className="text-3xl font-black text-text-primary">{agent.evolve_interval_seconds}s</div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mt-1">{t('detail.interval')}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 4: Provider Intelligence ─────────────────────────────── */}
      <div className="bg-bg-surface rounded-2xl border border-border-default/20 p-5 mb-4">
        <SectionHeader title={t('detail.provider')} sectionKey="provider" icon="🔌" />
        {!collapsed.provider && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-bg-base/50 rounded-xl p-4 border border-border-default/20">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('detail.last_provider')}</div>
              <div className="text-sm font-bold text-text-primary font-mono">
                {cascadeStats.last_provider || '—'}
              </div>
            </div>
            <div className="bg-bg-base/50 rounded-xl p-4 border border-border-default/20">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
                {t('detail.cascade_switches')}
              </div>
              <div className="text-2xl font-black text-amber-400">
                {cascadeStats.total_switches || 0}
              </div>
            </div>
            <div className="bg-bg-base/50 rounded-xl p-4 border border-border-default/20">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('detail.health')}</div>
              <div className={`text-sm font-bold ${agent.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                {agent.status === 'error' ? t('detail.degraded') : t('detail.healthy')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 5: Live Thought Stream ───────────────────────────────── */}
      <div className="bg-bg-surface rounded-2xl border border-border-default/20 p-5 mb-4">
        <SectionHeader title={t('detail.thoughts')} sectionKey="thoughts" icon="💭" />
        {!collapsed.thoughts && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              {['all', 'draft', 'testing', 'commit', 'cascade', 'error'].map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-colors ${
                    activeFilter === f
                      ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
                      : 'border-border-default/30 text-text-muted hover:border-border-default/60 hover:text-text-secondary'
                  }`}
                >
                  {f}
                  {f !== 'all' && (
                    <span className="ml-1 opacity-50">({getFilterCount(f)})</span>
                  )}
                </button>
              ))}
            </div>
            <ThoughtLog thoughts={filteredThoughts} maxLines={100} />
          </div>
        )}
      </div>

      {/* ── SECTION 6: Evolution Timeline ────────────────────────────────── */}
      <div className="bg-bg-surface rounded-2xl border border-border-default/20 p-5 mb-4">
        <SectionHeader title={t('detail.timeline')} sectionKey="timeline" icon="🧬" />
        {!collapsed.timeline && (
          <div>
            {versions.length === 0 ? (
              <p className="text-xs text-text-muted italic">{t('detail.no_versions')}</p>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="flex items-center min-w-max">
                  {[...versions].reverse().map((v: any, i: number) => {
                    const vScore = Math.round((v.performance_score || 0) * 100)
                    const vColor = vScore >= 70 ? '#10b981' : vScore >= 40 ? '#f59e0b' : '#ef4444'
                    const vCode = v.agent_code || v.code || null
                    const isSelected = vCode !== null && selectedVersionCode === vCode
                    return (
                      <div key={v.version} className="flex items-center">
                        <button
                          onClick={() => setSelectedVersionCode(isSelected ? null : vCode)}
                          title={v.commit_message || `v${v.version}`}
                          className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-accent-primary bg-accent-primary/10'
                              : 'border-border-default/20 hover:border-border-default/60 bg-bg-base/50'
                          }`}
                        >
                          <div
                            className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-[10px] font-black"
                            style={{ borderColor: vColor, color: vColor }}
                          >
                            v{v.version}
                          </div>
                          <div className="text-[9px] font-bold" style={{ color: vColor }}>
                            {vScore}%
                          </div>
                          <div className="text-[9px] text-text-muted">
                            {v.timestamp
                              ? new Date(v.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                              : ''}
                          </div>
                        </button>
                        {i < versions.length - 1 && (
                          <div className="w-6 h-px bg-border-default/30 mx-0.5" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {selectedVersionCode && (
              <div className="mt-3">
                <pre className="text-[11px] text-text-secondary font-mono bg-bg-base/50 rounded-lg p-3 border border-border-default/30 overflow-x-auto max-h-[250px] overflow-y-auto">
                  {selectedVersionCode}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 7: Agent Code Viewer ─────────────────────────────────── */}
      <div className="bg-bg-surface rounded-2xl border border-border-default/20 p-5 mb-4">
        <SectionHeader title={t('detail.code')} sectionKey="code" icon="💻" />
        {!collapsed.code && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-text-muted font-mono">v{agent.version} — current</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(agent.agent_code || '')
                  setCopiedCode(true)
                  setTimeout(() => setCopiedCode(false), 2000)
                }}
                className="text-[10px] text-accent-primary hover:text-accent-primary/80 transition-colors"
              >
                {copiedCode ? t('detail.copied') : t('detail.copy')}
              </button>
            </div>
            <pre className="text-[11px] text-text-secondary font-mono bg-bg-base/50 rounded-lg p-3 border border-border-default/30 overflow-x-auto max-h-[300px] overflow-y-auto">
              {agent.agent_code || t('detail.no_code')}
            </pre>
          </div>
        )}
      </div>

      {/* ── SECTION 8: Known Limitations ─────────────────────────────────── */}
      <div className="bg-bg-surface rounded-2xl border border-border-default/20 p-5 mb-4">
        <SectionHeader title={t('detail.limitations')} sectionKey="limitations" icon="⚠" />
        {!collapsed.limitations && (
          <div>
            {errorThoughts.length === 0 ? (
              <p className="text-xs text-text-muted italic">{t('detail.no_failures')}</p>
            ) : (
              <div className="space-y-2">
                {errorThoughts.slice(0, 10).map((th: any, i: number) => (
                  <div key={i} className="flex gap-2 text-xs bg-red-950/20 rounded-lg px-3 py-2 border border-red-500/10">
                    <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-text-secondary break-words">{th.message}</span>
                      {th.timestamp && (
                        <div className="text-[10px] text-text-muted mt-0.5">
                          {new Date(th.timestamp).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 9: Raw Catalog JSON (collapsed by default) ───────────── */}
      <div className="bg-bg-surface rounded-2xl border border-border-default/20 p-5 mb-4">
        <SectionHeader title={t('detail.catalog')} sectionKey="catalog" icon="📋" />
        {!collapsed.catalog && (
          <pre className="text-[11px] text-text-secondary font-mono bg-bg-base/50 rounded-lg p-3 border border-border-default/30 overflow-x-auto max-h-[300px] overflow-y-auto">
            {JSON.stringify(catalogParsed, null, 2)}
          </pre>
        )}
      </div>

      {/* ── Genealogy Tree ───────────────────────────────────────────────── */}
      <div className="mb-4">
        <GenealogyTree agentId={agent.id} agentName={agent.name} />
      </div>

      {/* ── Danger Zone ──────────────────────────────────────────────────── */}
      <div className="bg-bg-surface rounded-2xl border border-red-500/10 p-5 mb-4">
        <h2 className="text-sm font-bold text-red-400/70 uppercase tracking-wider mb-3">{t('detail.danger_zone')}</h2>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-300">{t('detail.delete_confirm')}</span>
            <button
              onClick={handleDelete}
              className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
            >
              {t('detail.delete')}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1 text-xs bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
            >
              {t('detail.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            {t('detail.delete_agent')}
          </button>
        )}
      </div>
    </div>
  )
}
