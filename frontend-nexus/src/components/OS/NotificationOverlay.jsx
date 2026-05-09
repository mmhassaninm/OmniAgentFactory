import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

const NotificationOverlay = () => {
    const [notifications, setNotifications] = useState([]);

    useEffect(() => {
        if (window.nexusAPI) {
            window.nexusAPI.receive('os:notification', (payload) => {
                const id = Date.now();
                setNotifications(prev => [...prev, { ...payload, id }]);

                // Auto-dismiss after 5 seconds
                setTimeout(() => {
                    setNotifications(prev => prev.filter(n => n.id !== id));
                }, 5000);
            });
        }
    }, []);

    const getIcon = (type) => {
        switch (type) {
            case 'success': return <CheckCircle2 className="text-emerald-500" size={20} />;
            case 'error': return <AlertCircle className="text-red-500" size={20} />;
            default: return <Info className="text-blue-500" size={20} />;
        }
    };

    return (
        <div className="absolute top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
            <AnimatePresence>
                {notifications.map(notif => (
                    <motion.div
                        key={notif.id}
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl border border-slate-700 shadow-2xl rounded-xl p-4 flex items-start gap-4 min-w-[300px] cursor-pointer"
                        onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                    >
                        <div className="mt-0.5">
                            {getIcon(notif.type)}
                        </div>
                        <div className="flex-1">
                            <h4 className="text-sm font-semibold text-slate-200">{notif.title}</h4>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{notif.message}</p>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

export default NotificationOverlay;
