import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useOSStore } from '../../store/osStore';
import {
    Settings as SettingsIcon, Shield, Brain, Cpu, Globe, Save,
    Thermometer, Activity, Play, Square, Sliders, Zap, Bot, Dna, Palette
} from 'lucide-react';
import AuraCustomizer from './AuraCustomizer.jsx';
import nexusBridge from '../../services/bridge.js';

// ── Tab Definitions ─────────────────────────────────────────
const TABS = [
    { id: 'general', labelKey: 'settings.tabs.general', icon: Globe },
    { id: 'personalization', labelKey: 'settings.tabs.personalization', icon: Palette },
    { id: 'ai', labelKey: 'settings.tabs.ai', icon: Brain },
    { id: 'thermal', labelKey: 'settings.tabs.thermal', icon: Thermometer },
    { id: 'daemons', labelKey: 'settings.tabs.daemons', icon: Bot },
];

// ── Temperature Gauge Component ─────────────────────────────
function TempGauge({ label, temp, max, icon: Icon, t, systemLanguage }) {
    const ratio = Math.min(temp / max, 1.2); // Allow slight overflow for visual
    const color = ratio < 0.7 ? 'emerald' : ratio < 0.9 ? 'yellow' : 'red';
    const isRtl = systemLanguage === 'ar';
    const colorMap = {
        emerald: { bar: 'from-emerald-500 to-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]' },
        yellow: { bar: 'from-yellow-500 to-amber-400', text: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', glow: 'shadow-[0_0_20px_rgba(234,179,8,0.15)]' },
        red: { bar: 'from-red-500 to-rose-400', text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', glow: 'shadow-[0_0_20px_rgba(239,68,68,0.2)]' },
    };
    const c = colorMap[color];

    return (
        <div className={`p-4 rounded-2xl border ${c.border} ${c.bg} ${c.glow} transition-all duration-500`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${c.text}`} />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">{label}</span>
                </div>
                <span className={`text-2xl font-black tabular-nums ${c.text}`}>
                    {temp > 0 ? `${temp}°` : '--'}
                </span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                    className={`h-full bg-gradient-to-r ${c.bar} rounded-full`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(ratio * 100, 100)}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                />
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] text-gray-500 font-mono">
                <span>0°C</span>
                <span className={c.text}>{t('settings.thermal.limit')}: {max}°C</span>
                <span>100°C</span>
            </div>
        </div>
    );
}

// ── Threshold Slider Component ──────────────────────────────
function ThresholdSlider({ label, value, min, max, onChange, color = 'cyan' }) {
    const colorStyles = {
        cyan: 'accent-cyan-500',
        red: 'accent-red-500',
        amber: 'accent-amber-500',
    };
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</label>
                <span className="text-sm font-black text-white tabular-nums">{value}°C</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className={`w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer ${colorStyles[color]}`}
            />
            <div className="flex justify-between text-[9px] text-gray-600 font-mono">
                <span>{min}°C</span>
                <span>{max}°C</span>
            </div>
        </div>
    );
}

export default function Settings() {
    const { t, i18n } = useTranslation();
    const { systemLanguage, setSystemLanguage } = useOSStore();
    const [activeTab, setActiveTab] = useState('general');
    const isRtl = systemLanguage === 'ar';

    // ── Settings State ──────────────────────────────────────
    const [settings, setSettings] = useState({
        aiProvider: 'local',
        localUrl: 'http://127.0.0.1:1234/v1',
        theme: 'dark',
        transparency: 20,
        secrets: { geminiKey: '', githubToken: '' }
    });
    const [saveStatus, setSaveStatus] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // ── Thermal State ───────────────────────────────────────
    const [thermalStatus, setThermalStatus] = useState(null);
    const [cpuMax, setCpuMax] = useState(85);
    const [gpuMax, setGpuMax] = useState(80);

    // ── Daemon State ────────────────────────────────────────
    const [animusStatus, setAnimusStatus] = useState(null);
    const [architectStatus, setArchitectStatus] = useState(null);

    // ── Load settings on mount ──────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const data = await nexusBridge.invoke('settings:getSettings');
                if (data) setSettings(prev => ({ ...prev, ...data }));
            } catch (err) {
                console.error('[Settings] Load failed:', err);
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    // ── Poll thermal + daemon status ────────────────────────
    const refreshStatus = useCallback(async () => {
        try {
            const [thermal, animus, architect] = await Promise.all([
                nexusBridge.invoke('thermal:status').catch(() => null),
                nexusBridge.invoke('animus:status').catch(() => null),
                nexusBridge.invoke('architect:status').catch(() => null),
            ]);
            if (thermal && !thermal.error) {
                setThermalStatus(thermal);
                if (thermal.thresholds) {
                    setCpuMax(thermal.thresholds.cpuMax);
                    setGpuMax(thermal.thresholds.gpuMax);
                }
            }
            setAnimusStatus(animus);
            setArchitectStatus(architect);
        } catch { /* non-critical */ }
    }, []);

    useEffect(() => {
        refreshStatus();
        const iv = setInterval(refreshStatus, 5000);
        return () => clearInterval(iv);
    }, [refreshStatus]);

    // ── Handlers ────────────────────────────────────────────
    const handleSave = async () => {
        setSaveStatus(t('os.saving'));
        try {
            await nexusBridge.invoke('settings:updateSettings', settings);
            setSaveStatus(t('settings.synchronized'));
            setTimeout(() => setSaveStatus(''), 3000);
        } catch {
            setSaveStatus(t('settings.sync_failed'));
        }
    };

    const handleLanguageChange = async (lang) => {
        setSystemLanguage(lang);
        i18n.changeLanguage(lang);
        await nexusBridge.invoke('settings:updateSettings', { ...settings, systemLanguage: lang });
    };

    const handleThermalStart = async () => {
        await nexusBridge.invoke('thermal:start', { thresholds: { cpuMax, gpuMax } });
        refreshStatus();
    };

    const handleThermalStop = async () => {
        await nexusBridge.invoke('thermal:stop');
        refreshStatus();
    };

    const handleSaveThresholds = async () => {
        await nexusBridge.invoke('thermal:set-thresholds', { cpuMax, gpuMax });
        setSaveStatus(t('settings.synchronized'));
        setTimeout(() => setSaveStatus(''), 3000);
    };

    if (isLoading) return <div className="flex items-center justify-center h-full text-cyan-400 font-mono">{t('settings.initializing')}</div>;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`w-full h-full flex flex-col bg-[#050505] text-white font-sans overflow-hidden ${isRtl ? 'text-right' : 'text-left'}`}
        >
            {/* ── Header ────────────────────────────────────── */}
            <div className="px-6 pt-5 pb-0 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3 text-start">
                    <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                        <SettingsIcon className="text-cyan-400" size={22} />
                    </div>
                    <div>
                        <h1 className="text-lg font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-200 to-cyan-500">
                            {t('settings.title')}
                        </h1>
                        <p className={`text-[9px] font-mono text-cyan-500/60 uppercase ${isRtl ? 'tracking-normal' : 'tracking-widest'}`}>{t('settings.subtitle')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-mono ${saveStatus.includes(t('settings.sync_failed')) ? 'text-red-400' : 'text-cyan-400'}`}>{saveStatus}</span>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-bold text-[10px] uppercase tracking-widest rounded-full transition-all active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                    >
                        <Save size={12} /> {t('settings.commit')}
                    </button>
                </div>
            </div>

            {/* ── Tab Bar ───────────────────────────────────── */}
            <div className="px-6 pt-4 flex-shrink-0">
                <div className={`flex gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/5`}>
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold tracking-wide transition-all duration-200 ${isActive
                                    ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                    }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {t(tab.labelKey)}
                                {isActive && (
                                    <motion.div
                                        layoutId="tab-indicator"
                                        className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/10 to-transparent border border-cyan-500/20"
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Tab Content ───────────────────────────────── */}
            <div className="flex-1 overflow-auto custom-scrollbar p-6">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, x: isRtl ? -12 : 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: isRtl ? 12 : -12 }}
                        transition={{ duration: 0.2 }}
                        className="max-w-3xl"
                    >
                        {/* ═══ GENERAL TAB ═══ */}
                        {activeTab === 'general' && (
                            <div className="space-y-6">
                                <section className="bg-black/40 p-6 rounded-2xl border border-white/5">
                                    <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                                        <Globe size={14} /> {t('settings.general.localization')}
                                    </h2>
                                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                                        <span className="text-sm font-medium">{t('settings.general.core_lang')}</span>
                                        <select
                                            value={systemLanguage}
                                            onChange={(e) => handleLanguageChange(e.target.value)}
                                            className="bg-slate-900 border border-white/10 rounded-lg px-4 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                                        >
                                            <option value="en">English (West)</option>
                                            <option value="ar">العربية (East)</option>
                                        </select>
                                    </div>
                                </section>

                                <section className="bg-cyan-500/5 p-5 rounded-2xl border border-cyan-500/10 text-start">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                                        <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">{t('settings.general.neural_link')}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed italic">
                                        {t('settings.general.encryption_note')}
                                    </p>
                                </section>
                            </div>
                        )}

                        {/* ═══ PERSONALIZATION TAB ═══ */}
                        {activeTab === 'personalization' && (
                            <div className="space-y-6">
                                <section className="bg-black/40 p-1 rounded-2xl border border-white/5 overflow-hidden">
                                    <AuraCustomizer />
                                </section>
                            </div>
                        )}

                        {/* ═══ AI ENGINE TAB ═══ */}
                        {activeTab === 'ai' && (
                            <div className="space-y-6">
                                <section className="bg-black/40 p-6 rounded-2xl border border-white/5">
                                    <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                                        <Brain size={14} /> {t('settings.ai.provider')}
                                    </h2>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { id: 'local', name: 'LM Studio', sub: t('settings.ai.local_sub') },
                                            { id: 'google', name: 'Google Gemini', sub: t('settings.ai.google_sub') }
                                        ].map(provider => (
                                            <button
                                                key={provider.id}
                                                onClick={() => setSettings({ ...settings, aiProvider: provider.id })}
                                                className={`p-4 rounded-xl border transition-all text-start ${settings.aiProvider === provider.id
                                                    ? 'bg-cyan-500/10 border-cyan-500/40 text-white shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                                                    : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'
                                                    }`}
                                            >
                                                <div className="font-bold text-sm mb-1">{provider.name}</div>
                                                <div className="text-[9px] opacity-60 font-mono uppercase">{provider.sub}</div>
                                            </button>
                                        ))}
                                    </div>
                                </section>

                                <section className="bg-black/40 p-6 rounded-2xl border border-white/5">
                                    <h2 className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                                        <Shield size={14} /> {t('settings.ai.vault')}
                                    </h2>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 ms-1">{t('settings.ai.endpoint_label')}</label>
                                            <input
                                                type="text"
                                                value={settings.localUrl}
                                                onChange={(e) => setSettings({ ...settings, localUrl: e.target.value })}
                                                placeholder="http://127.0.0.1:1234/v1"
                                                className="w-full bg-slate-900/50 border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-cyan-500/50 transition-all font-mono placeholder-slate-700"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 ms-1">{t('settings.ai.gemini_label')}</label>
                                            <input
                                                type="password"
                                                value={settings.secrets.geminiKey}
                                                onChange={(e) => setSettings({ ...settings, secrets: { ...settings.secrets, geminiKey: e.target.value } })}
                                                placeholder="AIza..."
                                                className="w-full bg-slate-900/50 border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-rose-500/50 transition-all font-mono placeholder-slate-700"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 ms-1">{t('settings.ai.github_label')}</label>
                                            <input
                                                type="password"
                                                value={settings.secrets.githubToken}
                                                onChange={(e) => setSettings({ ...settings, secrets: { ...settings.secrets, githubToken: e.target.value } })}
                                                placeholder="ghp_..."
                                                className="w-full bg-slate-900/50 border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-rose-500/50 transition-all font-mono placeholder-slate-700"
                                            />
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* ═══ THERMAL SENTINEL TAB ═══ */}
                        {activeTab === 'thermal' && (
                            <div className="space-y-6">
                                {/* Live Gauges */}
                                <div className="grid grid-cols-2 gap-4">
                                    <TempGauge
                                        label={t('settings.thermal.gauges.cpu')}
                                        temp={thermalStatus?.latest?.cpuTemp || 0}
                                        max={cpuMax}
                                        icon={Cpu}
                                        t={t}
                                        systemLanguage={systemLanguage}
                                    />
                                    <TempGauge
                                        label={thermalStatus?.latest?.gpuName || t('settings.thermal.gauges.gpu')}
                                        temp={thermalStatus?.latest?.gpuTemp || 0}
                                        max={gpuMax}
                                        icon={Activity}
                                        t={t}
                                        systemLanguage={systemLanguage}
                                    />
                                </div>

                                {/* Controls */}
                                <section className="bg-black/40 p-6 rounded-2xl border border-white/5">
                                    <div className="flex items-center justify-between mb-5">
                                        <h2 className="text-xs font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2">
                                            <Thermometer size={14} /> {t('settings.thermal.controls')}
                                        </h2>
                                        {thermalStatus?.isRunning ? (
                                            <button
                                                onClick={handleThermalStop}
                                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-[10px] font-bold hover:bg-red-500/30 transition-all"
                                            >
                                                <Square className="w-3 h-3" /> {t('settings.thermal.stop')}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleThermalStart}
                                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold hover:bg-emerald-500/30 transition-all"
                                            >
                                                <Play className="w-3 h-3" /> {t('settings.thermal.start')}
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-5">
                                        <ThresholdSlider
                                            label={t('settings.thermal.cpu_max')}
                                            value={cpuMax}
                                            min={50}
                                            max={100}
                                            onChange={setCpuMax}
                                            color="amber"
                                        />
                                        <ThresholdSlider
                                            label={t('settings.thermal.gpu_max')}
                                            value={gpuMax}
                                            min={50}
                                            max={95}
                                            onChange={setGpuMax}
                                            color="red"
                                        />
                                        <button
                                            onClick={handleSaveThresholds}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500/20 border border-orange-500/30 text-orange-300 text-[10px] font-bold rounded-lg hover:bg-orange-500/30 transition-all"
                                        >
                                            <Sliders className="w-3 h-3" /> {t('settings.thermal.save_thresholds')}
                                        </button>
                                    </div>
                                </section>

                                {/* Status Info */}
                                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 text-[10px] text-gray-500 font-mono space-y-1 text-start">
                                    <p>{t('settings.thermal.status')}: <span className={thermalStatus?.isRunning ? 'text-emerald-400' : 'text-gray-400'}>{thermalStatus?.isRunning ? t('settings.daemons.status_running') : t('settings.daemons.status_idle')}</span></p>
                                    <p>{t('settings.thermal.poll_interval')}: {(thermalStatus?.pollMs || 5000) / 1000}s</p>
                                    <p>{t('settings.thermal.last_reading')}: {thermalStatus?.latest?.timestamp || 'N/A'}</p>
                                </div>
                            </div>
                        )}

                        {/* ═══ DAEMONS TAB ═══ */}
                        {activeTab === 'daemons' && (
                            <div className="space-y-6">
                                {/* Animus Daemon */}
                                <section className="bg-black/40 p-6 rounded-2xl border border-white/5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                            <Dna size={14} /> {t('settings.daemons.animus_title')}
                                        </h2>
                                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold border ${animusStatus?.isDaemonRunning
                                            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                            : 'text-gray-500 border-white/10 bg-white/5'
                                            }`}>
                                            {animusStatus?.isDaemonRunning ? t('settings.daemons.status_running') : t('settings.daemons.status_idle')}
                                        </span>
                                    </div>
                                    {animusStatus?.stats && (
                                        <div className="grid grid-cols-4 gap-3">
                                            {[
                                                { labelKey: 'settings.daemons.stats.scanned', value: animusStatus.stats.scanned, color: 'text-gray-300' },
                                                { labelKey: 'settings.daemons.stats.evolved', value: animusStatus.stats.evolved, color: 'text-emerald-400' },
                                                { labelKey: 'settings.daemons.stats.queued', value: animusStatus.stats.queued, color: 'text-yellow-400' },
                                                { labelKey: 'settings.daemons.stats.injected', value: animusStatus.stats.injected, color: 'text-cyan-400' },
                                            ].map(s => (
                                                <div key={s.labelKey} className="bg-white/5 rounded-xl p-3 text-center">
                                                    <div className={`text-lg font-black tabular-nums ${s.color}`}>{s.value}</div>
                                                    <div className="text-[9px] text-gray-500 uppercase tracking-widest mt-1">{t(s.labelKey)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {!animusStatus && <p className="text-xs text-gray-600 italic">Animus status unavailable.</p>}
                                </section>

                                {/* Architect Daemon */}
                                <section className="bg-black/40 p-6 rounded-2xl border border-white/5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xs font-bold text-violet-400 uppercase tracking-widest flex items-center gap-2">
                                            <Zap size={14} /> {t('settings.daemons.architect_title')}
                                        </h2>
                                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold border ${architectStatus?.isRunning
                                            ? 'text-violet-400 border-violet-500/30 bg-violet-500/10'
                                            : 'text-gray-500 border-white/10 bg-white/5'
                                            }`}>
                                            {architectStatus?.isRunning ? t('settings.daemons.status_running') : t('settings.daemons.status_idle')}
                                        </span>
                                    </div>
                                    {architectStatus?.currentIdea ? (
                                        <div className="bg-white/5 rounded-xl p-4 text-start">
                                            <p className="text-xs text-white font-medium">{architectStatus.currentIdea.title || 'Current Idea'}</p>
                                            <p className="text-[10px] text-gray-500 mt-1">{architectStatus.currentIdea.description || 'No description'}</p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-600 italic text-start">{t('settings.daemons.no_idea')}</p>
                                    )}
                                </section>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
