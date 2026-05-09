import React from 'react';
import {
    LayoutDashboard,
    ShieldCheck,
    MessagesSquare,
    Settings,
    Terminal,
    LogOut
} from 'lucide-react';

const Sidebar = ({ activeView, setActiveView }) => {
    const navItems = [
        { id: 'admin', icon: LayoutDashboard, label: 'Dashboard' },
        { id: 'vault', icon: ShieldCheck, label: 'Vault' },
        { id: 'chat', icon: MessagesSquare, label: 'Messages' },
        { id: 'monitor', icon: Terminal, label: 'System' },
        { id: 'settings', icon: Settings, label: 'Settings' }
    ];

    return (
        <aside className="w-64 h-full bg-[#050505] border-r border-white/5 flex flex-col z-50">
            {/* Sidebar Header */}
            <div className="p-6 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)] flex items-center justify-center">
                    <Terminal size={18} className="text-black" />
                </div>
                <span className="text-lg font-bold tracking-wider text-white">NEXUS<span className="text-cyan-400">OS</span></span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 mt-4 px-4 space-y-2">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveView(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${isActive
                                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                }`}
                        >
                            <Icon
                                size={20}
                                className={`transition-transform duration-300 group-hover:scale-110 ${isActive ? 'text-cyan-400' : ''}`}
                            />
                            <span className="font-medium">{item.label}</span>
                            {isActive && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Bottom Section */}
            <div className="p-4 border-t border-white/5">
                <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all duration-300 group"
                    onClick={() => window.nexusAPI?.invoke('os:quit')}
                >
                    <LogOut size={20} />
                    <span className="font-medium">Shutdown</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
