import { useRef, useEffect } from 'react'

interface ThoughtEntry {
  agent_id?: string
  timestamp: string
  phase: string
  message: string
  model_used?: string
}

interface ThoughtLogProps {
  thoughts: ThoughtEntry[]
  compact?: boolean
  maxLines?: number
}

const PHASE_COLORS: Record<string, string> = {
  draft: 'text-blue-400',
  testing: 'text-purple-400',
  commit: 'text-emerald-400',
  rollback: 'text-amber-400',
  evolve: 'text-cyan-400',
  error: 'text-red-400',
  general: 'text-slate-400',
}

const PHASE_ICONS: Record<string, string> = {
  draft: '📝',
  testing: '🧪',
  commit: '✅',
  rollback: '↩️',
  evolve: '🧬',
  error: '⚠️',
  general: '💭',
}

export default function ThoughtLog({ thoughts, compact = false, maxLines = 100 }: ThoughtLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const displayThoughts = compact ? thoughts.slice(0, 3) : thoughts.slice(0, maxLines)

  useEffect(() => {
    if (!compact && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [thoughts, compact])

  if (displayThoughts.length === 0) {
    return (
      <div className={`text-text-muted text-xs italic ${compact ? 'py-1' : 'py-4 text-center'}`}>
        No thoughts yet...
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className={`space-y-0.5 overflow-y-auto ${compact ? 'max-h-[4.5rem]' : 'max-h-[500px]'}`}
    >
      {displayThoughts.map((t, i) => {
        const colorClass = PHASE_COLORS[t.phase] || PHASE_COLORS.general
        const icon = PHASE_ICONS[t.phase] || '💭'
        const time = new Date(t.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })

        return (
          <div
            key={`${t.timestamp}-${i}`}
            className={`flex items-start gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'} animate-slide-up`}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <span className="shrink-0 opacity-70">{icon}</span>
            <span className="shrink-0 text-text-muted font-mono">{time}</span>
            <span className={`${colorClass} break-all leading-relaxed`}>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
