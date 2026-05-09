import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Bell, Trash2, CheckCircle2, AlertCircle, Info, AlertTriangle, Clock } from 'lucide-react';
import { useOSStore } from '../../store/osStore';

const ICONS = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    error: <AlertCircle className="w-4 h-4 text-red-400" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    info: <Info className="w-4 h-4 text-cyan-400" />
};

export default function NotificationCenter() {
    const { t } = useTranslation();
    const {
        isNotifCenterOpen,
        closeNotifCenter,
        notifications,
        clearNotifications,
        removeNotification,
        systemLanguage
    } = useOSStore();
    const isRtl = systemLanguage === 'ar';

    return (
        <AnimatePresence>
            {isNotifCenterOpen && (
                <>
                    {/* Backdrop for mobile-like dismiss */}
                    <div
                        className="fixed inset-0 z-[60] bg-transparent pointer-events-auto"
                        onClick={closeNotifCenter}
                    />

                    <motion.div
                        initial={{ opacity: 0, x: isRtl ? -400 : 400 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: isRtl ? -400 : 400 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className={`fixed top-3 bottom-20 z-[70] w-80 sm:w-96 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col pointer-events-auto overflow-hidden ${isRtl ? 'left-3' : 'right-3'}`}
                    >
                        {/* Header */}
                        <div className={`flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02] ${isRtl ? 'flex-row-reverse' : ''}`}>
                            <div className={`flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                <Bell className="w-4 h-4 text-cyan-400" />
                                <h2 className="text-sm font-bold text-white tracking-widest uppercase">{t('os.notif_center')}</h2>
                            </div>
                            <div className={`flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                {notifications.length > 0 && (
                                    <button
                                        onClick={clearNotifications}
                                        className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-red-400 transition-colors"
                                        title={t('os.clear_all')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    onClick={closeNotifCenter}
                                    className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Notifications List */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {notifications.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-40 gap-3">
                                    <Bell className="w-12 h-12" />
                                    <p className="text-xs font-bold uppercase tracking-widest">{t('os.no_notifs')}</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <AnimatePresence mode="popLayout">
                                        {notifications.map((notif) => (
                                            <motion.div
                                                key={notif.id}
                                                layout
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                className="group relative bg-white/[0.03] border border-white/5 rounded-xl p-3 hover:bg-white/[0.05] transition-all hover:border-white/10"
                                            >
                                                <div className={`flex items-start gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                                    <div className="mt-1 flex-shrink-0">
                                                        {ICONS[notif.type || 'info']}
                                                    </div>
                                                    <div className={`flex-1 min-w-0 ${isRtl ? 'text-right' : 'text-left'}`}>
                                                        <h4 className="text-[11px] font-bold text-gray-200 truncate">{notif.title}</h4>
                                                        <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                                                            {notif.message}
                                                        </p>
                                                        <div className={`flex items-center gap-1 mt-2 text-[8px] text-gray-600 font-bold uppercase tracking-tighter ${isRtl ? 'flex-row-reverse' : ''}`}>
                                                            <Clock className="w-2.5 h-2.5" />
                                                            {new Date(notif.timestamp).toLocaleTimeString(systemLanguage, { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => removeNotification(notif.id)}
                                                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-all"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
