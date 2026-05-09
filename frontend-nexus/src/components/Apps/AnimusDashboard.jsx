import React, { useState, useEffect, useCallback } from 'react';
import { Dna, Play, Square, RefreshCw, Check, X, ChevronDown, ChevronRight, Loader2, Zap, FileCode, Clock, Syringe, Copy, ClipboardCheck } from 'lucide-react';
import nexusBridge from '../../services/bridge';

const STATUS_COLORS = {
    pending: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
    injected: 'text-green-400 border-green-500/30 bg-green-500/10',
    rejected: 'text-red-400 border-red-500/30 bg-red-500/10',
    failed: 'text-red-400 border-red-500/30 bg-red-500/10',
};

/** Reusable glassmorphism copy-to-clipboard button */
function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async (e) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* fallback: silently fail if clipboard is blocked */ }
    };
    return (
        <button
            onClick={handleCopy}
            className={`absolute top-2 right-2 z-10 flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-wide border backdrop-blur-md transition-all duration-200 cursor-pointer select-none ${copied
                ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                : 'bg-black/30 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'
                }`}
            title={copied ? 'Copied!' : 'Copy to clipboard'}
        >
            {copied ? <ClipboardCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy'}
        </button>
    );
}

export default function AnimusDashboard() {
    const [daemonStatus, setDaemonStatus] = useState(null);
    const [queue, setQueue] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);

    // Fetch status and queue
    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const [status, q] = await Promise.all([
                nexusBridge.invoke('animus:status', {}),
                nexusBridge.invoke('animus:queue', { limit: 50, status: 'pending' })
            ]);
            setDaemonStatus(status);
            setQueue(q || []);
        } catch (err) {
            console.error('[AnimusDashboard] Fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    // Auto-refresh every 30s
    useEffect(() => {
        const interval = setInterval(refresh, 30000);
        return () => clearInterval(interval);
    }, [refresh]);

    // Daemon Control
    const handleStartDaemon = async () => {
        await nexusBridge.invoke('animus:daemon-start', {});
        setTimeout(refresh, 1000);
    };

    const handleStopDaemon = async () => {
        await nexusBridge.invoke('animus:daemon-stop', {});
        setTimeout(refresh, 500);
    };

    // Approve & Inject
    const handleInject = async (id) => {
        setActionLoading(id);
        try {
            const result = await nexusBridge.invoke('animus:inject', { itemId: id });
            if (result?.success) {
                // Re-fetch queue from MongoDB for accurate state
                await refresh();
            } else {
                console.error('[AnimusDashboard] Inject failed:', result?.message || result?.error);
            }
        } catch (err) {
            console.error('[AnimusDashboard] Inject error:', err);
        } finally {
            setActionLoading(null);
        }
    };

    // Reject (Skip)
    const handleReject = async (id) => {
        setActionLoading(id);
        try {
            const result = await nexusBridge.invoke('animus:reject', { itemId: id });
            if (result?.success) {
                await refresh();
            } else {
                console.error('[AnimusDashboard] Reject failed:', result?.message || result?.error);
            }
        } catch (err) {
            console.error('[AnimusDashboard] Reject error:', err);
        } finally {
            setActionLoading(null);
        }
    };

    const progress = daemonStatus ? Math.round((daemonStatus.currentFileIndex / Math.max(daemonStatus.totalFiles, 1)) * 100) : 0;

    return (
        <div className="w-full h-full flex flex-col bg-[#050505] text-white font-sans overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                        <Dna className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold tracking-wide">Nexus-Animus DNA Vault</h1>
                        <p className="text-[10px] text-gray-500">Persistent Legacy Evolution Daemon</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={refresh} className="p-2 rounded-lg hover:bg-white/10 transition-colors" title="Refresh">
                        <RefreshCw className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    {daemonStatus?.isDaemonRunning ? (
                        <button onClick={handleStopDaemon} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold hover:bg-red-500/30 transition-colors">
                            <Square className="w-3 h-3" /> Stop Daemon
                        </button>
                    ) : (
                        <button onClick={handleStartDaemon} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-colors">
                            <Play className="w-3 h-3" /> Start Daemon
                        </button>
                    )}
                </div>
            </div>

            {/* Stats Bar */}
            {daemonStatus && (
                <div className="px-4 py-3 border-b border-white/5 bg-black/40 flex items-center gap-4 flex-shrink-0">
                    <div className="flex-1">
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                            <span>Progress: {daemonStatus.currentFileIndex}/{daemonStatus.totalFiles} files</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                    <div className="flex gap-3 text-[10px]">
                        <span className="text-emerald-400">🧠 {daemonStatus.stats.evolved} evolved</span>
                        <span className="text-yellow-400">📋 {daemonStatus.stats.queued} queued</span>
                        <span className="text-cyan-400">💉 {daemonStatus.stats.injected} injected</span>
                        <span className="text-gray-400">⏭️ {daemonStatus.stats.skipped} skipped</span>
                    </div>
                </div>
            )}

            {/* Queue List */}
            <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-2">
                {queue.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <Dna className="w-12 h-12 mb-4 opacity-30" />
                        <p className="text-sm">No pending evolutions in the queue.</p>
                        <p className="text-xs mt-1">Start the daemon to begin extracting legacy DNA.</p>
                    </div>
                ) : (
                    queue.map(item => (
                        <div key={item.id} className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition-colors">
                            {/* Header Row */}
                            <div
                                className="flex items-center gap-3 p-3 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            >
                                {expandedId === item.id
                                    ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                    : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                }
                                <FileCode className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-white truncate">{item.suggested_name}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${STATUS_COLORS[item.status] || 'text-gray-400'}`}>
                                            {item.snippet_type || 'full_file'}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 truncate mt-0.5">
                                        From: {item.source_name} → {item.target_dir}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleInject(item.id); }}
                                        disabled={actionLoading === item.id}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold hover:bg-emerald-500/40 disabled:opacity-40 transition-all"
                                    >
                                        {actionLoading === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Syringe className="w-3 h-3" />}
                                        INJECT
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleReject(item.id); }}
                                        disabled={actionLoading === item.id}
                                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded Detail View */}
                            {expandedId === item.id && (
                                <div className="border-t border-white/5 bg-black/30 p-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Category</label>
                                            <span className="text-xs text-cyan-300">{item.label || item.category}</span>
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Created</label>
                                            <span className="text-xs text-gray-300">{item.created_at}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-bold text-red-400 uppercase tracking-widest block mb-1">Original Legacy Snippet</label>
                                        <div className="relative">
                                            <CopyButton text={item.original_snippet} />
                                            <pre className="bg-black/60 border border-white/5 rounded-lg p-3 pr-20 text-[10px] text-red-200/80 font-mono max-h-40 overflow-auto custom-scrollbar whitespace-pre-wrap">
                                                {item.original_snippet}
                                            </pre>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block mb-1">Evolved NexusOS Code</label>
                                        <div className="relative">
                                            <CopyButton text={item.evolved_code} />
                                            <pre className="bg-black/60 border border-emerald-500/10 rounded-lg p-3 pr-20 text-[10px] text-emerald-200/80 font-mono max-h-60 overflow-auto custom-scrollbar whitespace-pre-wrap">
                                                {item.evolved_code}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Live Log Footer */}
            {daemonStatus?.recentLog?.length > 0 && (
                <div className="h-24 border-t border-white/5 bg-black/60 p-2 overflow-auto custom-scrollbar flex-shrink-0">
                    {daemonStatus.recentLog.slice(-8).map((entry, i) => (
                        <p key={i} className={`text-[9px] font-mono py-0.5 ${entry.type === 'error' ? 'text-red-400' :
                            entry.type === 'success' ? 'text-emerald-400' :
                                entry.type === 'progress' ? 'text-cyan-400' :
                                    'text-gray-500'
                            }`}>
                            <span className="text-gray-600 mr-2">{entry.timestamp?.slice(11, 19)}</span>
                            {entry.message}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}
