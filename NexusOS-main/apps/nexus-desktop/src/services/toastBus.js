/**
 * ============================================================
 *  🔔 NexusOS Global Toast Event Bus
 * ============================================================
 *  A simple publish-subscribe event emitter for firing toast
 *  notifications from ANY component or service in the app.
 *
 *  Usage:
 *    import toastBus from '../../services/toastBus';
 *    toastBus.success('Title', 'Message');
 *    toastBus.error('Title', 'Message');
 *    toastBus.info('Title', 'Message');
 * ============================================================
 */

const listeners = new Set();

const toastBus = {
    /** Subscribe to toast events. Returns unsubscribe function. */
    subscribe(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
    },

    /** Emit a toast notification. */
    emit(toast) {
        const payload = {
            id: Date.now() + Math.random(),
            createdAt: Date.now(),
            autoDismissMs: 15000,
            ...toast
        };
        listeners.forEach(cb => cb(payload));
    },

    /** Convenience methods */
    success(title, message, options = {}) {
        this.emit({ type: 'success', title, message, ...options });
    },
    error(title, message, options = {}) {
        this.emit({ type: 'error', title, message, autoDismissMs: 0, ...options });
    },
    info(title, message, options = {}) {
        this.emit({ type: 'info', title, message, ...options });
    },
    warning(title, message, options = {}) {
        this.emit({ type: 'warning', title, message, ...options });
    }
};

export default toastBus;
