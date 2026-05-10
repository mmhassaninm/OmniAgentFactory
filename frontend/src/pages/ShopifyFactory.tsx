import { useCallback, useEffect, useState } from 'react'
import {
  ShoppingBag,
  Play,
  Pause,
  Square,
  Download,
  Wifi,
  WifiOff,
  RefreshCw,
  Package,
  TrendingUp,
  Clock,
} from 'lucide-react'
import { BASE_URL } from '../config'
import { useShopifySocket, SwarmEvent } from '../hooks/useShopifySocket'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SwarmStatus {
  running: boolean
  paused: boolean
  cycle_count: number
  theme_count: number
  current_agent: string
  current_theme: string
}

interface ThemeVersion {
  id: string
  version: string
  zip_path: string
  changelog: string
  qa_score: number
  created_at: string
}

interface Theme {
  id: string
  name: string
  niche: string
  current_version: string
  sell_price: number
  created_at?: string
  updated_at?: string
}

// ── Agent display names ───────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  market_researcher: 'Market Researcher',
  creative_director: 'Creative Director',
  ux_designer: 'UX Designer',
  liquid_developer: 'Liquid Developer',
  content_writer: 'Content Writer',
  qa_reviewer: 'QA Reviewer',
  version_manager: 'Version Manager',
  shopify_builder: 'Theme Builder',
  swarm: 'Swarm Engine',
}

