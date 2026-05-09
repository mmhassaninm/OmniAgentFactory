import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface FeedEvent {
  type?: string
  agent_id: string
  timestamp: string
  phase: string
  message: string
  model_used?: string
}

interface Agent {
  id: string
  name: string
}

interface Props {
  liveEvents: FeedEvent[]
  agents: Agent[]
}

const PHASE_CFG: Record<string, { icon: string; color: string }> = {
  commit:   { icon: '✅', color: 'text-emerald-400' },
  rollback: { icon: '↩️', color: 'text-amber-400' },
  error:    { icon: '❌', color: 'text-red-400' },
  draft:    { icon: '📝', color: 'text-sky-400' },
  testing:  { icon: '🧪', color: 'text-violet-400' },
  evolve:   { icon: '⚡', color: 'text-cyan-400' },
  cascade:  { icon: '🔀', color: 'text-orange-400' },
  general:  { icon: '💬', color: 'text-slate-400' },
}

async function fetchActivity(): Promise<{ events: FeedEvent[] }> {
  const res = await fetch('/api/factory/activity?limit=50')
  if (!res.ok) return { events: [] }
  return res.json()
}

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function ActivityFeed({ liveEvents, agents }: Props) {
  const [isOpen, setIsOpen] = useState(true)
  const [follow, setFollow] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: historicalData } = useQuery({
    queryKey: ['factory-activity'],
    queryFn: fetchActivity,
    staleTime: 30_000,
  })

  // Merge live (prepended, newest-first) with historical seed
  const historicalEvents: FeedEvent[] = historicalData?.events || []
  const liveIds = new Set(liveEvents.map(e => `${e.agent_id}:${e.timestamp}:${e.message}`))
  const dedupedHistorical = historicalEvents.filter(
    e => !liveIds.has(`${e.agent_id}:${e.timestamp}:${e.message}`)
  )
  const allEvents = [...liveEvents, ...dedupedHistorical].slice(0, 100)

  const agentMap: Record<string, string> = {}
  for (const a of agents) agentMap[a.id] = a.name

  useEffect(() => {
    if (follow && listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [liveEvents.length, follow])

  return (
    <div className="mb-6 glass rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-bold
                   text-text-muted uppercase tracking-wider hover:text-text-primary transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>📡</span>
          <span>Live Activity Feed</span>
          {allEvents.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full
                             bg-accent-primary/10 text-accent-primary normal-case tracking-normal">
              {allEvents.length}
            </span>
          )}
        </div>
        <span className="text-xs opacity-40">{isOpen ? '▼' : '▶'}</span>
      </button>

      {isOpen && (
        <div className="border-t border-border-default/40">
          {/* Controls bar */}
          <div className="flex items-center justify-between px-5 py-2 border-b border-border-default/20">
            <span className="text-xs text-text-muted">
              {allEvents.length === 0
                ? 'Waiting for factory events…'
                : `${allEvents.length} events — newest first`}
            </span>
            <button
              onClick={() => setFollow(f => !f)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all ${
                follow
                  ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                  : 'text-text-muted border border-transparent hover:text-text-primary'
              }`}
            >
              <span className={follow ? 'animate-pulse' : ''}>●</span>
              Follow
            </button>
          </div>

          {/* Event list */}
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto divide-y divide-border-default/10"
          >
            {allEvents.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-sm">
                <div className="text-2xl mb-2 opacity-30">📡</div>
                <p>No activity yet — start evolving an agent to see live events</p>
              </div>
            ) : (
              allEvents.map((ev, i) => {
                const cfg = PHASE_CFG[ev.phase] ?? PHASE_CFG.general
                const agentLabel = agentMap[ev.agent_id] ?? ev.agent_id.slice(0, 8)
                return (
                  <div
                    key={`${ev.agent_id}-${ev.timestamp}-${i}`}
                    className="flex items-start gap-3 px-5 py-2.5 hover:bg-bg-elevated/50 transition-colors"
                  >
                    <span className="shrink-0 mt-0.5 text-sm leading-none">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>
                          {ev.phase}
                        </span>
                        <span className="text-[10px] text-text-muted font-mono truncate max-w-[120px]">
                          {agentLabel}
                        </span>
                        {ev.model_used && (
                          <span className="text-[10px] text-text-muted/60 font-mono truncate hidden sm:block">
                            · {ev.model_used.split('/').pop()}
                          </span>
                        )}
                        <span className="text-[10px] text-text-muted ml-auto shrink-0">
                          {fmtTime(ev.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                        {ev.message}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
