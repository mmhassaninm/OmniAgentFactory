import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useOSStore } from '../../store/osStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, ChevronDown, ChevronUp, BookOpen, Sparkles, Activity, Folder,
    FileCode2, Globe, Shield, Settings, Palette, Image, Disc3, Terminal,
    Zap, Brain, Flame, Dna, Lightbulb, Fingerprint, HardDrive, ShieldCheck,
    Lock, MousePointer2, MessageSquare, Lightbulb as TipIcon, Info
} from 'lucide-react';

/**
 * NexusOS Codex — Bilingual System Catalog (Phase 62)
 * ─────────────────────────────────────────────────────
 * 10x Evolution of Vibelab's Codex.jsx
 * Features: Category tabs, animated glassmorphism cards,
 *           full i18n via react-i18next, search, tips section
 */

const CODEX_ENTRIES = [
    // ── Applications ──
    { key: 'cortex', category: 'apps', icon: MessageSquare, color: 'text-cyan-400', gradient: 'from-cyan-500/20' },
    { key: 'explorer', category: 'apps', icon: Folder, color: 'text-blue-300', gradient: 'from-blue-500/20' },
    { key: 'nexus_code', category: 'apps', icon: FileCode2, color: 'text-blue-500', gradient: 'from-blue-600/20' },
    { key: 'browser', category: 'apps', icon: Globe, color: 'text-blue-400', gradient: 'from-blue-400/20' },
    { key: 'pantheon', category: 'apps', icon: Image, color: 'text-purple-400', gradient: 'from-purple-500/20' },
    { key: 'media_engine', category: 'apps', icon: Disc3, color: 'text-cyan-400', gradient: 'from-cyan-400/20' },
    { key: 'terminal', category: 'apps', icon: Terminal, color: 'text-green-400', gradient: 'from-green-500/20' },
    { key: 'settings', category: 'apps', icon: Settings, color: 'text-gray-400', gradient: 'from-gray-500/20' },
    { key: 'aura', category: 'apps', icon: Palette, color: 'text-purple-400', gradient: 'from-purple-400/20' },
    { key: 'forge', category: 'apps', icon: Flame, color: 'text-orange-400', gradient: 'from-orange-500/20' },
    // ── Security ──
    { key: 'monitor', category: 'security', icon: Activity, color: 'text-emerald-400', gradient: 'from-emerald-500/20' },
    { key: 'vault', category: 'security', icon: Shield, color: 'text-yellow-400', gradient: 'from-yellow-500/20' },
    { key: 'identity_shield', category: 'security', icon: Fingerprint, color: 'text-emerald-400', gradient: 'from-emerald-400/20' },
    { key: 'nexus_vault', category: 'security', icon: HardDrive, color: 'text-purple-400', gradient: 'from-purple-500/20' },
    { key: 'omnishield', category: 'security', icon: ShieldCheck, color: 'text-emerald-400', gradient: 'from-emerald-500/20' },
    { key: 'lock_screen', category: 'security', icon: Lock, color: 'text-cyan-400', gradient: 'from-cyan-500/20' },
    // ── AI Services ──
    { key: 'prime', category: 'ai', icon: Zap, color: 'text-violet-400', gradient: 'from-violet-500/20' },
    { key: 'animus', category: 'ai', icon: Dna, color: 'text-emerald-400', gradient: 'from-emerald-400/20' },
    { key: 'architect', category: 'ai', icon: Lightbulb, color: 'text-amber-400', gradient: 'from-amber-500/20' },
    { key: 'neural_hub', category: 'ai', icon: Brain, color: 'text-purple-400', gradient: 'from-purple-400/20' },
    // ── System ──
    { key: 'context_menu', category: 'system', icon: MousePointer2, color: 'text-slate-400', gradient: 'from-slate-500/20' },
];

const CATEGORIES = ['all', 'apps', 'security', 'ai', 'system'];

