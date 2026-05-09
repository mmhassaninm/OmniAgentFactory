import { exec } from 'child_process';
import util from 'util';
import logger from '@nexus/logger';

const execPromise = util.promisify(exec);

class VramManager {
    constructor() {
        this.IDLE_TIMEOUT_MS = 60000; // 60 seconds
        this.PINNED_MODEL = 'text-embedding-bge-m3';
        this.idleTimer = null;

        logger.info('[VramManager] 🧠 GPU Breather Protocol Initialized.');
    }

    /**
     * Resets the 60-second idle timer. Called by aiOrchestrator when a prompt begins.
     */
    recordActivity() {
        logger.info('[VramManager] 🧠 Activity detected. Resetting VRAM idle timer.');
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        this.idleTimer = setTimeout(() => this._cleanupRoutine(), this.IDLE_TIMEOUT_MS);
    }

    /**
     * Checks if ANY text-generation model is currently loaded in LM Studio.
     * Evaluates models minus the pinned embedding model.
     * 
     * @returns {boolean} true if an LLM is warm, false if cold.
     */
    async isEngineWarm() {
        try {
            const { stdout } = await execPromise('lms ps --json');
            const loadedData = JSON.parse(stdout.trim());
            const loadedModels = loadedData.map(m => m.identifier);
            // An engine is "warm" if any model other than the pinned embedding model is loaded.
            const warmModels = loadedModels.filter(id => id !== this.PINNED_MODEL);
            return warmModels.length > 0;
        } catch (err) {
            logger.error(`[VramManager] Failed to check loaded models via lms cli: ${err.message}`);
            // Default to true if mapping fails to avoid false cold starts.
            return true;
        }
    }

    /**
     * Called when the system is idle for 60 seconds.
     * Iterates through loaded models and unloads everything EXCEPT the pinned embedding model.
     */
    async _cleanupRoutine() {
        logger.info('[VramManager] 🧠 60s Idle threshold reached. Triggering VRAM Cleanup...');
        try {
            const { stdout } = await execPromise('lms ps --json');
            const loadedData = JSON.parse(stdout.trim());
            const loadedModels = loadedData.map(m => m.identifier);

            let unloadedCount = 0;

            for (const modelId of loadedModels) {
                if (modelId === this.PINNED_MODEL) {
                    logger.info(`[VramManager] 📌 Preserving pinned model: ${this.PINNED_MODEL}`);
                    continue;
                }

                try {
                    logger.info(`[VramManager] 🚀 Ejecting heavy model: ${modelId}`);
                    await execPromise(`lms unload "${modelId}"`);
                    unloadedCount++;
                } catch (unloadErr) {
                    logger.error(`[VramManager] Failed to unload ${modelId}: ${unloadErr.message}`);
                }
            }

            if (unloadedCount > 0) {
                logger.info(`[VramManager] 🟢 VRAM Cleanup complete. Ejected ${unloadedCount} model(s).`);
                this._emitUINotification('GPU Breather: Heavy LLM Ejected to save VRAM');
            } else {
                logger.info('[VramManager] 🟢 VRAM is already optimized. No heavy models in memory.');
            }
        } catch (err) {
            logger.error(`[VramManager] Cleanup routine failed: ${err.message}`);
        }
    }

    /**
     * Helper to send an IPC toast message to the frontend UI via NexusBridge.
     */
    _emitUINotification(message) {
        if (global.nexusUIBridge && global.nexusUIBridge.sendToast) {
            global.nexusUIBridge.sendToast(message);
        } else {
            console.log(`[IPC_FALLBACK] ${message}`);
        }
    }
}

export default new VramManager();
