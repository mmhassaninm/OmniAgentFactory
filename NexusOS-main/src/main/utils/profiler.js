const v8 = require('v8');
const os = require('os');
const logger = require('./logger');

class Profiler {
    constructor() {
        this.interval = null;
        this.isProfiling = false;

        // Thresholds
        this.MAX_RSS_MB = 500; // Trigger alert if resident set size > 500MB (Main Processor limit)
    }

    start(pollRateMs = 60000) {
        if (this.isProfiling) return;
        this.isProfiling = true;

        logger.info('SystemProfiler', `Starting NexusOS V8 Memory Profiling (Interval: ${pollRateMs}ms)`);

        this.interval = setInterval(() => {
            this.snapshot();
        }, pollRateMs);

        // Take immediate initial snapshot
        this.snapshot();
    }

    snapshot() {
        try {
            const memStats = process.memoryUsage();
            const heapStats = v8.getHeapStatistics();

            const rssMB = Math.round(memStats.rss / 1024 / 1024);
            const heapUsedMB = Math.round(memStats.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(memStats.heapTotal / 1024 / 1024);
            const externalMB = Math.round(memStats.external / 1024 / 1024);

            // Standard Telemetry Log
            logger.debug('SystemProfiler', `Memory Snapshot: RSS=${rssMB}MB, HeapUsed=${heapUsedMB}MB, HeapTotal=${heapTotalMB}MB, External=${externalMB}MB`);

            // Critical Leak Detection
            if (rssMB > this.MAX_RSS_MB) {
                logger.error('SystemProfiler', `CRITICAL MEMORY WARNING: Main Process RSS (${rssMB}MB) exceeded threshold (${this.MAX_RSS_MB}MB)! Possible Leak Detected in Electron Core or Active IPC Channels.`);

                // If it hits severe critical mass (e.g. 1GB), initiate emergency Node.js GC if exposed, 
                // or broadcast eventBus warning to user UI to restart the app
                const eventBus = require('./eventBus');
                eventBus.broadcastToUI('os:notification', {
                    title: 'System Stability Warning',
                    message: 'NexusOS Core is using excessive memory. A restart is recommended to prevent data loss.',
                    type: 'error'
                });
            }
        } catch (error) {
            logger.error('SystemProfiler', 'Failed to take memory snapshot', error);
        }
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isProfiling = false;
            logger.info('SystemProfiler', 'V8 Memory Profiling stopped.');
        }
    }
}

module.exports = new Profiler();
