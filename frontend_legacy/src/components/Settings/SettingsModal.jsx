import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Settings, Brain, Cpu, Shield,
    Bell, Lock, HardDrive, Languages,
    Activity, Info, Key, Server, CheckCircle,
    AlertCircle, Eye, EyeOff, RefreshCw, Boxes, Plus, Trash2,
    Zap, Bot, SlidersHorizontal, Type
} from 'lucide-react';

const FONT_SIZE_KEY = 'nexus_chat_font_size';
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 20;
const FONT_SIZE_DEFAULT = 14;

function useChatFontSize() {
    const [fontSize, setFontSize] = useState(() => {
        const stored = localStorage.getItem(FONT_SIZE_KEY);
        return stored ? Number(stored) : FONT_SIZE_DEFAULT;
    });

    const applyFontSize = useCallback((size) => {
        document.documentElement.style.setProperty('--chat-font-size', `${size}px`);
    }, []);

    useEffect(() => { applyFontSize(fontSize); }, [fontSize, applyFontSize]);

    const updateFontSize = useCallback((size) => {
        setFontSize(size);
        localStorage.setItem(FONT_SIZE_KEY, String(size));
        applyFontSize(size);
    }, [applyFontSize]);

    return [fontSize, updateFontSize];
}
import { useOSStore } from '../../store/osStore';
import toastBus from '../../services/toastBus';

const PROVIDER_ICONS = {
    lm_studio: '🖥', openai: '✦', anthropic: '◆',
    google: '✸', groq: '⚡', openrouter: '🌐', ollama: '🦙',
};

/* ── Status dot colors ── */
const LOCAL_PROVIDERS = new Set(['lm_studio', 'ollama']);

const providerStatusColor = (p) => {
    if (p.available) return 'var(--accent-success)';
    if (!p.api_key && !LOCAL_PROVIDERS.has(p.name)) return 'var(--text-muted)';
    return 'var(--accent-error)';
};
const providerStatusLabel = (p) => {
    if (p.available) return 'Online';
    if (!p.api_key && !LOCAL_PROVIDERS.has(p.name)) return 'No key';
    return 'Offline';
};

