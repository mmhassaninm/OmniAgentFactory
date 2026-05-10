import { useEffect, useState, useCallback } from 'react'
import { BASE_URL } from '../config'

interface EarningsData {
  today: number
  week: number
  month: number
  pitches_sent_week: number
  deals_closed_week: number
  conversion_rate_pct: number
  best_strategy: string
}

interface StatusData {
  agent_mode: string
  paypal_configured: boolean
  paypal_sandbox: boolean
  gmail_configured: boolean
  telegram_configured: boolean
  pending_pitches: number
  pending_emails: number
  paypal_me_link: string
}

interface BalanceEntry {
  currency: string
  total_balance?: { value: string }
}

function fmt(n: number) {
  return n.toFixed(2)
}

function StrategyBadge({ strategy }: { strategy: string }) {
  const labels: Record<string, string> = {
    strategy_1_content: 'Content Writing',
    strategy_2_micro_tasks: 'Micro Tasks',
    strategy_3_digital_products: 'Digital Products',
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300 border border-emerald-700/40">
      {labels[strategy] ?? strategy}
    </span>
  )
}

function ConfigDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${ok ? 'bg-emerald-400' : 'bg-red-500'}`} />
  )
}

export default function EarningsDashboard() {
  const [earnings, setEarnings] = useState<EarningsData | null>(null)
  const [status, setStatus] = useState<StatusData | null>(null)
  const [balance, setBalance] = useState<BalanceEntry[] | null>(null)
  const [hunting, setHunting] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchAll = useCallback(async () => {
    try {
      const [eRes, sRes] = await Promise.all([
        fetch(`${BASE_URL}/api/money/earnings`),
        fetch(`${BASE_URL}/api/money/status`),
      ])
      if (eRes.ok) setEarnings(await eRes.json())
      if (sRes.ok) setStatus(await sRes.json())
      setLastRefresh(new Date())
    } catch {
      // backend offline — silently fail
    }
  }, [])

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/money/balance`)
      if (res.ok) {
        const data = await res.json()
        setBalance(data.balances ?? [])
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchAll()
    fetchBalance()
    const interval = setInterval(fetchAll, 30_000)
    return () => clearInterval(interval)
  }, [fetchAll, fetchBalance])

  const handleHunt = async () => {
    setHunting(true)
    try {
      await fetch(`${BASE_URL}/api/money/hunt`, { method: 'POST' })
      setTimeout(fetchAll, 3000)
    } finally {
      setTimeout(() => setHunting(false), 5000)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e0e0e] text-white p-6 space-y-5 w-full max-w-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <h2 className="text-lg font-semibold tracking-tight">Money Agent</h2>
          {status?.paypal_sandbox && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400 border border-yellow-700/40">
              SANDBOX
            </span>
          )}
        </div>
        <span className="text-xs text-white/30">
          {lastRefresh.toLocaleTimeString()}
        </span>
      </div>

      {/* PayPal balance */}
      <div className="rounded-xl bg-white/5 border border-white/8 p-4">
        <p className="text-xs text-white/40 mb-1 uppercase tracking-wider">PayPal Balance</p>
        {balance && balance.length > 0 ? (
          balance.map((b, i) => (
            <p key={i} className="text-2xl font-bold text-emerald-400">
              {b.currency} {b.total_balance?.value ?? '—'}
            </p>
          ))
        ) : (
          <p className="text-2xl font-bold text-white/20">—</p>
        )}
      </div>

      {/* Earnings grid */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Today', value: earnings?.today },
          { label: 'This Week', value: earnings?.week },
          { label: 'This Month', value: earnings?.month },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
            <p className="text-xs text-white/40 mb-1">{label}</p>
            <p className="text-xl font-bold text-white">
              ${value !== undefined ? fmt(value) : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Pipeline stats */}
      <div className="rounded-xl bg-white/5 border border-white/8 p-4 space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Pipeline (this week)</p>
        <div className="flex justify-between text-sm">
          <span className="text-white/60">Pitches sent</span>
          <span className="font-medium">{earnings?.pitches_sent_week ?? 0}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/60">Deals closed</span>
          <span className="font-medium">{earnings?.deals_closed_week ?? 0}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/60">Conversion rate</span>
          <span className="font-medium text-emerald-400">
            {earnings?.conversion_rate_pct?.toFixed(1) ?? '0.0'}%
          </span>
        </div>
        <div className="flex justify-between text-sm items-center">
          <span className="text-white/60">Best strategy</span>
          {earnings?.best_strategy && <StrategyBadge strategy={earnings.best_strategy} />}
        </div>
      </div>

      {/* Pending approvals alert */}
      {status && (status.pending_pitches > 0 || status.pending_emails > 0) && (
        <div className="rounded-xl border border-amber-600/40 bg-amber-900/20 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <span>⏳</span>
            <span>
              {status.pending_pitches} pitch{status.pending_pitches !== 1 ? 'es' : ''} awaiting your approval
            </span>
          </div>
          <a
            href="/money-agent"
            className="text-xs text-amber-400 hover:text-amber-200 underline underline-offset-2"
          >
            Review →
          </a>
        </div>
      )}

      {/* Config status */}
      {status && (
        <div className="rounded-xl bg-white/5 border border-white/8 p-3 grid grid-cols-2 gap-1 text-xs text-white/50">
          <span><ConfigDot ok={status.paypal_configured} />PayPal API</span>
          <span><ConfigDot ok={status.gmail_configured} />Gmail</span>
          <span><ConfigDot ok={status.telegram_configured} />Telegram</span>
          <span className="text-white/30 truncate">mode: {status.agent_mode}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleHunt}
          disabled={hunting}
          className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 disabled:text-emerald-700 text-white text-sm font-medium py-2.5 transition-colors"
        >
          {hunting ? '🔍 Hunting...' : '🔍 Hunt Now'}
        </button>
        <button
          onClick={() => { fetchAll(); fetchBalance() }}
          className="rounded-xl border border-white/10 hover:border-white/20 px-4 text-sm text-white/60 hover:text-white transition-colors"
        >
          ↻
        </button>
      </div>
    </div>
  )
}
