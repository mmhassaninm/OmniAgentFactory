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

export default function AgentCard({ agent, onShowCatalog }: AgentCardProps) {
  const navigate = useNavigate()
  const { t } = useLang()
  const controlMut = useControlAgent()
  const evolveMut = useEvolveAgent()
  const resumeMut = useResumeAgent()
  const fixMut = useFixAgent()
  const { thoughts } = useAgentSocket(agent.id)

  const score = Math.round((agent.score || 0) * 100)

  const STATUS_LABELS: Record<string, string> = {
    evolving: t('agent.status.evolving'),
    paused: t('agent.status.paused'),
    paused_safe: t('agent.status.paused'),
    paused_unsafe: t('agent.status.paused_unsafe'),
    stopped: t('agent.status.stopped'),
    idle: t('agent.status.idle'),
    testing: t('agent.status.testing'),
    error: t('agent.status.error'),
  }

  const statusLabel = STATUS_LABELS[agent.status] || agent.status.toUpperCase()
  const statusClass = STATUS_CLASSES[agent.status] || 'status-idle'

  // Score ring color
  const scoreColor = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div
      className="glass rounded-xl p-4 hover:border-accent-secondary/40
                 transition-all duration-300 hover:translate-y-[-2px]
                 hover:shadow-[0_8px_32px_rgba(124,58,237,0.15)]
                 group relative overflow-hidden"
    >
      {/* Subtle gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent-primary via-accent-secondary to-accent-tertiary opacity-50 group-hover:opacity-100 transition-opacity" />

      {/* Header: Name + Status + Score */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 mr-3">
          <h3
            className="text-sm font-bold text-text-primary truncate cursor-pointer
                       hover:text-accent-primary transition-colors"
            onClick={() => navigate(`/agent/${agent.id}`)}
          >
            {agent.name}
          </h3>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{agent.goal}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Version Badge */}
          <span className="text-[10px] font-mono text-text-muted bg-bg-panel px-1.5 py-0.5 rounded">
            v{agent.version}
          </span>

          {/* Status Badge */}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Score Ring */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative w-10 h-10 shrink-0">
          <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
            <circle
              cx="18" cy="18" r="15.9"
              fill="none"
              stroke="rgba(100,116,139,0.15)"
              strokeWidth="2.5"
            />
            <circle
              cx="18" cy="18" r="15.9"
              fill="none"
              stroke={scoreColor}
              strokeWidth="2.5"
              strokeDasharray={`${score} ${100 - score}`}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
            style={{ color: scoreColor }}
          >
            {score}%
          </span>
        </div>

        <div className="flex-1 text-[10px] text-text-muted">
          <div>{t('agent.performance_score')}</div>
          <div className="font-mono text-text-secondary">
            {t('agent.created_date')} {new Date(agent.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Real-time Thought Log (last 3 lines) */}
      <div className="mb-3 bg-bg-base/50 rounded-lg p-2 border border-border-default/50">
        <ThoughtLog thoughts={thoughts} compact />
      </div>

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

      {/* USE + Catalog + Preview Buttons */}
      <div className="mt-2 pt-2 border-t border-border-default/30 flex items-center gap-2">
        <button
          onClick={() => navigate(`/agent/${agent.id}/chat`)}
          title={t('agent.use_title')}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg
                     bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 text-[10px] font-bold
                     transition-colors border border-teal-500/20"
        >
          <span>💬</span>
          <span>{t('agent.use')}</span>
        </button>
        <button
          onClick={() => onShowCatalog(agent.id)}
          className="flex-1 text-[10px] text-text-muted hover:text-accent-primary
                     transition-colors flex items-center justify-center gap-1 py-1.5"
        >
          <span>📖</span>
          <span>{t('agent.catalog')}</span>
        </button>
        <button
          onClick={() => window.open(`/agent/${agent.id}/preview`, '_blank')}
          className="flex-1 text-[10px] text-text-muted hover:text-accent-primary
                     transition-colors flex items-center justify-center gap-1 py-1.5"
        >
          <span>👁</span>
          <span>{t('agent.preview')}</span>
        </button>
      </div>
    </div>
  )
}
