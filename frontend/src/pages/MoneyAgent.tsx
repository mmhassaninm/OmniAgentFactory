import { useEffect, useState, useCallback } from 'react'
import EarningsDashboard from '../components/EarningsDashboard'
import BrowserViewer from '../components/BrowserViewer'
import { BASE_URL } from '../config'

interface PendingItem {
  id: string
  opportunity: {
    title: string
    url: string
    snippet: string
    estimated_value: number
  }
  pitch_subject: string
  pitch_body: string
  estimated_value: number
  strategy: string
  created_at: string
  status: string
}

interface Opportunity {
  id: string
  title: string
  url: string
  niche: string
  estimated_value: number
  found_at: string
}

interface StrategyConfig {
  name: string
  niche: string
  description: string
  income_range: string
  ban_risk: string
  automation_level: number
  keywords: string[]
  price: number
}

function PitchCard({ item, onApprove, onSkip }: {
  item: PendingItem
  onApprove: (id: string) => void
  onSkip: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState<'approve' | 'skip' | null>(null)

  const handle = async (action: 'approve' | 'skip') => {
    setLoading(action)
    try {
      if (action === 'approve') await onApprove(item.id)
      else await onSkip(item.id)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e0e0e] hover:bg-[#121212] p-5 space-y-4 transition-all duration-300 relative overflow-hidden group animate-in slide-in-from-right-5 duration-300">
      <div className="absolute top-0 left-0 w-[2px] h-0 bg-gradient-to-b from-emerald-500 to-teal-500 group-hover:h-full transition-all duration-500" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors truncate">{item.opportunity.title}</p>
          <p className="text-xs text-white/40 truncate">{item.opportunity.url}</p>
        </div>
        <span className="shrink-0 text-xs font-extrabold px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/30">
          ~${item.estimated_value.toFixed(0)}
        </span>
      </div>

      <div className="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2">
        <p className="text-xs text-white/40 font-medium">Subject: <span className="text-white/80">{item.pitch_subject}</span></p>
        <div
          className={`text-xs text-white/60 leading-relaxed whitespace-pre-wrap transition-all duration-300 ${expanded ? '' : 'line-clamp-3'}`}
        >
          {item.pitch_body}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-emerald-400/70 hover:text-emerald-400 mt-1 font-medium transition-colors focus:outline-none"
        >
          {expanded ? '▲ Collapse' : '▼ Read full draft'}
        </button>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={() => handle('approve')}
          disabled={loading !== null}
          className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 shadow-lg shadow-emerald-950/10 hover:shadow-emerald-500/10 transition-all duration-300"
        >
          {loading === 'approve' ? 'Sending Pitch...' : '✅ Approve & Send'}
        </button>
        <button
          onClick={() => handle('skip')}
          disabled={loading !== null}
          className="flex-1 rounded-xl border border-white/10 hover:border-red-500/30 hover:bg-red-950/20 hover:text-red-400 disabled:opacity-50 text-white/60 text-xs font-semibold py-2.5 transition-all duration-300"
        >
          ❌ Skip
        </button>
      </div>
    </div>
  )
}

function OpportunityRow({ opp }: { opp: Opportunity }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-white/5 last:border-0 hover:bg-white/[0.01] px-2 -mx-2 rounded-lg transition-colors group">
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-sm text-white/80 group-hover:text-white transition-colors truncate">{opp.title}</p>
        <p className="text-xs text-white/30 truncate">{opp.url}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-emerald-400">${opp.estimated_value.toFixed(0)}</p>
        <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">{opp.niche}</p>
      </div>
    </div>
  )
}

function MoneyAgentPage() {
  const [pending, setPending] = useState<PendingItem[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [strategies, setStrategies] = useState<Record<string, StrategyConfig>>({})
  const [activeStrategy, setActiveStrategy] = useState<string>('')
  const [configModal, setConfigModal] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Config Form state
  const [formPrice, setFormPrice] = useState<number>(0)
  const [formNiche, setFormNiche] = useState<string>('')
  const [formRange, setFormRange] = useState<string>('')
  const [formKeywords, setFormKeywords] = useState<string>('')
  const [savingConfig, setSavingConfig] = useState(false)

  // Stealth Marketing Campaigns (Idea 48) state
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [campaignModal, setCampaignModal] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [campaignTopic, setCampaignTopic] = useState('')
  const [campaignLink, setCampaignLink] = useState('')
  const [campaignKeywords, setCampaignKeywords] = useState('')
  const [triggeringId, setTriggeringId] = useState<string | null>(null)
  const [savingCampaign, setSavingCampaign] = useState(false)

  const fetchStrategies = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/money/strategies`)
      if (res.ok) {
        const d = await res.json()
        setStrategies(d.strategies ?? {})
        setActiveStrategy(d.active_strategy ?? '')
      }
    } catch (e) {
      console.warn('Failed to load strategies', e)
    }
  }, [])

  const fetchStealthData = useCallback(async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        fetch(`${BASE_URL}/api/money/stealth/campaigns`),
        fetch(`${BASE_URL}/api/money/stealth/posts`),
      ])
      if (cRes.ok) {
        const d = await cRes.json()
        setCampaigns(d ?? [])
      }
      if (pRes.ok) {
        const d = await pRes.json()
        setPosts(d ?? [])
      }
    } catch (e) {
      console.warn('Failed to load stealth data', e)
    }
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const [pRes, oRes] = await Promise.all([
        fetch(`${BASE_URL}/api/money/pending`),
        fetch(`${BASE_URL}/api/money/opportunities`),
      ])
      if (pRes.ok) {
        const d = await pRes.json()
        setPending(d.items ?? [])
      }
      if (oRes.ok) {
        const d = await oRes.json()
        setOpportunities(d.opportunities ?? [])
      }
    } catch {
      // backend offline
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStrategies()
    fetchData()
    fetchStealthData()
    const interval = setInterval(() => {
      fetchData()
      fetchStealthData()
    }, 15_000)
    return () => clearInterval(interval)
  }, [fetchStrategies, fetchData, fetchStealthData])

  const handleApprove = async (id: string) => {
    await fetch(`${BASE_URL}/api/money/approve/${id}`, { method: 'POST' })
    setPending(prev => prev.filter(p => p.id !== id))
  }

  const handleSkip = async (id: string) => {
    await fetch(`${BASE_URL}/api/money/skip/${id}`, { method: 'POST' })
    setPending(prev => prev.filter(p => p.id !== id))
  }

  const handleSwitchStrategy = async (key: string) => {
    try {
      const res = await fetch(`${BASE_URL}/api/money/strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_key: key })
      })
      if (res.ok) {
        setActiveStrategy(key)
        fetchData()
      }
    } catch (e) {
      console.error('Failed to switch strategy', e)
    }
  }

  const openConfig = (key: string) => {
    const strat = strategies[key]
    if (strat) {
      setFormPrice(strat.price)
      setFormNiche(strat.niche)
      setFormRange(strat.income_range)
      setFormKeywords(strat.keywords ? strat.keywords.join('\n') : '')
      setConfigModal(key)
    }
  }

  const handleSaveConfig = async () => {
    if (!configModal) return
    setSavingConfig(true)
    try {
      const res = await fetch(`${BASE_URL}/api/money/strategy/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_key: configModal,
          niche: formNiche,
          price: Number(formPrice),
          income_range: formRange,
          keywords: formKeywords.split('\n').map(k => k.trim()).filter(Boolean)
        })
      })
      if (res.ok) {
        await fetchStrategies()
        setConfigModal(null)
      }
    } catch (e) {
      console.error('Failed to save config', e)
    } finally {
      setSavingConfig(false)
    }
  }

  const handleCreateCampaign = async () => {
    if (!campaignName || !campaignTopic || !campaignLink) return
    setSavingCampaign(true)
    try {
      const res = await fetch(`${BASE_URL}/api/money/stealth/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          topic: campaignTopic,
          referral_link: campaignLink,
          keywords: campaignKeywords.split('\n').map(k => k.trim()).filter(Boolean)
        })
      })
      if (res.ok) {
        await fetchStealthData()
        setCampaignModal(false)
        setCampaignName('')
        setCampaignTopic('')
        setCampaignLink('')
        setCampaignKeywords('')
      }
    } catch (e) {
      console.error('Failed to create campaign', e)
    } finally {
      setSavingCampaign(false)
    }
  }

  const handleDeleteCampaign = async (id: string) => {
    try {
      const res = await fetch(`${BASE_URL}/api/money/stealth/campaigns/${id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        await fetchStealthData()
      }
    } catch (e) {
      console.error('Failed to delete campaign', e)
    }
  }

  const handleTriggerCampaign = async (id: string) => {
    setTriggeringId(id)
    try {
      const res = await fetch(`${BASE_URL}/api/money/stealth/trigger/${id}`, {
        method: 'POST'
      })
      if (res.ok) {
        await fetchStealthData()
      }
    } catch (e) {
      console.error('Failed to trigger campaign', e)
    } finally {
      setTriggeringId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#070707] text-white p-6 relative overflow-x-hidden selection:bg-emerald-500/30 selection:text-emerald-300">
      
      {/* Background ambient lighting */}
      <div className="absolute top-[-200px] left-[50%] -translate-x-[50%] w-[1000px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto space-y-10 relative z-10">

        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-3xl">💸</span>
              <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-emerald-400">
                Monetization Command Hub
              </h1>
            </div>
            <p className="text-sm text-white/40 mt-1.5 max-w-2xl leading-relaxed">
              Autonomous passive financial yield generator. Switch between specialized target niches, adjust rates, and supervise cold outreach queues with zero manual friction.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-center">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 mr-1" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-950/55 border border-emerald-500/20 px-3 py-1 rounded-full">
              System Live
            </span>
          </div>
        </div>

        {/* 1. Strategies Switcher Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white/90 uppercase tracking-wider">Select Active Income Strategy</h2>
            <span className="text-xs text-white/30 font-medium">Click to activate or modify parameters</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.entries(strategies).map(([key, config]) => {
              const isActive = activeStrategy === key
              return (
                <div
                  key={key}
                  className={`rounded-2xl border transition-all duration-500 p-5 space-y-5 relative overflow-hidden group cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-b from-[#0f1d14] to-[#0c0d0c] border-emerald-500/40 shadow-xl shadow-emerald-950/20'
                      : 'bg-[#0a0a0a]/80 border-white/5 hover:border-white/15'
                  }`}
                  onClick={() => handleSwitchStrategy(key)}
                >
                  {/* Active glowing indicator */}
                  {isActive && (
                    <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-emerald-400 shadow-md shadow-emerald-400 animate-pulse" />
                  )}

                  {/* Icon and metadata */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                        {config.name}
                      </p>
                      <span className="text-xs font-extrabold text-emerald-400">
                        ${config.price}/pkg
                      </span>
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed min-h-[48px]">
                      {config.description}
                    </p>
                  </div>

                  {/* Telemetry/meters */}
                  <div className="grid grid-cols-2 gap-3 text-[11px] pt-2 border-t border-white/5">
                    <div className="space-y-1">
                      <p className="text-white/30">Automation Level</p>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${config.automation_level * 100}%` }}
                          />
                        </div>
                        <span className="font-bold text-white/80">{(config.automation_level * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-white/30">Ban Risk</p>
                      <span
                        className={`font-extrabold text-[10px] uppercase tracking-wider ${
                          config.ban_risk === 'ZERO'
                            ? 'text-emerald-400'
                            : config.ban_risk === 'LOW'
                            ? 'text-yellow-500'
                            : 'text-red-500'
                        }`}
                      >
                        {config.ban_risk} RISK
                      </span>
                    </div>
                  </div>

                  {/* Actions inside strategy card */}
                  <div className="flex items-center justify-between pt-2 gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => openConfig(key)}
                      className="text-xs text-white/50 hover:text-white/90 border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl transition-all duration-300 flex-1 text-center font-medium"
                    >
                      ⚙️ Edit Config
                    </button>
                    {isActive ? (
                      <span className="text-xs font-bold text-emerald-400 px-3 py-1.5 bg-emerald-950/40 border border-emerald-500/20 rounded-xl flex-1 text-center">
                        Active Strategy
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSwitchStrategy(key)}
                        className="text-xs text-white/40 hover:text-white hover:bg-white/[0.03] border border-white/5 px-3 py-1.5 rounded-xl transition-all duration-300 flex-1 text-center"
                      >
                        Activate Strategy
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 2. Split Dashboard & Approvals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">

          {/* Left Panel: Earnings and Live Stream */}
          <div className="space-y-8">
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white/90 uppercase tracking-wider">Metrics & Live Agent View</h3>
              <p className="text-xs text-white/30">Real-time stats from PayPal APIs and live browsing sessions</p>
            </div>
            <div className="grid grid-cols-1 gap-8">
              <EarningsDashboard />
              <BrowserViewer />
            </div>
          </div>

          {/* Right Panel: Pending Approvals Queue */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div>
                <h2 className="text-base font-bold text-white/90 uppercase tracking-wider flex items-center gap-2">
                  Outreach Pitch Approvals
                  {pending.length > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {pending.length} New
                    </span>
                  )}
                </h2>
                <p className="text-xs text-white/30 mt-0.5">Approve these generated pitches to stage and send them</p>
              </div>
              <button
                onClick={fetchData}
                className="text-xs text-white/30 hover:text-emerald-400 flex items-center gap-1.5 border border-white/5 bg-[#0f0f0f] px-2.5 py-1.5 rounded-xl hover:border-emerald-500/20 transition-all duration-300"
              >
                ↻ Refresh Queue
              </button>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-12 text-center text-white/20 text-sm animate-pulse">
                Fetching draft queue...
              </div>
            ) : pending.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-[#0a0a0a]/50 p-12 text-center space-y-3">
                <p className="text-3xl">🎯</p>
                <p className="text-sm font-semibold text-white/50">Pitch Queue Empty</p>
                <p className="text-xs text-white/30 max-w-xs mx-auto">
                  Click <strong className="text-emerald-400">Hunt Now</strong> in the left console to trigger search bots on the active strategy immediately.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {pending.map(item => (
                  <PitchCard
                    key={item.id}
                    item={item}
                    onApprove={handleApprove}
                    onSkip={handleSkip}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. Stealth Affiliate Marketing System (Idea 48) */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-emerald-400">
                Stealth Outreach & Referral Campaigns
              </h2>
              <p className="text-xs text-white/30 mt-0.5">
                Automated forum placement engine (Idea 48). Generates organic responses containing passive referral links.
              </p>
            </div>
            <button
              onClick={() => setCampaignModal(true)}
              className="text-xs font-bold text-emerald-400 border border-emerald-500/20 bg-emerald-950/40 hover:bg-emerald-900/40 px-3.5 py-2 rounded-xl transition-all duration-300 flex items-center gap-1.5 shadow-lg shadow-emerald-950/20"
            >
              ➕ Create Campaign
            </button>
          </div>

          {/* Campaigns Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {campaigns.map(c => {
              const isTriggering = triggeringId === c.id
              return (
                <div key={c.id} className="rounded-2xl border border-white/5 bg-[#0a0a0a]/50 p-5 space-y-4 hover:border-emerald-500/20 transition-all duration-300 relative group overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500/50 to-teal-500/50" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                        {c.name}
                      </h4>
                      <p className="text-[11px] text-white/40">{c.topic}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteCampaign(c.id)}
                      className="text-xs text-white/20 hover:text-red-500 transition-colors"
                      title="Delete Campaign"
                    >
                      🗑️
                    </button>
                  </div>

                  <div className="rounded-xl bg-black/40 border border-white/5 p-3 space-y-1 text-xs">
                    <p className="text-white/30 truncate">Link: <span className="text-white/70 font-mono text-[10px]">{c.referral_link}</span></p>
                    <p className="text-white/30 truncate">Keywords: <span className="text-white/70">{c.keywords?.join(', ')}</span></p>
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-white/5 pt-3">
                    <div className="flex gap-4">
                      <div>
                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-wider">Views</p>
                        <p className="text-sm font-extrabold text-white">{c.clicks ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-wider">Conversions</p>
                        <p className="text-sm font-extrabold text-emerald-400">{c.conversions ?? 0}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleTriggerCampaign(c.id)}
                      disabled={triggeringId !== null}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold py-2 px-3 shadow-lg shadow-emerald-950/10 transition-all duration-300"
                    >
                      {isTriggering ? 'Running...' : '🔥 Run Outreach'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Generated Posts Section */}
          {posts.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white/80 uppercase tracking-widest">
                Generated Promotion & Placement Drafts
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[500px] overflow-y-auto pr-1">
                {posts.map(p => (
                  <div key={p.id} className="rounded-2xl border border-white/5 bg-black/40 p-5 space-y-4 hover:bg-white/[0.01] transition-all duration-300 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                            {p.campaign_name}
                          </p>
                          <h4 className="text-sm font-bold text-white truncate">{p.title}</h4>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-800/20">
                          {p.status}
                        </span>
                      </div>

                      <div className="rounded-xl bg-black/60 border border-white/5 p-3 space-y-1 text-xs">
                        <p className="text-white/30">Target forum thread:</p>
                        <a href={p.source_url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline truncate block">
                          {p.source_url}
                        </a>
                        <p className="text-white/40 italic line-clamp-2 mt-1.5">"{p.snippet}"</p>
                      </div>

                      <div className="rounded-xl border border-white/5 bg-black/40 p-3 space-y-2">
                        <p className="text-xs font-bold text-white/60">Generated Smart Reply:</p>
                        <p className="text-xs text-white/70 whitespace-pre-wrap leading-relaxed line-clamp-4">
                          {p.generated_answer}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-white/30 pt-3 border-t border-white/5">
                      <span>Generated: {new Date(p.posted_at).toLocaleTimeString()}</span>
                      <div className="flex gap-3">
                        <span>👁️ {p.clicks} clicks</span>
                        <span className="text-emerald-400">💵 {p.conversions} conv</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 4. Passive Yield Roadmap */}
        <div className="rounded-2xl border border-white/5 bg-gradient-to-r from-[#0a0c0a] via-[#090a09] to-[#080808] p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white/80 uppercase tracking-widest">Autonomous ROI Path</h3>
            <p className="text-[11px] text-white/30">Target milestones based on active outreach and digital packaging</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            {[
              { period: 'Phase 1: Kickoff', target: '$50–200/wk', note: 'AI cold content service launches pitches across 15 domains.' },
              { period: 'Phase 2: Scale', target: '$200–500/wk', note: 'Auto-invoice triggers Paypal deals upon response validation.' },
              { period: 'Phase 3: Automation', target: '$500–1 000/wk', note: 'Micro-task bots run in headless cycles scraping bounties.' },
              { period: 'Phase 4: Leverage', target: '$1 500+/mo passive', note: 'AI prompt digital assets scale Etsy/Gumroad pipelines.' },
            ].map(({ period, target, note }) => (
              <div key={period} className="rounded-xl bg-black/40 border border-white/5 p-4 space-y-1.5">
                <p className="font-semibold text-white/70">{period}</p>
                <p className="text-emerald-400 font-extrabold text-sm">{target}</p>
                <p className="text-[11px] text-white/40 leading-relaxed">{note}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 5. Configuration Drawer/Modal Overlay */}
      {configModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-all duration-300">
          <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-emerald-500/5 max-w-md w-full overflow-hidden">
            
            {/* Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="text-sm font-bold text-white">Configure {strategies[configModal]?.name}</h3>
                <p className="text-[11px] text-white/40">Adjust parameters for the background hunting engine</p>
              </div>
              <button
                onClick={() => setConfigModal(null)}
                className="text-xs text-white/30 hover:text-white px-2 py-1 rounded-lg border border-white/5 bg-black"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Target Price (USD)</label>
                  <input
                    type="number"
                    value={formPrice}
                    onChange={e => setFormPrice(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Pricing Range</label>
                  <input
                    type="text"
                    value={formRange}
                    onChange={e => setFormRange(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Target Niche</label>
                <input
                  type="text"
                  value={formNiche}
                  onChange={e => setFormNiche(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Search Keywords / Queries (one per line)</label>
                <textarea
                  value={formKeywords}
                  onChange={e => setFormKeywords(e.target.value)}
                  rows={4}
                  placeholder="small business hire freelance content&#10;remote marketing blog editor"
                  className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none resize-none font-mono"
                />
              </div>

            </div>

            {/* Footer */}
            <div className="p-5 border-t border-white/5 flex items-center justify-end gap-3 bg-white/[0.01]">
              <button
                disabled={savingConfig}
                onClick={() => setConfigModal(null)}
                className="text-xs text-white/60 hover:text-white px-4 py-2 rounded-xl border border-white/5 bg-transparent"
              >
                Cancel
              </button>
              <button
                disabled={savingConfig}
                onClick={handleSaveConfig}
                className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/20"
              >
                {savingConfig ? 'Saving...' : '💾 Save Settings'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 6. Campaign Creation Modal Overlay */}
      {campaignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-all duration-300">
          <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-emerald-500/5 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="text-sm font-bold text-white">Create Referral Campaign</h3>
                <p className="text-[11px] text-white/40">Launch a passive affiliate placement bot</p>
              </div>
              <button
                onClick={() => setCampaignModal(false)}
                className="text-xs text-white/30 hover:text-white px-2 py-1 rounded-lg border border-white/5 bg-black"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Campaign Name</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                  placeholder="e.g. Hostinger Hosting"
                  className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Topic / Category Niche</label>
                <input
                  type="text"
                  value={campaignTopic}
                  onChange={e => setCampaignTopic(e.target.value)}
                  placeholder="e.g. Web Hosting, E-commerce, Keyboards"
                  className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Affiliate / Partner Referral Link</label>
                <input
                  type="text"
                  value={campaignLink}
                  onChange={e => setCampaignLink(e.target.value)}
                  placeholder="https://hostinger.com/ref/omni"
                  className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider">Forum Search Keywords (one per line)</label>
                <textarea
                  value={campaignKeywords}
                  onChange={e => setCampaignKeywords(e.target.value)}
                  rows={3}
                  placeholder="best web host&#10;cheap fastapi hosting"
                  className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none resize-none font-mono"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-white/5 flex items-center justify-end gap-3 bg-white/[0.01]">
              <button
                disabled={savingCampaign}
                onClick={() => setCampaignModal(false)}
                className="text-xs text-white/60 hover:text-white px-4 py-2 rounded-xl border border-white/5 bg-transparent"
              >
                Cancel
              </button>
              <button
                disabled={savingCampaign}
                onClick={handleCreateCampaign}
                className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/20"
              >
                {savingCampaign ? 'Launching...' : '🚀 Launch Campaign'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}

import React from 'react';

const MoneyAgent: React.FC = () => {
  return <MoneyAgentPage />;
};

export default MoneyAgent;
