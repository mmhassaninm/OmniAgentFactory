import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

export default function AgentThoughtBubble({ iteration, thought, isStreaming = false }) {
    const [expanded, setExpanded] = useState(isStreaming);

    const hasContent = thought && thought.trim().length > 0;
    const preview = (thought || '').substring(0, 120);
    const isTruncated = (thought || '').length > 120;

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="my-1.5 rounded-xl overflow-hidden"
            style={{
                background: 'rgba(124,58,237,0.05)',
                border: '1px solid rgba(124,58,237,0.18)',
            }}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
                onClick={() => hasContent && setExpanded(e => !e)}
            >
                <Brain size={12} style={{ color: '#a78bfa' }} className={isStreaming ? 'animate-pulse' : ''} />
                <span
                    className="text-[10px] font-black uppercase tracking-widest flex-1"
                    style={{ color: '#a78bfa' }}
                >
                    {isStreaming ? '🧠 Thinking...' : `🧠 Step ${iteration} Reasoning`}
                </span>
                {hasContent && !isStreaming && (
                    expanded
                        ? <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
                        : <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
                )}
            </div>

            {/* Content */}
            <AnimatePresence initial={false}>
                {(expanded || isStreaming) && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        <p
                            className="px-3 pb-2.5 text-[11px] leading-relaxed italic"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {isStreaming ? thought : (
                                expanded ? thought : (isTruncated ? preview + '...' : preview)
                            )}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
