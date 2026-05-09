import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Fingerprint, ScanEye, KeyRound, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOSStore } from '../../store/osStore';

/**
 * Aegis Authentication Gateway (Zero-Trust Lock Screen)
 * ────────────────────────────────────────────────────────
 * Hyper-Evolved from legacy Nexus Prime Login.jsx & BiometricSetup.jsx
 * This operates as the entry gateway to NexusOS Desktop.
 */

export default function AegisLockScreen() {
    const { t } = useTranslation();
    const { login, systemLanguage, auraColor } = useOSStore();
    const isRtl = systemLanguage === 'ar';

    const [passcode, setPasscode] = useState('');
    const [agentId, setAgentId] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [authStatus, setAuthStatus] = useState('IDLE'); // IDLE, SCANNING, SUCCESS, FAILED
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getColorClass = () => {
        switch (auraColor) {
            case 'cyan': return 'text-cyan-400 border-cyan-500 bg-cyan-500/10';
            case 'purple': return 'text-purple-400 border-purple-500 bg-purple-500/10';
            case 'emerald': return 'text-emerald-400 border-emerald-500 bg-emerald-500/10';
            case 'rose': return 'text-rose-400 border-rose-500 bg-rose-500/10';
            case 'amber': return 'text-amber-400 border-amber-500 bg-amber-500/10';
            default: return 'text-cyan-400 border-cyan-500 bg-cyan-500/10';
        }
    };
    const activeColor = getColorClass();

    const handleLogin = (e) => {
        e?.preventDefault();
        if (!agentId || !passcode) {
            setAuthStatus('FAILED');
            setTimeout(() => setAuthStatus('IDLE'), 2000);
            return;
        }

        setAuthStatus('SCANNING');
        // Simulate complex bio-metric and cryptographic handshake
        setTimeout(() => {
            if (passcode === 'nexus2026') {
                setAuthStatus('SUCCESS');
                setTimeout(() => login(agentId), 1500);
            } else {
                setAuthStatus('FAILED');
                setTimeout(() => setAuthStatus('IDLE'), 2000);
            }
        }, 2000);
    };

    const triggerBiometric = () => {
        // Simulated Fingerprint/WebAuthn flow
        if (!agentId) {
            setAgentId('Admin'); // Auto-assume admin if direct bio is touched
        }
        setIsScanning(true);
        setAuthStatus('SCANNING');
        setTimeout(() => {
            setIsScanning(false);
            setAuthStatus('SUCCESS');
            setTimeout(() => login(agentId || 'Admin'), 1000);
        }, 2500);
    };

    return (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center overflow-hidden bg-[#020617] font-sans select-none">

            {/* Dynamic Abstract Background mimicking the Lock Screen Environment */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-0 left-0 w-full h-full nexus-wallpaper opacity-40 mix-blend-screen overflow-hidden"></div>
                <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 transition-all duration-1000 ${authStatus === 'FAILED' ? 'bg-red-500' : authStatus === 'SUCCESS' ? 'bg-green-500' : activeColor.split(' ')[0].replace('text-', 'bg-')}`}></div>
            </div>

            {/* Time & Date Header */}
            <div className="absolute top-16 left-0 right-0 z-10 flex flex-col items-center">
                <motion.div
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="text-7xl font-light text-white tracking-widest drop-shadow-2xl"
                >
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </motion.div>
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
                    className="text-lg text-white/50 uppercase tracking-[0.3em] font-medium mt-2"
                >
                    {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                </motion.div>
            </div>

            {/* Central Authentication Glass Panel */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className={`relative z-10 w-full max-w-sm rounded-[2.5rem] p-8 glass-panel-premium border-y border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-all duration-300 ${authStatus === 'FAILED' ? 'ring-2 ring-red-500/50 shadow-red-500/20' : authStatus === 'SUCCESS' ? 'ring-2 ring-emerald-500/50 shadow-emerald-500/20' : 'ring-1 ring-white/10'}`}
            >
                {/* Status Indicator Orb */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                    <div className="relative">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center p-1 backdrop-blur-xl border z-20 transition-colors duration-500 ${authStatus === 'FAILED' ? 'bg-red-500/20 border-red-500 text-red-400' : authStatus === 'SUCCESS' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-black/50 border-white/20 text-white'}`}>
                            {authStatus === 'SCANNING' ? <ScanEye className="w-5 h-5 animate-pulse" /> :
                                authStatus === 'FAILED' ? <Lock className="w-5 h-5" /> :
                                    authStatus === 'SUCCESS' ? <Lock className="w-5 h-5" /> :
                                        <Lock className="w-5 h-5 opacity-70" />}
                        </div>
                        {authStatus === 'SCANNING' && (
                            <motion.div
                                className={`absolute inset-0 rounded-full border-2 border-dashed ${activeColor.split(' ')[0]} z-10`}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                            />
                        )}
                        {/* Glow Behind Orb */}
                        <div className={`absolute inset-0 rounded-full blur-xl z-0 ${authStatus === 'FAILED' ? 'bg-red-500/50' : authStatus === 'SUCCESS' ? 'bg-emerald-500/50' : ''}`} />
                    </div>
                </div>

                <div className="text-center mt-6 mb-8">
                    <h2 className="text-xl font-bold text-white tracking-wider">{t('auth.title', { defaultValue: 'OMNISHIELD GATEWAY' })}</h2>
                    <p className="text-xs text-white/40 uppercase tracking-[0.2em] mt-1">{t('auth.subtitle', { defaultValue: 'Unified Protection Active' })}</p>
                </div>

                <AnimatePresence mode="wait">
                    {authStatus === 'SUCCESS' ? (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center py-8"
                        >
                            <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/50 mb-4 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                                <ScanEye className="w-10 h-10 text-emerald-400" />
                            </div>
                            <span className="text-emerald-400 font-mono tracking-widest uppercase text-sm">{t('auth.authorized', { defaultValue: 'IDENTITY VERIFIED' })}</span>
                        </motion.div>
                    ) : (
                        <motion.form
                            key="form"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onSubmit={handleLogin}
                            className={`flex flex-col gap-4 ${isRtl ? 'text-right' : 'text-left'}`}
                        >
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-widest text-white/50 font-semibold px-2">{t('auth.agent_id', { defaultValue: 'Agent Identity' })}</label>
                                <div className="relative group">
                                    <input
                                        type="text"
                                        value={agentId}
                                        onChange={(e) => setAgentId(e.target.value)}
                                        disabled={authStatus !== 'IDLE'}
                                        placeholder="IDENTIFIER"
                                        className={`w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-all font-mono group-hover:bg-white/5 ${isRtl ? 'pr-4 pl-10' : 'pl-4 pr-10'}`}
                                        autoFocus
                                    />
                                    <ScanEye className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-3' : 'right-3'} w-4 h-4 text-white/20`} />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-widest text-white/50 font-semibold px-2">{t('auth.passcode', { defaultValue: 'Secure Passcode' })}</label>
                                <div className="relative group">
                                    <input
                                        type="password"
                                        value={passcode}
                                        onChange={(e) => setPasscode(e.target.value)}
                                        disabled={authStatus !== 'IDLE'}
                                        placeholder="••••••••"
                                        className={`w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-all font-mono tracking-[0.2em] group-hover:bg-white/5 ${isRtl ? 'pr-4 pl-10' : 'pl-4 pr-10'}`}
                                    />
                                    <KeyRound className={`absolute top-1/2 -translate-y-1/2 ${isRtl ? 'left-3' : 'right-3'} w-4 h-4 text-white/20`} />
                                </div>
                            </div>

                            {authStatus === 'FAILED' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                    className="text-[10px] text-center text-red-400 font-mono py-1"
                                >
                                    ⚠ {t('auth.failed', { defaultValue: 'INVALID CREDENTIALS OR BIO-SIGNATURE' })}
                                </motion.div>
                            )}

                            <div className="flex items-center gap-3 mt-4">
                                <button
                                    type="button"
                                    onClick={triggerBiometric}
                                    disabled={authStatus !== 'IDLE'}
                                    className={`flex items-center justify-center p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group ${activeColor.split(' ')[0]}`}
                                    title="Initiate Biometric Scan"
                                >
                                    <Fingerprint className={`w-5 h-5 transition-transform ${isScanning ? 'animate-pulse scale-110' : 'group-hover:scale-110'}`} />
                                </button>

                                <button
                                    type="submit"
                                    disabled={authStatus !== 'IDLE'}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase tracking-widest text-white transition-all overflow-hidden relative group border ${activeColor.split(' ')[1]} ${activeColor.split(' ')[2]}`}
                                >
                                    {/* Neon Button Glow Layer */}
                                    <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] skew-x-12 ${authStatus === 'IDLE' ? 'group-hover:animate-shine' : ''}`} />

                                    {authStatus === 'SCANNING' ? (
                                        <span className="animate-pulse">{t('auth.processing', { defaultValue: 'VERIFYING...' })}</span>
                                    ) : (
                                        <>
                                            {t('auth.submit', { defaultValue: 'INITIALIZE' })}
                                            <ArrowRight className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.form>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Footer Status Line */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center text-[10px] text-white/30 font-mono tracking-widest uppercase">
                <div className="flex items-center gap-4">
                    <span>SYS: ONLINE</span>
                    <span className="w-1 h-1 rounded-full bg-white/30"></span>
                    <span>NET: SECURE</span>
                    <span className="w-1 h-1 rounded-full bg-white/30"></span>
                    <span>ENC: AES-256</span>
                </div>
            </div>

            {/* Simulated Hint */}
            {authStatus === 'IDLE' && (
                <div className="absolute bottom-4 text-[9px] text-white/20">Try 'Admin' / 'nexus2026' or Biometric</div>
            )}
        </div>
    );
}
