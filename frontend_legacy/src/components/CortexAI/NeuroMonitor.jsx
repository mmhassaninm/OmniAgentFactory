import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain, Cpu, Activity, Zap, Shield,
    ChevronUp, ChevronDown, Loader2, Database,
    Maximize2, Minimize2
} from 'lucide-react';

const BACKEND_BASE = 'http://localhost:3001/api';
const NEURO_STREAM_URL = `${BACKEND_BASE}/neuro/stream`;

export default function NeuroMonitor() {
    const [streamData, setStreamData] = useState({
        state: 'SLEEP',
        cpu_load: 0,
        queue_len: 0,
        active_tasks: [],
        proactive_enabled: true,
        timestamp: Date.now()
    });
    const [isConnected, setIsConnected] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        const eventSource = new EventSource(NEURO_STREAM_URL);
        eventSource.addEventListener('cortex:neuro_stream', (event) => {
            const data = JSON.parse(event.data);
            setStreamData(data);
            setIsConnected(true);
        });
        eventSource.onerror = () => setIsConnected(false);
        return () => eventSource.close();
    }, []);

    const getStateColor = (state) => {
        switch (state) {
            case 'WAKE': return 'text-emerald-400';
            case 'BUSY': return 'text-orange-400';
            default: return 'text-cyan-500/40';
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-6 right-6 z-40 pointer-events-none"
        >
            <div className={`bg-[#0a0f1d]/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl pointer-events-auto transition-all duration-500 overflow-hidden ${isExpanded ? 'w-64 p-4' : 'w-auto p-2'}`}>

                {/* Micro Header / Mini Toggle */}
                <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className={`p-1.5 rounded-lg bg-white/5 border border-white/5 ${streamData.state === 'WAKE' ? 'animate-pulse' : ''} ${!streamData.proactive_enabled ? 'opacity-20' : ''}`}>
                        <Brain className={`w-3.5 h-3.5 ${streamData.proactive_enabled ? getStateColor(streamData.state) : 'text-gray-600'}`} />
                    </div>

                    {isExpanded && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex-1"
                        >
                            <h3 className="text-[10px] font-black text-white/80 uppercase tracking-widest">Cortex Neuro</h3>
                            <p className="text-[8px] text-gray-600 font-bold uppercase tracking-tighter">
                                {streamData.proactive_enabled ? streamData.state : 'PAUSED'}
                            </p>
                        </motion.div>
                    )}

                    <div className="flex items-center gap-2">
                        {!isExpanded && (
                            <div className="flex flex-col items-end">
                                <span className={`text-[9px] font-mono leading-none ${streamData.cpu_load > 60 ? 'text-orange-400' : 'text-emerald-400/60'}`}>
                                    {streamData.cpu_load.toFixed(0)}%
                                </span>
                            </div>
                        )}
                        {isExpanded ? <ChevronDown size={12} className="text-gray-600" /> : <ChevronUp size={12} className="text-gray-600" />}
                    </div>
                </div>

                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-4 space-y-4 pt-4 border-t border-white/5"
                        >
                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-white/5 rounded-xl p-2 flex flex-col items-center">
                                    <Database className="w-3 h-3 text-purple-400/50 mb-1" />
                                    <span className="text-xs font-black text-white">{streamData.queue_len}</span>
                                    <span className="text-[7px] text-gray-600 uppercase">Queue</span>
                                </div>
                                <div className="bg-white/5 rounded-xl p-2 flex flex-col items-center">
                                    <Zap className="w-3 h-3 text-yellow-500/50 mb-1" />
                                    <span className="text-xs font-black text-white">{streamData.active_tasks.length}</span>
                                    <span className="text-[7px] text-gray-600 uppercase">Active</span>
                                </div>
                            </div>

                            {/* Task Stream */}
                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                                {streamData.active_tasks.map(task => (
                                    <div key={task.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <Activity className="w-2.5 h-2.5 text-cyan-400 flex-shrink-0" />
                                            <span className="text-[9px] font-bold text-gray-400 truncate uppercase">{task.type}</span>
                                        </div>
                                        <Loader2 className="w-2.5 h-2.5 text-cyan-500/40 animate-spin" />
                                    </div>
                                ))}
                                {streamData.active_tasks.length === 0 && (
                                    <div className="text-[8px] text-gray-700 text-center py-2 uppercase tracking-tighter italic">Standing by...</div>
                                )}
                            </div>

                            <div className="flex justify-between items-center text-[8px] font-bold text-gray-600">
                                <span className="uppercase tracking-widest">CPU: {streamData.cpu_load.toFixed(1)}%</span>
                                <span className={`px-1.5 py-0.5 rounded ${isConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                    {isConnected ? 'LIVE' : 'DISC'}
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
