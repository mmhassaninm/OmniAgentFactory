import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronRight, Settings, Terminal, Globe, Shield, MessagesSquare, Sparkles, Activity, ShieldAlert, ShieldCheck, Flame, Dna, Lightbulb, Image, Zap, Brain, Cpu, User, Power, LogOut, Folder, Palette, FileCode2, Fingerprint, HardDrive, BookOpen, Languages, RefreshCw } from 'lucide-react';
import { useOSStore } from '../../store/osStore';

const MOCK_APPS = [
    { id: 'cortex', nameKey: 'apps.cortex', icon: Sparkles, color: 'text-cyan-400' },
    { id: 'ai-control', nameKey: 'apps.ai_control', icon: Activity, color: 'text-violet-400' },
    { id: 'monitor', nameKey: 'apps.monitor', icon: Activity, color: 'text-emerald-400' },
    { id: 'neural-hub', nameKey: 'apps.neural_hub', icon: Brain, color: 'text-cyan-400' },
    { id: 'sentinel-viewer', nameKey: 'apps.sentinel_viewer', icon: ShieldCheck, color: 'text-rose-400' },
    { id: 'vault', nameKey: 'apps.vault', icon: Shield, color: 'text-yellow-400' },
    { id: 'forge', nameKey: 'apps.forge', icon: Flame, color: 'text-orange-400' },
    { id: 'animus', nameKey: 'apps.animus', icon: Dna, color: 'text-emerald-400' },
    { id: 'architect', nameKey: 'apps.architect', icon: Lightbulb, color: 'text-amber-400' },
    { id: 'pantheon', nameKey: 'apps.pantheon', icon: Image, color: 'text-purple-400' },
    { id: 'explorer', nameKey: 'apps.explorer', icon: Folder, color: 'text-blue-300' },
    { id: 'netguard', nameKey: 'apps.netguard', icon: ShieldAlert, color: 'text-red-400' },
    { id: 'browser', nameKey: 'apps.browser', icon: Globe, color: 'text-blue-400' },
    { id: 'terminal', nameKey: 'apps.terminal', icon: Terminal, color: 'text-green-400' },
    { id: 'aura', nameKey: 'apps.aura', icon: Palette, color: 'text-purple-400' },
    { id: 'nexus-code', nameKey: 'apps.nexus_code', icon: FileCode2, color: 'text-blue-500' },
    { id: 'identity-shield', nameKey: 'apps.identity_shield', icon: Fingerprint, color: 'text-emerald-400' },
    { id: 'nexus-vault', nameKey: 'apps.nexus_vault', icon: HardDrive, color: 'text-purple-400' },
    { id: 'codex', nameKey: 'codex.title', icon: BookOpen, color: 'text-cyan-400' },
    { id: 'translator', nameKey: 'apps.translator', icon: Languages, color: 'text-indigo-400' },
    { id: 'neural-forge', nameKey: 'apps.neural_forge', icon: Brain, color: 'text-purple-400' },
    { id: 'settings', nameKey: 'apps.settings', icon: Settings, color: 'text-gray-400' },
];

