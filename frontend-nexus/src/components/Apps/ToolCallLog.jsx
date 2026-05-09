import React, { useState } from 'react';
import { Terminal, ChevronDown, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ToolCallLog = ({ toolCalls }) => {
    const [isOpen, setIsOpen] = useState(false);

    if (!toolCalls || toolCalls.length === 0) return null;

    return (
        <div className="mb-3 rounded-lg border border-white/5 bg-black/20 overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    <Terminal size={12} className="text-emerald-400" />
                    <span>System Operations ({toolCalls.length})</span>
                </div>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={12} className="text-gray-600" />
                </motion.div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-2 space-y-1 bg-black/40 border-t border-white/5">
                            {toolCalls.map((call, idx) => (
                                <div key={idx} className="flex items-start gap-2 p-1.5 rounded bg-white/5 group">
                                    <div className="mt-0.5">
                                        {call.status === 'completed' ? (
                                            <CheckCircle2 size={12} className="text-emerald-500" />
                                        ) : call.status === 'failed' ? (
                                            <XCircle size={12} className="text-red-500" />
                                        ) : (
                                            <Loader2 size={12} className="text-cyan-500 animate-spin" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-mono text-cyan-400 font-bold">{call.function.name}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-500 truncate font-mono mt-0.5">
                                            {JSON.stringify(call.function.arguments)}
                                        </div>
                                        {call.result && (
                                            <div className="mt-1 text-[9px] text-gray-600 font-mono bg-black/20 p-1 rounded max-h-20 overflow-y-auto">
                                                {typeof call.result === 'string' ? call.result : JSON.stringify(call.result, null, 2)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ToolCallLog;
