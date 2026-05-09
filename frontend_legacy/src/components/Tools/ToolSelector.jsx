import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap } from 'lucide-react';

const TOOL_META = [
    { name: 'web_search',      icon: '🔍', label: 'Web Search',      desc: 'DuckDuckGo search — no API key needed' },
    { name: 'calculator',      icon: '🧮', label: 'Calculator',       desc: 'Safe math eval: trig, log, sqrt, pi…' },
    { name: 'get_datetime',    icon: '⏰', label: 'Date & Time',      desc: 'Current date/time in any timezone' },
    { name: 'fetch_url',       icon: '🌐', label: 'Fetch URL',        desc: 'Read article or web page content' },
    { name: 'run_python',      icon: '💻', label: 'Run Python',       desc: 'Execute Python snippet (sandboxed)' },
    { name: 'code_interpreter',icon: '💻', label: 'Code Interpreter', desc: 'Run Python/JS via local interpreter' },
    { name: 'run_in_sandbox',  icon: '📦', label: 'Docker Sandbox',   desc: 'Isolated Docker execution, no network' },
    { name: 'list_files',      icon: '📂', label: 'List Files',       desc: 'List directory contents' },
    { name: 'read_file',       icon: '📄', label: 'Read File',        desc: 'Read a local file' },
    { name: 'run_command',     icon: '⚡', label: 'Run Command',      desc: 'Shell command in sandbox' },
    { name: 'write_draft',     icon: '✏️', label: 'Write Draft',      desc: 'Write content to a file' },
    { name: 'web_scraper',     icon: '🕸️', label: 'Web Scraper',     desc: 'Legacy URL fetcher' },
];

const ToggleSwitch = ({ checked, onChange }) => (
    <button
        type="button"
        onClick={onChange}
        className="relative flex-shrink-0 w-8 h-4 rounded-full transition-all"
        style={{
            background: checked ? 'var(--accent-primary)' : 'var(--bg-panel)',
            border: checked ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
            boxShadow: checked ? '0 0 8px rgba(0,212,255,0.3)' : 'none',
        }}
    >
        <span
            className="absolute top-0.5 rounded-full transition-all"
            style={{
                width: '11px', height: '11px',
                background: checked ? '#fff' : 'var(--text-muted)',
                left: checked ? 'calc(100% - 13px)' : '1px',
            }}
        />
    </button>
);

export default function ToolSelector({ isOpen, onClose, enabledTools, onToggle, onEnableAll, onDisableAll }) {
    const [hoveredTool, setHoveredTool] = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40"
                        style={{ background: 'rgba(0,0,0,0.4)' }}
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 8 }}
                        transition={{ duration: 0.15 }}
                        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-80 rounded-2xl overflow-hidden"
                        style={{
                            background: 'var(--bg-panel)',
                            border: '1px solid var(--border-subtle)',
                            boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.08)',
                        }}
                    >
                        {/* Header */}
                        <div
                            className="flex items-center justify-between px-4 py-3"
                            style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        >
                            <div className="flex items-center gap-2">
                                <Zap size={13} style={{ color: 'var(--accent-primary)' }} />
                                <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
                                    Tool Selection
                                </span>
                                <span
                                    className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                                    style={{ background: 'rgba(0,212,255,0.12)', color: 'var(--accent-primary)' }}
                                >
                                    {enabledTools.length} active
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={onEnableAll}
                                    className="text-[9px] font-black uppercase px-2 py-0.5 rounded-lg transition-all"
                                    style={{ color: 'var(--accent-primary)', background: 'rgba(0,212,255,0.08)' }}
                                >
                                    All
                                </button>
                                <button
                                    onClick={onDisableAll}
                                    className="text-[9px] font-black uppercase px-2 py-0.5 rounded-lg transition-all"
                                    style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}
                                >
                                    None
                                </button>
                                <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Tool list */}
                        <div className="overflow-y-auto max-h-72 custom-scrollbar py-1">
                            {TOOL_META.map((tool) => {
                                const active = enabledTools.includes(tool.name);
                                return (
                                    <div
                                        key={tool.name}
                                        className="flex items-center gap-3 px-4 py-2 transition-all cursor-pointer"
                                        style={{
                                            background: hoveredTool === tool.name ? 'rgba(255,255,255,0.03)' : 'transparent',
                                        }}
                                        onMouseEnter={() => setHoveredTool(tool.name)}
                                        onMouseLeave={() => setHoveredTool(null)}
                                        onClick={() => onToggle(tool.name)}
                                    >
                                        <span className="text-base w-6 text-center flex-shrink-0">{tool.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] font-bold" style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                {tool.label}
                                            </div>
                                            {hoveredTool === tool.name && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    className="text-[9px]"
                                                    style={{ color: 'var(--text-muted)' }}
                                                >
                                                    {tool.desc}
                                                </motion.div>
                                            )}
                                        </div>
                                        <ToggleSwitch checked={active} onChange={() => onToggle(tool.name)} />
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
