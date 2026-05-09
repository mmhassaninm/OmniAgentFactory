import { useAgentCatalog } from '../hooks/useAgent'

interface AgentCatalogProps {
  agentId: string
  onClose: () => void
}

export default function AgentCatalog({ agentId, onClose }: AgentCatalogProps) {
  const { data: catalog, isLoading, error } = useAgentCatalog(agentId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-strong rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default/50">
          <div>
            <h2 className="text-lg font-bold gradient-text">Agent Catalog</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {catalog?.agent_name || 'Loading...'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg
                       bg-bg-panel text-text-muted hover:text-text-primary
                       hover:bg-bg-elevated transition-all"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-5rem)]">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin-slow text-2xl">⚙</div>
              <span className="ml-3 text-text-muted">Generating catalog...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <span className="text-red-400">Failed to load catalog</span>
            </div>
          )}

          {catalog && (
            <div className="space-y-5">
              {/* Goal */}
              <section>
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Goal</h3>
                <p className="text-sm text-text-secondary">{catalog.goal}</p>
              </section>

              {/* Catalog Text */}
              <section>
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Documentation</h3>
                <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap bg-bg-base/50 rounded-lg p-4 border border-border-default/30 font-mono text-xs">
                  {catalog.catalog_text}
                </div>
              </section>

              {/* Version & Score */}
              <div className="flex gap-4">
                <div className="flex-1 bg-bg-base/50 rounded-lg p-3 border border-border-default/30">
                  <div className="text-[10px] text-text-muted uppercase mb-1">Version</div>
                  <div className="text-lg font-bold gradient-text">v{catalog.version}</div>
                </div>
                <div className="flex-1 bg-bg-base/50 rounded-lg p-3 border border-border-default/30">
                  <div className="text-[10px] text-text-muted uppercase mb-1">Score</div>
                  <div className="text-lg font-bold text-emerald-400">
                    {Math.round((catalog.score || 0) * 100)}%
                  </div>
                </div>
              </div>

              {/* Version History */}
              {catalog.version_history && catalog.version_history.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                    Version History
                  </h3>
                  <div className="space-y-1.5">
                    {catalog.version_history.map((v: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs bg-bg-base/30 rounded-lg px-3 py-2 border border-border-default/20"
                      >
                        <span className="font-mono text-accent-primary shrink-0">v{v.version}</span>
                        <span className="text-text-secondary flex-1 truncate">{v.message}</span>
                        <span className="text-emerald-400 shrink-0">{Math.round((v.score || 0) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
