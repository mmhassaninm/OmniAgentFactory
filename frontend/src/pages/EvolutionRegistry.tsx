import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Brain, Lightbulb, Bug, Pause, Play, RefreshCw, CheckCircle, XCircle } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Idea {
  id: string
  title: string
  description: string
  source: string
  status: 'pending' | 'in_progress' | 'implemented' | 'rejected' | 'approved_manually'
  impact: 'high' | 'medium' | 'low'
  feasibility: 'high' | 'medium' | 'low'
  category: string
  created_at: string
  implemented_at?: string
  outcome?: string
}

interface Problem {
  id: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'in_progress' | 'solved' | "won't_fix"
  root_cause: string
  proposed_solution: string
  created_at: string
  solved_at?: string
  verified: boolean
}

interface LoopStats {
  stats: {
    total_ideas: number
    implemented_ideas: number
    total_problems: number
    solved_problems: number
    idea_success_rate: number
    problem_resolution_rate: number
  }
  loop_cycle: number
  loop_active: boolean
  loop_paused: boolean
}

// ── Fetch helpers ──────────────────────────────────────────────────────────────
const API = 'http://localhost:3001'

const fetchStats = async (): Promise<LoopStats> => {
  const r = await fetch(`${API}/api/evolution/stats`)
  if (!r.ok) throw new Error('Failed to fetch stats')
  return r.json()
}

const fetchIdeas = async (status?: string): Promise<{ ideas: Idea[]; count: number }> => {
  const url = status ? `${API}/api/evolution/ideas?status=${status}` : `${API}/api/evolution/ideas`
  const r = await fetch(url)
  if (!r.ok) throw new Error('Failed to fetch ideas')
  return r.json()
}

const fetchProblems = async (status?: string): Promise<{ problems: Problem[]; count: number }> => {
  const url = status ? `${API}/api/evolution/problems?status=${status}` : `${API}/api/evolution/problems`
  const r = await fetch(url)
  if (!r.ok) throw new Error('Failed to fetch problems')
  return r.json()
}

