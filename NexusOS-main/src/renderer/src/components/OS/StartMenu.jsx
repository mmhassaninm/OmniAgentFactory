import React from 'react';
import { useOSStore } from '../../store/osStore';
import { useTranslation } from 'react-i18next';

const StartMenu = () => {
    const { isStartMenuOpen, launchApp, systemLanguage } = useOSStore();
    const { t } = useTranslation();

    if (!isStartMenuOpen) return null;

    const apps = [
        { id: 'chat', title: t('apps.chat'), icon: '💬' },
        { id: 'monitor', title: t('apps.monitor'), icon: '📊' },
        { id: 'vault', title: t('apps.vault'), icon: '🔐' },
        { id: 'admin', title: t('apps.admin', { defaultValue: systemLanguage === 'en' ? 'Cloud Control' : 'لوحة الكلاود' }), icon: '☁️' },
        { id: 'settings', title: t('os.settings', { defaultValue: systemLanguage === 'en' ? 'Settings' : 'الإعدادات' }), icon: '⚙️' },
    ];

    return (
        <div className="fixed bottom-[72px] left-6 w-[400px] h-[500px] bg-gray-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden z-50 transform origin-bottom-left animate-in fade-in slide-in-from-bottom-5 duration-200">

            {/* Search Bar */}
            <div className="p-4 border-b border-white/10">
                <div className="relative">
                    <input
                        type="text"
                        placeholder={t('os.search')}
                        className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                </div>
            </div>

            {/* Pinned Apps Grid */}
            <div className="flex-1 p-6">
                <h3 className="text-xs font-semibold text-gray-400 mb-4 uppercase tracking-wider">
                    {t('os.pinned')}
                </h3>
                <div className="grid grid-cols-4 gap-4">
                    {apps.map((app) => (
                        <button
                            key={app.id}
                            onClick={() => launchApp(app.id, app.title)}
                            className="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-white/10 transition-colors group cursor-pointer"
                        >
                            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-inner">
                                {app.icon}
                            </div>
                            <span className="text-xs text-gray-300 font-medium truncate w-full text-center">
                                {app.title}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Footer / Power Options */}
            <div className="h-14 mt-auto bg-black/40 border-t border-white/5 flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500"></div>
                    <span className="text-sm font-medium text-gray-200">Admin</span>
                </div>
                <button className="text-gray-400 hover:text-red-400 transition-colors cursor-pointer" title={t('os.shutdown')}>
                    ⏻
                </button>
            </div>

        </div>
    );
};

export default StartMenu;
