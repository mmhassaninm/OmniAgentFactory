import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Wifi, Cpu, HardDrive, Download, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOSStore } from '../../store/osStore';

/**
 * Dynamic Desktop Widgets
 * ─────────────────────────────────────────────
 * Evolved from legacy Nexus Prime absolute-positioned widgets.
 * 
 * Features:
 * - Real-time animated stats (simulated network/CPU load)
 * - Draggable capability
 * - Glassmorphism UI reacting to Aura System
 */

const DRAG_CONSTRAINTS = { top: 0, left: 0, right: 1000, bottom: 600 };

export default function DesktopWidgets() {
    const { t } = useTranslation();
    const { systemLanguage, auraColor } = useOSStore();
    const isRtl = systemLanguage === 'ar';

    const [stats, setStats] = useState({
        cpu: 12,
        ram: 45,
        download: 12.5,
        upload: 4.2
    });

    useEffect(() => {
        const interval = setInterval(() => {
            setStats({
                cpu: Math.floor(Math.random() * 30) + 10,
                ram: Math.floor(Math.random() * 10) + 40,
                download: (Math.random() * 50).toFixed(1),
                upload: (Math.random() * 15).toFixed(1)
            });
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const getColorClass = () => {
        switch (auraColor) {
            case 'cyan': return 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5';
            case 'purple': return 'text-purple-400 border-purple-500/30 bg-purple-500/5';
            case 'emerald': return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
            case 'rose': return 'text-rose-400 border-rose-500/30 bg-rose-500/5';
            case 'amber': return 'text-amber-400 border-amber-500/30 bg-amber-500/5';
            default: return 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5';
        }
    };

    const auraBorder = getColorClass();

    return (
        <div className="absolute inset-0 pointer-events-none z-[5] overflow-hidden p-8">

            {/* System Pulse Indicator (Constitution Phase 57) */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`absolute top-4 ${isRtl ? 'left-1/2 translate-x-1/2' : 'left-1/2 -translate-x-1/2'} flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/5 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.5)]`}
            >
                <div className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono select-none">
                    System Pulse: Stable
                </span>
            </motion.div>

            {/* System Resource Widget */}
            <motion.div
                drag
                dragMomentum={false}
                dragConstraints={DRAG_CONSTRAINTS}
                className={`absolute pointer-events-auto cursor-grab active:cursor-grabbing top-10 ${isRtl ? 'left-10' : 'right-10'} w-64 bg-black/40 backdrop-blur-2xl border border-white/5 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-5`}
            >
                <div className={`flex items-center gap-2 mb-4 border-b border-white/5 pb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <Activity className={`w-4 h-4 ${auraBorder.split(' ')[0]}`} />
                    <span className="text-[11px] font-bold text-white uppercase tracking-widest">{t('apps.widgets.system', { defaultValue: 'System Core' })}</span>
                </div>

                <div className="space-y-4">
                    {/* CPU */}
                    <div>
                        <div className={`flex justify-between text-[10px] text-slate-400 mb-1 uppercase tracking-wider font-bold ${isRtl ? 'flex-row-reverse' : ''}`}>
                            <div className={`flex items-center gap-1.5 ${isRtl ? 'flex-row-reverse' : ''}`}><Cpu className="w-3 h-3" /> CPU</div>
                            <span>{stats.cpu}%</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className={`h-full rounded-full ${auraBorder.split(' ')[2].replace('/5', '')}`}
                                animate={{ width: `${stats.cpu}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                    </div>
                    {/* RAM */}
                    <div>
                        <div className={`flex justify-between text-[10px] text-slate-400 mb-1 uppercase tracking-wider font-bold ${isRtl ? 'flex-row-reverse' : ''}`}>
                            <div className={`flex items-center gap-1.5 ${isRtl ? 'flex-row-reverse' : ''}`}><HardDrive className="w-3 h-3" /> RAM</div>
                            <span>{stats.ram}%</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className={`h-full rounded-full ${auraBorder.split(' ')[2].replace('/5', '')}`}
                                animate={{ width: `${stats.ram}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Network Speed Widget */}
            <motion.div
                drag
                dragMomentum={false}
                dragConstraints={DRAG_CONSTRAINTS}
                className={`absolute pointer-events-auto cursor-grab active:cursor-grabbing top-48 ${isRtl ? 'left-10' : 'right-10'} w-64 bg-black/40 backdrop-blur-2xl border border-white/5 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-5`}
            >
                <div className={`flex items-center gap-2 mb-4 border-b border-white/5 pb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <Wifi className={`w-4 h-4 ${auraBorder.split(' ')[0]}`} />
                    <span className="text-[11px] font-bold text-white uppercase tracking-widest">{t('apps.widgets.network', { defaultValue: 'NetGuard HUD' })}</span>
                </div>

                <div className={`flex items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <div className="flex flex-col items-center">
                        <div className={`flex items-center gap-1 text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1 ${isRtl ? 'flex-row-reverse' : ''}`}>
                            <Download className="w-3 h-3 text-cyan-500" /> {t('apps.widgets.dl', { defaultValue: 'DL' })}
                        </div>
                        <div className="text-xl font-black text-white font-mono tracking-tighter">
                            {stats.download} <span className="text-[10px] text-slate-500 font-sans">MB/s</span>
                        </div>
                    </div>
                    <div className="w-[1px] h-8 bg-white/10"></div>
                    <div className="flex flex-col items-center">
                        <div className={`flex items-center gap-1 text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1 ${isRtl ? 'flex-row-reverse' : ''}`}>
                            <Upload className="w-3 h-3 text-emerald-500" /> {t('apps.widgets.ul', { defaultValue: 'UL' })}
                        </div>
                        <div className="text-xl font-black text-white font-mono tracking-tighter">
                            {stats.upload} <span className="text-[10px] text-slate-500 font-sans">MB/s</span>
                        </div>
                    </div>
                </div>
            </motion.div>

        </div>
    );
}
