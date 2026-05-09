import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Sparkles } from 'lucide-react';

const ThinkingAccordion = ({ thinking, isStreaming }) => {
    const [isOpen, setIsOpen] = useState(isStreaming);

    useEffect(() => {
        if (isStreaming) setIsOpen(true);
    }, [isStreaming]);

    if (!thinking) return null;

    return (
        <div className={`mb-3 rounded-xl overflow-hidden border transition-all duration-400 
            ${isStreaming ? 'border-cyan-500/30 shadow-[0_4px_20px_rgba(6,182,212,0.1)]' : 'border-white/10'}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-cyan-500/5 border-none text-cyan-400 text-[11px] font-bold cursor-pointer select-none hover:bg-cyan-500/10 transition-colors uppercase tracking-wider"
            >
                <div className="flex items-center gap-2">
                    {isStreaming ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                            <Sparkles size={13} />
                        </motion.div>
                    ) : <span className="opacity-80 text-[13px]">🧠</span>}
                    <span className={isStreaming ? 'animate-pulse' : ''}>
                        {isStreaming ? 'Neural Processing...' : 'Thought Process'}
                    </span>
                </div>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3 }}>
                    <ChevronDown size={13} />
                </motion.div>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: "circOut" }}
                    >
                        <div className="px-3.5 py-3 text-gray-400 text-[12px] leading-relaxed font-mono whitespace-pre-wrap border-t border-cyan-500/10 bg-black/30 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {thinking}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ThinkingAccordion;
