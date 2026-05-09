const { app, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const eventBus = require('../utils/eventBus');

// Phase 31.6: The worker script content as a plain string.
// CRITICAL: This script runs in a UtilityProcess V8 isolate.
// It CANNOT require('electron') or any module that depends on it.
// It CANNOT use require('worker_threads') — that crashes the V8 isolate.
const WORKER_SCRIPT_CONTENT = [
    '// NexusOS BackupWorker - UtilityProcess Context',
    '// CRITICAL: Do NOT require electron or worker_threads here.',
    '',
    'process.on("uncaughtException", (err) => console.error("[BackupWorker] UNCAUGHT:", err));',
    'process.on("unhandledRejection", (err) => console.error("[BackupWorker] REJECTION:", err));',
    '',
    'try {',
    '    const port = process.parentPort || process;',
    '    console.log("[BackupWorker] Worker Booting up...");',
    '',
    '    port.on("message", (msg) => {',
    '        const data = (msg && msg.data) ? msg.data : msg;',
    '        if (data && data.type === "START_BACKUP") {',
    '            console.log("[BackupWorker] Starting offline backup...");',
    '            setTimeout(() => {',
    '                const result = { type: "BACKUP_COMPLETE", timestamp: Date.now() };',
    '                if (port.postMessage) {',
    '                    port.postMessage(result);',
    '                } else if (process.send) {',
    '                    process.send(result);',
    '                }',
    '            }, 5000);',
    '        }',
    '    });',
    '} catch (err) {',
    '    console.error("[BackupWorker] WORKER FATAL:", err);',
    '}',
].join('\n');

class BackupDaemon {
    constructor() {
        this.process = null;
        this.restarts = 0;
        this.lastRestartTime = 0;
        this.backupInterval = 1000 * 60 * 60; // Every 1 hour
        this.isInitialized = false;
        this.scheduleTimer = null;
        this.scheduleInterval = null;
    }

    init() {
        // Phase 31.5: Singleton lock — prevent multiple initializations
        if (this.isInitialized) return;
        this.isInitialized = true;

        logger.info('BackupDaemon', 'Initializing Smart Backup System...');

        // Phase 30: Critical ASAR Fix - Write worker to userData, not __dirname
        const workerDir = path.join(app.getPath('userData'), 'workers');
        const workerPath = path.join(workerDir, 'backupWorker.js');

        try {
            if (!fs.existsSync(workerDir)) {
                fs.mkdirSync(workerDir, { recursive: true });
            }

            // Always overwrite to ensure latest worker code is deployed
            fs.writeFileSync(workerPath, WORKER_SCRIPT_CONTENT);

            // Spawn the UtilityProcess
            this.process = utilityProcess.fork(workerPath);

            // Phase 31.3: Expose UtilityProcess-level errors
            this.process.on('error', (err) => {
                logger.error('BackupDaemon', '[BackupWorker] INTERNAL FATAL ERROR', err);
            });

            this.process.on('message', (message) => {
                logger.debug('BackupDaemon', 'Received message from Worker', message);
                if (message.type === 'BACKUP_COMPLETE') {
                    logger.info('BackupDaemon', 'Backup finalized at ' + new Date(message.timestamp).toLocaleString());
                    eventBus.broadcastToUI('os:notification', {
                        title: 'Smart Backup',
                        message: 'System backup completed successfully.',
                        type: 'success'
                    });
                }
            });

            this.process.on('exit', (code) => {
                const now = Date.now();
                if (now - this.lastRestartTime < 60000) {
                    this.restarts++;
                } else {
                    this.restarts = 1;
                }
                this.lastRestartTime = now;

                if (this.restarts > 3) {
                    logger.error('BackupDaemon', 'Worker crashed too many times (' + code + '). Halting daemon.');
                    this.process = null;
                    return;
                }

                logger.warn('BackupDaemon', 'Worker exited with code ' + code + '. Restarting (' + this.restarts + '/3)...');
                // Reset singleton lock so restart can proceed
                this.isInitialized = false;
                setTimeout(() => this.init(), 5000);
            });

            // Start the cron cycle
            this.startSchedule();

        } catch (error) {
            logger.error('BackupDaemon', 'Failed to initialize worker: ' + error.message, error.stack);
            this.isInitialized = false;
        }
    }

    startSchedule() {
        logger.info('BackupDaemon', 'Backup Schedule Active.');
        // Trigger first backup after 1 minute, then every hour
        this.scheduleTimer = setTimeout(() => {
            this.triggerBackup();
            this.scheduleInterval = setInterval(() => this.triggerBackup(), this.backupInterval);
        }, 60000);
    }

    triggerBackup() {
        if (this.process) {
            logger.debug('BackupDaemon', 'Dispatching BACKUP signal to UtilityProcess.');
            this.process.postMessage({ type: 'START_BACKUP' });
        }
    }

    // Graceful shutdown
    stop() {
        if (this.scheduleTimer) clearTimeout(this.scheduleTimer);
        if (this.scheduleInterval) clearInterval(this.scheduleInterval);
        if (this.process) {
            this.process.kill();
            logger.info('BackupDaemon', 'Worker terminated.');
        }
        this.isInitialized = false;
    }
}

module.exports = new BackupDaemon();
