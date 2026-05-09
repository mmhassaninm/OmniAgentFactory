import { useState, useEffect } from 'react'
import { Layers, RefreshCw, Shield, Server, Zap, HelpCircle } from 'lucide-react'

interface RouterStatus {
  current_tier: number
  active_provider: string
  active_model: string
  cooling_keys: number
  total_openrouter_keys: number
  available_openrouter_keys: number
  last_success: string | null
  total_requests: number
  tier_stats: {
    tier1_hits: number
    tier2_hits: number
    tier3_hits: number
    tier4_hits: number
    tier5_hits: number
  }
}

export default function ModelRouter() {
  const [status, setStatus] = useState<RouterStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/router/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch (e) {
      console.error('[ModelRouter] Error fetching router status:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10000) // Poll every 10 seconds
    return () => clearInterval(interval)
  }, [])

  if (loading || !status) {
    return (
      <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6 flex flex-col justify-center items-center h-[280px]">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
        <p className="text-slate-500 text-xs font-mono font-bold tracking-wider uppercase">Loading Cascade Router...</p>
      </div>
    )
  }

  // Define tier metadata
  const tierConfig: Record<number, { name: string; color: string; desc: string; glow: string }> = {
    1: {
      name: 'Tier 1: OpenRouter Premium',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      glow: 'shadow-[0_0_20px_rgba(52,211,153,0.15)] border-emerald-500/30 bg-emerald-950/20',
      desc: 'Automatic high-performance model selection'
    },
    2: {
      name: 'Tier 2: OpenRouter Free Pool',
      color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
      glow: 'shadow-[0_0_20px_rgba(45,212,191,0.15)] border-teal-500/30 bg-teal-950/20',
      desc: 'Rotational free model auto-routing'
    },
    3: {
      name: 'Tier 3: Specific Free Models',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      glow: 'shadow-[0_0_20px_rgba(251,191,36,0.15)] border-amber-500/30 bg-amber-950/20',
      desc: 'Direct failover to individual free model pathways'
    },
    4: {
      name: 'Tier 4: Multi-Cloud Fallback',
      color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
      glow: 'shadow-[0_0_20px_rgba(251,146,60,0.15)] border-orange-500/30 bg-orange-950/20',
      desc: 'Direct fallback to Groq, Cerebras, Gemini, or Cloudflare'
    },
    5: {
      name: 'Tier 5: Offline Local Nodes',
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      glow: 'shadow-[0_0_20px_rgba(251,113,133,0.15)] border-rose-500/30 bg-rose-950/20',
      desc: 'Local Ollama instances on safe, host-based hostnames'
    }
  }

  const currentTier = status.current_tier || 1
  const activeConfig = tierConfig[currentTier] || tierConfig[1]

  // Calculate tier percentages for progress bars
  const totalHits = Object.values(status.tier_stats).reduce((a, b) => a + b, 0) || 1
  const getPercent = (hits: number) => Math.round((hits / totalHits) * 100)

  return (
    <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-6 relative overflow-hidden transition-all duration-300">
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Title block */}
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-2.5">
          <Layers className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold font-mono tracking-tight text-white uppercase">
            Cascade Priority Router
          </h2>
        </div>
        <span className="text-[10px] text-slate-500 font-mono font-bold uppercase flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Active Multi-Tier
        </span>
      </div>

      {/* Main split grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
        {/* Left Side: Router Health and Details */}
        <div className="space-y-4">
          {/* Active Tier Display */}
          <div className={`p-4 rounded-xl border transition-all duration-300 ${activeConfig.glow}`}>
            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono mb-1">
              Active Routing Layer
            </span>
            <span className="text-sm font-black text-white block">
              {activeConfig.name}
            </span>
            <p className="text-[11px] text-slate-400 mt-1 leading-normal">
              {activeConfig.desc}
            </p>
          </div>

          {/* Router Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Active Model */}
            <div className="bg-[#080c14] border border-white/[0.04] rounded-xl p-3">
              <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Active Model
              </span>
              <span className="block text-xs font-bold text-slate-200 mt-1.5 truncate font-mono" title={status.active_model}>
                {status.active_model}
              </span>
            </div>

            {/* Total Queries */}
            <div className="bg-[#080c14] border border-white/[0.04] rounded-xl p-3">
              <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Lifetime Queries
              </span>
              <span className="block text-lg font-black text-indigo-400 mt-1 font-mono">
                {status.total_requests}
              </span>
            </div>
          </div>

          {/* Key Status Indicators */}
          <div className="bg-[#080c14] border border-white/[0.04] rounded-xl p-3 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                OpenRouter Key Allocation
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold text-slate-300 font-mono">
                  {status.available_openrouter_keys} Available
                </span>
                <span className="text-slate-600 text-xs font-mono">•</span>
                <span className="text-xs font-bold text-slate-400 font-mono">
                  {status.total_openrouter_keys} Total
                </span>
              </div>
            </div>

            {/* Cooling Key Indicator */}
            {status.cooling_keys > 0 ? (
              <div className="px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/25 flex items-center gap-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className="text-[10px] font-bold text-blue-400 font-mono">
                  {status.cooling_keys} COOLING
                </span>
              </div>
            ) : (
              <div className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700/50 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-bold text-slate-400 font-mono uppercase">
                  Stable
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Tier Analytics and Statistics */}
        <div className="space-y-4">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-2">
            Historical Routing Density
          </span>

          <div className="space-y-3">
            {/* Tier 1 Hit progress bar */}
            <div>
              <div className="flex justify-between text-[11px] mb-1 font-mono">
                <span className="text-slate-300 font-bold">Tier 1: Premium OR</span>
                <span className="text-emerald-400 font-bold">{status.tier_stats.tier1_hits} ({getPercent(status.tier_stats.tier1_hits)}%)</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.03] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${getPercent(status.tier_stats.tier1_hits)}%` }}
                />
              </div>
            </div>

            {/* Tier 2 Hit progress bar */}
            <div>
              <div className="flex justify-between text-[11px] mb-1 font-mono">
                <span className="text-slate-300 font-bold">Tier 2: Free Pool OR</span>
                <span className="text-teal-400 font-bold">{status.tier_stats.tier2_hits} ({getPercent(status.tier_stats.tier2_hits)}%)</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.03] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-teal-400 rounded-full transition-all duration-500"
                  style={{ width: `${getPercent(status.tier_stats.tier2_hits)}%` }}
                />
              </div>
            </div>

            {/* Tier 3 Hit progress bar */}
            <div>
              <div className="flex justify-between text-[11px] mb-1 font-mono">
                <span className="text-slate-300 font-bold">Tier 3: Specific Free</span>
                <span className="text-amber-400 font-bold">{status.tier_stats.tier3_hits} ({getPercent(status.tier_stats.tier3_hits)}%)</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.03] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${getPercent(status.tier_stats.tier3_hits)}%` }}
                />
              </div>
            </div>

            {/* Tier 4 Hit progress bar */}
            <div>
              <div className="flex justify-between text-[11px] mb-1 font-mono">
                <span className="text-slate-300 font-bold">Tier 4: Cloud Failover</span>
                <span className="text-orange-400 font-bold">{status.tier_stats.tier4_hits} ({getPercent(status.tier_stats.tier4_hits)}%)</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.03] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-orange-400 rounded-full transition-all duration-500"
                  style={{ width: `${getPercent(status.tier_stats.tier4_hits)}%` }}
                />
              </div>
            </div>

            {/* Tier 5 Hit progress bar */}
            <div>
              <div className="flex justify-between text-[11px] mb-1 font-mono">
                <span className="text-slate-300 font-bold">Tier 5: Local Ollama</span>
                <span className="text-rose-400 font-bold">{status.tier_stats.tier5_hits} ({getPercent(status.tier_stats.tier5_hits)}%)</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.03] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-rose-400 rounded-full transition-all duration-500"
                  style={{ width: `${getPercent(status.tier_stats.tier5_hits)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
