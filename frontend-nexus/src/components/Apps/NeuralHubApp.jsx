import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain, Cpu, Database, Network, Search,
    ChevronRight, Zap, Target, Layers, Sparkles
} from 'lucide-react';
import nexusBridge from '../../services/bridge.js';

// ── Intelligence Metrics ──────────────────────────────────────
function MetricTile({ label, value, icon: Icon, color }) {
    return (
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex items-center gap-4 transition-all hover:bg-white/[0.05]">
            <div className={`p-3 rounded-xl bg-${color}-500/10 border border-${color}-500/20 shadow-lg`}>
                <Icon size={20} className={`text-${color}-400`} />
            </div>
            <div>
                <div className="text-[9px] text-gray-500 uppercase font-black tracking-widest mb-1">{label}</div>
                <div className="text-xl font-black tabular-nums text-white">{value}</div>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════
//  MAIN NEURAL HUB APP
// ════════════════════════════════════════════════════════════

export default function NeuralHubApp() {
    const [neuralState, setNeuralState] = useState({
        intelligenceDensity: '0.88',
        cacheEfficiency: '94%',
        vectorSimilarity: '0.92',
        activeContexts: 4
    });

    const [activeContexts, setActiveContexts] = useState([
        { id: 1, type: 'LogRAG', source: 'sentinelService.js', score: 0.94, description: 'Surgical stack trace extraction for IPC parameter mismatch' },
        { id: 2, type: 'CodeGraph', source: 'Taskbar.jsx', score: 0.88, description: 'Aura Sync UI logic mapping and component dependency' },
        { id: 3, type: 'History', source: 'system_events.mongodb', score: 0.91, description: 'Historical fix extraction for repetitive thermal alerts' },
        { id: 4, type: 'R&D', source: 'PROJECT_INSTRUCTIONS.md', score: 0.99, description: 'Constitutional rule adherence and instruction parsing' }
    ]);

    const [selectedContext, setSelectedContext] = useState(activeContexts[0]);
    const [reasoningTrace, setReasoningTrace] = useState([
        { step: 1, logic: 'Analyzing incoming crash signal from electron-main renderer bridge.' },
        { step: 2, logic: 'Executing Context Sniper at radius 40 around failure at line 142.' },
        { step: 3, logic: 'Querying Knowledge Manager for similar vectorized patterns in system_events.' },
        { step: 4, logic: 'Identified 92% similarity with Phase 43 IPC extraction bug; proposing atomic patch.' }
    ]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex flex-col bg-[#050505] text-white font-sans overflow-hidden"
        >
            {/* ── Header ────────────────────────────────────── */}
            <div className="px-6 pt-6 pb-0 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.15)] relative group">
                        <Brain className="text-cyan-400 animate-pulse" size={24} />
                        <div className="absolute -inset-1 bg-cyan-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-200 to-cyan-500">
                            OMNISCIENT NEURAL HUB
                        </h1>
                        <p className="text-[10px] font-mono text-cyan-500/60 uppercase tracking-[0.2em] mt-2">Intelligence Density & RAG Monitoring</p>
                    </div>
                </div>
            </div>

            {/* ── Metrics Grid ──────────────────────────────── */}
            <div className="px-6 pt-6 grid grid-cols-4 gap-4 flex-shrink-0">
                <MetricTile label="Intelligence Density" value={neuralState.intelligenceDensity} icon={Cpu} color="cyan" />
                <MetricTile label="Cache Efficiency" value={neuralState.cacheEfficiency} icon={Database} color="emerald" />
                <MetricTile label="Vector Similarity" value={neuralState.vectorSimilarity} icon={Network} color="violet" />
                <MetricTile label="Active Branches" value={neuralState.activeContexts} icon={Layers} color="orange" />
            </div>

            {/* ── Main Content ──────────────────────────────── */}
            <div className="flex-1 flex gap-6 p-6 overflow-hidden min-h-0">

                {/* Left: Active Knowledge Chunks */}
                <div className="w-[420px] flex-shrink-0 flex flex-col gap-4 overflow-hidden">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Target size={14} className="text-cyan-400" /> Active Context Chunks
                        </h3>
                        <span className="text-[9px] text-gray-500 font-mono tracking-widest uppercase">Live RAG Feed</span>
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar space-y-2 pr-2">
                        {activeContexts.map(ctx => (
                            <button
                                key={ctx.id}
                                onClick={() => setSelectedContext(ctx)}
                                className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 relative group
                                    ${selectedContext?.id === ctx.id
                                        ? 'bg-cyan-500/5 border-cyan-500/30 shadow-[0_4px_20px_rgba(6,182,212,0.1)]'
                                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                                    }`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-400 uppercase tracking-tighter">
                                        <Zap size={12} /> {ctx.type}
                                    </div>
                                    <div className="text-[10px] font-black text-white tracking-widest">{(ctx.score * 100).toFixed(0)}%</div>
                                </div>
                                <p className="text-xs text-white font-medium mb-1 line-clamp-1">{ctx.description}</p>
                                <div className="text-[9px] text-gray-500 font-mono truncate">{ctx.source}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right: Reasoning Trace & Detail */}
                <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                    <div className="flex items-center gap-2 px-2">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Sparkles size={14} className="text-violet-400" /> Neural Reasoning Trace
                        </h3>
                    </div>

                    <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-3xl p-6 overflow-hidden flex flex-col gap-6">
                        {/* Selected Context Detail Area */}
                        <div className="grid grid-cols-2 gap-6 pb-6 border-b border-white/5">
                            <div>
                                <div className="text-[9px] text-gray-600 uppercase font-black mb-2 tracking-widest">Origin Source</div>
                                <div className="bg-black/40 p-3 rounded-xl border border-white/5 text-[11px] font-mono text-cyan-300">
                                    {selectedContext?.source}
                                </div>
                            </div>
                            <div>
                                <div className="text-[9px] text-gray-600 uppercase font-black mb-2 tracking-widest">Similarity Weight</div>
                                <div className="h-2 bg-white/5 rounded-full mt-3 overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${selectedContext?.score * 100}%` }}
                                        transition={{ duration: 1, ease: 'easeOut' }}
                                        className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Reasoning Log */}
                        <div className="flex-1 overflow-auto custom-scrollbar space-y-4">
                            {reasoningTrace.map((r, i) => (
                                <motion.div
                                    key={r.step}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex gap-4 group"
                                >
                                    <div className="flex flex-col items-center">
                                        <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black group-hover:bg-cyan-500/20 group-hover:border-cyan-500/30 transition-all">
                                            {r.step}
                                        </div>
                                        {i < reasoningTrace.length - 1 && <div className="w-[1px] flex-1 bg-gradient-to-b from-white/10 to-transparent mt-2" />}
                                    </div>
                                    <div className="flex-1 pt-1 pb-4">
                                        <p className="text-[13px] text-gray-300 leading-relaxed font-medium transition-colors group-hover:text-white">
                                            {r.logic}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Analysis Footer */}
                        <div className="pt-4 border-t border-white/5 text-center">
                            <span className="text-[10px] text-gray-500 uppercase font-black tracking-[0.3em] flex items-center justify-center gap-2 animate-pulse">
                                <Network size={12} className="text-cyan-400" /> Context Synchronized: {new Date().toLocaleTimeString()}
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </motion.div>
    );
}
