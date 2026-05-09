import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sparkles, Check, Palette } from 'lucide-react';
import { useOSStore } from '../../store/osStore';

const COLORS = [
    { id: 'cyan', nameKey: 'settings.personalization.colors.cyan', hex: '#00f3ff', glow: 'shadow-[0_0_20px_rgba(0,243,255,0.4)]' },
    { id: 'purple', nameKey: 'settings.personalization.colors.purple', hex: '#bc13fe', glow: 'shadow-[0_0_20px_rgba(188,19,254,0.4)]' },
    { id: 'emerald', nameKey: 'settings.personalization.colors.emerald', hex: '#10b981', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.4)]' },
    { id: 'rose', nameKey: 'settings.personalization.colors.rose', hex: '#f43f5e', glow: 'shadow-[0_0_20px_rgba(244,63,94,0.4)]' },
    { id: 'amber', nameKey: 'settings.personalization.colors.amber', hex: '#f59e0b', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.4)]' },
];

export default function AuraCustomizer() {
    const { t } = useTranslation();
    const { auraColor, setAuraColor, systemLanguage } = useOSStore();
    const isRtl = systemLanguage === 'ar';

    return (
        <div className="w-full h-full p-6 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md overflow-hidden">
            <div className="max-w-md w-full bg-[#050510]/80 border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                {/* Background Ambient Glow */}
                <div className={`absolute -top-24 -left-24 w-48 h-48 rounded-full opacity-20 blur-3xl transition-colors duration-700 bg-[var(--neon-primary)]`} />
                <div className={`absolute -bottom-24 -right-24 w-48 h-48 rounded-full opacity-20 blur-3xl transition-colors duration-700 bg-[var(--neon-primary)]`} />

                <div className="relative z-10 flex flex-col items-center">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-6 group transition-all">
                        <Palette className="w-8 h-8 text-[var(--neon-primary)] drop-shadow-[0_0_10px_var(--neon-glow)] transition-all" />
                    </div>

                    <h2 className="text-2xl font-black text-white tracking-tighter mb-2">{t('settings.personalization.aura')}</h2>
                    <p className="text-gray-500 text-xs font-mono uppercase tracking-widest mb-8">{t('settings.personalization.luminance')}</p>

                    <div className={`grid grid-cols-5 gap-4 w-full mb-10 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        {COLORS.map((color) => (
                            <button
                                key={color.id}
                                onClick={() => setAuraColor(color.id)}
                                className={`group relative flex flex-col items-center gap-2 outline-none`}
                            >
                                <div
                                    className={`w-12 h-12 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${auraColor === color.id
                                        ? 'border-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                                        : 'border-transparent hover:scale-105 opacity-60 hover:opacity-100'
                                        }`}
                                    style={{ backgroundColor: color.hex, boxShadow: auraColor === color.id ? `0 0 25px ${color.hex}66` : 'none' }}
                                >
                                    {auraColor === color.id && <Check className="w-5 h-5 text-white drop-shadow-md" />}
                                </div>
                                <span className={`text-[8px] font-bold uppercase tracking-tighter transition-colors ${auraColor === color.id ? 'text-white' : 'text-gray-600'}`}>
                                    {t(color.nameKey)}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8" />

                    <div className="w-full space-y-4">
                        <div className={`flex items-center justify-between px-4 py-3 bg-white/5 border border-white/5 rounded-2xl group hover:border-white/10 transition-all ${isRtl ? 'flex-row-reverse' : ''}`}>
                            <div className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                <Sparkles className="w-4 h-4 text-cyan-400" />
                                <span className="text-xs font-bold text-gray-300">{t('settings.personalization.sync')}</span>
                            </div>
                            <div className="w-10 h-5 bg-white/10 rounded-full relative cursor-pointer">
                                <div className={`absolute ${isRtl ? 'right-1' : 'left-1'} top-1 w-3 h-3 bg-white rounded-full shadow-sm`} />
                            </div>
                        </div>
                    </div>

                    <p className="mt-8 text-[9px] text-gray-600 font-mono italic text-center max-w-[200px]">
                        {t('settings.personalization.instant_apply')}
                    </p>
                </div>
            </div>
        </div>
    );
}
