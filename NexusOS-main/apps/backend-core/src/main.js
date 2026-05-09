/**
 * ============================================================
 *  Backend-Core Entry Point
 * ============================================================
 *  Bootstraps core backend services for the NexusOS Electron app.
 *  Called from the main process to initialize the engine and
 *  any long-running daemons.
 * ============================================================
 */

import nexusPrimeEngine from './services/nexusPrimeEngine.js';
import architectDaemon from './services/architectDaemon.js';
import dockerSandbox from './services/dockerSandbox.js';
import thermalSentinel from './services/thermalSentinel.js';
import eventLogger from './services/eventLogger.js';
import logger from '@nexus/logger';

/**
 * Initializes all backend-core services.
 * Called once during Electron main process startup.
 */
export async function initializeBackendCore() {
  logger.info('⚙️ [BACKEND-CORE] Initializing backend services...');

  // 1. Initialize Nexus-Prime Engine (Embedding Guard + Model Lifecycle)
  try {
    await nexusPrimeEngine.init();
    logger.info('⚙️ [BACKEND-CORE] ✅ Nexus-Prime Engine initialized.');
  } catch (err) {
    logger.error(`⚙️ [BACKEND-CORE] ❌ Nexus-Prime init failed: ${err.message}`);
  }

  // 2. Initialize EventLogger (MongoDB persistence)
  try {
    await eventLogger.init();
    logger.info('⚙️ [BACKEND-CORE] ✅ EventLogger initialized.');
  } catch (err) {
    logger.error(`⚙️ [BACKEND-CORE] ❌ EventLogger init failed: ${err.message}`);
  }

  // 3. Architect Daemon is started on-demand via IPC, no auto-start here.
  logger.info('⚙️ [BACKEND-CORE] ✅ All backend services ready.');
}

export { nexusPrimeEngine, architectDaemon, dockerSandbox, thermalSentinel, eventLogger };
