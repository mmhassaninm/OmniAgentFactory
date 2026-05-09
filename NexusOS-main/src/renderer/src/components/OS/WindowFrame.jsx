import React, { lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOSStore } from '../../store/osStore';
import { useTranslation } from 'react-i18next';

const ChatClient = lazy(() => import('../Apps/ChatClient'));
const GeminiVault = lazy(() => import('../Apps/GeminiVault'));
const SystemMonitor = lazy(() => import('../Apps/SystemMonitor'));
const AdminPanel = lazy(() => import('../Apps/AdminPanel'));
const OSSettings = lazy(() => import('../Apps/Settings'));

const WindowFrame = ({ app }) => {
    const { focusApp, closeApp, systemLanguage } = useOSStore();
    const { t } = useTranslation();
    const isRTL = systemLanguage === 'ar';

    const renderAppContent = () => {
        switch (app.id) {
            case 'chat':
                return (
                    <React.Suspense fallback={
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-black/20">
                            <span className="text-4xl mb-4 animate-pulse">💬</span>
                            <p>{t('apps.chat_loading', { defaultValue: 'Loading Privacy Chat...' })}</p>
                        </div>
                    }>
                        <ChatClient />
                    </React.Suspense>
                );
            case 'vault':
                return (
                    <React.Suspense fallback={
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-black/20">
                            <span className="text-4xl mb-4 animate-pulse text-emerald-500/50">🔐</span>
                            <p>{t('apps.vault_loading', { defaultValue: 'Accessing Gemini Vault...' })}</p>
                        </div>
                    }>
                        <GeminiVault />
                    </React.Suspense>
                );
            case 'monitor':
                return (
                    <React.Suspense fallback={
                        <div className="w-full h-full flex flex-col items-center justify-center text-emerald-500 bg-black/20">
                            <span className="text-4xl mb-4 animate-spin-slow">⚙️</span>
                            <p>{t('apps.monitor_loading', { defaultValue: 'Initializing Telemetry Link...' })}</p>
                        </div>
                    }>
                        <SystemMonitor />
                    </React.Suspense>
                );
            case 'admin':
                return (
                    <React.Suspense fallback={
                        <div className="w-full h-full flex flex-col items-center justify-center text-cyan-500 bg-black/20">
                            <span className="text-4xl mb-4 animate-pulse">🛡️</span>
                            <p>{t('apps.admin_loading', { defaultValue: 'Connecting to Cloud Control Panel...' })}</p>
                        </div>
                    }>
                        <AdminPanel />
                    </React.Suspense>
                );
            case 'settings':
                return (
                    <React.Suspense fallback={
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-black/20">
                            <span className="text-4xl mb-4 animate-spin-slow">⚙️</span>
                            <p>{t('os.settings', { defaultValue: 'Loading Settings...' })}</p>
                        </div>
                    }>
                        <OSSettings />
                    </React.Suspense>
                );
            default:
                return (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-black/20">
                        <span className="text-4xl mb-4">✨</span>
                        <p>{t('apps.app_loading', { defaultValue: 'Loading App Component...' })}</p>
                        <p className="text-emerald-500/50 text-sm mt-2">{app.id}</p>
                    </div>
                );
        }
    };

    return (
        <motion.div
            drag
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onPointerDown={(e) => {
                // Prevent click from propagating to desktop and closing start menu unnecessarily
                e.stopPropagation();
                focusApp(app.id);
            }}
            style={{ zIndex: app.zIndex }}
            className={`absolute top-20 \${isRTL ? 'right-20' : 'left-20'} w-[800px] h-[600px] bg-gray-950/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden \${
        app.isActive ? 'ring-1 ring-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.1)]' : 'brightness-75'
      }`}
        >
            {/* Title Bar - Draggable Handle */}
            <div
                className="h-10 bg-black/40 border-b border-white/5 flex items-center justify-between px-3 cursor-move select-none"
                onPointerDown={(e) => {
                    // Focus the app when clicking the title bar
                    focusApp(app.id);
                }}
            >

                {/* Window Controls (macOS style for sleekness) */}
                <div className={`flex items-center gap-2 \${isRTL ? 'order-1' : 'order-first'}`}>
                    <button
                        onClick={(e) => { e.stopPropagation(); closeApp(app.id); }}
                        className="w-3.5 h-3.5 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-colors group cursor-pointer"
                    >
                        <span className="opacity-0 group-hover:opacity-100 text-[8px] text-red-900 font-bold">✕</span>
                    </button>
                    <button className="w-3.5 h-3.5 rounded-full bg-amber-500/80 hover:bg-amber-500 transition-colors"></button>
                    <button className="w-3.5 h-3.5 rounded-full bg-emerald-500/80 hover:bg-emerald-500 transition-colors"></button>
                </div>

                {/* Title */}
                <div className="flex-1 text-center text-xs font-semibold tracking-wider text-gray-300 pointer-events-none">
                    {app.title}
                </div>

                {/* Placeholder for symmetry */}
                <div className={`w-14 \${isRTL ? 'order-first' : 'order-last'}`}></div>

            </div>

            {/* App Content Area */}
            <div className="flex-1 overflow-auto relative cursor-auto">
                {renderAppContent()}
            </div>
        </motion.div>
    );
};

export default WindowFrame;
