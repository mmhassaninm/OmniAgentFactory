const electronData = require('electron');
console.log('[DEBUG-BOOT] process.versions.electron:', process.versions.electron);
console.log('[DEBUG-BOOT] process.type:', process.type);
console.log('[DEBUG-BOOT] ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
const { app, session } = electronData;
const { initLifecycle } = require('./lifecycle');
const backupDaemon = require('./daemons/backupDaemon');
const logger = require('./utils/logger');

// Phase 32.1: Step 5 - Autofill Warning Suppression
if (app && app.commandLine) {
    app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');
}

// Phase 28: Step 4 - Main Process Error Handling
process.on('uncaughtException', (error) => {
    logger.error('NexusOS_System', 'Unhandled Exception', error.stack || error);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('NexusOS_System', 'Unhandled Rejection at Promise', String(reason));
});

// Phase 18: Core OS Boot Logger
logger.info('NexusOS', '=== NEXUS OS KERNEL INITIALIZATION ===');

// Initialize the OS Lifecycle (Kernel Boot)
initLifecycle(app);

// Phase 11 & 12: Boot Background Daemons when the app is ready
app.whenReady().then(() => {
    // Phase 32.1: Steps 2, 3, 4 - Dynamic CSP via HTTP Headers
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const isDev = !app.isPackaged;
        let csp = isDev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com; connect-src 'self' ws://localhost:* http://localhost:* wss://localhost:*;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com; connect-src 'self';";

        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp]
            }
        });
    });

    try {
        backupDaemon.init();
    } catch (e) {
        logger.error('NexusOS', `Critical Failure: BackupDaemon Init`, e.stack);
    }

    try {
        const vaultMonitor = require('./daemons/vaultMonitor');
        vaultMonitor.init();
    } catch (e) {
        logger.error('NexusOS', `Critical Failure: VaultMonitor Init`, e.stack);
    }

    try {
        const pythonOrchestrator = require('./pythonOrchestrator');
        pythonOrchestrator.init();
    } catch (e) {
        logger.error('NexusOS', `Critical Failure: PythonOrchestrator Init`, e.stack);
    }

    // Phase 7: Node.js Core Extraction & IPC Bridge
    try {
        import('../../apps/backend-core/src/main.js').then((core) => {
            core.initializeBackendCore();
        }).catch(err => logger.error('NexusOS', 'Failed to load BackendCore', err.stack));
    } catch (e) {
        logger.error('NexusOS', `Critical Failure: BackendCore Import`, e.stack);
    }

    // Phase 21: System Profiling
    const profiler = require('./utils/profiler');
    const profileInterval = app.isPackaged ? 600000 : 10000;
    profiler.start(profileInterval);
});
