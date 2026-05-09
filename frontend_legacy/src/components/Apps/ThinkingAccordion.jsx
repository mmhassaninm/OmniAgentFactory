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
        <div
            className="mb-3 rounded-xl overflow-hidden"
            style={{
                border: isStreaming
                    ? '1px solid rgba(124,58,237,0.35)'
                    : '1px solid var(--border-secondary)',
                boxShadow: isStreaming ? '0 4px 20px rgba(124,58,237,0.1)' : 'none',
                transition: 'box-shadow 200ms ease-out',
            }}
        >
            {/* ── Toggle button ── */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none transition-colors"
                style={{
                    background: 'rgba(124,58,237,0.08)',
                    color: '#a78bfa',
                    fontSize: '11px',
                    fontWeight: 700,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.13)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.08)'; }}
            >
                <div className="flex items-center gap-2">
                    {isStreaming ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                            <Sparkles size={12} />
                        </motion.div>
                    ) : (
                        <span style={{ fontSize: 13 }}>🧠</span>
                    )}
                    <span className={isStreaming ? 'animate-pulse' : ''}>
                        {isStreaming ? 'Neural Processing…' : 'View reasoning'}
                    </span>
                </div>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={13} />
                </motion.div>
            </button>

            {/* ── Collapsible content ── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <div
                            className="px-3.5 py-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap max-h-[280px] overflow-y-auto custom-scrollbar italic"
                            style={{
                                color: 'var(--text-muted)',
                                borderTop: '1px solid rgba(124,58,237,0.15)',
                                background: '#1a1f2e',
                            }}
                        >
                            {thinking}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ThinkingAccordion;