// ── Color helpers ──────────────────────────────────────────────────────────────
const statusColor: Record<string, string> = {
  pending:          'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  in_progress:      'bg-blue-500/10 text-blue-400 border-blue-500/20',
  implemented:      'bg-green-500/10 text-green-400 border-green-500/20',
  approved_manually:'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  solved:           'bg-green-500/10 text-green-400 border-green-500/20',
  rejected:         'bg-red-500/10 text-red-400 border-red-500/20',
  "won't_fix":      'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

const impactColor: Record<string, string> = {
  high:   'text-red-400',
  medium: 'text-yellow-400',
  low:    'text-slate-400',
}

const severityColor: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-orange-400',
  medium:   'text-yellow-400',
  low:      'text-slate-400',
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function EvolutionRegistry() {
  const qc = useQueryClient()
  const [ideaFilter, setIdeaFilter] = useState<string | undefined>(undefined)
  const [probFilter, setProbFilter] = useState<string | undefined>(undefined)

  // Queries
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['evolution-stats'],
    queryFn: fetchStats,
    refetchInterval: 10_000,
    retry: 2,
  })

  const { data: ideasData, isLoading: ideasLoading } = useQuery({
    queryKey: ['evolution-ideas', ideaFilter],
    queryFn: () => fetchIdeas(ideaFilter),
    refetchInterval: 15_000,
    retry: 2,
  })

  const { data: problemsData, isLoading: problemsLoading } = useQuery({
    queryKey: ['evolution-problems', probFilter],
    queryFn: () => fetchProblems(probFilter),
    refetchInterval: 15_000,
    retry: 2,
  })

  // Mutations
  const approveIdea = useMutation({
    mutationFn: (id: string) =>
      fetch(`${API}/api/evolution/ideas/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evolution-ideas'] }),
  })

  const rejectIdea = useMutation({
    mutationFn: (id: string) =>
      fetch(`${API}/api/evolution/ideas/${id}/reject`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evolution-ideas'] }),
  })

  const pauseLoop = useMutation({
    mutationFn: () => fetch(`${API}/api/evolution/loop/pause`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evolution-stats'] }),
  })

  const resumeLoop = useMutation({
    mutationFn: () => fetch(`${API}/api/evolution/loop/resume`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evolution-stats'] }),
  })

  const stats    = statsData?.stats
  const isActive = statsData?.loop_active ?? false
  const isPaused = statsData?.loop_paused ?? false
  const cycle    = statsData?.loop_cycle ?? 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 min-h-screen bg-[#060a12] text-[#f0f4f8]">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Evolution Registry</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${
                statsLoading ? 'bg-slate-500' :
                statsError   ? 'bg-rose-500' :
                isActive && !isPaused ? 'bg-green-400 animate-pulse' :
                isPaused ? 'bg-yellow-400' : 'bg-slate-500'
              }`} />
              <span className="text-xs text-slate-400 font-mono">
                {statsLoading ? 'Connecting...' :
                 statsError   ? 'Backend offline' :
                 isActive && !isPaused ? `Cycle #${cycle} — Running` :
                 isPaused ? `Cycle #${cycle} — Paused` : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {!statsError && (isPaused ? (
            <button
              onClick={() => resumeLoop.mutate()}
              disabled={resumeLoop.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> Resume
            </button>
          ) : (
            <button
              onClick={() => pauseLoop.mutate()}
              disabled={pauseLoop.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          ))}
          <button
            onClick={() => qc.invalidateQueries()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/5 border border-white/10 text-slate-400 rounded-lg hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* ── Stats Row ─────────────────────────────────────────────────────── */}
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Ideas',    value: stats.total_ideas,       icon: Lightbulb,   color: 'cyan'   },
            { label: 'Implemented',    value: stats.implemented_ideas,  icon: CheckCircle, color: 'green'  },
            { label: 'Total Problems', value: stats.total_problems,     icon: Bug,         color: 'orange' },
            { label: 'Solved',         value: stats.solved_problems,    icon: CheckCircle, color: 'green'  },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg bg-${color}-500/10 border border-${color}-500/20 flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 text-${color}-400`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
              </div>
            </div>
          ))}
        </div>
      ) : statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          ⚠ Cannot reach backend — make sure NexusOS is running on port 3001
        </div>
      )}

      {/* ── Tables Row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Ideas Table */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-sm text-white">Ideas</span>
              {ideasData && (
                <span className="text-[10px] text-slate-500 font-mono ml-1">({ideasData.count})</span>
              )}
            </div>
            <div className="flex gap-1">
              {([undefined, 'pending', 'implemented', 'rejected'] as const).map(s => (
                <button
                  key={s ?? 'all'}
                  onClick={() => setIdeaFilter(s)}
                  className={`px-2 py-0.5 text-[10px] rounded font-mono transition-colors ${
                    ideaFilter === s
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {s ?? 'all'}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-white/[0.04] max-h-[520px] overflow-y-auto">
            {ideasLoading ? (
              <div className="p-8 text-center text-slate-600 text-sm">Loading ideas...</div>
            ) : ideasData?.ideas.length === 0 ? (
              <div className="p-8 text-center text-slate-600 text-sm">No ideas yet — loop is running...</div>
            ) : ideasData?.ideas.map(idea => (
              <div key={idea.id} className="p-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-slate-500">{idea.id}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${statusColor[idea.status] ?? ''}`}>
                        {idea.status}
                      </span>
                      <span className={`text-[10px] font-mono ${impactColor[idea.impact]}`}>
                        ↑{idea.impact}
                      </span>
                      {idea.category && (
                        <span className="text-[10px] text-slate-500 font-mono">{idea.category}</span>
                      )}
                    </div>
                    <p className="text-sm text-white mt-1 font-medium leading-snug">{idea.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{idea.description}</p>
                  </div>
                  {idea.status === 'pending' && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => approveIdea.mutate(idea.id)}
                        disabled={approveIdea.isPending}
                        className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                        title="Approve"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => rejectIdea.mutate(idea.id)}
                        disabled={rejectIdea.isPending}
                        className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        title="Reject"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Problems Table */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-orange-400" />
              <span className="font-semibold text-sm text-white">Problems</span>
              {problemsData && (
                <span className="text-[10px] text-slate-500 font-mono ml-1">({problemsData.count})</span>
              )}
            </div>
            <div className="flex gap-1">
              {([undefined, 'in_progress', 'solved'] as const).map(s => (
                <button
                  key={s ?? 'all'}
                  onClick={() => setProbFilter(s)}
                  className={`px-2 py-0.5 text-[10px] rounded font-mono transition-colors ${
                    probFilter === s
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {s ?? 'all'}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-white/[0.04] max-h-[520px] overflow-y-auto">
            {problemsLoading ? (
              <div className="p-8 text-center text-slate-600 text-sm">Loading problems...</div>
            ) : problemsData?.problems.length === 0 ? (
              <div className="p-8 text-center text-slate-600 text-sm">No problems detected yet...</div>
            ) : problemsData?.problems.map(prob => (
              <div key={prob.id} className="p-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono text-slate-500">{prob.id}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${statusColor[prob.status] ?? ''}`}>
                        {prob.status}
                      </span>
                      <span className={`text-[10px] font-mono ${severityColor[prob.severity]}`}>
                        ⚡{prob.severity}
                      </span>
                      {prob.verified && (
                        <span className="text-[10px] text-green-400 font-mono">✓ verified</span>
                      )}
                    </div>
                    <p className="text-sm text-white mt-1 font-medium leading-snug">{prob.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{prob.description}</p>
                    {prob.proposed_solution && (
                      <p className="text-[10px] text-indigo-400/70 mt-1 line-clamp-1">💡 {prob.proposed_solution}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
