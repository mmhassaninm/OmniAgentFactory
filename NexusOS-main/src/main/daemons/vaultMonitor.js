const path = require('path');
const { app, BrowserWindow } = require('electron');
const logger = require('../utils/logger');
const eventBus = require('../utils/eventBus');

let chokidar;

class VaultMonitor {
    constructor() {
        this.watcher = null;
        this.vaultPath = path.join(app.getPath('documents'), 'Nexus_Vault');
    }

    async init() {
        logger.info('VaultMonitor', `Initializing Secure Vault Watcher at: ${this.vaultPath}`);

        try {
            // Phase 28: Step 1 - ESM Normalization
            const chokidarModule = await import('chokidar');
            chokidar = chokidarModule.default || chokidarModule;

            // Initialize watcher with Chokidar
            this.watcher = chokidar.watch(this.vaultPath, {
                ignored: /(^|[\\\/])\../, // ignore dotfiles
                persistent: true,
                depth: 99
            });

            this.watcher
                .on('add', filePath => this.notifySync('added', filePath))
                .on('change', filePath => this.notifySync('changed', filePath))
                .on('unlink', filePath => this.notifySync('removed', filePath))
                .on('error', error => logger.error('VaultMonitor', `Watcher error`, error));

            logger.info('VaultMonitor', 'Chokidar daemon active and monitoring.');
        } catch (error) {
            logger.error('VaultMonitor', 'Failed to initialize Chokidar', error.stack);
        }
    }

    notifySync(event, filePath) {
        logger.debug('VaultMonitor', `Event: ${event} at ${filePath}`);

        // Dispatch visual sync indicator via EventBus rather than looping manually
        eventBus.broadcastToUI('vault:sync-status', {
            event,
            file: path.basename(filePath),
            timestamp: Date.now()
        });
    }

    stop() {
        if (this.watcher) {
            this.watcher.close().then(() => logger.info('VaultMonitor', 'Watcher terminated.'));
        }
    }
}

module.exports = new VaultMonitor();
