import React, { useState, useEffect } from 'react';
import { useOSStore } from '../../store/osStore';
import { useTranslation } from 'react-i18next';

const Taskbar = () => {
    const { toggleStartMenu, openApps, focusApp, systemLanguage } = useOSStore();
    const { t } = useTranslation();
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const timeString = time.toLocaleTimeString(systemLanguage === 'en' ? 'en-US' : 'ar-EG', {
        hour: '2-digit', minute: '2-digit'
    });

    return (
        <div className="fixed bottom-0 left-0 w-full h-12 bg-gray-950/80 backdrop-blur-xl border-t border-white/10 flex items-center justify-between px-2 z-50">

            {/* Start Button & Pinned Apps */}
            <div className="flex items-center h-full gap-2 overflow-hidden">
                <button
                    onClick={toggleStartMenu}
                    className="h-10 w-10 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors cursor-pointer group"
                    title={t('os.start_menu')}
                >
                    <div className="w-5 h-5 bg-gradient-to-tr from-emerald-400 to-cyan-500 rounded-[4px] group-hover:shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all"></div>
                </button>

                <div className="w-px h-6 bg-white/10 mx-1"></div>

                {/* Running Apps Strip */}
                <div className="flex items-center gap-1 h-full">
                    {openApps.map((app) => (
                        <button
                            key={app.id}
                            onClick={() => focusApp(app.id)}
                            className={`px-3 h-10 flex items-center justify-center rounded-md transition-all cursor-pointer min-w-[120px] max-w-[160px] truncate \${
                app.isActive 
                  ? 'bg-white/15 border-b-2 border-emerald-400 text-white' 
                  : 'hover:bg-white/5 text-gray-400 hover:text-gray-200'
              }`}
                        >
                            <span className="truncate text-sm font-medium">{app.title}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* System Tray & Clock */}
            <div className="flex items-center h-full gap-2 pe-2">
                <div
                    className="flex items-center gap-3 px-3 h-10 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                    title={systemLanguage === 'en' ? 'System Telemetry Active' : 'المراقب يعمل'}
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs text-gray-300 font-medium tracking-wide">
                        {timeString}
                    </span>
                </div>
            </div>

        </div>
    );
};

export default Taskbar;