export default function NexusCodex() {
    const { t } = useTranslation();
    const { systemLanguage } = useOSStore();
    const isRtl = systemLanguage === 'ar';

    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [expandedKey, setExpandedKey] = useState(null);

    const filteredEntries = useMemo(() => {
        return CODEX_ENTRIES.filter(entry => {
            const categoryMatch = activeCategory === 'all' || entry.category === activeCategory;
            if (!categoryMatch) return false;
            if (!searchQuery) return true;
            const name = t(`codex.items.${entry.key}.name`, '');
            const desc = t(`codex.items.${entry.key}.desc`, '');
            const q = searchQuery.toLowerCase();
            return name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
        });
    }, [searchQuery, activeCategory, t]);

    return (
        <div className={`flex flex-col h-full bg-[#030810] text-white overflow-hidden ${isRtl ? 'rtl' : 'ltr'}`}>

            {/* ── Header ── */}
            <div className="p-6 pb-0 flex-shrink-0">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse"></div>
                            <div className="w-10 h-10 rounded-xl bg-black border border-cyan-500/30 flex items-center justify-center relative">
                                <BookOpen className="text-cyan-400 w-5 h-5" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-[0.2em] text-white uppercase">{t('codex.title')}</h1>
                            <p className="text-[10px] text-cyan-400/60 uppercase tracking-widest">{t('codex.subtitle')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-600 uppercase">{filteredEntries.length} {isRtl ? 'عنصر' : 'items'}</span>
                    </div>
                </div>

                {/* ── Search Bar ── */}
                <div className="relative mt-4">
                    <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 start-4" />
                    <input
                        type="text"
                        placeholder={t('codex.search_placeholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/60 border border-white/10 rounded-xl py-2.5 text-sm focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all placeholder:text-slate-700 text-white ps-11 pe-4"
                    />
                </div>

                {/* ── Category Tabs ── */}
                <div className="flex gap-2 mt-4 pb-4 border-b border-white/5 overflow-x-auto scrollbar-none">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => { setActiveCategory(cat); setExpandedKey(null); }}
                            className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-200
                                ${activeCategory === cat
                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                                    : 'bg-white/5 text-slate-500 border border-white/5 hover:bg-white/10 hover:text-slate-300'
                                }`}
                        >
                            {t(`codex.categories.${cat}`)}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Entries List ── */}
            <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-3 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                    {filteredEntries.map((entry) => {
                        const Icon = entry.icon;
                        const isExpanded = expandedKey === entry.key;
                        const name = t(`codex.items.${entry.key}.name`);
                        const desc = t(`codex.items.${entry.key}.desc`);
                        const tips = t(`codex.items.${entry.key}.tips`);

                        return (
                            <motion.div
                                key={entry.key}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className={`rounded-2xl border transition-all duration-300 overflow-hidden group
                                    ${isExpanded
                                        ? 'bg-black/60 border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.08)]'
                                        : 'bg-black/30 border-white/5 hover:bg-black/50 hover:border-white/10'
                                    }`}
                            >
                                {/* Card Header */}
                                <button
                                    onClick={() => setExpandedKey(isExpanded ? null : entry.key)}
                                    className="w-full flex items-center gap-4 p-4 text-start focus:outline-none"
                                >
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${entry.gradient} to-transparent border border-white/5 flex items-center justify-center flex-shrink-0 transition-all group-hover:scale-105`}>
                                        <Icon className={`w-5 h-5 ${entry.color} drop-shadow-[0_0_6px_currentColor]`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-bold text-white truncate">{name}</h3>
                                        {!isExpanded && (
                                            <p className="text-[11px] text-slate-500 truncate mt-0.5 leading-snug">{desc}</p>
                                        )}
                                    </div>
                                    <div className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${isExpanded ? 'bg-cyan-500/20' : 'bg-white/5'}`}>
                                        {isExpanded
                                            ? <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                                            : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                        }
                                    </div>
                                </button>

                                {/* Expanded Content */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-4 pb-4 pt-0 space-y-3 text-start">
                                                {/* Description */}
                                                <div className="flex gap-2 items-start">
                                                    <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5 me-2" />
                                                    <p className="text-[13px] text-slate-300 leading-relaxed">{desc}</p>
                                                </div>

                                                {/* Tips Box */}
                                                <div className={`bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-3 flex gap-2 items-start`}>
                                                    <Sparkles className="w-4 h-4 text-cyan-500 flex-shrink-0 mt-0.5 me-2" />
                                                    <div>
                                                        <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-wider block mb-1">
                                                            {isRtl ? 'نصائح' : 'Tips'}
                                                        </span>
                                                        <p className="text-[12px] text-cyan-200/70 leading-relaxed">{tips}</p>
                                                    </div>
                                                </div>

                                                {/* Category Badge */}
                                                <div className="flex items-center gap-2 pt-1">
                                                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border
                                                        ${entry.category === 'apps' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                            entry.category === 'security' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                entry.category === 'ai' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' :
                                                                    'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                                        }`}>
                                                        {t(`codex.categories.${entry.category}`)}
                                                    </span>
                                                    <span className="text-[9px] text-slate-700 font-mono">[{entry.key}]</span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {filteredEntries.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-700">
                        <Search className="w-10 h-10 mb-4 opacity-30" />
                        <p className="text-sm">{isRtl ? 'لا توجد نتائج مطابقة.' : 'No matching results found.'}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
