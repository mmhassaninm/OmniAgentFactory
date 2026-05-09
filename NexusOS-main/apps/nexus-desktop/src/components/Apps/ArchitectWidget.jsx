import React, { useState, useEffect, useCallback } from 'react';
import { Lightbulb, X, Hammer, Sparkles, Clock, Loader2, ChevronDown, ChevronUp, Zap, Play, Square } from 'lucide-react';
import nexusBridge from '../../services/bridge';

export default function ArchitectWidget() {
    const [idea, setIdea] = useState(null);
    const [isBuilding, setIsBuilding] = useState(false);
    const [buildResult, setBuildResult] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [daemonRunning, setDaemonRunning] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Listen for new ideas from the daemon
    useEffect(() => {
        if (window.nexusAPI && window.nexusAPI.receive) {
            const unsub = window.nexusAPI.receive('architect:new-idea', (newIdea) => {
                setIdea(newIdea);
                setBuildResult(null);
                setIsExpanded(false);
            });
            return () => { if (unsub) unsub(); };
        }
    }, []);

    // Check daemon status on mount
    useEffect(() => {
        nexusBridge.invoke('architect:status', {})
            .then(s => {
                setDaemonRunning(s?.isRunning || false);
                if (s?.pendingIdea) setIdea(s.pendingIdea);
            })
            .catch(() => { });
    }, []);

    const handleDismiss = async () => {
        await nexusBridge.invoke('architect:dismiss', {});
        setIdea(null);
        setBuildResult(null);
    };

    const handleBuild = async () => {
        setIsBuilding(true);
        setBuildResult(null);
        try {
            const result = await nexusBridge.invoke('architect:approve', {});
            setBuildResult(result);
        } catch (err) {
            setBuildResult({ success: false, message: err.message });
        } finally {
            setIsBuilding(false);
        }
    };

    const handleTrigger = async () => {
        setIsGenerating(true);
        try {
            const result = await nexusBridge.invoke('architect:trigger', {});
            if (result?.pendingIdea) {
                setIdea(result.pendingIdea);
                setBuildResult(null);
            }
        } catch (err) {
            console.error('[Architect] Trigger failed:', err);
        } finally {
            setIsGenerating(false);
        }
    };

    const toggleDaemon = async () => {
        if (daemonRunning) {
            await nexusBridge.invoke('architect:stop', {});
            setDaemonRunning(false);
        } else {
            await nexusBridge.invoke('architect:start', {});
            setDaemonRunning(true);
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-[#050505] text-white font-sans overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-gradient-to-r from-amber-500/10 to-purple-500/10 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                        <Lightbulb className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold tracking-wide">Nexus-Architect</h1>
                        <p className="text-[10px] text-gray-500">Proactive Evolution Daemon</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleTrigger}
                        disabled={isGenerating}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/30 disabled:opacity-40 transition-colors"
                    >
                        {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {isGenerating ? 'Thinking...' : 'Generate Idea'}
                    </button>
                    <button
                        onClick={toggleDaemon}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${daemonRunning
                                ? 'bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30'
                                : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30'
                            }`}
                    >
                        {daemonRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {daemonRunning ? 'Stop' : 'Auto'}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto custom-scrollbar p-4">
                {!idea ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <Lightbulb className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-sm font-medium">No ideas yet.</p>
                        <p className="text-xs mt-1">Click "Generate Idea" or start the auto-daemon.</p>
                        <p className="text-[10px] mt-3 text-gray-600">The Architect analyzes your OS, workflow, and codebase to invent new features.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Idea Card */}
                        <div className="bg-gradient-to-br from-amber-500/10 to-purple-500/10 border border-amber-500/20 rounded-2xl p-5 shadow-[0_0_40px_rgba(245,158,11,0.1)]">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Lightbulb className="w-4 h-4 text-amber-400" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-lg font-bold text-amber-200">{idea.featureName}</h2>
                                    <p className="text-sm text-gray-300 mt-1 leading-relaxed">{idea.pitch}</p>
                                </div>
                            </div>

                            {/* Expandable Blueprint */}
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-white transition-colors mb-3"
                            >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                Technical Blueprint
                            </button>

                            {isExpanded && idea.technicalBlueprint && (
                                <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-2 mb-3">
                                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                                        <div>
                                            <span className="text-gray-500 uppercase tracking-widest font-bold">Type</span>
                                            <p className="text-cyan-300 mt-0.5">{idea.technicalBlueprint.type}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 uppercase tracking-widest font-bold">Frontend</span>
                                            <p className="text-white mt-0.5">{idea.technicalBlueprint.frontendFile || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 uppercase tracking-widest font-bold">Backend</span>
                                            <p className="text-white mt-0.5">{idea.technicalBlueprint.backendFile || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 uppercase tracking-widest font-bold">IPC</span>
                                            <p className="text-purple-300 mt-0.5">{idea.technicalBlueprint.ipcChannels?.join(', ') || 'N/A'}</p>
                                        </div>
                                    </div>
                                    {idea.technicalBlueprint.keyFeatures && (
                                        <div className="mt-2">
                                            <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Key Features</span>
                                            <ul className="mt-1 space-y-0.5">
                                                {idea.technicalBlueprint.keyFeatures.map((f, i) => (
                                                    <li key={i} className="text-[10px] text-gray-300 flex items-center gap-1.5">
                                                        <Zap className="w-2.5 h-2.5 text-amber-400" /> {f}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleBuild}
                                    disabled={isBuilding}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20"
                                >
                                    {isBuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hammer className="w-4 h-4" />}
                                    {isBuilding ? 'Building...' : '🔨 Build It Now'}
                                </button>
                                <button
                                    onClick={handleDismiss}
                                    className="px-4 py-3 rounded-xl font-bold text-sm bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>

                        {/* Build Result */}
                        {buildResult && (
                            <div className={`p-4 rounded-xl border ${buildResult.success
                                    ? 'bg-emerald-500/10 border-emerald-500/30'
                                    : 'bg-red-500/10 border-red-500/30'
                                }`}>
                                <div className="flex items-center gap-2 mb-2">
                                    {buildResult.success
                                        ? <Zap className="w-4 h-4 text-emerald-400" />
                                        : <X className="w-4 h-4 text-red-400" />
                                    }
                                    <span className={`text-xs font-bold ${buildResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
                                        {buildResult.success ? 'Feature Built Successfully!' : 'Build Failed'}
                                    </span>
                                </div>
                                <p className="text-[10px] text-gray-400">{buildResult.message}</p>
                                {buildResult.files?.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        {buildResult.files.map((f, i) => (
                                            <p key={i} className="text-[10px] text-emerald-300 font-mono">📦 {f}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Timestamp */}
                        {idea.generatedAt && (
                            <div className="flex items-center gap-1.5 text-[9px] text-gray-600">
                                <Clock className="w-3 h-3" />
                                Generated: {idea.generatedAt}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
