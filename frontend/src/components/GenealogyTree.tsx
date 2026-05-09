import { useQuery } from '@tanstack/react-query'

interface GenealogyNode {
  agent_id: string
  name: string
  current_score: number
  status: string
  generation: number
  version: number
  parent_agent_id?: string
  bred_from_agents?: string[]
  children: string[]
}

interface AncestryData {
  agent: GenealogyNode
  ancestry: GenealogyNode[]
  children: GenealogyNode[]
  generation: number
}

interface Props {
  agentId: string
  agentName: string
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <span
      className="text-xs font-bold px-1.5 py-0.5 rounded"
      style={{ color, backgroundColor: `${color}22` }}
    >
      {pct}%
    </span>
  )
}

function NodeCard({
  node,
  highlight = false,
  label,
}: {
  node: GenealogyNode
  highlight?: boolean
  label?: string
}) {
  const statusColor: Record<string, string> = {
    evolving: '#22c55e',
    paused: '#f59e0b',
    stopped: '#6b7280',
    idle: '#6b7280',
    ghost: '#7c3aed',
    extinct: '#ef4444',
  }

  return (
    <div
      className={`flex flex-col gap-1 px-3 py-2 rounded-xl border text-xs transition-all ${
        highlight
          ? 'border-accent-primary/60 bg-accent-primary/10 shadow-[0_0_8px_rgba(0,212,255,0.15)]'
          : 'border-white/5 bg-surface-2 hover:border-white/10'
      }`}
    >
      {label && <span className="text-text-muted text-[10px] uppercase tracking-wide">{label}</span>}
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: statusColor[node.status] || '#6b7280' }}
        />
        <span className="font-medium text-text-primary truncate max-w-[120px]">{node.name}</span>
        <ScoreBadge score={node.current_score} />
      </div>
      <div className="text-text-muted flex gap-2">
        <span>Gen {node.generation}</span>
        <span>·</span>
        <span>v{node.version}</span>
        <span>·</span>
        <span className="truncate">{node.agent_id.slice(0, 8)}</span>
      </div>
    </div>
  )
}

export default function GenealogyTree({ agentId, agentName }: Props) {
  const { data, isLoading } = useQuery<AncestryData>({
    queryKey: ['genealogy', agentId],
    queryFn: async () => {
      const res = await fetch(`/api/factory/genealogy/${agentId}`)
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    },
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-4 mb-6">
        <div className="h-4 bg-surface-2 rounded animate-pulse mb-2 w-32" />
        <div className="h-24 bg-surface-2 rounded animate-pulse" />
      </div>
    )
  }

  if (!data || !data.agent) {
    return (
      <div className="glass rounded-2xl p-4 mb-6 text-xs text-text-muted">
        No genealogy record yet — will appear after first evolution cycle.
      </div>
    )
  }

  const { agent, ancestry, children } = data
  const hasAncestry = ancestry && ancestry.length > 0
  const hasChildren = children && children.length > 0
  const isBred = agent.bred_from_agents && agent.bred_from_agents.length > 0

  return (
    <div className="glass rounded-2xl p-5 mb-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent-secondary/60 via-accent-primary/60 to-accent-secondary/60" />

      <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
        <span>🧬</span>
        <span>Genealogy Tree</span>
        <span className="text-xs text-text-muted font-normal bg-surface-2 px-2 py-0.5 rounded-full">
          Generation {agent.generation}
        </span>
      </h3>

      <div className="flex flex-col items-center gap-2">
        {/* Ancestry chain (oldest first) */}
        {hasAncestry && (
          <div className="w-full space-y-1">
            {[...ancestry].reverse().map((anc, idx) => (
              <div key={anc.agent_id} className="flex items-start gap-2">
                <div className="flex flex-col items-center">
                  <div
                    className="w-px flex-1 bg-gradient-to-b from-transparent to-white/10"
                    style={{ minHeight: '8px' }}
                  />
                </div>
                <div className="flex-1">
                  <NodeCard node={anc} label={idx === 0 ? 'Origin' : `Ancestor (Gen ${anc.generation})`} />
                </div>
              </div>
            ))}
            {/* Connector line down to current */}
            <div className="flex justify-center">
              <div className="w-px h-4 bg-white/10" />
            </div>
          </div>
        )}

        {/* Bred indicator */}
        {isBred && (
          <div className="text-xs text-accent-secondary flex items-center gap-1 mb-1">
            <span>🧬</span>
            <span>Bred from {agent.bred_from_agents!.length} parents</span>
          </div>
        )}

        {/* Current agent */}
        <div className="w-full">
          <NodeCard node={agent} highlight label="This Agent" />
        </div>

        {/* Children */}
        {hasChildren && (
          <>
            <div className="flex justify-center">
              <div className="w-px h-4 bg-white/10" />
            </div>
            <div className="w-full grid grid-cols-2 gap-2">
              {children.map((child) => (
                <NodeCard key={child.agent_id} node={child} label="Child" />
              ))}
            </div>
          </>
        )}

        {!hasAncestry && !hasChildren && !isBred && (
          <p className="text-xs text-text-muted text-center mt-1">
            First generation — no ancestors or children yet
          </p>
        )}
      </div>
    </div>
  )
}
