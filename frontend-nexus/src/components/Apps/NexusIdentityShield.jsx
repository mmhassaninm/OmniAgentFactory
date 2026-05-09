import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldAlert, ShieldCheck, Fingerprint, Lock, Cpu, Activity, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOSStore } from '../../store/osStore';

/**
 * Nexus Identity Shield
 * ─────────────────────────────────────────────
 * Evolves legacy BiometricSetup into a 10x visual 3D-styled security dashboard.
 * 
 * Features:
 * - Holographic UI layering (Glassmorphism)
 * - Animated scanning states (Framer Motion)
 * - Simulated biometric validation flow
 */

export default function NexusIdentityShield() {
    const { t } = useTranslation();
    const { systemLanguage, auraColor } = useOSStore();
    const isRtl = systemLanguage === 'ar';

    const [scanState, setScanState] = useState('idle'); // idle, scanning, verified, error
    const [scanProgress, setScanProgress] = useState(0);

    const getColorClass = () => {
        switch (auraColor) {
            case 'cyan': return 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10 shadow-cyan-500/20';
            case 'purple': return 'text-purple-400 border-purple-500/30 bg-purple-500/10 shadow-purple-500/20';
            case 'emerald': return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 shadow-emerald-500/20';
            case 'rose': return 'text-rose-400 border-rose-500/30 bg-rose-500/10 shadow-rose-500/20';
            case 'amber': return 'text-amber-400 border-amber-500/30 bg-amber-500/10 shadow-amber-500/20';
            default: return 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10 shadow-cyan-500/20';
        }
    };

    const auraTheme = getColorClass();

    const handleScan = () => {
        if (scanState === 'scanning') return;
        setScanState('scanning');
        setScanProgress(0);

        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                // Simulate success or error randomly for demonstration
                const isSuccess = Math.random() > 0.2;
                setScanState(isSuccess ? 'verified' : 'error');
            }
            setScanProgress(progress);
        }, 300);
    };

    return (
        <div className="w-full h-full flex items-center justify-center p-6 bg-transparent overflow-hidden">
            {/* Holographic Container */}
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full max-w-2xl bg-black/40 backdrop-blur-3xl border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col md:flex-row gap-8 overflow-hidden"
            >
                {/* Background Grid Protocol */}
                <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"></div>

                {/* Left Panel: Scanner Graphic */}
                <div className="relative z-10 w-full md:w-1/2 flex flex-col items-center justify-center">
                    <div className="relative w-48 h-64 border-2 border-white/10 rounded-2xl flex items-center justify-center overflow-hidden bg-black/50">
                        {/* Scanning Laser */}
                        <AnimatePresence>
                            {scanState === 'scanning' && (
                                <motion.div
                                    initial={{ top: 0 }}
                                    animate={{ top: ['0%', '100%', '0%'] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                    className={`absolute left-0 right-0 h-1 z-20 shadow-[0_0_15px_rgba(var(--color-${auraColor}-500),0.8)] ${auraTheme.split(' ')[2]}`}
                                />
                            )}
                        </AnimatePresence>

                        {/* Core Icon */}
                        <motion.div
                            animate={{
                                scale: scanState === 'scanning' ? [1, 1.1, 1] : 1,
                                filter: scanState === 'scanning' ? 'drop-shadow(0 0 10px rgba(0, 255, 255, 0.5))' : 'none'
                            }}
                            transition={{ duration: 1, repeat: scanState === 'scanning' ? Infinity : 0 }}
                        >
                            {scanState === 'idle' && <Fingerprint size={80} className="text-slate-500" />}
                            {scanState === 'scanning' && <Activity size={80} className={auraTheme.split(' ')[0]} />}
                            {scanState === 'verified' && <UserCheck size={80} className="text-emerald-400" />}
                            {scanState === 'error' && <ShieldAlert size={80} className="text-rose-400" />}
                        </motion.div>

                        {/* Progress Overlay */}
                        {scanState === 'scanning' && (
                            <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 text-center text-[10px] font-mono text-white/70 border-t border-white/10">
                                ANALYZING {(scanProgress).toFixed(0)}%
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Controls & Status */}
                <div className={`relative z-10 w-full md:w-1/2 flex flex-col justify-center ${isRtl ? 'text-right' : 'text-left'}`}>
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 w-fit mb-4 ${isRtl ? 'self-end flex-row-reverse' : ''}`}>
                        <Shield className="w-4 h-4 text-slate-400" />
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-300">Identity Protocol</span>
                    </div>

                    <h2 className="text-3xl font-black text-white mb-2 font-mono tracking-tighter">
                        Nexus Identity
                    </h2>
                    <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                        Secure your local OS session using advanced biometric heuristics and encrypted vault passkeys.
                    </p>

                    {/* Status Readout */}
                    <div className="space-y-3 mb-8">
                        <div className={`flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/40 ${isRtl ? 'flex-row-reverse' : ''}`}>
                            <div className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                <Lock className="w-4 h-4 text-slate-500" />
                                <span className="text-xs text-slate-300 font-medium tracking-wide">Vault Engine</span>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded uppercase">Active</span>
                        </div>
                        <div className={`flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/40 ${isRtl ? 'flex-row-reverse' : ''}`}>
                            <div className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                <Cpu className="w-4 h-4 text-slate-500" />
                                <span className="text-xs text-slate-300 font-medium tracking-wide">Neural Heuristics</span>
                            </div>
                            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded uppercase">Online</span>
                        </div>
                    </div>

                    {/* Action Button */}
                    <button
                        onClick={handleScan}
                        disabled={scanState === 'scanning'}
                        className={`group relative overflow-hidden rounded-xl w-full p-4 border transition-all duration-300
                            ${scanState === 'scanning' ? 'bg-slate-800 border-slate-700 cursor-not-allowed' :
                                scanState === 'verified' ? 'bg-emerald-900/40 border-emerald-500/50 hover:bg-emerald-800/60' :
                                    scanState === 'error' ? 'bg-rose-900/40 border-rose-500/50 hover:bg-rose-800/60' :
                                        `${auraTheme.split(' ')[2]} ${auraTheme.split(' ')[1]} hover:bg-white/10`
                            }
                        `}
                    >
                        {/* Button Glow Effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>

                        <div className={`relative flex items-center justify-center gap-2 font-bold tracking-wider text-sm uppercase ${isRtl ? 'flex-row-reverse' : ''}`}>
                            {scanState === 'idle' && <><Fingerprint size={18} /> Authenticate Session</>}
                            {scanState === 'scanning' && <><Activity size={18} className="animate-spin" /> Processing Matrix...</>}
                            {scanState === 'verified' && <><ShieldCheck size={18} className="text-emerald-300" /> Identity Confirmed</>}
                            {scanState === 'error' && <><ShieldAlert size={18} className="text-rose-300" /> Validation Failed - Retry</>}
                        </div>
                    </button>

                    {/* Error Subtext */}
                    <AnimatePresence>
                        {scanState === 'error' && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mt-4 p-3 border border-rose-500/30 bg-rose-500/10 rounded-lg text-xs text-rose-300 flex items-center gap-2"
                            >
                                <ShieldAlert size={14} /> Biometric mismatch detected. Check sensor alignment.
                            </motion.div>
                        )}
                        {scanState === 'verified' && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mt-4 p-3 border border-emerald-500/30 bg-emerald-500/10 rounded-lg text-xs text-emerald-300 flex items-center gap-2"
                            >
                                <ShieldCheck size={14} /> Vault decrypted. Access granted to Core System.
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
