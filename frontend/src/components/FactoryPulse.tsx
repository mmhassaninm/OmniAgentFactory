import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

interface MirrorInsight {
  question: string
  answer: string
  generated_at: string
}

interface MirrorResponse {
  insights: {
    top_improver?: MirrorInsight
    best_strategy?: MirrorInsight
    factory_trajectory?: MirrorInsight
    common_failure?: MirrorInsight
    save_priority?: MirrorInsight
  }
  cache_ttl_minutes: number
}

const INSIGHT_CONFIG = [
  { key: 'top_improver', icon: '🚀', label: 'Top Improver' },
  { key: 'best_strategy', icon: '⚡', label: 'Best Strategy' },
  { key: 'factory_trajectory', icon: '📈', label: 'Factory Trajectory' },
  { key: 'common_failure', icon: '🔍', label: 'Common Failure' },
  { key: 'save_priority', icon: '💾', label: 'Save Priority' },
]

async function fetchMirror(): Promise<MirrorResponse> {
  const res = await fetch('/api/factory/mirror')
  if (!res.ok) throw new Error(res.statusText)
  return res.json()
}

async function clearMirrorCache() {
  await fetch('/api/factory/mirror/cache', { method: 'DELETE' })
}

export default function FactoryPulse() {
  const [expanded, setExpanded] = useState<string | null>('top_improver')

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<MirrorResponse>({
    queryKey: ['factory-mirror'],
    queryFn: fetchMirror,
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 minutes
    staleTime: 5 * 60 * 1000,
  })

  const handleRefresh = async () => {
    await clearMirrorCache()
    await refetch()
  }

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="glass rounded-2xl p-5 mb-6 relative overflow-hidden">
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 via-cyan-400 to-purple-500" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔮</span>
          <h2 className="text-lg font-bold text-text-primary">Factory Pulse</h2>
          <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">
            Self-Awareness Layer
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-text-muted">Updated {lastUpdated}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="text-xs px-3 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-text-muted
                       hover:text-text-primary transition-colors disabled:opacity-50"
          >
            {isLoading ? '⟳ Loading...' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 mb-3">
          Failed to load insights. Backend may still be generating data.
        </div>
      )}

      {isLoading && !data && (
        <div className="space-y-2">
          {INSIGHT_CONFIG.map(cfg => (
            <div key={cfg.key} className="h-12 bg-surface-2 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {data && (
        <div className="space-y-2">
          {INSIGHT_CONFIG.map(cfg => {
            const insight = data.insights[cfg.key as keyof typeof data.insights]
            const isOpen = expanded === cfg.key

            return (
              <div
                key={cfg.key}
                className="rounded-xl border border-white/5 bg-surface-2 overflow-hidden
                           hover:border-white/10 transition-all"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : cfg.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="text-base">{cfg.icon}</span>
                  <span className="text-sm font-medium text-text-primary flex-1">{cfg.label}</span>
                  {insight && (
                    <span className="text-xs text-text-muted line-clamp-1 max-w-[240px] hidden sm:block">
                      {insight.answer.slice(0, 80)}…
                    </span>
                  )}
                  <span className="text-text-muted text-xs ml-2">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && insight && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    <p className="text-xs text-text-muted mt-1 mb-2 italic">{insight.question}</p>
                    <p className="text-sm text-text-primary leading-relaxed">{insight.answer}</p>
                    <p className="text-xs text-text-muted mt-2">
                      Generated: {new Date(insight.generated_at).toLocaleString()}
                    </p>
                  </div>
                )}

                {isOpen && !insight && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    <p className="text-sm text-text-muted mt-2">No data available yet.</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-text-muted mt-3 text-center">
        Auto-refreshes every 5 minutes · Cache TTL: 30 minutes
      </p>
    </div>
  )
}
