import { useModelHealth } from '../hooks/useAgent'

export default function ModelRouter() {
  const { data, isLoading } = useModelHealth()

  if (isLoading || !data) return null

  const providers = Object.entries(data as Record<string, any>)

  return (
    <div className="glass rounded-xl p-4">
      <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
        Model Router Health
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {providers.map(([name, info]) => {
          const available = info.available_keys || 0
          const total = info.total_keys || 0
          const healthy = available > 0

          return (
            <div
              key={name}
              className={`rounded-lg p-2.5 border text-center transition-all ${
                healthy
                  ? 'bg-emerald-950/20 border-emerald-500/20'
                  : total > 0
                  ? 'bg-red-950/20 border-red-500/20'
                  : 'bg-bg-panel border-border-default/30'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1">
                {name}
              </div>
              <div className={`text-lg font-bold ${
                healthy ? 'text-emerald-400' : total > 0 ? 'text-red-400' : 'text-text-muted'
              }`}>
                {available}/{total}
              </div>
              <div className="text-[9px] text-text-muted">keys available</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
