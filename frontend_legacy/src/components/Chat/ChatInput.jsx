import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Globe, Boxes, Volume2, VolumeX, Mic, MicOff, Send, RotateCcw,
    ChevronDown, RefreshCw, Server, CircleDot, Zap, Search, Sparkles, Bot
} from 'lucide-react';

const PROVIDER_ICONS = {
    lm_studio: '🖥', openai: '✦', anthropic: '◆',
    google: '✸', groq: '⚡', openrouter: '🌐',
};

/* ── Shared icon-button style ── */
const ActionBtn = ({ onClick, active, activeColor = '#00d4ff', activeAlpha = 0.12, tooltip, disabled, className = '', children }) => {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            data-tooltip={tooltip}
            className={`nd-tooltip flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 transition-all ${className}`}
            style={{
                background: active
                    ? `rgba(${hexToRgb(activeColor)}, ${activeAlpha})`
                    : hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: active
                    ? `1px solid rgba(${hexToRgb(activeColor)}, 0.30)`
                    : '1px solid transparent',
                color: active ? activeColor : 'var(--text-muted)',
                boxShadow: active ? `0 0 10px rgba(${hexToRgb(activeColor)}, 0.18)` : 'none',
                transition: 'all var(--t-base)',
            }}
            onMouseEnter={e => { setHovered(true); if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { setHovered(false); if (!active) e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
            {children}
        </button>
    );
};

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '255,255,255';
    return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}

export default function ChatInput({
    isRtl, t, activeConvId, isRecording, inputRef, inputValue, setInputValue,
    handleKeyDown, isStreaming, isSearchEnabled, setIsSearchEnabled,
    isSwarmEnabled, setIsSwarmEnabled,
    kbFileRef, handleKBUpload, kbStatus, ttsEnabled, setTtsEnabled,
    startRecording, stopRecording, abortRef, sendMessage,
    isModelDropdownOpen, setIsModelDropdownOpen, modelStatus, selectedModelId,
    fetchAllModels, allModels, setSelectedModel, isDepthOpen, setIsDepthOpen,
    currentDepth, SEARCH_DEPTHS, searchDepth, setSearchDepth,
    activeProvider = 'lm_studio', availableProviders = [], onProviderChange,
    // Tool calling & agent mode props
    toolsEnabled = false, setToolsEnabled, enabledTools = [], onOpenToolSelector,
    agentMode = false, setAgentMode,
}) {
    const [modelSearch, setModelSearch] = useState('');

    const selectedModelLabel = useMemo(() => {
        if (!selectedModelId || selectedModelId === 'auto') return 'AutoDetect';
        for (const group of (allModels || [])) {
            const match = group.models?.find(m => m.id === selectedModelId);
            if (match) return match.name || match.id;
        }
        return selectedModelId.split('/').pop();
    }, [selectedModelId, allModels]);

    const filteredGroups = useMemo(() => {
        if (!modelSearch.trim()) return allModels || [];
        const q = modelSearch.toLowerCase();
        return (allModels || [])
            .map(g => ({ ...g, models: (g.models || []).filter(m => m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q)) }))
            .filter(g => g.models.length > 0);
    }, [allModels, modelSearch]);

    if (!activeConvId) return null;

    const statusDotColor = modelStatus === 'online' ? 'var(--accent-success)'
        : modelStatus === 'loading' ? 'var(--accent-warning)'
        : 'var(--accent-error)';

    return (
        <div className="px-4 pb-4 pt-2 flex-shrink-0">
            {/* ── Floating input card ── */}
            <div className={`nd-input-card ${isRecording ? 'recording' : ''}`}>

                {/* ── Input row ── */}
                <div className={`flex items-center gap-2 px-4 py-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <input
                        ref={inputRef}
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isStreaming}
                        dir="auto"
                        placeholder={t('chat.placeholder', { defaultValue: 'Ask Nexus anything…' })}
                        className="flex-1 bg-transparent py-2.5 focus:outline-none text-sm tracking-tight"
                        style={{
                            color: 'var(--text-primary)',
                            caretColor: 'var(--accent-primary)',
                        }}
                    />

                    {/* ── Action buttons ── */}
                    <div className={`flex items-center gap-0.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        {/* Web Search */}
                        <ActionBtn
                            onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                            active={isSearchEnabled}
                            activeColor="#00ff88"
                            tooltip="Web Search"
                        >
                            <Globe size={14} />
                        </ActionBtn>

                        {/* Swarm / Multi-agent */}
                        <ActionBtn
                            onClick={() => setIsSwarmEnabled(!isSwarmEnabled)}
                            active={isSwarmEnabled}
                            activeColor="#7c3aed"
                            tooltip="Swarm Mode"
                            className={isSwarmEnabled ? 'animate-pulse' : ''}
                        >
                            <Zap size={14} />
                        </ActionBtn>

                        {/* Tools toggle */}
                        <div className="relative">
                            <ActionBtn
                                onClick={() => {
                                    if (toolsEnabled && onOpenToolSelector) {
                                        onOpenToolSelector();
                                    } else {
                                        setToolsEnabled?.(!toolsEnabled);
                                    }
                                }}
                                active={toolsEnabled}
                                activeColor="#f59e0b"
                                tooltip={toolsEnabled ? `Tools Active: ${enabledTools.length} — click to configure` : 'Enable Tools'}
                            >
                                <span className="text-sm leading-none">⚡</span>
                            </ActionBtn>
                            {toolsEnabled && enabledTools.length > 0 && (
                                <span
                                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-black"
                                    style={{ background: '#f59e0b', color: '#000' }}
                                >
                                    {enabledTools.length}
                                </span>
                            )}
                        </div>

                        {/* Agent Mode toggle */}
                        <ActionBtn
                            onClick={() => setAgentMode?.(!agentMode)}
                            active={agentMode}
                            activeColor="#10b981"
                            tooltip={agentMode ? 'Agent Mode ON — autonomous task execution' : 'Agent Mode'}
                            className={agentMode ? 'animate-pulse' : ''}
                        >
                            <Bot size={14} />
                        </ActionBtn>

                        {/* Knowledge Base */}
                        <ActionBtn
                            onClick={() => kbFileRef.current?.click()}
                            active={!!kbStatus}
                            activeColor="#7c3aed"
                            tooltip={kbStatus || 'Knowledge Base'}
                        >
                            <Boxes size={14} />
                        </ActionBtn>
                        <input
                            ref={kbFileRef}
                            type="file"
                            accept=".txt,.md,.csv,.json"
                            className="hidden"
                            onChange={handleKBUpload}
                        />

                        {/* TTS */}
                        <ActionBtn
                            onClick={() => { setTtsEnabled(!ttsEnabled); if (ttsEnabled) window.speechSynthesis.cancel(); }}
                            active={ttsEnabled}
                            activeColor="#00ff88"
                            tooltip="Text to Speech"
                        >
                            {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                        </ActionBtn>

                        {/* Mic */}
                        <ActionBtn
                            onClick={isRecording ? stopRecording : startRecording}
                            active={isRecording}
                            activeColor="#ff4444"
                            tooltip={isRecording ? 'Stop Recording' : 'Voice Input'}
                            className={isRecording ? 'animate-pulse' : ''}
                        >
                            {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
                        </ActionBtn>

                        {/* Divider */}
                        <div
                            className="w-px h-5 mx-1 flex-shrink-0"
                            style={{ background: 'var(--border-default)' }}
                        />

                        {/* Send / Cancel */}
                        <button
                            onClick={isStreaming ? () => abortRef.current?.abort() : sendMessage}
                            disabled={!inputValue.trim() && !isStreaming}
                            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl transition-all font-bold"
                            style={{
                                background: isStreaming
                                    ? 'rgba(255,68,68,0.15)'
                                    : inputValue.trim()
                                        ? 'var(--accent-primary)'
                                        : 'rgba(255,255,255,0.04)',
                                color: isStreaming
                                    ? 'var(--accent-error)'
                                    : inputValue.trim()
                                        ? '#000'
                                        : 'var(--text-muted)',
                                boxShadow: !isStreaming && inputValue.trim()
                                    ? '0 0 14px rgba(0,212,255,0.35)'
                                    : 'none',
                                cursor: !inputValue.trim() && !isStreaming ? 'not-allowed' : 'pointer',
                                transition: 'all var(--t-base)',
                            }}
                        >
                            {isStreaming
                                ? <RotateCcw size={16} />
                                : <Send size={16} className={isRtl ? 'rotate-180' : ''} />
                            }
                        </button>
                    </div>
                </div>

                {/* ── Meta row: model · depth · status tags ── */}
                <div
                    className={`flex items-center gap-1.5 px-4 pb-2.5 text-[10px] flex-wrap ${isRtl ? 'flex-row-reverse' : ''}`}
                    style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}
                >
                    {/* Model selector */}
                    <div className="relative">
                        <button
                            onClick={() => { setIsModelDropdownOpen(!isModelDropdownOpen); setModelSearch(''); }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                            style={{
                                background: 'rgba(0,0,0,0.2)',
                                border: `1px solid ${modelStatus === 'online' ? 'var(--border-primary)' : 'var(--border-subtle)'}`,
                                color: modelStatus === 'online' ? 'var(--accent-primary)' : 'var(--text-muted)',
                            }}
                        >
                            <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                    background: statusDotColor,
                                    boxShadow: modelStatus === 'online' ? `0 0 4px ${statusDotColor}` : 'none',
                                    animation: modelStatus === 'loading' ? 'pulse 1.5s infinite' : 'none',
                                }}
                            />
                            {selectedModelId === 'auto' || !selectedModelId
                                ? <Sparkles size={10} style={{ color: 'var(--accent-warning)' }} />
                                : null
                            }
                            <span className="font-bold truncate max-w-[130px]">{selectedModelLabel}</span>
                            <ChevronDown
                                size={10}
                                className={`flex-shrink-0 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        <AnimatePresence>
                            {isModelDropdownOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                    transition={{ duration: 0.12 }}
                                    className="absolute bottom-full left-0 mb-1.5 min-w-[280px] rounded-xl overflow-hidden shadow-2xl z-50"
                                    style={{
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border-default)',
                                        boxShadow: 'var(--shadow-float)',
                                    }}
                                >
                                    {/* Header */}
                                    <div
                                        className={`flex items-center justify-between px-3 py-2 ${isRtl ? 'flex-row-reverse' : ''}`}
                                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                                    >
                                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                            Select Model
                                        </span>
                                        <button
                                            onClick={fetchAllModels}
                                            className="p-1 rounded transition-colors"
                                            style={{ color: 'var(--text-muted)' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-primary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                        >
                                            <RefreshCw size={10} className={modelStatus === 'loading' ? 'animate-spin' : ''} />
                                        </button>
                                    </div>

                                    {/* Search */}
                                    <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <div
                                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                                            style={{ background: 'rgba(0,0,0,0.3)' }}
                                        >
                                            <Search size={9} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                            <input
                                                type="text"
                                                value={modelSearch}
                                                onChange={e => setModelSearch(e.target.value)}
                                                placeholder="Search models…"
                                                className="flex-1 bg-transparent text-[10px] focus:outline-none"
                                                style={{ color: 'var(--text-secondary)' }}
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    {/* List */}
                                    <div className="max-h-56 overflow-y-auto custom-scrollbar">
                                        {/* AutoDetect */}
                                        {(!modelSearch || 'autodetect'.includes(modelSearch.toLowerCase())) && (
                                            <button
                                                onClick={() => { setSelectedModel('auto'); setIsModelDropdownOpen(false); }}
                                                className={`w-full flex items-center gap-2 px-3 py-2.5 text-[11px] transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                                                style={{
                                                    borderBottom: '1px solid var(--border-subtle)',
                                                    background: (!selectedModelId || selectedModelId === 'auto') ? 'rgba(255,170,0,0.05)' : 'transparent',
                                                    color: (!selectedModelId || selectedModelId === 'auto') ? 'var(--accent-warning)' : 'var(--text-secondary)',
                                                    fontWeight: (!selectedModelId || selectedModelId === 'auto') ? 700 : 400,
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = (!selectedModelId || selectedModelId === 'auto') ? 'rgba(255,170,0,0.05)' : 'transparent'; }}
                                            >
                                                <Sparkles size={10} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />
                                                <span className="flex-1">AutoDetect</span>
                                                <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>Best available</span>
                                            </button>
                                        )}

                                        {/* Provider groups */}
                                        {filteredGroups.length === 0 && modelSearch ? (
                                            <div className="px-3 py-3 text-center text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                No models match "{modelSearch}"
                                            </div>
                                        ) : filteredGroups.map(group =>
                                            group.models?.length > 0 && (
                                                <div key={group.name}>
                                                    <div
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 ${isRtl ? 'flex-row-reverse' : ''}`}
                                                        style={{ background: 'rgba(0,0,0,0.2)' }}
                                                    >
                                                        <span className="text-[9px]">{PROVIDER_ICONS[group.name] || '🤖'}</span>
                                                        <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                                            {group.display_name}
                                                        </span>
                                                        <span
                                                            className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                            style={{ background: group.available ? 'var(--accent-success)' : 'rgba(255,68,68,0.4)' }}
                                                        />
                                                    </div>
                                                    {group.models.map(m => (
                                                        <button
                                                            key={m.id}
                                                            onClick={() => { setSelectedModel(m.id); setIsModelDropdownOpen(false); }}
                                                            className={`w-full flex items-center gap-2 px-4 py-2 text-[11px] transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                                                            style={{
                                                                background: selectedModelId === m.id ? 'rgba(0,212,255,0.05)' : 'transparent',
                                                                color: selectedModelId === m.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                                                fontWeight: selectedModelId === m.id ? 700 : 400,
                                                            }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = selectedModelId === m.id ? 'rgba(0,212,255,0.05)' : 'transparent'; }}
                                                        >
                                                            <CircleDot
                                                                size={9}
                                                                style={{
                                                                    color: selectedModelId === m.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                                                                    flexShrink: 0,
                                                                }}
                                                            />
                                                            <span className="truncate">{m.name || m.id}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )
                                        )}

                                        {!modelSearch && filteredGroups.every(g => !g.models?.length) && (
                                            <div className="px-3 py-4 text-center text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                <Server size={16} className="mx-auto mb-2" style={{ opacity: 0.3 }} />
                                                No models available. Check your provider connections.
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Depth selector */}
                    <span style={{ color: 'var(--border-default)' }}>·</span>
                    <div className="relative">
                        <button
                            onClick={() => setIsDepthOpen(!isDepthOpen)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                            style={{
                                background: 'rgba(0,0,0,0.2)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                            }}
                        >
                            <currentDepth.icon size={10} className={currentDepth.color} />
                            <span className={`font-bold ${currentDepth.color}`}>
                                {t(currentDepth.label, { defaultValue: currentDepth.id })}
                            </span>
                            <ChevronDown size={9} className={`transition-transform ${isDepthOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isDepthOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="absolute bottom-full left-0 mb-1.5 min-w-[180px] rounded-xl overflow-hidden shadow-2xl z-50"
                                style={{
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-default)',
                                    boxShadow: 'var(--shadow-float)',
                                }}
                            >
                                {SEARCH_DEPTHS.map(d => (
                                    <button
                                        key={d.id}
                                        onClick={() => { setSearchDepth(d.id); setIsDepthOpen(false); }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                                        style={{
                                            background: searchDepth === d.id ? 'rgba(255,255,255,0.04)' : 'transparent',
                                            fontWeight: searchDepth === d.id ? 700 : 400,
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = searchDepth === d.id ? 'rgba(255,255,255,0.04)' : 'transparent'; }}
                                    >
                                        <d.icon size={13} className={d.color} />
                                        <span className={d.color}>{t(d.label, { defaultValue: d.id })}</span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </div>

                    {/* Status badges */}
                    {isSearchEnabled && (
                        <>
                            <span style={{ color: 'var(--border-default)' }}>·</span>
                            <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#00ff8880' }}>
                                <Globe size={9} /> Web
                            </span>
                        </>
                    )}
                    {isSwarmEnabled && (
                        <>
                            <span style={{ color: 'var(--border-default)' }}>·</span>
                            <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: 'rgba(124,58,237,0.7)' }}>
                                <Zap size={9} /> Swarm
                            </span>
                        </>
                    )}
                    {toolsEnabled && (
                        <>
                            <span style={{ color: 'var(--border-default)' }}>·</span>
                            <button
                                onClick={onOpenToolSelector}
                                className="flex items-center gap-1 text-[10px] font-bold transition-opacity hover:opacity-80"
                                style={{ color: '#f59e0b', background: 'transparent', border: 'none', cursor: 'pointer' }}
                            >
                                <span>⚡</span> Tools: {enabledTools.length}
                            </button>
                        </>
                    )}
                    {agentMode && (
                        <>
                            <span style={{ color: 'var(--border-default)' }}>·</span>
                            <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#10b981' }}>
                                <Bot size={9} /> Agent
                            </span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
