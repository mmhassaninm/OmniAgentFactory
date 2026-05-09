import logger from '@nexus/logger';
import aiOrchestrator from './aiOrchestrator.js';

class InfiniteOmikron {
    constructor() {
        this.isRunning = false;
        this.loopInterval = null;
        this.iterationCount = 0;
        this.baseDelay = 1000 * 60 * 15; // Run every 15 minutes
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('[InfiniteOmikron] 🔄 God-Mode Autonomous Loop Initiated. NexusOS is now self-evolving.');

        // Execute immediately, then set interval
        this._runCycle();
        this.loopInterval = setInterval(() => this._runCycle(), this.baseDelay);
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        clearInterval(this.loopInterval);
        logger.info('[InfiniteOmikron] 🛑 Autonomous Loop Halted.');
    }

    async _runCycle() {
        this.iterationCount++;
        logger.info(`[InfiniteOmikron] 🧬 Execution Cycle [${this.iterationCount}] commencing...`);

        try {
            // Task 1: Codebase Analysis (System Health)
            logger.info(`[InfiniteOmikron] -> Scanning system logs and core components...`);
            const diagnosticPrompt = `You are the core of NexusOS. Evaluate the current system state, search for potential infinite loop bugs in our backend orchestration, and output a strict JSON tool array to fix any detected anomalies via PowerShell 'windowsSkill' or report them.`;

            // Queue via Orchestrator
            // We do not await it blocking the main thread, the Orchestrator handles it queue-based
            aiOrchestrator.spawnSubagent(diagnosticPrompt, 'Omikron-Diagnostic-Agent').catch(e => {
                logger.error(`[InfiniteOmikron] Diagnostic Agent Failed: ${e.message}`);
            });

            // Simulated dynamic delays to prevent thermal throttling
            const thermalDelay = Math.floor(Math.random() * 5000);
            await new Promise(r => setTimeout(r, thermalDelay));

        } catch (error) {
            logger.error(`[InfiniteOmikron] Critical Failure in Loop Cycle [${this.iterationCount}]: ${error.message}`);
            // Attempt self-healing or skip
        }
    }
}

export default new InfiniteOmikron();
