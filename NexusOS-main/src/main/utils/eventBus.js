const { EventEmitter } = require('events');
const { BrowserWindow } = require('electron');
const logger = require('./logger');

class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50); // Increase limit for complex OS orchestrations
        logger.info('NexusOS', 'Global EventBus Initialized.');
    }

    /**
     * Publish an event internally across all Node.js Main Process services
     * @param {string} channel
     * @param {any} payload
     */
    publish(channel, payload) {
        logger.debug('EventBus', `Publishing to internal channel: \${channel}`);
        this.emit(channel, payload);
    }

    /**
     * Subscribe to an internal Node.js event
     * @param {string} channel
     * @param {Function} callback
     */
    subscribe(channel, callback) {
        this.on(channel, callback);
    }

    /**
     * Broadcast an event to all open React Renderer windows (UI)
     * @param {string} channel
     * @param {any} payload
     */
    broadcastToUI(channel, payload) {
        logger.debug('EventBus', `Broadcasting to UI channel: \${channel}`);
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send(channel, payload);
            }
        });
    }

    /**
     * Dispatch an event to a specific Window by its ID
     * @param {number} windowId
     * @param {string} channel
     * @param {any} payload
     */
    sendToWindow(windowId, channel, payload) {
        const win = BrowserWindow.fromId(windowId);
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, payload);
        }
    }
}

// Export as Singleton to share the exact same instance across all services
module.exports = new EventBus();
