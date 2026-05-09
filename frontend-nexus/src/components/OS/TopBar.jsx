import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Server, User } from 'lucide-react';

const TopBar = () => {
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language;

    return (
        <header className="h-16 w-full border-b border-white/5 flex items-center justify-between px-8 bg-[#050505]/50 backdrop-blur-md z-40">
            {/* Left: View Title (Context sensitive) */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 uppercase tracking-widest">
                    <Server size={14} className="text-cyan-500/50" />
                    <span>Kernel v1.0.0 // Boot_Stable</span>
                </div>
            </div>

            {/* Right: Quick Controls */}
            <div className="flex items-center gap-6">
                {/* Language Switcher */}
                <div className="flex items-center gap-2 text-sm text-slate-400 font-medium">
                    <Globe size={16} className="text-cyan-400/70" />
                    <span className="uppercase">{currentLang}</span>
                </div>

                {/* System Status Badge */}
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-xs font-mono text-cyan-400/90 tracking-tighter">OS_SECURE</span>
                </div>

                {/* Profile Placeholder */}
                <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors cursor-pointer">
                    <User size={16} className="text-slate-300" />
                </div>
            </div>
        </header>
    );
};

export default TopBar;