const AGENT_COLORS: Record<string, string> = {
  market_researcher: 'text-blue-400',
  creative_director: 'text-purple-400',
  ux_designer: 'text-pink-400',
  liquid_developer: 'text-green-400',
  content_writer: 'text-yellow-400',
  qa_reviewer: 'text-orange-400',
  version_manager: 'text-cyan-400',
  shopify_builder: 'text-emerald-400',
  swarm: 'text-indigo-400',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`}
    />
  )
}

function SwarmStatusPanel({
  status,
  onStart,
  onPause,
  onResume,
  onStop,
  loading,
}: {
  status: SwarmStatus | null
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  loading: boolean
}) {
  const isRunning = status?.running && !status?.paused
  const isPaused = status?.running && status?.paused

  return (
    <div className="bg-white/5 border border-white/8 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Swarm Status</h2>
        <StatusDot active={!!isRunning} />
      </div>

      <div className="space-y-3 mb-5">
        <div className="flex justify-between text-sm">
          <span className="text-white/40">State</span>
          <span className={isRunning ? 'text-emerald-400' : isPaused ? 'text-yellow-400' : 'text-white/40'}>
            {isRunning ? 'Running' : isPaused ? 'Paused' : 'Idle'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/40">Cycle</span>
          <span className="text-white font-mono">#{status?.cycle_count ?? 0}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/40">Themes built</span>
          <span className="text-white font-mono">{status?.theme_count ?? 0}</span>
        </div>
        {status?.current_theme && (
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Current theme</span>
            <span className="text-indigo-300 font-medium truncate max-w-[140px]">{status.current_theme}</span>
          </div>
        )}
        {status?.current_agent && (
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Active agent</span>
            <span className={`font-medium ${AGENT_COLORS[status.current_agent] ?? 'text-white'}`}>
              {AGENT_LABELS[status.current_agent] ?? status.current_agent}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {!status?.running ? (
          <button
            onClick={onStart}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            <Play size={14} />
            Start
          </button>
        ) : isPaused ? (
          <button
            onClick={onResume}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            <Play size={14} />
            Resume
          </button>
        ) : (
          <button
            onClick={onPause}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            <Pause size={14} />
            Pause
          </button>
        )}
        {status?.running && (
          <button
            onClick={onStop}
            disabled={loading}
            className="flex items-center justify-center gap-1 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 disabled:opacity-50 text-red-400 text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            <Square size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function AgentFeedPanel({ events, connected }: { events: SwarmEvent[]; connected: boolean }) {
  return (
    <div className="bg-white/5 border border-white/8 rounded-xl p-5 flex flex-col" style={{ minHeight: 320 }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Live Agent Feed</h2>
        <span className="flex items-center gap-1.5 text-xs text-white/40">
          {connected ? (
            <><Wifi size={12} className="text-emerald-400" /> Live</>
          ) : (
            <><WifiOff size={12} className="text-red-400" /> Reconnecting</>
          )}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: 320 }}>
        {events.length === 0 ? (
          <p className="text-white/20 text-sm text-center py-8">
            Start the swarm to see agent activity here.
          </p>
        ) : (
          events.map((ev, i) => (
            <div key={i} className="flex gap-3 py-2 border-b border-white/5 last:border-0">
              <span className={`text-xs font-semibold shrink-0 w-32 truncate ${AGENT_COLORS[ev.agent] ?? 'text-white/60'}`}>
                {AGENT_LABELS[ev.agent] ?? ev.agent}
              </span>
              <span className="text-xs text-white/70 flex-1">{ev.message}</span>
              <span className="text-xs text-white/20 shrink-0">
                {new Date(ev.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ThemeCard({ theme, onDownload }: { theme: Theme; onDownload: (id: string, version: string) => void }) {
  return (
    <div className="bg-white/5 border border-white/8 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-white font-semibold text-sm">{theme.name}</h3>
          <p className="text-white/40 text-xs mt-0.5 capitalize">{theme.niche}</p>
        </div>
        <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/20">
          {theme.current_version}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-emerald-400 font-bold text-sm">${theme.sell_price}</span>
        {theme.updated_at && (
          <span className="text-white/20 text-xs flex items-center gap-1">
            <Clock size={10} />
            {new Date(theme.updated_at).toLocaleDateString()}
          </span>
        )}
      </div>

      <button
        onClick={() => onDownload(theme.id, theme.current_version)}
        className="flex items-center justify-center gap-2 bg-white/8 hover:bg-white/12 border border-white/10 text-white/70 hover:text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors"
      >
        <Download size={12} />
        Download ZIP
      </button>
    </div>
  )
}

function VersionTimeline({ versions }: { versions: ThemeVersion[] }) {
  if (!versions.length) return null
  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div key={v.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
          <span className="text-xs font-mono text-indigo-300 w-16 shrink-0">{v.version}</span>
          <div className="flex-1">
            <span className="text-xs text-white/50">{v.changelog?.split('\n')[0]?.replace(/^#+ /, '') || 'Theme update'}</span>
          </div>
          <span className="text-xs text-white/20 shrink-0">QA: {Math.round(v.qa_score)}</span>
          <span className="text-xs text-white/20 shrink-0">{new Date(v.created_at).toLocaleDateString()}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ShopifyFactory() {
  const { events, connected } = useShopifySocket()
  const [status, setStatus] = useState<SwarmStatus | null>(null)
  const [themes, setThemes] = useState<Theme[]>([])
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const [versions, setVersions] = useState<ThemeVersion[]>([])
  const [loading, setLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/shopify/status`)
      if (res.ok) setStatus(await res.json())
    } catch (_) {}
  }, [])

  const fetchThemes = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/shopify/themes`)
      if (res.ok) setThemes(await res.json())
    } catch (_) {}
  }, [])

  const fetchVersions = useCallback(async (themeId: string) => {
    try {
      const res = await fetch(`${BASE_URL}/api/shopify/themes/${themeId}`)
      if (res.ok) {
        const data = await res.json()
        setVersions(data.versions ?? [])
      }
    } catch (_) {}
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchThemes()
    const statusInterval = setInterval(fetchStatus, 5_000)
    const themesInterval = setInterval(fetchThemes, 10_000)
    return () => {
      clearInterval(statusInterval)
      clearInterval(themesInterval)
    }
  }, [fetchStatus, fetchThemes])

  useEffect(() => {
    if (selectedTheme) fetchVersions(selectedTheme)
  }, [selectedTheme, fetchVersions])

  async function control(action: 'start' | 'pause' | 'resume' | 'stop') {
    setLoading(true)
    try {
      await fetch(`${BASE_URL}/api/shopify/${action}`, { method: 'POST' })
      await fetchStatus()
    } catch (_) {}
    setLoading(false)
  }

  function handleDownload(themeId: string, version: string) {
    window.open(`${BASE_URL}/api/shopify/themes/${themeId}/download/${version}`, '_blank')
  }

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#060a12' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          <ShoppingBag size={16} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Shopify Theme Factory</h1>
          <p className="text-white/40 text-xs">7-agent swarm — research, design, code, package</p>
        </div>
      </div>

      {/* Top row: status + agent feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <SwarmStatusPanel
            status={status}
            onStart={() => control('start')}
            onPause={() => control('pause')}
            onResume={() => control('resume')}
            onStop={() => control('stop')}
            loading={loading}
          />
        </div>
        <div className="lg:col-span-2">
          <AgentFeedPanel events={events} connected={connected} />
        </div>
      </div>

      {/* Theme Library */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
            <Package size={14} />
            Theme Library
            <span className="bg-white/8 text-white/40 text-xs px-2 py-0.5 rounded-full">{themes.length}</span>
          </h2>
          <button
            onClick={fetchThemes}
            className="text-white/30 hover:text-white/60 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {themes.length === 0 ? (
          <div className="bg-white/3 border border-white/6 rounded-xl p-8 text-center">
            <TrendingUp size={32} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No themes yet. Start the swarm to generate your first theme.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {themes.map((theme) => (
              <div key={theme.id}>
                <ThemeCard
                  theme={theme}
                  onDownload={handleDownload}
                />
                <button
                  onClick={() => setSelectedTheme(selectedTheme === theme.id ? null : theme.id)}
                  className="w-full mt-1 text-xs text-white/30 hover:text-white/60 text-center py-1 transition-colors"
                >
                  {selectedTheme === theme.id ? 'Hide history' : 'Version history'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Version Timeline (appears below selected theme card) */}
      {selectedTheme && versions.length > 0 && (
        <div className="bg-white/5 border border-white/8 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
            Version History — {themes.find((t) => t.id === selectedTheme)?.name}
          </h3>
          <VersionTimeline versions={versions} />
        </div>
      )}
    </div>
  )
}
