import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck, AlertTriangle, CheckCircle, Clock, XCircle,
    RefreshCw, FileCode, Activity, Search, ChevronRight, Terminal
} from 'lucide-react';
import nexusBridge from '../../services/bridge.js';

// ── Status config ───────────────────────────────────────────
const STATUS_CONFIG = {
    pending: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: Clock, label: 'PENDING' },
    healing: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Activity, label: 'HEALING' },
    resolved: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle, label: 'RESOLVED' },
    failed: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: XCircle, label: 'FAILED' },
};

const LEVEL_DOT = {
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
    healing: 'bg-cyan-500',
};

// ── Stat Card ───────────────────────────────────────────────
function StatCard({ label, value, color }) {
    return (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 text-center">
            <div className={`text-xl font-black tabular-nums ${color}`}>{value}</div>
            <div className="text-[9px] text-gray-500 uppercase tracking-widest mt-1">{label}</div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════
//  MAIN EVENT VIEWER
// ════════════════════════════════════════════════════════════

export default function EventViewerApp() {
    const [events, setEvents] = useState([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, healing: 0, resolved: 0, failed: 0 });
    const [selected, setSelected] = useState(null);
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState('sentinel'); // 'sentinel' | 'raw'
    const [rawLogs, setRawLogs] = useState('');

    // ── Fetch data ──────────────────────────────────────────
    const refresh = useCallback(async () => {
        try {
            if (viewMode === 'sentinel') {
                const filterPayload = filter === 'all' ? {} : { status: filter };
                const [evts, st] = await Promise.all([
                    nexusBridge.invoke('events:list', filterPayload),
                    nexusBridge.invoke('events:stats'),
                ]);
                setEvents(evts || []);
                setStats(st || { total: 0, pending: 0, healing: 0, resolved: 0, failed: 0 });
            } else {
                const logs = await nexusBridge.invoke('events:raw-logs');
                setRawLogs(logs || '');
            }
        } catch (err) {
            console.error('[EventViewer] Fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [filter, viewMode]);

    useEffect(() => {
        refresh();
        const iv = setInterval(refresh, 8000);
        return () => clearInterval(iv);
    }, [refresh]);

    // ── Filter events by search ─────────────────────────────
    const filteredEvents = events.filter(evt => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (evt.message || '').toLowerCase().includes(q) ||
            (evt.filePath || '').toLowerCase().includes(q) ||
            (evt.source || '').toLowerCase().includes(q);
    });

    // ── Format timestamp ────────────────────────────────────
    const fmtTime = (ts) => {
        if (!ts) return '--';
        try {
            return new Date(ts).toLocaleString('en-GB', { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch { return ts; }
    };

    // ── Render ──────────────────────────────────────────────

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex flex-col bg-[#050505] text-white font-sans overflow-hidden"
        >
            {/* ── Header ────────────────────────────────────── */}
            <div className="px-5 pt-4 pb-0 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.1)]">
                        <ShieldCheck className="text-rose-400" size={20} />
                    </div>
                    <div>
                        <h1 className="text-base font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-rose-200 to-rose-500">
                            SENTINEL EVENT VIEWER
                        </h1>
                        <p className="text-[9px] font-mono text-rose-500/60 uppercase tracking-widest">Omniscient Self-Learning Intelligence</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-white/5 border border-white/10 rounded-lg overflow-hidden p-0.5">
                        <button
                            onClick={() => { setViewMode('sentinel'); setIsLoading(true); }}
                            className={`px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-md transition-all ${viewMode === 'sentinel' ? 'bg-rose-500/20 text-rose-400' : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <ShieldCheck className="w-3 h-3 inline-block mr-1 -mt-0.5" /> Sentinel
                        </button>
                        <button
                            onClick={() => { setViewMode('raw'); setIsLoading(true); }}
                            className={`px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider rounded-md transition-all flex items-center gap-1.5 ${viewMode === 'raw' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Terminal size={12} /> Raw Logs
                        </button>
                    </div>
                    <button
                        onClick={() => { setIsLoading(true); refresh(); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                </div>
            </div>

            {/* ── Stats Bar & Filters (Sentinel ONLY) ─────────────────────────────────── */}
            {viewMode === 'sentinel' && (
                <>
                    <div className="px-5 pt-3 flex-shrink-0">
                        <div className="grid grid-cols-5 gap-2">
                            <StatCard label="Total" value={stats.total} color="text-white" />
                            <StatCard label="Pending" value={stats.pending} color="text-yellow-400" />
                            <StatCard label="Healing" value={stats.healing} color="text-blue-400" />
                            <StatCard label="Resolved" value={stats.resolved} color="text-emerald-400" />
                            <StatCard label="Failed" value={stats.failed} color="text-red-400" />
                        </div>
                    </div>

                    <div className="px-5 pt-3 flex gap-2 flex-shrink-0">
                        <div className="flex gap-1 bg-white/[0.03] rounded-lg p-0.5 border border-white/5">
                            {['all', 'pending', 'healing', 'resolved', 'failed'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${filter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    {f.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        <div className="flex-1 relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
                            <input
                                type="text"
                                placeholder="Search events..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-white/[0.03] border border-white/5 rounded-lg pl-7 pr-3 py-1.5 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-rose-500/30"
                            />
                        </div>
                    </div>
                </>
            )}

            {/* ── Main Content ─────────────────── */}
            <div className="flex-1 flex gap-3 p-5 overflow-hidden min-h-0">
                {viewMode === 'sentinel' ? (
                    <>
                        {/* Left: Event List */}
                        <div className="w-[340px] flex-shrink-0 overflow-auto custom-scrollbar space-y-1.5 pr-1">
                            {filteredEvents.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-gray-600 text-xs">
                                    {isLoading ? 'Loading events...' : 'No events found.'}
                                </div>
                            ) : (
                                filteredEvents.map(evt => {
                                    const sc = STATUS_CONFIG[evt.status] || STATUS_CONFIG.pending;
                                    const isSelected = selected?._id === evt._id;
                                    return (
                                        <button
                                            key={evt._id}
                                            onClick={() => setSelected(evt)}
                                            className={`w-full text-left p-3 rounded-xl border transition-all ${isSelected
                                                ? `${sc.bg} ${sc.border} shadow-lg`
                                                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                                                }`}
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${LEVEL_DOT[evt.level] || 'bg-gray-500'}`} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] text-white font-medium truncate">{evt.message?.slice(0, 80) || 'Unknown error'}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-[9px] font-bold uppercase ${sc.color}`}>{sc.label}</span>
                                                        <span className="text-[9px] text-gray-600">{evt.source}</span>
                                                        <span className="text-[9px] text-gray-600">{fmtTime(evt.timestamp)}</span>
                                                    </div>
                                                </div>
                                                <ChevronRight className={`w-3 h-3 mt-1 flex-shrink-0 ${isSelected ? sc.color : 'text-gray-700'}`} />
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {/* Right: Detail Panel */}
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <AnimatePresence mode="wait">
                                {selected ? (
                                    <motion.div
                                        key={selected._id}
                                        initial={{ opacity: 0, x: 8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -8 }}
                                        className="space-y-4"
                                    >
                                        {/* Status Badge */}
                                        {(() => {
                                            const sc = STATUS_CONFIG[selected.status] || STATUS_CONFIG.pending;
                                            const Icon = sc.icon;
                                            return (
                                                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${sc.bg} ${sc.border} border`}>
                                                    <Icon className={`w-4 h-4 ${sc.color}`} />
                                                    <span className={`text-xs font-bold ${sc.color}`}>{sc.label}</span>
                                                    <span className="text-[9px] text-gray-500 ml-auto">{fmtTime(selected.timestamp)}</span>
                                                </div>
                                            );
                                        })()}

                                        {/* Error Message */}
                                        <section className="bg-black/40 p-4 rounded-xl border border-white/5">
                                            <h3 className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                <AlertTriangle className="w-3 h-3" /> Error Message
                                            </h3>
                                            <p className="text-xs text-white font-mono leading-relaxed break-all">{selected.message}</p>
                                        </section>

                                        {/* File Info */}
                                        {selected.filePath && (
                                            <section className="bg-black/40 p-4 rounded-xl border border-white/5">
                                                <h3 className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                    <FileCode className="w-3 h-3" /> Source Location
                                                </h3>
                                                <p className="text-xs text-gray-300 font-mono">{selected.filePath}{selected.line ? `:${selected.line}` : ''}</p>
                                            </section>
                                        )}

                                        {/* Stack Trace */}
                                        {selected.stackTrace && (
                                            <section className="bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                                                <div className="px-4 py-2 border-b border-white/5">
                                                    <h3 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Stack Trace</h3>
                                                </div>
                                                <pre className="p-4 text-[10px] text-red-200/70 font-mono overflow-auto max-h-40 custom-scrollbar whitespace-pre-wrap">
                                                    {selected.stackTrace}
                                                </pre>
                                            </section>
                                        )}

                                        {/* AI Root Cause Analysis */}
                                        {selected.rca && (
                                            <section className="bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/10">
                                                <h3 className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-2">🧠 AI Root Cause Analysis</h3>
                                                <p className="text-xs text-emerald-200/80 leading-relaxed">{selected.rca}</p>
                                            </section>
                                        )}

                                        {/* Patch Applied */}
                                        {selected.patchApplied && (
                                            <section className="bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                                                <div className="px-4 py-2 border-b border-white/5">
                                                    <h3 className="text-[10px] text-violet-400 font-bold uppercase tracking-widest">Patch Applied</h3>
                                                </div>
                                                <pre className="p-4 text-[10px] text-violet-200/70 font-mono overflow-auto max-h-40 custom-scrollbar whitespace-pre-wrap">
                                                    {JSON.stringify(selected.patchApplied, null, 2)}
                                                </pre>
                                            </section>
                                        )}

                                        {/* Metadata */}
                                        <div className="grid grid-cols-3 gap-2 text-[9px] font-mono text-gray-600">
                                            <div>Source: <span className="text-gray-400">{selected.source}</span></div>
                                            <div>Level: <span className="text-gray-400">{selected.level}</span></div>
                                            <div>Attempts: <span className="text-gray-400">{selected.healAttempts || 0}</span></div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex items-center justify-center h-full"
                                    >
                                        <div className="text-center">
                                            <ShieldCheck className="w-12 h-12 text-gray-800 mx-auto mb-3" />
                                            <p className="text-sm text-gray-600">Select an event to inspect</p>
                                            <p className="text-[10px] text-gray-700 mt-1">AI analysis, patch details, and stack traces</p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </>
                ) : (
                    /* ── Raw Logs View ── */
                    <div className="flex-1 bg-black/50 border border-white/5 rounded-xl overflow-hidden relative">
                        <div className="absolute top-0 inset-x-0 h-8 bg-black/40 border-b border-white/5 flex items-center px-4 shrink-0 z-10">
                            <span className="text-[10px] text-cyan-400/70 font-mono tracking-widest uppercase">System Unified Log Stream • nexus_os.log</span>
                        </div>
                        <pre className="w-full h-full pt-10 pb-4 px-4 overflow-auto custom-scrollbar text-[10px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap select-text">
                            {isLoading ? 'Streaming logs...' : (rawLogs || 'No logs recorded.')}
                        </pre>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
