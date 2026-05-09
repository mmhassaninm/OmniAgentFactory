import { useNavigate } from 'react-router-dom'
import { useControlAgent, useEvolveAgent, useResumeAgent, useFixAgent, Agent } from '../hooks/useAgent'
import { useAgentSocket } from '../hooks/useSocket'
import ThoughtLog from './ThoughtLog'
import KillSwitch from './KillSwitch'
import { useLang } from '../i18n/LanguageContext'

interface AgentCardProps {
  agent: Agent
  onShowCatalog: (agentId: string) => void
}

export default function AgentCard({ agent, onShowCatalog }: AgentCardProps) {
  const navigate = useNavigate()
  const { t } = useLang()
  const controlMut = useControlAgent()
  const evolveMut = useEvolveAgent()
  const resumeMut = useResumeAgent()
  const fixMut = useFixAgent()
  const { thoughts } = useAgentSocket(agent.id)

  const score = Math.round((agent.score || 0) * 100)

  // Status Badge Logic
  let statusBadge = (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400 border border-slate-700/20">
      IDLE
    </span>
  )

  if (agent.status === 'evolving') {
    statusBadge = (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
        EVOLVING
      </span>
    )
  } else if (agent.status === 'error' || agent.status === 'failed') {
    statusBadge = (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
        FAILED
      </span>
    )
  } else if (agent.version >= 10 || agent.status === 'complete' || agent.status === 'testing') {
    statusBadge = (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
        COMPLETE
      </span>
    )
  }

  return (
    <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-5 hover:border-indigo-500/30 transition-all duration-300 hover:shadow-[0_8px_32px_rgba(99,102,241,0.12)] group relative overflow-hidden flex flex-col justify-between min-h-[340px]">
      {/* Subtle top edge gradient glow on hover */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div>
        {/* Header: Name + Status Badge */}
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0 flex-1 pr-3">
            <h3
              onClick={() => navigate(`/agents/${agent.id}`)}
              className="text-sm font-semibold text-white tracking-tight cursor-pointer hover:text-indigo-400 transition-colors truncate"
            >
              {agent.name}
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">
              ID: {agent.id.substring(0, 8)}...
            </span>
          </div>
          <div className="shrink-0">
            {statusBadge}
          </div>
        </div>

        {/* Goal Description */}
        <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed mb-4 h-8">
          {agent.goal}
        </p>

        {/* Score Ring & Performance Area */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative w-10 h-10 shrink-0">
            <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
              <circle
                cx="18" cy="18" r="15.9"
                fill="none"
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="2.5"
              />
              <circle
                cx="18" cy="18" r="15.9"
                fill="none"
                stroke={score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'}
                strokeWidth="2.5"
                strokeDasharray={`${score} ${100 - score}`}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            </svg>
            <span
              className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
              style={{ color: score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444' }}
            >
              {score}%
            </span>
          </div>

          <div className="flex-1 text-[10px] text-slate-500 font-mono">
            <div>Score: {score}% Performance</div>
            <div>Created: {new Date(agent.created_at).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Evolution Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 font-mono">
            <span>Evolution Progress</span>
            <span>Cycle {agent.version}/10</span>
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full transition-all duration-500"
              style={{ width: `${Math.min(100, (agent.version / 10) * 100)}%` }}
            />
          </div>
        </div>

        {/* Real-time Thought Log */}
        <div className="mb-4 bg-[#05080f]/50 rounded-lg p-2.5 border border-white/[0.04] text-[11px]">
          <ThoughtLog thoughts={thoughts} compact />
        </div>
      </div>

      <div>
        {/* Kill Switch Controls */}
        <KillSwitch
          agentId={agent.id}
          status={agent.status}
          onControl={(mode) => controlMut.mutate({ agentId: agent.id, mode })}
          onEvolve={() => evolveMut.mutate(agent.id)}
          onResume={() => resumeMut.mutate(agent.id)}
          onFix={(instruction) => fixMut.mutate({ agentId: agent.id, instruction })}
          isLoading={controlMut.isPending || evolveMut.isPending || resumeMut.isPending}
        />

        {/* Action Buttons Footer */}
        <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-2">
          <button
            onClick={() => navigate(`/agents/${agent.id}/chat`)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-xs font-semibold transition-all border border-indigo-500/20"
          >
            <span>💬</span>
            <span>Chat</span>
          </button>
          
          <button
            onClick={() => onShowCatalog(agent.id)}
            className="px-3 py-1.5 rounded-lg border border-white/[0.06] hover:bg-white/5 text-slate-400 hover:text-white text-xs transition-all"
          >
            📖 Catalog
          </button>

          <button
            onClick={() => window.open(`/agent/${agent.id}/preview`, '_blank')}
            className="px-3 py-1.5 rounded-lg border border-white/[0.06] hover:bg-white/5 text-slate-400 hover:text-white text-xs transition-all"
          >
            👁 Preview
          </button>
        </div>
      </div>
    </div>
  )
}