export default function StartMenu() {
    const { isStartMenuOpen, closeStartMenu, launchApp, systemLanguage, addNotification } = useOSStore();
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [isPoweringDown, setIsPoweringDown] = useState(false);
    const isRtl = systemLanguage === 'ar';

    const handlePowerAction = async (action) => {
        setIsPoweringDown(true);
        addNotification({
            title: t('os.system_pulse') || 'System Core',
            message: action === 'shutdown' ? (t('os.shutting_down') || 'Initiating Shutdown Sequence...') : (t('os.restarting') || 'Initiating Restart Sequence...'),
            type: 'warning',
            duration: 5000
        });

        try {
            await fetch(`http://localhost:3001/api/power/${action}`, { method: 'POST' });
        } catch (e) {
            console.error('Power action failed:', e);
            setIsPoweringDown(false);
        }
    };

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isStartMenuOpen) {
                closeStartMenu();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isStartMenuOpen, closeStartMenu]);

    if (!isStartMenuOpen) return null;

    const filteredApps = MOCK_APPS.filter(app =>
        t(app.nameKey).toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleAppClick = (app) => {
        launchApp(app.id, t(app.nameKey));
    };

    return (
        <div
            className="w-[400px] z-50 pointer-events-auto glass-panel-premium rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.6)] flex flex-col text-white backdrop-blur-3xl border border-white/10"
            style={{
                position: 'absolute',
                bottom: '80px',
                [isRtl ? 'right' : 'left']: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* ── User Profile Header ─────────────────────────── */}
            <div className={`p-5 bg-gradient-to-r ${isRtl ? 'from-transparent to-slate-900/80' : 'from-slate-900/80 to-transparent'} border-b border-white/5 flex items-center gap-4 relative z-10`}>
                <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center text-white font-bold shadow-[0_0_15px_rgba(6,182,212,0.5)] ring-2 ring-white/10">
                        <User className="w-5 h-5" />
                    </div>
                    <div className={`absolute bottom-0 ${isRtl ? 'left-0' : 'right-0'} w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900`}></div>
                </div>
                <div>
                    <div className="text-sm font-bold text-white tracking-wide">{t('os.admin')}</div>
                    <div className="text-[10px] text-cyan-400 font-mono tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                        {t('os.sys_admin')}
                    </div>
                </div>
            </div>

            {/* ── Search Bar ──────────────────────────────────── */}
            <div className="px-5 pt-4 pb-2 relative z-10">
                <div className="relative">
                    <Search className={`absolute ${isRtl ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500`} />
                    <input
                        type="text"
                        placeholder={t('os.search')}
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={`w-full bg-black/40 border border-white/10 rounded-xl py-2.5 ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'} text-[13px] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all placeholder:text-gray-600 shadow-inner text-white`}
                    />
                </div>
            </div>

            {/* ── Pinned Apps Grid ────────────────────────────── */}
            <div className="flex-1 px-5 pb-3 overflow-y-auto custom-scrollbar relative z-10" style={{ maxHeight: '320px' }}>
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">{t('os.pinned')}</h3>
                <div className="grid grid-cols-4 gap-2">
                    {filteredApps.map((app) => {
                        const Icon = app.icon;
                        return (
                            <button
                                key={app.id}
                                onClick={() => handleAppClick(app)}
                                className="flex flex-col items-center justify-center p-2.5 rounded-xl transition-all duration-300 group hover:bg-white/10 hover:-translate-y-0.5"
                            >
                                <div className={`w-12 h-12 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-center mb-2 shadow-[0_4px_15px_rgba(0,0,0,0.3)] group-hover:shadow-[0_0_20px_rgba(0,243,255,0.1)] group-hover:border-white/15 transition-all ${app.color}`}>
                                    <Icon className="w-5 h-5 drop-shadow-lg" />
                                </div>
                                <span className="text-[10px] font-medium text-gray-400 text-center truncate w-full group-hover:text-white transition-colors capitalize">{t(app.nameKey)}</span>
                            </button>
                        );
                    })}
                </div>
                {filteredApps.length === 0 && (
                    <div className="text-center text-gray-600 mt-10 text-sm">
                        {t('os.no_apps_found', { query: searchQuery })}
                    </div>
                )}
            </div>

            {/* ── System Stats Widget ────────────────────────── */}
            <div className="mx-5 mb-3 p-3 bg-black/30 rounded-xl border border-white/5 space-y-2.5 relative z-10">
                <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                    <span className="flex items-center gap-1.5"><Cpu className="w-3 h-3" /> {t('os.cpu')}</span>
                    <span className="text-cyan-400">12%</span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full bg-cyan-500 w-[12%] shadow-[0_0_10px_#22d3ee] rounded-full transition-all ${isRtl ? 'float-right' : ''}`}></div>
                </div>

                <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                    <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" /> {t('os.memory')}</span>
                    <span className="text-purple-400">34%</span>
                </div>
                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full bg-purple-500 w-[34%] shadow-[0_0_10px_#a855f7] rounded-full transition-all ${isRtl ? 'float-right' : ''}`}></div>
                </div>
            </div>

            {/* ── Power Footer ────────────────────────────────── */}
            <div className="p-4 bg-black/20 border-t border-white/5 flex justify-between items-center relative z-10 rounded-b-2xl">
                <span className="text-[10px] text-gray-600 font-mono">NexusOS v2.0</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handlePowerAction('restart')}
                        disabled={isPoweringDown}
                        className="flex items-center justify-center p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-500 transition-all group disabled:opacity-50"
                        title={t('os.restart') || 'Restart System'}
                    >
                        <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                    </button>
                    <button
                        onClick={() => handlePowerAction('shutdown')}
                        disabled={isPoweringDown}
                        className="flex items-center justify-center p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 transition-all group disabled:opacity-50"
                        title={t('os.shutdown') || 'Shutdown System'}
                    >
                        <Power className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
}


