import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiCall } from '../api'
import {
    Activity, Clock, CheckCircle2, AlertCircle, AlertTriangle,
    XCircle, Play, Square, RefreshCw, List, Filter,
    ChevronDown, ChevronUp, Search, Zap, Cpu, Layers,
    DollarSign, ShoppingBag, BookOpen, Server, Shield
} from 'lucide-react'

interface TaskItem {
    id: string
    name: string
    description: string
    category: string
    priority: number
    status: string
    progress_pct: number
    progress_message: string
    created_by: string
    assigned_to: string
    ai_provider: string
    ai_model: string
    tokens_used: number
    created_at: string
    queued_at: string | null
    started_at: string | null
    completed_at: string | null
    estimated_duration_sec: number | null
    result_summary: string
    error_message: string
    parent_task_id: string | null
    child_task_ids: string[]
    tags: string[]
}

interface QueueSnapshot {
    total_pending: number
    total_running: number
    total_completed_today: number
    total_failed_today: number
    tasks: TaskItem[]
    queue_health: string
    avg_wait_time_sec: number
    avg_execution_time_sec: number
}

interface QueueStats {
    total_all_time: number
    total_today: number
    total_this_week: number
    by_category: Record<string, number>
    by_status: Record<string, number>
    avg_completion_time_sec: number
    avg_wait_time_sec: number
    success_rate_pct: number
    total_tokens_used: number
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    running: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    completed: 'text-green-400 bg-green-500/10 border-green-500/20',
    failed: 'text-red-400 bg-red-500/10 border-red-500/20',
    cancelled: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    retrying: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
    1: { label: 'CRITICAL', color: 'text-red-400' },
    2: { label: 'HIGH', color: 'text-orange-400' },
    3: { label: 'NORMAL', color: 'text-yellow-400' },
    4: { label: 'LOW', color: 'text-blue-400' },
    5: { label: 'IDLE', color: 'text-slate-500' },
}

const CATEGORY_ICONS: Record<string, any> = {
    evolution: Zap,
    swarm: Cpu,
    money: DollarSign,
    shopify: ShoppingBag,
    dev: Layers,
    skill: BookOpen,
    health: Shield,
    scheduled: Clock,
    manual: Activity,
}

const STATUS_ICONS: Record<string, any> = {
    pending: Clock,
    running: Activity,
    completed: CheckCircle2,
    failed: AlertCircle,
    cancelled: XCircle,
    retrying: AlertTriangle,
}

function formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '-'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
}

