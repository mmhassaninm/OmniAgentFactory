import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, RefreshCw, Cpu, Activity, DollarSign, Clock, ListCollapse, Database } from 'lucide-react'
import { useLang } from '../i18n/LanguageContext'

interface ProviderStats {
  provider: string
  status: 'online' | 'offline' | 'unconfigured'
  latency_ms: number
  calls: number
  tokens_in: number
  tokens_out: number
  cost_usd: number
  errors: number
  avg_latency_ms: number
  rpm_limit: number
  rpd_limit: number
}

interface HubData {
  uptime_seconds: number
  total_calls_session: number
  total_cost_session_usd: number
  active_calls: number
  providers: Record<string, ProviderStats>
  recent_calls: any[]
}

const ModelHub: React.FC = () => {
  const { t } = useLang()
  const { data: hubData, refetch, isLoading } = useQuery<HubData>({
    queryKey: ['hub-dashboard'],
    queryFn: () =>
      fetch('/api/hub/dashboard')
        .then(r => r.json())
        .catch(() => ({
          uptime_seconds: 0,
          total_calls_session: 0,
          total_cost_session_usd: 0,
          active_calls: 0,
          providers: {},
          recent_calls: [],
        })),
    refetchInterval: 2000,
  })

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours}h ${mins}m ${secs}s`
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'online':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
          dot: 'bg-emerald-400 shadow-[0_0_8px_#10b981]',
        }
      case 'offline':
        return {
          bg: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
          dot: 'bg-rose-400 shadow-[0_0_8px_#f43f5e]',
        }
      default:
        return {
          bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
          dot: 'bg-amber-400 shadow-[0_0_8px_#f59e0b]',
        }
    }
  }

  return (
    <div className="p-6 text-slate-100 select-none overflow-y-auto max-h-[calc(100vh-60px)]">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Floating Header */}
        <div className="flex items-center justify-between bg-slate-900/40 backdrop-blur-md p-4 rounded-xl border border-slate-800/60 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <Activity className="text-white animate-pulse" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 font-mono tracking-tight uppercase">
                {t?.('ai_model_hub') || 'AI Model Hub'}
              </h1>
              <p className="text-xs text-slate-400 font-mono">Real-Time LLM Telemetry & Multi-Provider Cascade Monitor</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 hover:text-white rounded-lg border border-slate-700/50 shadow-md transition-all active:scale-95 font-mono text-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            FORCE SYNC
          </button>
        </div>

        {isLoading && !hubData ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="animate-spin text-cyan-400 w-8 h-8" />
            <div className="text-sm text-slate-400 font-mono">Establishing neural link with ModelHub...</div>
          </div>
        ) : (
          <>
            {/* Realtime Metrics Board */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              {/* Card: Active Calls */}
              <div className="relative overflow-hidden bg-slate-950/60 backdrop-blur-md p-5 rounded-xl border border-cyan-500/20 shadow-lg group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-all duration-500" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-cyan-400 tracking-wider">ACTIVE PIPELINES</span>
                  <Cpu className="text-cyan-400/80" size={16} />
                </div>
                <div className="text-3xl font-black font-mono tracking-tight text-white flex items-baseline gap-2">
                  {hubData?.active_calls || 0}
                  {hubData?.active_calls && hubData.active_calls > 0 ? (
                    <span className="text-xs bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-mono animate-ping">IN-FLIGHT</span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono">IDLE</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-2">Currently processing LLM queries</div>
              </div>

              {/* Card: Total Calls */}
              <div className="relative overflow-hidden bg-slate-950/60 backdrop-blur-md p-5 rounded-xl border border-slate-800/80 shadow-lg group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all duration-500" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-emerald-400 tracking-wider">TOTAL DISPATCHED</span>
                  <Database className="text-emerald-400/80" size={16} />
                </div>
                <div className="text-3xl font-black font-mono tracking-tight text-white">
                  {hubData?.total_calls_session || 0}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-2">Dispatched model requests this session</div>
              </div>

              {/* Card: Session Cost */}
              <div className="relative overflow-hidden bg-slate-950/60 backdrop-blur-md p-5 rounded-xl border border-slate-800/80 shadow-lg group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-fuchsia-500/5 rounded-full blur-2xl group-hover:bg-fuchsia-500/10 transition-all duration-500" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-fuchsia-400 tracking-wider">ACCRUED ACCUMULATION</span>
                  <DollarSign className="text-fuchsia-400/80" size={16} />
                </div>
                <div className="text-3xl font-black font-mono tracking-tight text-white">
                  ${(hubData?.total_cost_session_usd || 0).toFixed(4)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-2">Aggregated session costs in USD</div>
              </div>

              {/* Card: Uptime */}
              <div className="relative overflow-hidden bg-slate-950/60 backdrop-blur-md p-5 rounded-xl border border-slate-800/80 shadow-lg group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all duration-500" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-amber-400 tracking-wider">TELEMETRY UPTIME</span>
                  <Clock className="text-amber-400/80" size={16} />
                </div>
                <div className="text-lg font-black font-mono tracking-tight text-white py-1">
                  {formatUptime(hubData?.uptime_seconds || 0)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-2">Continuous monitor online duration</div>
              </div>

            </div>

            {/* Providers Segment */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-mono text-slate-400 tracking-widest uppercase">ACTIVE NEURAL TIER PROVIDERS</h2>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">AUTOSCALING ON</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {hubData?.providers && Object.entries(hubData.providers).map(([name, stats]) => {
                  const style = getStatusStyle(stats.status)
                  const usagePercentage = Math.min((stats.calls / (stats.rpm_limit || 30)) * 100, 100)

                  return (
                    <div
                      key={name}
                      className="relative overflow-hidden bg-slate-900/30 backdrop-blur-md p-4 rounded-xl border border-slate-800/70 hover:border-slate-700/80 transition-all duration-300 shadow-md group"
                    >
                      {/* Inner glowing top accent */}
                      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />

                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-mono text-sm font-bold text-white tracking-wider uppercase group-hover:text-cyan-400 transition-colors">
                          {name}
                        </h3>
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider ${style.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {stats.status}
                        </div>
                      </div>

                      <div className="space-y-2 text-xs font-mono">
                        <div className="flex justify-between border-b border-slate-800/40 pb-1.5">
                          <span className="text-slate-400">Response Latency:</span>
                          <span className="text-cyan-300 font-bold">{stats.latency_ms} ms</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800/40 pb-1.5">
                          <span className="text-slate-400">Calls Handled:</span>
                          <span className="text-white font-bold">{stats.calls}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800/40 pb-1.5">
                          <span className="text-slate-400">Error Incidents:</span>
                          <span className={`font-bold ${stats.errors > 0 ? 'text-rose-400 font-extrabold animate-pulse' : 'text-emerald-400'}`}>
                            {stats.errors}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800/40 pb-1.5">
                          <span className="text-slate-400">Total Tokens:</span>
                          <span className="text-slate-300">{stats.tokens_in + stats.tokens_out}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800/40 pb-1.5">
                          <span className="text-slate-400">Estimated Cost:</span>
                          <span className="text-fuchsia-300 font-bold">${stats.cost_usd.toFixed(4)}</span>
                        </div>

                        {/* Rate Limit RPM Monitor */}
                        <div className="pt-2">
                          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                            <span>RPM LOAD FACTOR</span>
                            <span>{stats.calls} / {stats.rpm_limit || 30} RPM</span>
                          </div>
                          <div className="bg-slate-950/80 rounded h-1.5 overflow-hidden border border-slate-800/40">
                            <div
                              className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-full transition-all duration-500"
                              style={{ width: `${usagePercentage}%` }}
                            />
                          </div>
                        </div>

                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Realtime Call Feed */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-mono text-slate-400 tracking-widest uppercase flex items-center gap-2">
                  <ListCollapse size={16} />
                  LIVE TELEMETRY LOGS (LAST 20 TRANSMISSIONS)
                </h2>
                <div className="text-[10px] font-mono text-cyan-400 tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-ping" />
                  REALTIME AUTO-STREAMING
                </div>
              </div>

              <div className="bg-slate-900/20 backdrop-blur-md rounded-xl border border-slate-800/60 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-xs">
                    <thead>
                      <tr className="bg-slate-950/50 border-b border-slate-800/80 text-slate-400">
                        <th className="px-4 py-3 text-left font-semibold tracking-wider">TIME</th>
                        <th className="px-4 py-3 text-left font-semibold tracking-wider">PROVIDER</th>
                        <th className="px-4 py-3 text-left font-semibold tracking-wider">MODEL IDENTIFIER</th>
                        <th className="px-4 py-3 text-left font-semibold tracking-wider">TOKENS</th>
                        <th className="px-4 py-3 text-left font-semibold tracking-wider">LATENCY</th>
                        <th className="px-4 py-3 text-left font-semibold tracking-wider">COST</th>
                        <th className="px-4 py-3 text-left font-semibold tracking-wider">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {!hubData?.recent_calls || hubData.recent_calls.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                            NO DETECTED CALLS IN LOGGING SHIFT
                          </td>
                        </tr>
                      ) : (
                        hubData.recent_calls.slice(-20).reverse().map((call, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/10 transition-colors">
                            <td className="px-4 py-2.5 text-slate-500">
                              {new Date(call.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="px-4 py-2.5 text-cyan-400 font-bold uppercase tracking-wider">
                              {call.provider}
                            </td>
                            <td className="px-4 py-2.5 text-slate-300 max-w-xs truncate">
                              {call.model}
                            </td>
                            <td className="px-4 py-2.5 text-slate-400">
                              <span className="text-teal-400 font-bold">{call.tokens_in}</span>
                              <span className="text-slate-600"> / </span>
                              <span className="text-indigo-400 font-bold">{call.tokens_out}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`font-semibold ${call.latency_ms > 2000 ? 'text-amber-400' : 'text-cyan-400'}`}>
                                {call.latency_ms} ms
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-fuchsia-300 font-bold">
                              ${(call.cost_usd || 0).toFixed(4)}
                            </td>
                            <td className="px-4 py-2.5">
                              {call.error ? (
                                <span className="inline-flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase truncate max-w-[120px]" title={call.error}>
                                  <AlertCircle size={10} />
                                  FAIL
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">
                                  <CheckCircle size={10} />
                                  SUCCESS
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  )
}

export default ModelHub

