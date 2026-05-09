// Nexus-Prime is ready.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Send, Loader2, ChevronDown, ChevronUp, Check, X, FileCode, Terminal, Eye, Trash2, Brain, Wrench, AlertTriangle } from 'lucide-react';
import nexusBridge from '../../services/bridge';

function DiffViewer({ original, proposed, filePath, isNewFile }) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="bg-black/40 border border-white/5 rounded-xl overflow-hidden mt-2">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2 text-[10px]">
                    <FileCode className="w-3 h-3 text-cyan-400" />
                    <span className="text-white font-bold">{filePath}</span>
                    {isNewFile && <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[8px] font-bold border border-emerald-500/30">NEW</span>}
                    {!isNewFile && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[8px] font-bold border border-amber-500/30">MODIFIED</span>}
                </div>
                {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
            </button>

            {isExpanded && (
                <div className="border-t border-white/5">
                    {!isNewFile && original && (
                        <div className="border-b border-white/5">
                            <div className="px-3 py-1 bg-red-500/5">
                                <span className="text-[8px] font-bold text-red-400 uppercase tracking-widest">Original Code</span>
                            </div>
                            <pre className="p-3 text-[10px] font-mono text-red-200/60 max-h-48 overflow-auto custom-scrollbar whitespace-pre-wrap select-text cursor-text">
                                {original.slice(0, 3000)}{original.length > 3000 ? '\n... [truncated]' : ''}
                            </pre>
                        </div>
                    )}
                    <div>
                        <div className="px-3 py-1 bg-emerald-500/5">
                            <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">Proposed Code</span>
                        </div>
                        <pre className="p-3 text-[10px] font-mono text-emerald-200/70 max-h-64 overflow-auto custom-scrollbar whitespace-pre-wrap select-text cursor-text">
                            {proposed.slice(0, 5000)}{proposed.length > 5000 ? '\n... [truncated]' : ''}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

function ThinkingAccordion({ thinking }) {
    const [isOpen, setIsOpen] = useState(false);
    if (!thinking) return null;

    return (
        <div className="mb-2">
            <button onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1 text-[9px] text-purple-400 hover:text-purple-300 transition-colors">
                <Brain className="w-3 h-3" />
                {isOpen ? 'Hide' : 'Show'} Reasoning
                {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {isOpen && (
                <div className="mt-1 p-3 rounded-lg bg-purple-500/5 border border-purple-500/10 text-[10px] text-purple-200/60 italic max-h-40 overflow-auto custom-scrollbar whitespace-pre-wrap select-text cursor-text">
                    {thinking}
                </div>
            )}
        </div>
    );
}

function ToolCallLog({ toolCalls }) {
    const [isOpen, setIsOpen] = useState(false);
    if (!toolCalls?.length) return null;

    return (
        <div className="mb-2">
            <button onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1 text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors">
                <Wrench className="w-3 h-3" />
                {toolCalls.length} tool call{toolCalls.length > 1 ? 's' : ''}
                {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {isOpen && (
                <div className="mt-1 space-y-1">
                    {toolCalls.map((tc, i) => (
                        <div key={i} className="p-2 rounded-lg bg-cyan-500/5 border border-cyan-500/10 text-[9px] font-mono">
                            <span className="text-cyan-300">{tc.tool}</span>
                            <span className="text-gray-600">(</span>
                            <span className="text-gray-400">{JSON.stringify(tc.args).slice(0, 120)}</span>
                            <span className="text-gray-600">)</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
function BrainStatusIndicator({ status, modelName, meta }) {
    if (!status || status === 'idle') return null;

    const isError = status === 'error';
    const isLoading = status === 'loading';
    const isReady = status === 'ready';

    // Layout colors and icons based on status
    let icon = <Brain className={`w-3 h-3 ${isLoading ? 'animate-pulse' : ''}`} />;
    let colorClass = 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5';
    let text = `Active Brain: ${modelName || 'Unknown'}`;

    if (isLoading) {
        icon = <Loader2 className="w-3 h-3 animate-spin" />;
        colorClass = 'text-purple-400 border-purple-500/30 bg-purple-500/10 shadow-[0_0_10px_rgba(168,85,247,0.2)]';
        text = meta?.phase || 'Swapping Neural Links...';
    } else if (isError) {
        icon = <AlertTriangle className="w-3 h-3" />;
        colorClass = 'text-red-400 border-red-500/30 bg-red-500/10';
        text = modelName || 'Memory Offline';
    }

    return (
        <div className={`flex flex-col items-end transition-all duration-300`}>
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border backdrop-blur-md ${colorClass}`}>
                {icon}
                <span className="text-[10px] font-bold tracking-wide">{text}</span>
            </div>
            {meta?.note && (
                <span className="text-[8px] text-amber-500 mt-1 opacity-80">{meta.note}</span>
            )}
        </div>
    );
}

export default function NexusAiControl() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [patches, setPatches] = useState([]);
    const [actionLoading, setActionLoading] = useState(null);
    const [brainState, setBrainState] = useState({ status: 'idle', modelName: '', meta: {} });
    const [aiMetrics, setAiMetrics] = useState(null);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    useEffect(scrollToBottom, [messages]);

    // Listen to backend brain status updates via preload IPC (not bridge)
    useEffect(() => {
        if (!window.nexusAPI?.receive) return; // Guard for non-Electron environments
        const unsubscribe = window.nexusAPI.receive('prime:status-update', (data) => {
            setBrainState({
                status: data.status,
                modelName: data.modelName,
                meta: data.meta || {}
            });
        });
        const unsubscribeMetrics = window.nexusAPI.receive('ai-control:metrics-update', (data) => {
            setAiMetrics(data);
        });
        return () => {
            if (unsubscribe) unsubscribe();
            if (unsubscribeMetrics) unsubscribeMetrics();
        };
    }, []);

    // Send message
    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setIsLoading(true);

        try {
            const result = await nexusBridge.invoke('prime:chat', { message: text });

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: result.response,
                thinking: result.thinking,
                toolCalls: result.toolCalls,
                patches: result.patches,
                cached: result.cached || false
            }]);

            if (result.patches?.length > 0) {
                setPatches(result.patches);
            }
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Connection error: ${err.message}. Is LM Studio running on port 1234?`
            }]);
        } finally {
            setIsLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [input, isLoading]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    // Approve patch
    const handleApprove = async (patchId) => {
        setActionLoading(patchId);
        try {
            await nexusBridge.invoke('prime:approve-patch', { patchId });
            setPatches(prev => prev.filter(p => p.id !== patchId));
            setMessages(prev => [...prev, { role: 'system', content: `✅ Patch ${patchId} approved and injected to disk.` }]);
        } catch (err) {
            console.error('[Prime] Approve error:', err);
        } finally { setActionLoading(null); }
    };

    // Reject patch
    const handleReject = async (patchId) => {
        setActionLoading(patchId);
        try {
            await nexusBridge.invoke('prime:reject-patch', { patchId });
            setPatches(prev => prev.filter(p => p.id !== patchId));
            setMessages(prev => [...prev, { role: 'system', content: `❌ Patch ${patchId} rejected.` }]);
        } catch (err) {
            console.error('[Prime] Reject error:', err);
        } finally { setActionLoading(null); }
    };

    const handleClearChat = useCallback(() => {
        setMessages([]);
        setPatches([]);
        setInput('');
    }, []);

    return (
        <div className="w-full h-full flex flex-col bg-[#050505] text-white font-sans overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-gradient-to-r from-violet-500/15 to-cyan-500/10 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.2)]">
                        <Zap className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold tracking-wide">Nexus AI Control <span className="text-[10px] ml-1 opacity-70">🎛️</span></h1>
                        <p className="text-[10px] text-gray-500">Autonomous Cybernetic Architect & AI Gateway</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[9px] text-gray-500">LM Studio Connected</span>
                    </div>
                    <BrainStatusIndicator
                        status={brainState.status}
                        modelName={brainState.modelName}
                        meta={brainState.meta}
                    />
                    {aiMetrics && (
                        <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-400 font-mono bg-black/40 px-2 py-1 rounded border border-white/5">
                            <div className="flex gap-1.5 border-r border-white/10 pr-2" title="Priority Queue Logs">
                                <span className={aiMetrics.queueStats.CRITICAL > 0 ? 'text-red-400 font-bold' : ''}>C:{aiMetrics.queueStats.CRITICAL}</span>
                                <span className={aiMetrics.queueStats.HIGH > 0 ? 'text-amber-400 font-bold' : ''}>H:{aiMetrics.queueStats.HIGH}</span>
                                <span className={aiMetrics.queueStats.LOW > 0 ? 'text-emerald-400' : ''}>L:{aiMetrics.queueStats.LOW}</span>
                            </div>
                            <div className="border-r border-white/10 pr-2 text-cyan-400">
                                ⚡ Cache {aiMetrics.hitRate}%
                            </div>
                            <div className="text-purple-400">
                                💾 {(aiMetrics.vramSaved / 1024).toFixed(1)} KB VRAM
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-4 select-text">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <Zap className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-sm font-medium">Nexus-Prime is ready.</p>
                        <p className="text-xs mt-1 max-w-sm text-center">Powered by your local LM Studio. I can read files, write code, run tests, and build features — all locally.</p>
                        <div className="mt-4 grid grid-cols-2 gap-2 max-w-sm">
                            {['Build a user profile page', 'Audit the auth middleware', 'Write tests for aiService', 'Add dark mode toggle'].map(s => (
                                <button key={s} onClick={() => { setInput(s); setTimeout(handleSend, 100); }}
                                    className="p-2 rounded-lg bg-white/[0.03] border border-white/5 text-[10px] text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-left">
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                            ? 'bg-violet-500/20 border border-violet-500/20 text-white'
                            : msg.role === 'system'
                                ? 'bg-white/[0.03] border border-white/5 text-gray-400 text-xs italic'
                                : 'bg-white/[0.03] border border-white/5 text-gray-200'}`}>
                            {msg.role === 'assistant' && msg.cached && (
                                <div className="mb-2 inline-flex items-center gap-1.5 px-2 py-1 rounded bg-gradient-to-r from-emerald-500/20 to-transparent border border-emerald-500/20 text-[9px] font-bold text-emerald-400">
                                    <Zap className="w-3 h-3" />
                                    ZERO-SHOT CACHE HIT — VRAM PROTECTED
                                </div>
                            )}
                            {msg.role === 'assistant' && <ThinkingAccordion thinking={msg.thinking} />}
                            {msg.role === 'assistant' && <ToolCallLog toolCalls={msg.toolCalls} />}

                            <div className="text-xs leading-relaxed whitespace-pre-wrap select-text cursor-text">{msg.content}</div>

                            {/* Inline Patches (Diff Viewer) */}
                            {msg.patches?.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    <p className="text-[9px] text-amber-400 font-bold uppercase tracking-widest">Pending Patches ({msg.patches.length})</p>
                                    {msg.patches.map(patch => (
                                        <div key={patch.id}>
                                            <DiffViewer
                                                original={patch.original}
                                                proposed={patch.content}
                                                filePath={patch.filePath}
                                                isNewFile={patch.isNewFile}
                                            />
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <button onClick={() => handleApprove(patch.id)}
                                                    disabled={actionLoading === patch.id}
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold hover:bg-emerald-500/40 disabled:opacity-40 transition-all">
                                                    {actionLoading === patch.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                    ✅ Approve & Inject
                                                </button>
                                                <button onClick={() => handleReject(patch.id)}
                                                    disabled={actionLoading === patch.id}
                                                    className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold hover:bg-red-500/20 disabled:opacity-40 transition-all">
                                                    ❌ Reject
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-gray-600 mt-1">{patch.description}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-3 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                            <span className="text-xs text-gray-400">Prime is thinking...</span>
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-white/5 bg-black/40 flex-shrink-0">
                <div className="relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="w-full rounded-lg bg-white/[0.03] border border-white/5 text-white placeholder-white/20 px-4 py-3 pr-24 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all select-text cursor-text"
                        onKeyDown={handleKeyDown}
                        placeholder="Ask me something..."
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                            onClick={handleClearChat}
                            className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                            title="Clear Chat"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={isLoading || !input.trim()}
                            className="p-2 text-purple-400 hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