function formatTime(iso: string | null): string {
    if (!iso) return '-'
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function TaskQueue() {
    const navigate = useNavigate()
    const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null)
    const [stats, setStats] = useState<QueueStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [filterCategory, setFilterCategory] = useState<string>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [expandedTask, setExpandedTask] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const wsRef = useRef<WebSocket | null>(null)

    const fetchData = useCallback(async () => {
        try {
            const [snap, st] = await Promise.all([
                apiCall('/api/queue/snapshot'),
                apiCall('/api/queue/stats'),
            ])
            setSnapshot(snap)
            setStats(st)
            setError(null)
        } catch (e: any) {
            setError(e.message || 'Failed to load queue data')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 3000)
        return () => clearInterval(interval)
    }, [fetchData])

    // WebSocket connection for real-time updates
    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = window.location.host
        const ws = new WebSocket(`${protocol}//${host}/api/queue/ws/queue/stream`)
        wsRef.current = ws

        ws.onopen = () => console.log('[TaskQueue] WebSocket connected')
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data)
                if (msg.type && msg.type.startsWith('task_')) {
                    // Refresh on any task event
                    fetchData()
                }
            } catch { }
        }
        ws.onclose = () => console.log('[TaskQueue] WebSocket disconnected')

        // Ping every 30s
        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('ping')
        }, 30000)

        return () => {
            clearInterval(pingInterval)
            ws.close()
        }
    }, [fetchData])

    const handleCancel = async (taskId: string) => {
        setActionLoading(taskId)
        try {
            await apiCall(`/api/queue/tasks/${taskId}/cancel`, { method: 'POST' })
            fetchData()
        } catch (e: any) {
            setError(e.message || 'Failed to cancel task')
        } finally {
            setActionLoading(null)
        }
    }

    const handleRetry = async (taskId: string) => {
        setActionLoading(taskId)
        try {
            await apiCall(`/api/queue/tasks/${taskId}/retry`, { method: 'POST' })
            fetchData()
        } catch (e: any) {
            setError(e.message || 'Failed to retry task')
        } finally {
            setActionLoading(null)
        }
    }

    const getHealthIcon = (health: string) => {
        switch (health) {
            case 'healthy': return <CheckCircle2 className="w-4 h-4 text-green-400" />
            case 'backed_up': return <AlertTriangle className="w-4 h-4 text-yellow-400" />
            case 'stalled': return <AlertCircle className="w-4 h-4 text-red-400" />
            default: return <Activity className="w-4 h-4 text-slate-400" />
        }
    }

    const getHealthText = (health: string) => {
        switch (health) {
            case 'healthy': return 'HEALTHY'
            case 'backed_up': return 'BACKED UP'
            case 'stalled': return 'STALLED'
            default: return 'UNKNOWN'
        }
    }

    const filteredTasks = (snapshot?.tasks || []).filter(task => {
        if (filterStatus !== 'all' && task.status !== filterStatus) return false
        if (filterCategory !== 'all' && task.category !== filterCategory) return false
        if (searchQuery && !task.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
        return true
    })

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw className="w-10 h-10 text-cyan-400 animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 text-lg">Loading Task Queue...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <List className="w-8 h-8 text-cyan-400" />
                        Task Queue
                    </h1>
                    <p className="text-slate-400 mt-1">Real-time AI task execution monitor</p>
                </div>
                <button
                    onClick={fetchData}
                    className="p-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}

            {/* Summary Bar */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
                    <div className="flex items-center gap-2 text-yellow-400 text-xs font-bold mb-1">
                        <Clock className="w-4 h-4" /> PENDING
                    </div>
                    <div className="text-3xl font-bold text-white">{snapshot?.total_pending || 0}</div>
                </div>
                <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
                    <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold mb-1">
                        <Activity className="w-4 h-4" /> RUNNING
                    </div>
                    <div className="text-3xl font-bold text-white">{snapshot?.total_running || 0}</div>
                </div>
                <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
                    <div className="flex items-center gap-2 text-green-400 text-xs font-bold mb-1">
                        <CheckCircle2 className="w-4 h-4" /> TODAY
                    </div>
                    <div className="text-3xl font-bold text-white">{snapshot?.total_completed_today || 0}</div>
                </div>
                <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
                    <div className="flex items-center gap-2 text-red-400 text-xs font-bold mb-1">
                        <AlertCircle className="w-4 h-4" /> FAILED
                    </div>
                    <div className="text-3xl font-bold text-white">{snapshot?.total_failed_today || 0}</div>
                </div>
                <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold mb-1" style={{ color: snapshot?.queue_health === 'healthy' ? '#4ade80' : '#facc15' }}>
                        {getHealthIcon(snapshot?.queue_health || 'healthy')} HEALTH
                    </div>
                    <div className="text-3xl font-bold text-white">{getHealthText(snapshot?.queue_health || 'healthy')}</div>
                </div>
            </div>

            {/* Stats Row */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
                    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 text-center">
                        <div className="text-xs text-slate-500">All Time</div>
                        <div className="text-lg font-bold text-white">{stats.total_all_time}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 text-center">
                        <div className="text-xs text-slate-500">This Week</div>
                        <div className="text-lg font-bold text-white">{stats.total_this_week}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 text-center">
                        <div className="text-xs text-slate-500">Success Rate</div>
                        <div className="text-lg font-bold text-green-400">{stats.success_rate_pct}%</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 text-center">
                        <div className="text-xs text-slate-500">Avg Wait</div>
                        <div className="text-lg font-bold text-white">{formatDuration(stats.avg_wait_time_sec)}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 text-center">
                        <div className="text-xs text-slate-500">Avg Exec</div>
                        <div className="text-lg font-bold text-white">{formatDuration(stats.avg_completion_time_sec)}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 text-center">
                        <div className="text-xs text-slate-500">Tokens Used</div>
                        <div className="text-lg font-bold text-purple-400">{(stats.total_tokens_used / 1000).toFixed(0)}K</div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                {/* Status Filter */}
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg border border-slate-700 p-1">
                    {['all', 'pending', 'running', 'completed', 'failed'].map(s => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${filterStatus === s
                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                                }`}
                        >
                            {s.toUpperCase()}
                        </button>
                    ))}
                </div>

                {/* Category Filter */}
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-500"
                >
                    <option value="all">All Categories</option>
                    <option value="evolution">Evolution</option>
                    <option value="swarm">Swarm</option>
                    <option value="money">Money</option>
                    <option value="shopify">Shopify</option>
                    <option value="dev">Dev</option>
                    <option value="skill">Skill</option>
                    <option value="health">Health</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="manual">Manual</option>
                </select>

                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                </div>
            </div>

            {/* Task List */}
            <div className="space-y-2">
                {filteredTasks.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No tasks found</p>
                    </div>
                ) : (
                    filteredTasks.map((task) => {
                        const StatusIcon = STATUS_ICONS[task.status] || Activity
                        const CategoryIcon = CATEGORY_ICONS[task.category] || Activity
                        const isExpanded = expandedTask === task.id
                        const waitTime = task.started_at && task.created_at
                            ? (new Date(task.started_at).getTime() - new Date(task.created_at).getTime()) / 1000
                            : 0
                        const duration = task.completed_at && task.started_at
                            ? (new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()) / 1000
                            : task.started_at
                                ? (Date.now() - new Date(task.started_at).getTime()) / 1000
                                : 0

                        return (
                            <div
                                key={task.id}
                                className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors"
                            >
                                {/* Task Row */}
                                <div
                                    className="flex items-center gap-4 p-4 cursor-pointer"
                                    onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                                >
                                    {/* Status Icon */}
                                    <StatusIcon className={`w-5 h-5 ${STATUS_COLORS[task.status]?.split(' ')[0] || 'text-slate-400'}`} />

                                    {/* Priority */}
                                    <span className={`text-[10px] font-bold w-16 ${PRIORITY_LABELS[task.priority]?.color || 'text-slate-400'}`}>
                                        {PRIORITY_LABELS[task.priority]?.label || 'N/A'}
                                    </span>

                                    {/* Category */}
                                    <div className="flex items-center gap-1 w-20">
                                        <CategoryIcon className="w-3.5 h-3.5 text-slate-500" />
                                        <span className="text-xs text-slate-400">{task.category.toUpperCase()}</span>
                                    </div>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-white truncate">{task.name}</div>
                                        {task.progress_message && (
                                            <div className="text-xs text-slate-500 truncate">{task.progress_message}</div>
                                        )}
                                    </div>

                                    {/* AI Model */}
                                    {task.ai_model && (
                                        <div className="w-32 text-xs text-slate-500 truncate hidden md:block">{task.ai_model}</div>
                                    )}

                                    {/* Progress Bar (running tasks) */}
                                    {task.status === 'running' && (
                                        <div className="w-24">
                                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-cyan-500 to-green-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${task.progress_pct}%` }}
                                                />
                                            </div>
                                            <div className="text-[10px] text-cyan-400 mt-0.5 text-right">{task.progress_pct}%</div>
                                        </div>
                                    )}

                                    {/* Wait Time */}
                                    {task.status === 'pending' && (
                                        <div className="w-20 text-xs text-slate-500 text-right">
                                            Wait: {formatDuration(waitTime || (snapshot?.avg_wait_time_sec || 0))}
                                        </div>
                                    )}

                                    {/* Duration */}
                                    {duration > 0 && (
                                        <div className="w-20 text-xs text-slate-500 text-right">
                                            {formatDuration(duration)}
                                        </div>
                                    )}

                                    {/* Time */}
                                    <div className="w-20 text-xs text-slate-500 text-right hidden lg:block">
                                        {formatTime(task.created_at)}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        {(task.status === 'pending' || task.status === 'running') && (
                                            <button
                                                onClick={() => handleCancel(task.id)}
                                                disabled={actionLoading === task.id}
                                                className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                                title="Cancel"
                                            >
                                                <Square className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        {(task.status === 'failed' || task.status === 'cancelled') && (
                                            <button
                                                onClick={() => handleRetry(task.id)}
                                                disabled={actionLoading === task.id}
                                                className="p-1.5 rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                                                title="Retry"
                                            >
                                                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === task.id ? 'animate-spin' : ''}`} />
                                            </button>
                                        )}
                                        <button className="p-1.5 text-slate-500 hover:text-white transition-colors">
                                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="border-t border-slate-700 p-4 bg-slate-800/50">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">Task ID</div>
                                                <div className="text-sm text-white font-mono">{task.id.slice(0, 8)}...</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">Created By</div>
                                                <div className="text-sm text-white">{task.created_by}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">Assigned To</div>
                                                <div className="text-sm text-white">{task.assigned_to || '-'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">Tags</div>
                                                <div className="text-sm text-white">{task.tags.join(', ') || '-'}</div>
                                            </div>
                                        </div>

                                        {task.description && (
                                            <div className="mb-4">
                                                <div className="text-xs text-slate-500 mb-1">Description</div>
                                                <div className="text-sm text-slate-300">{task.description}</div>
                                            </div>
                                        )}

                                        {/* Timeline */}
                                        <div className="mb-4">
                                            <div className="text-xs text-slate-500 mb-2">Timeline</div>
                                            <div className="grid grid-cols-4 gap-2 text-xs">
                                                <div className="bg-slate-700/50 rounded p-2">
                                                    <div className="text-slate-500">Created</div>
                                                    <div className="text-white">{formatTime(task.created_at)}</div>
                                                </div>
                                                <div className="bg-slate-700/50 rounded p-2">
                                                    <div className="text-slate-500">Started</div>
                                                    <div className="text-white">{formatTime(task.started_at)}</div>
                                                </div>
                                                <div className="bg-slate-700/50 rounded p-2">
                                                    <div className="text-slate-500">Completed</div>
                                                    <div className="text-white">{formatTime(task.completed_at)}</div>
                                                </div>
                                                <div className="bg-slate-700/50 rounded p-2">
                                                    <div className="text-slate-500">Duration</div>
                                                    <div className="text-white">{formatDuration(duration)}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Result / Error */}
                                        {task.result_summary && (
                                            <div className="mb-2">
                                                <div className="text-xs text-green-500 mb-1">Result</div>
                                                <div className="text-sm text-slate-300 bg-green-500/5 rounded-lg p-3 border border-green-500/10">
                                                    {task.result_summary}
                                                </div>
                                            </div>
                                        )}
                                        {task.error_message && (
                                            <div>
                                                <div className="text-xs text-red-500 mb-1">Error</div>
                                                <div className="text-sm text-red-300 bg-red-500/5 rounded-lg p-3 border border-red-500/10 font-mono">
                                                    {task.error_message}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}