const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// We can't immediately call app.getPath('userData') because logger might be required before the app is ready.
// Also, in some contexts (like testing or early boot), app might be undefined.
let logDirectory = '';
let logFile = '';

const initLogger = () => {
    if (logDirectory) return; // Already initialized

    try {
        // Fallback to a local logs folder if app is somehow undefined
        const userDataPath = app ? app.getPath('userData') : path.join(process.cwd(), '.nexus-logs');
        logDirectory = path.join(userDataPath, 'logs');
        logFile = path.join(logDirectory, 'nexus_os.log');

        if (!fs.existsSync(logDirectory)) {
            fs.mkdirSync(logDirectory, { recursive: true });
        }
    } catch (err) {
        console.error('[NexusLogger] Failed to create log directory:', err);
    }
};

const writeLog = (level, context, message, meta = '') => {
    try {
        initLogger(); // Set up the directory if it hasn't been done yet

        const timestamp = new Date().toISOString();
        const formattedMeta = meta ? ` | ${JSON.stringify(meta)}` : '';
        const logEntry = `[${timestamp}] [${level}] [${context}] ${message}${formattedMeta}\n`;

        // Output to console for development visibility
        if (level === 'ERROR') {
            console.error(logEntry.trim());
        } else if (level === 'WARN') {
            console.warn(logEntry.trim());
        } else {
            console.log(logEntry.trim());
        }

        // Output to persistent file
        if (logFile) {
            fs.appendFileSync(logFile, logEntry, 'utf8');
        }
    } catch (err) {
        console.error('[NexusLogger] Failed to write to log file:', err);
    }
};

const logger = {
    info: (context, message, meta) => writeLog('INFO', context, message, meta),
    warn: (context, message, meta) => writeLog('WARN', context, message, meta),
    error: (context, message, meta) => writeLog('ERROR', context, message, meta),
    debug: (context, message, meta) => {
        if (process.env.NODE_ENV !== 'production') {
            writeLog('DEBUG', context, message, meta);
        }
    }
};

// Global Error Catchers to prevent crashes from taking down the OS silently
process.on('uncaughtException', (error) => {
    logger.error('CRITICAL', 'Uncaught Exception', { error: error.message, stack: error.stack });
    // In a real OS, we might want to attempt graceful recovery here instead of immediate exit
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('CRITICAL', 'Unhandled Promise Rejection', { reason: reason });
});

module.exports = logger;
