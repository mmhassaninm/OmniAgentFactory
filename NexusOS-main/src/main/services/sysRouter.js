const { ipcMain } = require('electron');

class Router {
    constructor() {
        this.handlers = new Map();
    }

    // Register a new IPC Service Domain
    register(domain, handlers) {
        this.handlers.set(domain, handlers);

        // Bind all handlers to ipcMain
        Object.entries(handlers).forEach(([endpoint, func]) => {
            if (typeof func === 'function') {
                const channel = domain + ':' + endpoint;

                // Phase 31.5: Prevent duplicate handler errors during Hot Reloads
                ipcMain.removeHandler(channel);
                ipcMain.handle(channel, async (event, ...args) => {
                    try {
                        return await func(...args);
                    } catch (error) {
                        console.error('[IPC Error] ' + channel + ':', error);
                        // Return standardized error object to the renderer
                        return { error: true, message: error.message || 'Internal IPC Service Error' };
                    }
                });
            }
        });

        console.log('[IPC] Registered Domain: ' + domain);
    }
}

const sysRouter = new Router();
module.exports = sysRouter;