/* ── Provider card ─────────────────────────────────────────────── */
function ProviderCard({ provider, isActive, onActivate, onSaveConfig, onTest, onDelete }) {
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [expanded, setExpanded] = useState(false);

    const isLocal = provider.name === 'lm_studio';
    const isOllama = provider.name === 'ollama';
    const isCustom = provider.is_custom;
    const dotColor = providerStatusColor(provider);

    const handleSaveAndVerify = async () => {
        if (!apiKey && !baseUrl) return;
        setIsBusy(true);
        setTestResult(null);
        const saveResult = await onSaveConfig(provider.name, {
            api_key: apiKey || undefined,
            base_url: baseUrl || undefined,
        });
        if (!saveResult?.success) {
            toastBus.error('Save failed', saveResult?.message || 'Could not persist configuration');
            setIsBusy(false);
            return;
        }
        const result = await onTest(provider.name);
        setTestResult(result);
        if (result.available) {
            toastBus.success(`${provider.display_name} connected`, `Latency: ${result.latency_ms}ms`);
            setApiKey(''); setBaseUrl('');
        } else {
            toastBus.error(`${provider.display_name} unreachable`, result.message || 'Check your API key');
        }
        setIsBusy(false);
    };

    const handleTestOnly = async () => {
        setIsBusy(true);
        setTestResult(null);
        const result = await onTest(provider.name);
        setTestResult(result);
        setIsBusy(false);
    };

    return (
        <div
            className="rounded-2xl overflow-hidden transition-all"
            style={{
                border: isActive
                    ? '1px solid var(--border-primary)'
                    : '1px solid var(--border-subtle)',
                background: isActive ? 'rgba(0,212,255,0.03)' : 'var(--bg-card)',
            }}
        >
            {/* ── Header row ── */}
            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2.5">
                    {/* Status dot */}
                    <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                            background: dotColor,
                            boxShadow: provider.available ? `0 0 6px ${dotColor}` : 'none',
                        }}
                        title={providerStatusLabel(provider)}
                    />
                    <span className="text-[11px]">{PROVIDER_ICONS[provider.name] || '🤖'}</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        {provider.display_name}
                    </span>
                    {isCustom && (
                        <span
                            className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded"
                            style={{
                                background: 'rgba(124,58,237,0.15)',
                                color: '#a78bfa',
                                border: '1px solid rgba(124,58,237,0.25)',
                            }}
                        >
                            Custom
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Test result badge */}
                    {testResult && (
                        <span
                            className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                            style={{
                                background: testResult.available ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
                                color: testResult.available ? 'var(--accent-success)' : 'var(--accent-error)',
                            }}
                        >
                            {testResult.available ? `✓ ${testResult.latency_ms}ms` : '✗ Offline'}
                        </span>
                    )}
                    <button
                        onClick={e => { e.stopPropagation(); onActivate(provider.name); }}
                        className="text-[10px] font-bold px-3 py-1 rounded-lg uppercase tracking-wider transition-all"
                        style={{
                            background: isActive ? 'rgba(0,212,255,0.12)' : 'transparent',
                            color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                            border: isActive ? '1px solid var(--border-primary)' : '1px solid transparent',
                        }}
                    >
                        {isActive ? '● Active' : 'Set Active'}
                    </button>
                    {isCustom && (
                        <button
                            onClick={e => { e.stopPropagation(); onDelete(provider.name); }}
                            className="p-1 rounded-lg transition-all"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-error)'; e.currentTarget.style.background = 'rgba(255,68,68,0.08)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                        >
                            <Trash2 size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Expandable config ── */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <div
                            className="px-4 pb-4 space-y-2.5 pt-1"
                            style={{ borderTop: '1px solid var(--border-subtle)' }}
                        >
                            {isLocal ? (
                                /* ── LM Studio: no config needed ── */
                                <div className="flex items-center justify-between pt-2">
                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        localhost:1234 — no API key required
                                    </span>
                                    <button
                                        onClick={handleTestOnly}
                                        disabled={isBusy}
                                        className="flex items-center gap-1 text-[10px] transition-colors"
                                        style={{ color: 'var(--text-muted)' }}
                                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-primary)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                    >
                                        <RefreshCw size={9} className={isBusy ? 'animate-spin' : ''} />
                                        {testResult
                                            ? (testResult.available ? `✓ ${testResult.latency_ms}ms` : '✗ Offline')
                                            : 'Test Connection'
                                        }
                                    </button>
                                </div>
                            ) : isOllama ? (
                                /* ── Ollama: base URL + test only (no API key needed) ── */
                                <>
                                    <span className="block text-[10px] pt-2" style={{ color: 'var(--text-muted)' }}>
                                        Runs locally — no API key required.
                                    </span>
                                    <input
                                        type="text"
                                        value={baseUrl}
                                        onChange={e => setBaseUrl(e.target.value)}
                                        placeholder="Base URL (default: http://localhost:11434)"
                                        className="w-full rounded-xl px-3 py-2 text-[11px] focus:outline-none transition-all"
                                        style={{
                                            background: 'rgba(0,0,0,0.3)',
                                            border: '1px solid var(--border-default)',
                                            color: 'var(--text-secondary)',
                                        }}
                                        onFocus={e => { e.target.style.borderColor = 'var(--border-primary)'; }}
                                        onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; }}
                                    />
                                    <div className="flex gap-2 pt-0.5">
                                        <button
                                            onClick={handleTestOnly}
                                            disabled={isBusy}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                                            style={{
                                                border: '1px solid var(--border-default)',
                                                color: 'var(--text-muted)',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                        >
                                            <RefreshCw size={9} className={isBusy ? 'animate-spin' : ''} />
                                            Test Connection
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!baseUrl) return;
                                                setIsBusy(true);
                                                const saveResult = await onSaveConfig(provider.name, { base_url: baseUrl });
                                                if (saveResult?.success) { setBaseUrl(''); toastBus.success('Ollama URL saved', baseUrl); }
                                                else toastBus.error('Save failed', saveResult?.message || 'Could not persist URL');
                                                setIsBusy(false);
                                            }}
                                            disabled={isBusy || !baseUrl}
                                            className="flex-1 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                                            style={{
                                                background: 'rgba(0,212,255,0.08)',
                                                border: '1px solid var(--border-primary)',
                                                color: 'var(--accent-primary)',
                                                opacity: (isBusy || !baseUrl) ? 0.4 : 1,
                                                cursor: (isBusy || !baseUrl) ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            {isBusy ? 'Saving…' : 'Save URL'}
                                        </button>
                                    </div>
                                    {testResult && (
                                        <div
                                            className="text-[10px] font-bold px-3 py-1.5 rounded-xl"
                                            style={{
                                                background: testResult.available ? 'rgba(0,255,136,0.07)' : 'rgba(255,68,68,0.07)',
                                                color: testResult.available ? 'var(--accent-success)' : 'var(--accent-error)',
                                                border: `1px solid ${testResult.available ? 'rgba(0,255,136,0.2)' : 'rgba(255,68,68,0.2)'}`,
                                            }}
                                        >
                                            {testResult.message}
                                            {testResult.latency_ms != null ? ` (${testResult.latency_ms}ms)` : ''}
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* ── Cloud providers: API key + base URL + Save & Verify ── */
                                <>
                                    {/* API Key input */}
                                    <div className="relative pt-2">
                                        <input
                                            type={showKey ? 'text' : 'password'}
                                            value={apiKey}
                                            onChange={e => setApiKey(e.target.value)}
                                            placeholder="API Key (leave blank to keep existing)"
                                            className="w-full rounded-xl px-3 py-2 text-[11px] focus:outline-none pr-9 transition-all"
                                            style={{
                                                background: 'rgba(0,0,0,0.3)',
                                                border: '1px solid var(--border-default)',
                                                color: 'var(--text-secondary)',
                                            }}
                                            onFocus={e => { e.target.style.borderColor = 'var(--border-primary)'; }}
                                            onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKey(!showKey)}
                                            className="absolute right-2.5 top-1/2 mt-1 -translate-y-1/2 transition-colors"
                                            style={{ color: 'var(--text-muted)' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                        >
                                            {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                                        </button>
                                    </div>

                                    {/* Base URL */}
                                    <input
                                        type="text"
                                        value={baseUrl}
                                        onChange={e => setBaseUrl(e.target.value)}
                                        placeholder="Base URL (optional — uses default endpoint)"
                                        className="w-full rounded-xl px-3 py-2 text-[11px] focus:outline-none transition-all"
                                        style={{
                                            background: 'rgba(0,0,0,0.3)',
                                            border: '1px solid var(--border-default)',
                                            color: 'var(--text-secondary)',
                                        }}
                                        onFocus={e => { e.target.style.borderColor = 'var(--border-primary)'; }}
                                        onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; }}
                                    />

                                    {/* Action buttons */}
                                    <div className="flex gap-2 pt-0.5">
                                        <button
                                            onClick={handleTestOnly}
                                            disabled={isBusy}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                                            style={{
                                                border: '1px solid var(--border-default)',
                                                color: 'var(--text-muted)',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                        >
                                            <RefreshCw size={9} className={isBusy ? 'animate-spin' : ''} />
                                            Test
                                        </button>
                                        <button
                                            onClick={handleSaveAndVerify}
                                            disabled={isBusy || (!apiKey && !baseUrl)}
                                            className="flex-1 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                                            style={{
                                                background: 'rgba(0,212,255,0.08)',
                                                border: '1px solid var(--border-primary)',
                                                color: 'var(--accent-primary)',
                                                opacity: (isBusy || (!apiKey && !baseUrl)) ? 0.4 : 1,
                                                cursor: (isBusy || (!apiKey && !baseUrl)) ? 'not-allowed' : 'pointer',
                                            }}
                                        >
                                            {isBusy ? 'Verifying…' : 'Save & Verify'}
                                        </button>
                                    </div>

                                    {testResult && (
                                        <div
                                            className="text-[10px] font-bold px-3 py-1.5 rounded-xl"
                                            style={{
                                                background: testResult.available ? 'rgba(0,255,136,0.07)' : 'rgba(255,68,68,0.07)',
                                                color: testResult.available ? 'var(--accent-success)' : 'var(--accent-error)',
                                                border: `1px solid ${testResult.available ? 'rgba(0,255,136,0.2)' : 'rgba(255,68,68,0.2)'}`,
                                            }}
                                        >
                                            {testResult.message}
                                            {testResult.latency_ms != null ? ` (${testResult.latency_ms}ms)` : ''}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── Add Custom Provider form ──────────────────────────────────── */
function AddProviderForm({ onAdd }) {
    const [isOpen, setIsOpen] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [isBusy, setIsBusy] = useState(false);

    const handleSubmit = async () => {
        if (!displayName.trim() || !baseUrl.trim()) {
            toastBus.warning('Missing fields', 'Display name and Base URL are required');
            return;
        }
        setIsBusy(true);
        const result = await onAdd(displayName.trim(), baseUrl.trim(), apiKey || undefined);
        setIsBusy(false);
        if (result?.success) {
            setDisplayName(''); setBaseUrl(''); setApiKey('');
            setIsOpen(false);
        }
    };

    return (
        <div className="mt-2">
            {!isOpen ? (
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                    style={{
                        border: '1px dashed var(--border-default)',
                        color: 'var(--text-muted)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-primary)'; e.currentTarget.style.borderColor = 'var(--border-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                >
                    <Plus size={11} /> Add Custom Provider
                </button>
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl space-y-2.5"
                    style={{
                        background: 'rgba(124,58,237,0.04)',
                        border: '1px solid var(--border-secondary)',
                    }}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#a78bfa' }}>
                            New OpenAI-Compatible Provider
                        </span>
                        <button onClick={() => setIsOpen(false)} style={{ color: 'var(--text-muted)' }}>
                            <X size={12} />
                        </button>
                    </div>
                    {[
                        { value: displayName, setter: setDisplayName, placeholder: 'Display name (e.g. Ollama, vLLM)' },
                        { value: baseUrl,     setter: setBaseUrl,     placeholder: 'Base URL (e.g. http://localhost:11434/v1)' },
                    ].map(({ value, setter, placeholder }) => (
                        <input
                            key={placeholder}
                            type="text"
                            value={value}
                            onChange={e => setter(e.target.value)}
                            placeholder={placeholder}
                            className="w-full rounded-xl px-3 py-2 text-[11px] focus:outline-none transition-all"
                            style={{
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid var(--border-default)',
                                color: 'var(--text-secondary)',
                            }}
                            onFocus={e => { e.target.style.borderColor = 'rgba(124,58,237,0.4)'; }}
                            onBlur={e =>  { e.target.style.borderColor = 'var(--border-default)'; }}
                        />
                    ))}
                    <div className="relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder="API Key (optional)"
                            className="w-full rounded-xl px-3 py-2 text-[11px] focus:outline-none transition-all pr-9"
                            style={{
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid var(--border-default)',
                                color: 'var(--text-secondary)',
                            }}
                            onFocus={e => { e.target.style.borderColor = 'rgba(124,58,237,0.4)'; }}
                            onBlur={e =>  { e.target.style.borderColor = 'var(--border-default)'; }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={isBusy || !displayName.trim() || !baseUrl.trim()}
                        className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                        style={{
                            background: 'rgba(124,58,237,0.15)',
                            border: '1px solid var(--border-secondary)',
                            color: '#a78bfa',
                            opacity: (isBusy || !displayName.trim() || !baseUrl.trim()) ? 0.45 : 1,
                        }}
                    >
                        {isBusy ? 'Adding…' : 'Add Provider'}
                    </button>
                </motion.div>
            )}
        </div>
    );
}

/* ── Main SettingsModal ────────────────────────────────────────── */
export default function SettingsModal({
    isOpen, onClose, isProactiveEnabled, onToggleProactive, isRtl, t,
    toolsEnabled, setToolsEnabled, enabledTools = [], toggleTool, setEnabledTools,
    agentMode, setAgentMode, agentMaxIterations = 8,
}) {
    const [activeTab, setActiveTab] = useState('cortex');
    const [chatFontSize, setChatFontSize] = useChatFontSize();
    const {
        availableProviders, activeProvider, setActiveProvider,
        updateProviderConfig, testProvider, fetchProviders,
        addCustomProvider, removeCustomProvider,
    } = useOSStore();

    useEffect(() => { if (isOpen) fetchProviders(); }, [isOpen]);

    const tabs = [
        { id: 'general',   label: 'General',   icon: Settings },
        { id: 'cortex',    label: 'Cortex AI', icon: Brain    },
        { id: 'providers', label: 'Providers', icon: Key      },
        { id: 'tools',     label: 'Tools',     icon: Zap      },
        { id: 'system',    label: 'System',    icon: Cpu      },
    ];

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.92, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.92, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="w-full max-w-2xl overflow-hidden nd-noise"
                    style={{
                        background: 'rgba(13,17,23,0.96)',
                        backdropFilter: 'blur(32px)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '28px',
                        boxShadow: 'var(--shadow-float)',
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* ── Header ── */}
                    <div
                        className="flex items-center justify-between px-8 py-5"
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="p-2.5 rounded-2xl"
                                style={{
                                    background: 'rgba(0,212,255,0.08)',
                                    border: '1px solid var(--border-primary)',
                                }}
                            >
                                <Settings className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
                            </div>
                            <div>
                                <h2
                                    className="text-base font-black uppercase tracking-widest"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    Settings
                                </h2>
                                <p
                                    className="text-[9px] font-bold uppercase tracking-tighter"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    Configure your Nexus Experience
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl transition-all"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex" style={{ height: '500px' }}>
                        {/* ── Sidebar Tabs ── */}
                        <div
                            className="w-48 p-4 space-y-1 flex-shrink-0"
                            style={{ borderRight: '1px solid var(--border-subtle)' }}
                        >
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className="relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-xs font-bold uppercase tracking-wider"
                                    style={{ color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                                    onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                    onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--text-muted)'; }}
                                >
                                    {/* Sliding background indicator */}
                                    {activeTab === tab.id && (
                                        <motion.div
                                            layoutId="settings-tab-bg"
                                            className="absolute inset-0 rounded-xl"
                                            style={{
                                                background: 'rgba(0,212,255,0.07)',
                                                border: '1px solid var(--border-primary)',
                                            }}
                                            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                                        />
                                    )}
                                    <tab.icon className="w-4 h-4 relative z-10 flex-shrink-0" />
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* ── Content Area ── */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                            {/* Cortex AI tab */}
                            {activeTab === 'cortex' && (
                                <motion.div
                                    initial={{ opacity: 0, x: 8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="space-y-8"
                                >
                                    <div>
                                        <h3
                                            className="text-[9px] font-black uppercase tracking-[0.2em] mb-4"
                                            style={{ color: 'var(--text-muted)' }}
                                        >
                                            Background Intelligence
                                        </h3>
                                        <div
                                            className="p-5 rounded-2xl flex items-center justify-between group transition-all"
                                            style={{
                                                background: 'var(--bg-card)',
                                                border: '1px solid var(--border-subtle)',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                                        >
                                            <div className="flex gap-4">
                                                <div
                                                    className="p-3 rounded-2xl flex-shrink-0 h-fit"
                                                    style={{
                                                        background: 'rgba(0,212,255,0.08)',
                                                        border: '1px solid var(--border-primary)',
                                                    }}
                                                >
                                                    <Activity className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
                                                </div>
                                                <div>
                                                    <h4
                                                        className="text-sm font-bold mb-1"
                                                        style={{ color: 'var(--text-primary)' }}
                                                    >
                                                        Proactive Background Processing
                                                    </h4>
                                                    <p
                                                        className="text-xs leading-relaxed max-w-[300px]"
                                                        style={{ color: 'var(--text-muted)' }}
                                                    >
                                                        Enables Subconscious Memory, Predictive Analytics, and automated system cleanup during idle periods.
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Toggle */}
                                            <button
                                                onClick={onToggleProactive}
                                                className="relative w-11 h-6 rounded-full flex-shrink-0 transition-all duration-300"
                                                style={{
                                                    background: isProactiveEnabled
                                                        ? 'rgba(0,212,255,0.18)'
                                                        : 'rgba(255,255,255,0.04)',
                                                    border: '1px solid var(--border-default)',
                                                }}
                                            >
                                                <motion.div
                                                    animate={{ x: isProactiveEnabled ? 24 : 2 }}
                                                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                                    className="absolute top-1 w-4 h-4 rounded-full"
                                                    style={{
                                                        background: isProactiveEnabled ? 'var(--accent-primary)' : 'var(--text-muted)',
                                                        boxShadow: isProactiveEnabled ? '0 0 10px rgba(0,212,255,0.5)' : 'none',
                                                    }}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <h3
                                            className="text-[9px] font-black uppercase tracking-[0.2em] mb-4"
                                            style={{ color: 'var(--text-muted)' }}
                                        >
                                            Memory Cortex
                                        </h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { icon: Lock, label: 'Encryption', color: '#a78bfa', desc: 'All background tasks are AES-256 encrypted before storage.' },
                                                { icon: Shield, label: 'Zero-Trust', color: 'var(--accent-success)', desc: 'Docker sandboxing is enforced for all automated code execution.' },
                                            ].map(({ icon: Icon, label, color, desc }) => (
                                                <div
                                                    key={label}
                                                    className="p-4 rounded-2xl"
                                                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
                                                >
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Icon size={13} style={{ color }} />
                                                        <span
                                                            className="text-[9px] font-black uppercase tracking-widest"
                                                            style={{ color }}
                                                        >
                                                            {label}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                                        {desc}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Providers tab */}
                            {activeTab === 'providers' && (
                                <motion.div
                                    initial={{ opacity: 0, x: 8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="space-y-2.5"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3
                                            className="text-[9px] font-black uppercase tracking-[0.2em]"
                                            style={{ color: 'var(--text-muted)' }}
                                        >
                                            LLM Providers & API Keys
                                        </h3>
                                        <button
                                            onClick={fetchProviders}
                                            className="transition-colors p-1"
                                            style={{ color: 'var(--text-muted)' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-primary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                        >
                                            <RefreshCw size={12} />
                                        </button>
                                    </div>

                                    {availableProviders.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-40 text-center" style={{ color: 'var(--text-muted)' }}>
                                            <Server className="w-8 h-8 mb-3" style={{ opacity: 0.25 }} />
                                            <p className="text-xs font-bold uppercase tracking-widest">Backend offline</p>
                                            <p className="text-[10px] mt-1">Start the backend server to manage providers.</p>
                                        </div>
                                    ) : (
                                        <>
                                            {availableProviders.map(provider => (
                                                <ProviderCard
                                                    key={provider.name}
                                                    provider={provider}
                                                    isActive={activeProvider === provider.name}
                                                    onActivate={setActiveProvider}
                                                    onSaveConfig={updateProviderConfig}
                                                    onTest={testProvider}
                                                    onDelete={removeCustomProvider}
                                                />
                                            ))}
                                            <AddProviderForm onAdd={addCustomProvider} />
                                        </>
                                    )}

                                    <p className="text-[9px] pt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                        API keys are stored encrypted in your local MongoDB. They are never sent to third parties.
                                        LM Studio runs fully offline — no key required.
                                    </p>
                                </motion.div>
                            )}

                            {/* General tab */}
                            {activeTab === 'general' && (
                                <motion.div
                                    initial={{ opacity: 0, x: 8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="space-y-6"
                                >
                                    <h3
                                        className="text-[9px] font-black uppercase tracking-[0.2em] mb-4"
                                        style={{ color: 'var(--text-muted)' }}
                                    >
                                        Appearance
                                    </h3>

                                    {/* Font size slider */}
                                    <div
                                        className="p-5 rounded-2xl"
                                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
                                    >
                                        <div className="flex items-center gap-3 mb-4">
                                            <div
                                                className="p-2.5 rounded-xl flex-shrink-0"
                                                style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid var(--border-primary)' }}
                                            >
                                                <Type className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                                    Chat Font Size
                                                </div>
                                                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                    Controls the text size inside message bubbles
                                                </div>
                                            </div>
                                            <span
                                                className="ml-auto text-xs font-black tabular-nums"
                                                style={{ color: 'var(--accent-primary)', minWidth: '2.5rem', textAlign: 'right' }}
                                            >
                                                {chatFontSize}px
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                                {FONT_SIZE_MIN}
                                            </span>
                                            <input
                                                type="range"
                                                min={FONT_SIZE_MIN}
                                                max={FONT_SIZE_MAX}
                                                step={1}
                                                value={chatFontSize}
                                                onChange={e => setChatFontSize(Number(e.target.value))}
                                                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                                                style={{
                                                    accentColor: 'var(--accent-primary)',
                                                    background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${((chatFontSize - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN)) * 100}%, rgba(255,255,255,0.08) ${((chatFontSize - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN)) * 100}%, rgba(255,255,255,0.08) 100%)`,
                                                }}
                                            />
                                            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                                {FONT_SIZE_MAX}
                                            </span>
                                        </div>

                                        {/* Live preview */}
                                        <div
                                            className="mt-4 px-3 py-2 rounded-xl italic"
                                            style={{
                                                background: 'rgba(0,0,0,0.25)',
                                                border: '1px solid var(--border-subtle)',
                                                color: 'var(--text-secondary)',
                                                fontSize: `${chatFontSize}px`,
                                                lineHeight: 1.6,
                                            }}
                                        >
                                            Preview: The quick brown fox jumps over the lazy dog.
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Tools & Agent tab */}
                            {activeTab === 'tools' && (
                                <motion.div
                                    initial={{ opacity: 0, x: 8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="space-y-5"
                                >
                                    {/* Master toggles */}
                                    <div className="space-y-3">
                                        <h3 className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                                            Execution Modes
                                        </h3>
                                        {[
                                            {
                                                icon: Zap, label: 'Tool Calling', desc: 'Allow the AI to call tools (web search, calculator, code runner, etc.)',
                                                color: '#f59e0b', checked: !!toolsEnabled, onToggle: () => setToolsEnabled?.(!toolsEnabled)
                                            },
                                            {
                                                icon: Bot, label: 'Agent Mode', desc: 'Autonomous multi-step task execution with Think → Act → Observe loop',
                                                color: '#10b981', checked: !!agentMode, onToggle: () => setAgentMode?.(!agentMode)
                                            },
                                        ].map(({ icon: Icon, label, desc, color, checked, onToggle }) => (
                                            <div key={label} className="flex items-center justify-between p-4 rounded-2xl"
                                                style={{ background: 'var(--bg-card)', border: `1px solid ${checked ? color + '30' : 'var(--border-subtle)'}` }}>
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-xl" style={{ background: checked ? color + '15' : 'transparent', border: `1px solid ${checked ? color + '30' : 'var(--border-subtle)'}` }}>
                                                        <Icon size={14} style={{ color: checked ? color : 'var(--text-muted)' }} />
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold" style={{ color: checked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</div>
                                                        <div className="text-[10px] max-w-[240px]" style={{ color: 'var(--text-muted)' }}>{desc}</div>
                                                    </div>
                                                </div>
                                                <button onClick={onToggle} className="relative w-10 h-5 rounded-full transition-all flex-shrink-0"
                                                    style={{ background: checked ? color + '30' : 'rgba(255,255,255,0.04)', border: `1px solid ${checked ? color : 'var(--border-default)'}` }}>
                                                    <motion.div animate={{ x: checked ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                                        className="absolute top-0.5 w-3.5 h-3.5 rounded-full"
                                                        style={{ background: checked ? color : 'var(--text-muted)', boxShadow: checked ? `0 0 8px ${color}60` : 'none' }} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Per-tool toggles */}
                                    {toolsEnabled && (
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                                                    Active Tools ({enabledTools.length}/12)
                                                </h3>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEnabledTools?.(['web_search','calculator','get_datetime','fetch_url','run_python','code_interpreter','run_in_sandbox','list_files','read_file','run_command','write_draft','web_scraper'])}
                                                        className="text-[9px] font-black px-2 py-0.5 rounded-lg" style={{ color: 'var(--accent-primary)', background: 'rgba(0,212,255,0.08)' }}>All</button>
                                                    <button onClick={() => setEnabledTools?.([])}
                                                        className="text-[9px] font-black px-2 py-0.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}>None</button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {[
                                                    { name: 'web_search', icon: '🔍', label: 'Web Search' },
                                                    { name: 'calculator', icon: '🧮', label: 'Calculator' },
                                                    { name: 'get_datetime', icon: '⏰', label: 'Date & Time' },
                                                    { name: 'fetch_url', icon: '🌐', label: 'Fetch URL' },
                                                    { name: 'run_python', icon: '💻', label: 'Run Python' },
                                                    { name: 'code_interpreter', icon: '💻', label: 'Code Interp.' },
                                                    { name: 'run_in_sandbox', icon: '📦', label: 'Sandbox' },
                                                    { name: 'list_files', icon: '📂', label: 'List Files' },
                                                    { name: 'read_file', icon: '📄', label: 'Read File' },
                                                    { name: 'run_command', icon: '⚡', label: 'Command' },
                                                    { name: 'write_draft', icon: '✏️', label: 'Write Draft' },
                                                    { name: 'web_scraper', icon: '🕸️', label: 'Web Scraper' },
                                                ].map(tool => {
                                                    const active = enabledTools.includes(tool.name);
                                                    return (
                                                        <button key={tool.name} onClick={() => toggleTool?.(tool.name)}
                                                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold transition-all text-left"
                                                            style={{
                                                                background: active ? 'rgba(245,158,11,0.08)' : 'var(--bg-card)',
                                                                border: `1px solid ${active ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)'}`,
                                                                color: active ? '#f59e0b' : 'var(--text-muted)',
                                                            }}>
                                                            <span>{tool.icon}</span>
                                                            <span className="truncate">{tool.label}</span>
                                                            <span className="ml-auto text-[8px]">{active ? '✓' : '○'}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* System tab */}
                            {activeTab === 'system' && (
                                <motion.div
                                    initial={{ opacity: 0, x: 8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="space-y-4"
                                >
                                    <div
                                        className="p-5 rounded-2xl"
                                        style={{
                                            background: 'var(--bg-card)',
                                            border: '1px solid var(--border-subtle)',
                                        }}
                                    >
                                        <div className="flex items-center gap-3 mb-4">
                                            <HardDrive
                                                className="w-5 h-5"
                                                style={{ color: 'var(--accent-primary)' }}
                                            />
                                            <span
                                                className="text-xs font-black uppercase tracking-widest"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                Local Environment
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            {[
                                                { label: 'Backend API',      value: 'STABLE (127.0.0.1:3001)', color: 'var(--accent-success)' },
                                                { label: 'Active Provider',  value: (activeProvider || '').replace('_', ' '), color: 'var(--accent-primary)' },
                                            ].map(({ label, value, color }) => (
                                                <div key={label} className="flex justify-between items-center text-[10px] font-bold">
                                                    <span
                                                        className="uppercase"
                                                        style={{ color: 'var(--text-muted)' }}
                                                    >
                                                        {label}
                                                    </span>
                                                    <span
                                                        className="capitalize"
                                                        style={{ color }}
                                                    >
                                                        {value}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>

                    {/* ── Footer ── */}
                    <div
                        className="px-8 py-3 flex items-center justify-between"
                        style={{
                            borderTop: '1px solid var(--border-subtle)',
                            background: 'rgba(0,0,0,0.2)',
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <Info className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                            <span
                                className="text-[9px] font-black uppercase tracking-tighter italic"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                NexusOS v5.2 — Built for God-Mode execution
                            </span>
                        </div>
                        <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                            Build: 2026.03.02-X
                        </span>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
