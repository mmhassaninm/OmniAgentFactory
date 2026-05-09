import React, { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useOSStore } from './store/osStore';
import { useTranslation } from 'react-i18next';

// OS Components
import Taskbar from './components/OS/Taskbar';
import StartMenu from './components/OS/StartMenu';
import WindowFrame from './components/OS/WindowFrame';

export default function App() {
    const { openApps, closeStartMenu, systemLanguage } = useOSStore();
    const { i18n } = useTranslation();

    // Sync language direction with i18n
    useEffect(() => {
        document.documentElement.dir = systemLanguage === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = systemLanguage;
        if (i18n.language !== systemLanguage) {
            i18n.changeLanguage(systemLanguage);
        }
    }, [systemLanguage]);

    // Sync language state with Main process (if Context Bridge available)
    useEffect(() => {
        if (window.nexusAPI) {
            window.nexusAPI.invoke('os:change-language', systemLanguage)
                .catch(err => console.warn('Failed to sync OS Language:', err));

            const unsubFocus = window.nexusAPI.receive('os:focus-app', (appId) => {
                useOSStore.getState().focusApp(appId);
            });

            return () => {
                if (unsubFocus) unsubFocus();
            };
        }
    }, [systemLanguage]);

    return (
        <div
            className="w-full h-full bg-[#050505] bg-cover bg-center overflow-hidden relative font-sans"
            onClick={() => closeStartMenu()}
        >
            {/* Desktop Wallpaper Layer */}
            <div className="absolute inset-0 z-0">
                <div className="w-full h-full bg-gradient-to-br from-gray-950 via-slate-900 to-gray-950" />
            </div>

            {/* Desktop Icons / Empty state */}
            <div className="absolute inset-0 z-10 p-6 pb-14">
                {openApps.length === 0 && (
                    <div className="w-full h-full flex items-center justify-center opacity-30">
                        <div className="text-center">
                            <div className="text-6xl mb-4">🖥️</div>
                            <p className="text-gray-400 text-sm">NexusOS Desktop</p>
                            <p className="text-gray-600 text-xs mt-1">Click the Start Button to launch an app</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Window Layer (Floating App Windows) */}
            <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
                <div className="pointer-events-auto w-full h-full relative">
                    <AnimatePresence>
                        {openApps.map(app => (
                            <WindowFrame key={app.id} app={app} />
                        ))}
                    </AnimatePresence>
                </div>
            </div>

            {/* Start Menu Overlay */}
            <div className="absolute inset-0 z-40 pointer-events-none">
                <div className="pointer-events-auto">
                    <StartMenu />
                </div>
            </div>

            {/* Taskbar (Always on top) */}
            <Taskbar />
        </div>
    );
}
