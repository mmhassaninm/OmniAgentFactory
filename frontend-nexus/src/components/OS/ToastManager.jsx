import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import toastBus from '../../services/toastBus';

/**
 * ============================================================
 *  🔔 ToastManager — Global Glassmorphism Notification System
 * ============================================================
 *  Renders in the bottom-left corner (z-35) of the Desktop.
 *  Subscribes to the toastBus EventBus for incoming toasts.
 *  Also listens for 'os:notification' IPC events from backend.
 *
 *  Features:
 *  - [x] close button on every toast
 *  - Auto-dismiss after 15 seconds (configurable per toast)
 *  - Error toasts persist until manually closed
 *  - Stacks neatly, max 5 visible at once
 * ============================================================
 */

const MAX_VISIBLE = 5;

const ICONS = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    error: <AlertCircle className="w-4 h-4 text-red-400" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    info: <Info className="w-4 h-4 text-cyan-400" />
};

const BORDER_COLORS = {
    success: 'border-emerald-500/30',
    error: 'border-red-500/30',
    warning: 'border-amber-500/30',
    info: 'border-cyan-500/30'
};

const PROGRESS_COLORS = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-cyan-500'
};

export default function ToastManager() {
    const [toasts, setToasts] = useState([]);

    const dismiss = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((toast) => {
        // Add to local visible stack
        setToasts(prev => {
            const next = [...prev, toast];
            return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
        });

        // Sync with Global Action Center history
        useOSStore.getState().addNotification({
            title: toast.title,
            message: toast.message,
            type: toast.type || 'info',
            id: toast.id
        });

        // Auto-dismiss if configured
        if (toast.autoDismissMs && toast.autoDismissMs > 0) {
            setTimeout(() => dismiss(toast.id), toast.autoDismissMs);
        }
    }, [dismiss]);

    // Subscribe to EventBus
    useEffect(() => {
        const unsub = toastBus.subscribe(addToast);
        return unsub;
    }, [addToast]);

    // Also subscribe to backend IPC notifications
    useEffect(() => {
        if (window.nexusAPI && window.nexusAPI.receive) {
            const unsub = window.nexusAPI.receive('os:notification', (payload) => {
                const id = Date.now() + Math.random();
                addToast({
                    id,
                    type: payload.type || 'info',
                    title: payload.title || 'NexusOS',
                    message: payload.message || '',
                    autoDismissMs: 15000,
                    createdAt: Date.now()
                });
            });

            // Phase 51.5: OpenClaw Auto-Sync Alert
            const unsubOpenClaw = window.nexusAPI.receive('openclaw:update-available', (release) => {
                addToast({
                    id: 'openclaw-update',
                    type: 'info',
                    title: `🦞 OpenClaw Update Available: ${release.version}`,
                    message: 'Core stability improvements. Assimilation sequence standing by.',
                    autoDismissMs: 25000,
                    createdAt: Date.now()
                });
            });

            return () => {
                if (unsub) unsub();
                if (unsubOpenClaw) unsubOpenClaw();
            };
        }
    }, [addToast]);

    return (
        <div className="absolute bottom-16 left-4 z-[35] flex flex-col-reverse gap-2 pointer-events-none max-w-[380px]">
            <AnimatePresence>
                {toasts.map(toast => (
                    <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
                ))}
            </AnimatePresence>
        </div>
    );
}

function Toast({ toast, onDismiss }) {
    const [progressWidth, setProgressWidth] = useState(100);

    // Progress bar animation
    useEffect(() => {
        if (!toast.autoDismissMs || toast.autoDismissMs <= 0) return;
        // Start the shrink
        const frame = requestAnimationFrame(() => setProgressWidth(0));
        return () => cancelAnimationFrame(frame);
    }, [toast.autoDismissMs]);

    const type = toast.type || 'info';

    return (
        <motion.div
            initial={{ opacity: 0, x: -60, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -60, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={`pointer-events-auto bg-black/80 backdrop-blur-2xl border ${BORDER_COLORS[type]} rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-hidden`}
        >
            <div className="flex items-start gap-3 p-3 pr-2">
                <div className="mt-0.5 flex-shrink-0">{ICONS[type]}</div>
                <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-white truncate">{toast.title}</h4>
                    {toast.message && (
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed line-clamp-3">{toast.message}</p>
                    )}
                </div>
                <button
                    onClick={() => onDismiss(toast.id)}
                    className="p-1 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors flex-shrink-0"
                    aria-label="Close notification"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Auto-dismiss progress bar */}
            {toast.autoDismissMs > 0 && (
                <div className="h-[2px] bg-white/5">
                    <div
                        className={`h-full ${PROGRESS_COLORS[type]} transition-all ease-linear`}
                        style={{
                            width: `${progressWidth}%`,
                            transitionDuration: `${toast.autoDismissMs}ms`
                        }}
                    />
                </div>
            )}
        </motion.div>
    );
}
