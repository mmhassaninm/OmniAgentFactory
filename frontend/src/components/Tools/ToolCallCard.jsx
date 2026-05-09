import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Loader2, CheckCircle, XCircle } from 'lucide-react';

const TOOL_ICONS = {
    web_search: '🔍', calculator: '🧮', get_datetime: '⏰', fetch_url: '🌐',
    run_python: '💻', code_interpreter: '💻', run_in_sandbox: '📦',
    execute_on_host: '🖥️', list_files: '📂', read_file: '📄',
    run_command: '⚡', write_draft: '✏️', web_scraper: '🕸️',
};

const TOOL_COLORS = {
    web_search: '#00d4ff', calculator: '#f59e0b', get_datetime: '#10b981',
    fetch_url: '#6366f1', run_python: '#8b5cf6', default: '#00d4ff',
};

export default function ToolCallCard({ toolName, callId, icon, status, output, error, executionTimeMs, arguments: args }) {
    const [expanded, setExpanded] = useState(false);
    const color = TOOL_COLORS[toolName] || TOOL_COLORS.default;
    const displayIcon = icon || TOOL_ICONS[toolName] || '🔧';
    const displayName = toolName?.replace(/_/g, ' ') || 'tool';

    const isRunning = status === 'running';
    const isError = status === 'error';
    const isDone = status === 'done';

    const previewLines = (output || '').split('\n').slice(0, 3).join('\n');
    const hasMoreLines = (output || '').split('\n').length > 3;

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="my-1.5 rounded-xl overflow-hidden"
            style={{
                background: 'var(--bg-card)',
                border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : isRunning ? `rgba(${hexToRgb(color)},0.25)` : `rgba(${hexToRgb(color)},0.15)`}`,
                boxShadow: isRunning ? `0 0 12px rgba(${hexToRgb(color)},0.12)` : 'none',
            }}
        >
            {/* Header row */}
            <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
                onClick={() => isDone && setExpanded(e => !e)}
                style={{ background: `rgba(${hexToRgb(color)},0.06)` }}
            >
                {/* Status icon */}
                <span className="text-sm flex-shrink-0">
                    {isRunning ? (
                        <Loader2 size={13} className="animate-spin" style={{ color }} />
                    ) : isError ? (
                        <XCircle size={13} style={{ color: '#ef4444' }} />
                    ) : (
                        <CheckCircle size={13} style={{ color: '#10b981' }} />
                    )}
                </span>

                {/* Tool icon + name */}
                <span className="text-sm">{displayIcon}</span>
                <span className="text-[11px] font-bold capitalize flex-1 truncate" style={{ color }}>
                    {displayName}
                </span>

                {/* Execution time badge */}
                {executionTimeMs > 0 && (
                    <span
                        className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                        style={{ background: `rgba(${hexToRgb(color)},0.12)`, color }}
                    >
                        {executionTimeMs}ms
                    </span>
                )}

                {/* Expand toggle */}
                {isDone && (
                    expanded
                        ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
                        : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                )}

                {isRunning && (
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color }}>
                        executing...
                    </span>
                )}
            </div>

            {/* Args preview (shown while running) */}
            {isRunning && args && Object.keys(args).length > 0 && (
                <div className="px-3 pb-2">
                    {Object.entries(args).slice(0, 2).map(([k, v]) => (
                        <div key={k} className="flex gap-1 text-[10px]">
                            <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
                            <span className="truncate max-w-[300px]" style={{ color: 'var(--text-secondary)' }}>
                                {String(v).substring(0, 80)}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Collapsed output preview */}
            {isDone && !expanded && (isError ? error : previewLines) && (
                <div
                    className="px-3 pb-2 text-[10px] font-mono truncate"
                    style={{ color: isError ? '#ef4444' : 'var(--text-secondary)' }}
                >
                    {isError ? error : previewLines}
                    {!isError && hasMoreLines && (
                        <span style={{ color: 'var(--text-muted)' }}> ... ({(output || '').split('\n').length} lines)</span>
                    )}
                </div>
            )}

            {/* Expanded full output */}
            <AnimatePresence>
                {expanded && isDone && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                    >
                        <pre
                            className="px-3 pb-3 text-[10px] font-mono whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto custom-scrollbar"
                            style={{ color: isError ? '#ef4444' : 'var(--text-secondary)' }}
                        >
                            {isError ? error : output}
                        </pre>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function hexToRgb(hex) {
    if (!hex || !hex.startsWith('#')) return '0,212,255';
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}` : '0,212,255';
}
