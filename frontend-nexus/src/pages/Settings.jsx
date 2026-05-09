import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Cpu, Shield, Palette, Layout, Save, Terminal, Bell, Globe } from 'lucide-react';
import { useOSStore } from '../store/osStore';

const SettingCategory = ({ icon: Icon, title, active, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${active
            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
            : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
            }`}
    >
        <Icon size={18} className={active ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400'} />
        <span className="font-bold tracking-tight uppercase text-[11px]">{title}</span>
    </button>
);

const SettingItem = ({ label, description, children }) => (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group">
        <div className="flex flex-col gap-1">
            <span className="text-slate-200 font-bold tracking-tight">{label}</span>
            <span className="text-slate-500 text-[11px] font-medium">{description}</span>
        </div>
        <div className="min-w-[120px] flex justify-end">
            {children}
        </div>
    </div>
);

export default function Settings() {
    const { systemLanguage, setSystemLanguage, availableModels, activeModel, setActiveModel, fetchModels } = useOSStore();
    const [activeTab, setActiveTab] = useState('ai');
    const [isGhostActive, setIsGhostActive] = useState(false);
    const isRtl = systemLanguage === 'ar';

    React.useEffect(() => {
        fetchModels();
        // Check initial Ghost dev status
        fetch('http://localhost:3001/api/ghost/status')
            .then(res => res.json())
            .then(data => setIsGhostActive(data.running))
            .catch(console.error);
    }, [fetchModels]);

    const toggleGhostDev = async () => {
        try {
            const endpoint = isGhostActive ? '/api/ghost/stop' : '/api/ghost/start';
            const res = await fetch(`http://localhost:3001${endpoint}`, { method: 'POST' });
            if (res.ok) {
                setIsGhostActive(!isGhostActive);
            }
        } catch (err) {
            console.error('Ghost toggle failed:', err);
        }
    };

    return (
        <div className={`flex h-full w-full bg-[#050810] text-slate-300 font-mono selection:bg-cyan-500/30 overflow-hidden ${isRtl ? 'rtl' : 'ltr'}`}>
            {/* HUD Left Sidebar */}
            <div className="w-64 border-r border-white/5 bg-black/40 backdrop-blur-3xl p-6 flex flex-col gap-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <SettingsIcon size={24} className="text-cyan-500" />
                        <h1 className="text-white font-black tracking-widest uppercase text-lg">System</h1>
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter ml-9">Kernel Config v4.0.2</div>
                </div>

                <div className="flex flex-col gap-2">
                    <SettingCategory icon={Cpu} title="Neural Link" active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} />
                    <SettingCategory icon={Shield} title="Cyber Security" active={activeTab === 'security'} onClick={() => setActiveTab('security')} />
                    <SettingCategory icon={Palette} title="Aesthetics" active={activeTab === 'ui'} onClick={() => setActiveTab('ui')} />
                    <SettingCategory icon={Globe} title="Localization" active={activeTab === 'os'} onClick={() => setActiveTab('os')} />
                </div>

                <div className="mt-auto p-4 rounded-2xl border border-cyan-500/10 bg-cyan-500/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Terminal size={12} className="text-cyan-400" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-widest">Uplink Status</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[9px] text-emerald-400 font-black">STABLE_ENCRYPTED</span>
                    </div>
                </div>
            </div>

            {/* Main Configuration Panel */}
            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-[radial-gradient(circle_at_50%_0%,_rgba(6,182,212,0.05)_0%,_transparent_50%)]">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="max-w-3xl mx-auto space-y-10"
                >
                    {activeTab === 'ai' && (
                        <div className="space-y-6">
                            <div className="flex items-end justify-between mb-8">
                                <div>
                                    <h2 className="text-3xl font-black text-white tracking-tighter">Neural Link Configuration</h2>
                                    <p className="text-slate-500 mt-2">Manage autonomous agents and inference engine parameters.</p>
                                </div>
                                <button className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 text-black font-black text-[12px] uppercase tracking-widest hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                                    <Save size={16} /> Sync Config
                                </button>
                            </div>

                            <div className="grid gap-4">
                                <SettingItem label="Primary Intelligence Model" description="Select the core reasoning engine for complex logic.">
                                    <select
                                        value={activeModel || ''}
                                        onChange={(e) => setActiveModel(e.target.value)}
                                        className="bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-cyan-400 focus:outline-none focus:border-cyan-500/50 max-w-[200px]"
                                    >
                                        {availableModels.length > 0 ? (
                                            availableModels.map(model => (
                                                <option key={model.id} value={model.id}>{model.id.split('/').pop()}</option>
                                            ))
                                        ) : (
                                            <option>LM Studio API Offline</option>
                                        )}
                                    </select>
                                </SettingItem>

                                <SettingItem label="Agentic Self-Healing" description="Allow Sentinel to autonomously patch UI syntax errors.">
                                    <div className="w-12 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/50 relative cursor-pointer p-1">
                                        <div className="w-4 h-4 rounded-full bg-emerald-400 translate-x-6 transition-transform"></div>
                                    </div>
                                </SettingItem>

                                <SettingItem label="VRAM Management" description="Automatically unload idle models to save GPU resources.">
                                    <div className="w-12 h-6 rounded-full bg-white/5 border border-white/10 relative cursor-pointer p-1">
                                        <div className="w-4 h-4 rounded-full bg-slate-500 transition-transform"></div>
                                    </div>
                                </SettingItem>

                                <SettingItem label="Ghost Developer (Vision AI)" description="Continuously scan screen for code errors and push notifications. (Uses Vision Model)">
                                    <div
                                        onClick={toggleGhostDev}
                                        className={`w-12 h-6 rounded-full border relative cursor-pointer p-1 transition-colors ${isGhostActive ? 'bg-cyan-500/20 border-cyan-500/50' : 'bg-white/5 border-white/10'}`}
                                    >
                                        <div className={`w-4 h-4 rounded-full transition-transform ${isGhostActive ? 'bg-cyan-400 translate-x-6 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-slate-500 translate-x-0'}`}></div>
                                    </div>
                                </SettingItem>
                            </div>
                        </div>
                    )}

                    {activeTab === 'os' && (
                        <div className="space-y-6">
                            <div className="mb-8">
                                <h2 className="text-3xl font-black text-white tracking-tighter">Localization Registry</h2>
                                <p className="text-slate-500 mt-2">Set the global operating system language and region context.</p>
                            </div>

                            <div className="grid gap-4">
                                <SettingItem label="System Language" description="Changes the primary UI and AI response language.">
                                    <div className="flex items-center gap-2 bg-slate-900 border border-white/10 rounded-xl p-1">
                                        <button
                                            onClick={() => setSystemLanguage('en')}
                                            className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all ${systemLanguage === 'en' ? 'bg-cyan-500 text-black' : 'text-slate-500 hover:text-white'}`}
                                        >
                                            English
                                        </button>
                                        <button
                                            onClick={() => setSystemLanguage('ar')}
                                            className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all ${systemLanguage === 'ar' ? 'bg-cyan-500 text-black' : 'text-slate-500 hover:text-white'}`}
                                        >
                                            العربية
                                        </button>
                                    </div>
                                </SettingItem>

                                <SettingItem label="RTL Compatibility" description="Force Right-to-Left layout for Arabic support.">
                                    <span className="text-[10px] font-black text-cyan-500 bg-cyan-500/10 px-3 py-1 rounded-full uppercase">Auto-Detected</span>
                                </SettingItem>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}

