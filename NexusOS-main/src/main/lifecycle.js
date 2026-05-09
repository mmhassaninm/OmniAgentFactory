const { createMainWindow } = require('./windowManager');
const { BrowserWindow } = require('electron');
const { initIpcRouter } = require('./ipcRouter');
const logger = require('./utils/logger');

function initLifecycle(app) {
    // System Boot Sequence
    app.whenReady().then(() => {
        logger.info('NexusOS', 'System Booting...');
        logger.info('NexusOS', 'Initializing background daemons...');

        // Future Phase: Initialize Smart Backup, Vault Monitor, and AI Services here

        // Initialize Strict IPC Security Channels
        initIpcRouter();

        // Initialize standard OS UI
        logger.info('NexusOS', 'Rendering Desktop Interface...');
        createMainWindow();

        // Phase 13: Boot the Native System Tray
        const trayManager = require('./trayComponent');
        trayManager.init();

        app.on('activate', () => {
            // Re-create window if dock icon is clicked (macOS behavior, kept for cross-platform stability)
            if (BrowserWindow.getAllWindows().length === 0) {
                createMainWindow();
            } else {
                BrowserWindow.getAllWindows()[0].show();
            }
        });
    });

    app.on('window-all-closed', () => {
        logger.info('NexusOS', 'All windows closed.');
        // Phase 13: In NexusOS, closing the window just hides it, you must quit from the tray
        if (process.platform !== 'darwin') {
            // Do nothing, let it run in the background
        }
    });

    app.on('before-quit', () => {
        logger.info('NexusOS', 'Executing Nuclear Cleanup protocols before exit...');
        app.isQuitting = true;

        // Phase 28: Step 5 - Process Extermination & Cleanup
        try {
            const backupDaemon = require('./daemons/backupDaemon');
            backupDaemon.stop();
        } catch (e) { }

        try {
            const vaultMonitor = require('./daemons/vaultMonitor');
            vaultMonitor.stop();
        } catch (e) { }

        try {
            const pythonOrchestrator = require('./pythonOrchestrator');
            pythonOrchestrator.stop();
        } catch (e) { }

        try {
            const db = require('./database/dbConnection');
            if (db.close) db.close();
        } catch (e) { }

        try {
            const profiler = require('./utils/profiler');
            profiler.stop(); // Safe guard just in case memory leak interval needs removal
        } catch (e) { }

        // Ensure graceful shutdown wrapper even if exit isn't fired from Tray menu
        const trayManager = require('./trayComponent');
        if (trayManager.nuclearCleanupAndExit) {
            trayManager.nuclearCleanupAndExit();
        }
    });
}

module.exports = {
    initLifecycle
};
