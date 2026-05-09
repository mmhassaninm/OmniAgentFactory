import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, Battery, Volume2, Globe, Terminal, Settings, Lock, Sparkles, Activity, ShieldCheck, Menu, Eye, Palette, Bell, BellOff } from 'lucide-react';
import { useOSStore } from '../../store/osStore';
import nexusBridge from '../../services/bridge';

// ── NexusOrb (Legacy Nexus-Prime Start Button) ────────────────
const NexusOrb = ({ onClick, isActive }) => (
    <div
        onClick={onClick}
        className="relative group w-11 h-11 flex items-center justify-center flex-shrink-0 cursor-pointer"
    >
        {/* Glow Aura */}
        <div className={`absolute inset-0 rounded-full blur-md transition-all duration-500 ${isActive ? 'bg-cyan-500/40 scale-125' : 'bg-cyan-500/15 opacity-0 group-hover:opacity-100 group-hover:scale-110'}`}></div>
        {/* Orb Body */}
        <div className={`relative w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${isActive ? 'ring-2 ring-cyan-400/50 shadow-[0_0_20px_rgba(6,182,212,0.5)]' : 'border border-white/20'}`}>
            <div className="w-3 h-3 bg-white/90 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
        </div>
    </div>
);

export default function Taskbar() {
    const { toggleStartMenu, isStartMenuOpen, toggleNotifCenter, isNotifCenterOpen, notifications, openApps, focusApp, activeAppId, securityLevel, setSecurityLevel, systemLanguage } = useOSStore();
    const { t, i18n } = useTranslation();
    const [time, setTime] = useState(new Date());
    const [showPulseHUD, setShowPulseHUD] = useState(false);
    const [healthStats, setHealthStats] = useState({ total: 0, pending: 0, healing: 0, resolved: 0, failed: 0 });
    const isRtl = systemLanguage === 'ar';

    // Threat Oracle State
    const [oraclePrediction, setOraclePrediction] = useState(null);
    const [showOraclePopup, setShowOraclePopup] = useState(false);

    // Fetch Threat Oracle prediction
    useEffect(() => {
        const fetchOracle = () => {
            nexusBridge.invoke('oracle:get-prediction', {})
                .then(pred => { if (pred) setOraclePrediction(pred); })
                .catch(() => { });
        };
        fetchOracle();
        const oracleTimer = setInterval(fetchOracle, 60000);
        return () => clearInterval(oracleTimer);
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch live health stats from EventLogger
    useEffect(() => {
        if (showPulseHUD) {
            nexusBridge.invoke('events:stats', {})
                .then(stats => setHealthStats(stats || healthStats))
                .catch(err => console.error('[Taskbar] Stats fetch failed:', err));
        }
    }, [showPulseHUD]);

    // Aura Configuration
    const auraStyles = {
        standard: 'border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_60px_rgba(6,182,212,0.08)]',
        secure: 'border-emerald-500/20 shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_60px_rgba(16,185,129,0.15)]',
        ghost: 'border-purple-500/20 shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_60px_rgba(168,85,247,0.15)]'
    };

    const pulseColors = {
        standard: 'bg-cyan-400',
        secure: 'bg-emerald-400',
        ghost: 'bg-purple-400'
    };

    const timeString = time.toLocaleTimeString(systemLanguage, { hour: '2-digit', minute: '2-digit' });
    const dateString = time.toLocaleDateString(systemLanguage, { month: 'short', day: 'numeric', year: 'numeric' });

    // Helper map for app icons
    const iconMap = {
        'browser': Globe,
        'terminal': Terminal,
        'settings': Settings,
        'cortex': Sparkles,
        'vault': Lock,
        'aura': Palette,
        'default': Menu
    };

    return (
        <div
            className={`absolute bottom-3 left-3 right-3 h-14 bg-slate-900/60 backdrop-blur-2xl rounded-2xl border flex items-center justify-between px-2 z-50 text-white transition-all duration-700 ${auraStyles[securityLevel] || auraStyles.standard}`}
            onClick={(e) => e.stopPropagation()}
        >

            {/* Start Button & Running Apps Section */}
            <div className={`flex items-center h-full gap-1.5 z-10 overflow-hidden`}>
                {/* NexusOrb Start Button */}
                <NexusOrb
                    onClick={(e) => { e.stopPropagation(); toggleStartMenu(); }}
                    isActive={isStartMenuOpen}
                />

                {/* Divider */}
                <div className="w-[1px] h-8 bg-white/10 mx-1 flex-shrink-0"></div>

                {/* Running Apps */}
                <div className={`flex items-center h-full gap-1 px-1 overflow-hidden`}>
                    {openApps.map(app => {
                        const Icon = iconMap[app.id] || iconMap['default'];
                        const isActive = app.id === activeAppId;
                        // Derive translation key from ID
                        const nameKey = `apps.${app.id.replace(/-/g, '_')}`;
                        return (
                            <button
                                key={app.id}
                                onClick={() => focusApp(app.id)}
                                className={`h-10 px-3 flex items-center gap-2 rounded-lg transition-all duration-300 relative group min-w-[100px] max-w-[170px]
                                    ${isActive ? 'bg-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'hover:bg-white/5'}
                                `}
                            >
                                <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-300 ${isActive ? 'text-cyan-400 drop-shadow-[0_0_5px_rgba(0,243,255,0.5)]' : 'text-slate-400 group-hover:text-slate-200'}`} />
                                <span className={`text-xs font-medium tracking-wide truncate transition-colors ${isActive ? 'text-cyan-100' : 'text-slate-500 group-hover:text-slate-200'}`}>
                                    {t(nameKey, { defaultValue: app.title })}
                                </span>

                                {/* Active Indicator Dot */}
                                <div className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-full transition-all duration-300 ${isActive ? 'w-1.5 h-1.5 bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'w-1 h-1 bg-white/20 scale-0 group-hover:scale-100'}`}></div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* System Tray Section */}
            <div className={`flex items-center h-full gap-2 z-10 px-1`}>
                {/* System Pulse & Tray Icons */}
                <div
                    className={`flex items-center gap-3 px-3 h-10 rounded-lg hover:bg-white/5 transition-colors relative group cursor-pointer`}
                    onClick={() => setShowPulseHUD(!showPulseHUD)}
                >
                    {/* System Pulse */}
                    <div className="flex items-center relative">
                        <div className={`w-2 h-2 rounded-full animate-pulse transition-all duration-700 ${healthStats.failed > 0 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]' : (pulseColors[securityLevel] + ' shadow-[0_0_10px_rgba(0,243,255,0.5)]')}`}></div>
                        <div className={`absolute -inset-1 rounded-full animate-ping opacity-20 ${healthStats.failed > 0 ? 'bg-red-500' : pulseColors[securityLevel]}`}></div>
                    </div>

                    <div className="w-[1px] h-5 bg-white/10 flex-shrink-0"></div>

                    {/* Notification Bell */}
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleNotifCenter(); }}
                        className="relative p-1 rounded-lg hover:bg-white/10 transition-colors group/bell"
                        title={t('os.notif_center')}
                    >
                        {notifications.length > 0 ? (
                            <Bell className={`w-[14px] h-[14px] transition-colors ${isNotifCenterOpen ? 'text-cyan-400' : 'text-slate-400 group-hover/bell:text-white'}`} />
                        ) : (
                            <BellOff className="w-[14px] h-[14px] text-slate-600" />
                        )}
                        {notifications.length > 0 && !isNotifCenterOpen && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-slate-900 animate-pulse"></span>
                        )}
                    </button>

                    <Wifi className="w-[14px] h-[14px] text-slate-400" />
                    <Volume2 className="w-[14px] h-[14px] text-slate-400" />
                    <Battery className="w-[14px] h-[14px] text-slate-400" />

                    {/* Threat Oracle Badge */}
                    <div className="relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowOraclePopup(!showOraclePopup); }}
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black transition-all cursor-pointer border
                                ${oraclePrediction?.threat_level === 'CRITICAL'
                                    ? 'bg-red-500/30 border-red-500/50 text-red-400 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                                    : oraclePrediction?.threat_level === 'MEDIUM'
                                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                                        : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'}
                            `}
                            title={t('os.threat_oracle')}
                        >
                            <Eye className="w-[10px] h-[10px]" />
                        </button>
                        {showOraclePopup && (
                            <div className={`absolute bottom-[calc(100%+12px)] ${isRtl ? 'left-0' : 'right-0'} w-72 bg-black/85 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl z-50 pointer-events-auto`} onClick={(e) => e.stopPropagation()}>
                                <div className={`flex items-center gap-2 mb-3 border-b border-white/5 pb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <Eye className="w-4 h-4 text-cyan-400" />
                                    <span className="text-[11px] font-bold tracking-widest uppercase text-white">{t('os.threat_oracle')}</span>
                                    <span className={`${isRtl ? 'mr-auto' : 'ml-auto'} text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider
                                        ${oraclePrediction?.threat_level === 'CRITICAL' ? 'bg-red-500/20 text-red-400'
                                            : oraclePrediction?.threat_level === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400'
                                                : 'bg-emerald-500/20 text-emerald-400'}
                                    `}>{oraclePrediction?.threat_level || t('os.context.standard').toUpperCase()}</span>
                                </div>
                                <div className="space-y-2">
                                    <div className={`text-[11px] text-slate-300 leading-relaxed ${isRtl ? 'text-right' : ''}`}>
                                        {oraclePrediction?.prediction || 'Waiting for first analysis cycle...'}
                                    </div>
                                    {oraclePrediction?.recommended_action && (
                                        <div className={`text-[10px] text-cyan-400/80 bg-cyan-500/5 rounded-lg p-2 border border-cyan-500/10 ${isRtl ? 'text-right' : ''}`}>
                                            <span className="font-bold">{t('os.action')}:</span> {oraclePrediction.recommended_action}
                                        </div>
                                    )}
                                    {oraclePrediction?.timestamp && (
                                        <div className={`text-[9px] text-slate-600 ${isRtl ? 'text-left' : 'text-right'}`}>
                                            {t('os.last_scan')}: {new Date(oraclePrediction.timestamp).toLocaleTimeString(systemLanguage)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Pulse Diagnostic HUD */}
                    {showPulseHUD ? (
                        <div className={`absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2 w-64 bg-black/80 backdrop-blur-[20px] border border-white/10 rounded-2xl p-4 shadow-2xl animate-in z-50 pointer-events-auto`} onClick={(e) => e.stopPropagation()}>
                            <div className={`flex items-center gap-2 mb-3 border-b border-white/5 pb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                <Activity className="w-4 h-4 text-cyan-400" />
                                <span className="text-[11px] font-bold tracking-widest uppercase text-white">{t('os.system_pulse')}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                                    <div className="text-[9px] text-gray-500 uppercase font-bold mb-1 text-center">{t('os.stability')}</div>
                                    <div className="text-xs font-bold text-cyan-400 flex items-center justify-center gap-1">
                                        <ShieldCheck className="w-3 h-3" /> {healthStats.failed === 0 ? '100%' : t('os.critical')}
                                    </div>
                                </div>
                                <div className="p-2 bg-white/5 rounded-xl border border-white/5 text-center">
                                    <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">{t('os.total_logs')}</div>
                                    <div className="text-xs font-bold text-white tracking-widest">{healthStats.total}</div>
                                </div>
                            </div>
                            <div className="space-y-1.5 pt-1">
                                <div className={`flex justify-between text-[10px] ${isRtl ? 'flex-row-reverse' : ''}`}><span className="text-gray-400">{t('os.healed')}</span><span className="text-cyan-400 font-bold">{healthStats.resolved}</span></div>
                                <div className={`flex justify-between text-[10px] ${isRtl ? 'flex-row-reverse' : ''}`}><span className="text-gray-400">{t('os.loops')}</span><span className="text-blue-400 font-bold">{healthStats.healing}</span></div>
                                <div className={`flex justify-between text-[10px] ${isRtl ? 'flex-row-reverse' : ''}`}><span className="text-gray-400">{t('os.critical')}</span><span className={`font-bold ${healthStats.failed > 0 ? 'text-red-500 animate-pulse' : 'text-gray-600'}`}>{healthStats.failed}</span></div>
                            </div>

                            {/* Security Aura Toggles */}
                            <div className="mt-4 pt-3 border-t border-white/5">
                                <div className={`flex items-center gap-2 mb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <ShieldCheck className="w-3 h-3 text-gray-400" />
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{t('os.aura_sync')}</span>
                                </div>
                                <div className={`flex gap-1.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    {['standard', 'secure', 'ghost'].map(level => (
                                        <button
                                            key={level}
                                            onClick={(e) => { e.stopPropagation(); setSecurityLevel(level); }}
                                            className={`flex-1 py-1 rounded-md text-[8px] font-bold uppercase transition-all
                                                ${securityLevel === level
                                                    ? 'bg-white/20 text-white border border-white/20'
                                                    : 'bg-white/5 text-gray-500 hover:text-gray-300'
                                                }
                                            `}
                                        >
                                            {t(`os.context.${level}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 backdrop-blur-md border border-white/10 rounded text-[10px] text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                            {t('os.system_pulse')}: {healthStats.failed > 0 ? t('os.critical') : t('os.context.stable')}
                        </div>
                    )}
                </div>

                <div className="w-[1px] h-8 bg-white/10 flex-shrink-0"></div>

                {/* Date/Time */}
                <div className={`flex flex-col ${isRtl ? 'items-start' : 'items-end'} justify-center px-3 h-10 rounded-lg hover:bg-white/5 transition-colors ${isRtl ? 'text-left' : 'text-right'}`}>
                    <span className="text-[13px] font-semibold tracking-wider text-gray-100">{timeString}</span>
                    <span className="text-[10px] text-gray-500 font-medium">{dateString}</span>
                </div>

                {/* Show Desktop Button */}
                <div className={`w-[5px] h-full ${isRtl ? 'border-r rounded-l-2xl pr-1' : 'border-l rounded-r-2xl ml-1'} border-white/10 hover:bg-white/20 transition-all`}></div>
            </div>
        </div>
    );
}


