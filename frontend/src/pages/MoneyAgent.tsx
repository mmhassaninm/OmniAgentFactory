import { useEffect, useState, useCallback } from 'react'
import EarningsDashboard from '../components/EarningsDashboard'
import { BASE_URL } from '../config'

interface PendingItem {
  id: string
  opportunity: {
    title: string
    url: string
    snippet: string
    estimated_value: number
  }
  pitch_subject: string
  pitch_body: string
  estimated_value: number
  strategy: string
  created_at: string
  status: string
}

interface Opportunity {
  id: string
  title: string
  url: string
  niche: string
  estimated_value: number
  found_at: string
}

function PitchCard({ item, onApprove, onSkip }: {
  item: PendingItem
  onApprove: (id: string) => void
  onSkip: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState<'approve' | 'skip' | null>(null)

  const handle = async (action: 'approve' | 'skip') => {
    setLoading(action)
    try {
      if (action === 'approve') onApprove(item.id)
      else onSkip(item.id)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{item.opportunity.title}</p>
          <p className="text-xs text-white/40 truncate">{item.opportunity.url}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-emerald-400">
          ~${item.estimated_value.toFixed(0)}
        </span>
      </div>

      <div>
        <p className="text-xs text-white/50 mb-1">Subject: <span className="text-white/80">{item.pitch_subject}</span></p>
        <div
          className={`text-xs text-white/60 leading-relaxed whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}
        >
          {item.pitch_body}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-white/30 hover:text-white/60 mt-1 transition-colors"
        >
          {expanded ? '▲ collapse' : '▼ read more'}
        </button>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => handle('approve')}
          disabled={loading !== null}
          className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium py-2 transition-colors"
        >
          {loading === 'approve' ? 'Sending...' : '✅ Approve & Send'}
        </button>
        <button
          onClick={() => handle('skip')}
          disabled={loading !== null}
          className="flex-1 rounded-lg border border-white/10 hover:border-red-500/40 hover:text-red-400 text-white/60 text-xs font-medium py-2 transition-colors"
        >
          ❌ Skip
        </button>
      </div>
    </div>
  )
}

function OpportunityRow({ opp }: { opp: Opportunity }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0 pr-3">
        <p className="text-sm text-white/80 truncate">{opp.title}</p>
        <p className="text-xs text-white/30 truncate">{opp.url}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-medium text-emerald-400">${opp.estimated_value.toFixed(0)}</p>
        <p className="text-xs text-white/30 capitalize">{opp.niche}</p>
      </div>
    </div>
  )
}

export default function MoneyAgentPage() {
  const [pending, setPending] = useState<PendingItem[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [pRes, oRes] = await Promise.all([
        fetch(`${BASE_URL}/api/money/pending`),
        fetch(`${BASE_URL}/api/money/opportunities`),
      ])
      if (pRes.ok) {
        const d = await pRes.json()
        setPending(d.items ?? [])
      }
      if (oRes.ok) {
        const d = await oRes.json()
        setOpportunities(d.opportunities ?? [])
      }
    } catch {
      // backend offline
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 15_000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleApprove = async (id: string) => {
    await fetch(`${BASE_URL}/api/money/approve/${id}`, { method: 'POST' })
    setPending(prev => prev.filter(p => p.id !== id))
  }

  const handleSkip = async (id: string) => {
    await fetch(`${BASE_URL}/api/money/skip/${id}`, { method: 'POST' })
    setPending(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="min-h-screen bg-[#070707] text-white p-6">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Money Agent</h1>
          <p className="text-sm text-white/40 mt-1">
            Human-in-the-loop income system — agent finds and drafts, you approve and get paid.
          </p>
        </div>

        {/* Two-column layout on wide screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

          {/* Left: dashboard widget */}
          <EarningsDashboard />

          {/* Right: pending approvals */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Awaiting Your Approval
                {pending.length > 0 && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700/40">
                    {pending.length}
                  </span>
                )}
              </h2>
              <button
                onClick={fetchData}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                ↻ refresh
              </button>
            </div>

            {loading ? (
              <div className="rounded-xl border border-white/8 bg-white/5 p-8 text-center text-white/30 text-sm">
                Loading...
              </div>
            ) : pending.length === 0 ? (
              <div className="rounded-xl border border-white/8 bg-white/5 p-8 text-center space-y-2">
                <p className="text-2xl">🎯</p>
                <p className="text-sm text-white/40">No pitches pending approval.</p>
                <p className="text-xs text-white/25">Click "Hunt Now" in the dashboard to find new opportunities.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {pending.map(item => (
                  <PitchCard
                    key={item.id}
                    item={item}
                    onApprove={handleApprove}
                    onSkip={handleSkip}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent opportunities */}
        {opportunities.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-base font-semibold mb-4">Recent Opportunities Found</h2>
            <div className="divide-y divide-white/5">
              {opportunities.map((opp, i) => (
                <OpportunityRow key={opp.id ?? i} opp={opp} />
              ))}
            </div>
          </div>
        )}

        {/* Income timeline hint */}
        <div className="rounded-xl border border-white/8 bg-white/[0.03] p-5">
          <h3 className="text-sm font-medium text-white/60 mb-3">Realistic Income Timeline</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-white/40">
            {[
              { period: 'Week 1', target: '$0–50', note: 'Setup + first pitches' },
              { period: 'Week 2', target: '$50–200', note: '10–20 pitches/day' },
              { period: 'Week 3', target: '$200–500', note: 'Refine what works' },
              { period: 'Month 2+', target: '$500–1 500/mo', note: 'Digital products scale' },
            ].map(({ period, target, note }) => (
              <div key={period} className="rounded-lg bg-white/5 p-3 space-y-1">
                <p className="font-medium text-white/60">{period}</p>
                <p className="text-emerald-400 font-bold text-sm">{target}</p>
                <p className="text-white/30">{note}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
