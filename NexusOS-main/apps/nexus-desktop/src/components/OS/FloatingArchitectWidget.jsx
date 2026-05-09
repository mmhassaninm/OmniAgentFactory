import React, { useState, useEffect, useCallback } from 'react';
import { Lightbulb, X, Hammer, Loader2, ChevronDown, ChevronUp, Zap, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import nexusBridge from '../../services/bridge';

/**
 * FloatingArchitectWidget
 * ─────────────────────────────────────────────
 * Absolute-positioned overlay in the bottom-right corner of the
 * NexusOS Desktop. Listens for `architect:new-idea` IPC events
 * and pops up automatically with the AI's feature pitch.
 *
 * Sits outside the window manager — always visible, never blocks.
 */
export default function FloatingArchitectWidget() {
    const [idea, setIdea] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isBuilding, setIsBuilding] = useState(false);
    const [buildResult, setBuildResult] = useState(null);
    const [isExpanded, setIsExpanded] = useState(false);

    // Listen for IPC events from the Architect Daemon
    useEffect(() => {
        if (window.nexusAPI && window.nexusAPI.receive) {
            const unsub = window.nexusAPI.receive('architect:new-idea', (newIdea) => {
                setIdea(newIdea);
                setIsVisible(true);
                setBuildResult(null);
                setIsExpanded(false);
            });
            return () => { if (unsub) unsub(); };
        }
    }, []);

    // Also poll for pending ideas on mount (in case daemon already fired)
    useEffect(() => {
        nexusBridge.invoke('architect:status', {})
            .then(s => {
                if (s?.pendingIdea) {
                    setIdea(s.pendingIdea);
                    setIsVisible(true);
                }
            })
            .catch(() => { });
    }, []);

    const handleDismiss = useCallback(async () => {
        setIsVisible(false);
        setTimeout(() => { setIdea(null); setBuildResult(null); }, 400);
        await nexusBridge.invoke('architect:dismiss', {}).catch(() => { });
    }, []);

    const handleBuild = useCallback(async () => {
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
    }, []);

    if (!idea) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 80, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 80, scale: 0.9 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                    className="absolute bottom-16 right-4 z-30 w-[380px] pointer-events-auto"
                >
                    <div className="bg-black/70 backdrop-blur-2xl border border-amber-500/20 rounded-2xl shadow-[0_0_60px_rgba(245,158,11,0.15)] overflow-hidden">

                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500/15 to-purple-500/10 border-b border-white/5">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Architect Idea</p>
                                </div>
                            </div>
                            <button
                                onClick={handleDismiss}
                                className="p-1 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-4">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-amber-400" />
                                {idea.featureName}
                            </h3>
                            <p className="text-xs text-gray-300 mt-2 leading-relaxed">{idea.pitch}</p>

                            {/* Expandable Blueprint */}
                            {idea.technicalBlueprint && (
                                <>
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="flex items-center gap-1 text-[9px] text-gray-500 hover:text-gray-300 transition-colors mt-3"
                                    >
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                        Blueprint
                                    </button>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3 mt-2 grid grid-cols-2 gap-2 text-[9px]">
                                                    <div>
                                                        <span className="text-gray-600 uppercase tracking-widest">Type</span>
                                                        <p className="text-cyan-300 mt-0.5">{idea.technicalBlueprint.type}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-600 uppercase tracking-widest">Frontend</span>
                                                        <p className="text-white mt-0.5">{idea.technicalBlueprint.frontendFile || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-600 uppercase tracking-widest">Backend</span>
                                                        <p className="text-white mt-0.5">{idea.technicalBlueprint.backendFile || 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-600 uppercase tracking-widest">IPC</span>
                                                        <p className="text-purple-300 mt-0.5 truncate">{idea.technicalBlueprint.ipcChannels?.join(', ') || 'N/A'}</p>
                                                    </div>
                                                    {idea.technicalBlueprint.keyFeatures && (
                                                        <div className="col-span-2 mt-1">
                                                            <span className="text-gray-600 uppercase tracking-widest">Features</span>
                                                            <ul className="mt-1 space-y-0.5">
                                                                {idea.technicalBlueprint.keyFeatures.map((f, i) => (
                                                                    <li key={i} className="text-gray-300 flex items-center gap-1">
                                                                        <Zap className="w-2 h-2 text-amber-400" /> {f}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </>
                            )}

                            {/* Build Result */}
                            {buildResult && (
                                <div className={`mt-3 p-2.5 rounded-lg border text-[10px] ${buildResult.success
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                                    }`}>
                                    {buildResult.success ? '✅' : '❌'} {buildResult.message}
                                    {buildResult.files?.map((f, i) => (
                                        <p key={i} className="font-mono mt-1 text-[9px] opacity-70">📦 {f}</p>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-stretch border-t border-white/5">
                            <button
                                onClick={handleBuild}
                                disabled={isBuilding || !!buildResult}
                                className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold bg-gradient-to-r from-amber-600/30 to-orange-600/20 hover:from-amber-600/50 hover:to-orange-600/40 text-amber-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                {isBuilding
                                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Building...</>
                                    : <><Hammer className="w-3.5 h-3.5" /> Build It Now ⚡</>
                                }
                            </button>
                            <div className="w-px bg-white/5" />
                            <button
                                onClick={handleDismiss}
                                className="px-5 py-3 text-xs font-bold text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
