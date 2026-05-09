/**
 * ============================================================
 *  👻 Ghost Developer V2 — NexusOS Screen Sentinel
 * ============================================================
 *  Periodically captures the user's screen via Electron's
 *  desktopCapturer API (zero external dependencies), sends
 *  frames to the Dual-Provider AI for vision analysis to
 *  detect code errors, and pushes alerts via Electron IPC
 *  to all open NexusOS windows.
 *
 *  Evolved from: Vibelab/backend/services/ghostDeveloper.js
 *  Original: SSE-based broadcasting, screenshot-desktop npm,
 *            direct axios calls to hardcoded Vision LLM.
 * ============================================================
 */

import logger from '@nexus/logger';

// ── Config ──────────────────────────────────────────────────
const SCAN_INTERVAL_MS = 20000; // 20 seconds between scans
const CAPTURE_WIDTH = 1920;
const CAPTURE_HEIGHT = 1080;
const JPEG_QUALITY = 75;

class GhostDeveloperEvolved {
    constructor() {
        /** @type {NodeJS.Timeout | null} */
        this.intervalHandle = null;
        /** @type {boolean} */
        this.isRunning = false;
        /** @type {string} Last error hash to prevent duplicate alerts */
        this.lastErrorHash = '';
        /** @type {number} Total scans performed */
        this.scanCount = 0;
        /** @type {number} Errors detected */
        this.errorsFound = 0;
        /** @type {Array<{type: string, message: string, timestamp: string}>} */
        this.recentAlerts = [];
    }

    // ═══════════════════════════════════════════════════════════
    //  SCREEN CAPTURE (Electron Native)
    // ═══════════════════════════════════════════════════════════

    /**
     * Captures the primary display using Electron's desktopCapturer.
     * No external npm packages needed — uses Electron's built-in API.
     * @returns {Promise<Buffer>} JPEG image buffer
     */
    async _captureScreen() {
        // Dynamic import to avoid crashes when running outside Electron
        const { desktopCapturer } = await import('electron');

        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT }
        });

        const primaryScreen = sources[0];
        if (!primaryScreen) {
            throw new Error('No screen source available for capture.');
        }

        // Convert Electron NativeImage to JPEG Buffer
        const jpegBuffer = primaryScreen.thumbnail.toJPEG(JPEG_QUALITY);
        logger.info(`👻 [GHOST-V2] Frame captured: ${(jpegBuffer.length / 1024).toFixed(0)}KB`);
        return jpegBuffer;
    }

    // ═══════════════════════════════════════════════════════════
    //  VISION ANALYSIS (Dual-Provider AI)
    // ═══════════════════════════════════════════════════════════

    /**
     * Sends a captured screenshot to the NexusOS AI service for
     * vision-based error detection.
     * @param {Buffer} imageBuffer - JPEG screenshot buffer
     * @returns {Promise<{error_found: boolean, error_description: string} | null>}
     */
    async _analyzeFrame(imageBuffer) {
        try {
            const aiServiceModule = await import('./aiService.js');
            const aiService = aiServiceModule.default;

            const base64 = imageBuffer.toString('base64');

            const visionPrompt = `Analyze this screenshot carefully. Is the user looking at a code editor (like VS Code, Cursor, or a terminal) with a visible error? Look for:
- Red squiggly underlines
- Error messages in a terminal or console
- Red/orange error badges or indicators
- Compilation or runtime error text
- Stack traces or crash reports

Reply ONLY with a valid JSON object:
{"error_found": true, "error_description": "brief description of the error"}
or
{"error_found": false, "error_description": ""}

Do NOT include any text, explanation, or markdown. Only output the raw JSON.`;

            const result = await aiService.prompt(null, {
                text: visionPrompt,
                type: 'vision_analysis',
                image: `data:image/jpeg;base64,${base64}`,
                urgency: 'high'
            });

            if (!result?.success || !result?.response) {
                logger.warn('👻 [GHOST-V2] AI returned no response.');
                return null;
            }

            // Parse JSON from AI response (handle potential markdown wrapping)
            let responseText = result.response.trim();
            const jsonMatch = responseText.match(/\{[^}]+\}/);
            if (!jsonMatch) {
                logger.warn(`👻 [GHOST-V2] Could not parse JSON from: ${responseText.slice(0, 100)}`);
                return null;
            }

            return JSON.parse(jsonMatch[0]);
        } catch (err) {
            logger.error(`👻 [GHOST-V2] Vision analysis failed: ${err.message}`);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  ALERT BROADCASTING (Electron IPC)
    // ═══════════════════════════════════════════════════════════

    /**
     * Broadcasts an alert to all open NexusOS BrowserWindows
     * using Electron's native webContents.send() IPC.
     * @param {object} data - Alert payload
     */
    async _broadcast(data) {
        try {
            const { BrowserWindow } = await import('electron');
            const windows = BrowserWindow.getAllWindows();
            for (const win of windows) {
                if (!win.isDestroyed()) {
                    win.webContents.send('ghost:alert', data);
                }
            }
            logger.info(`👻 [GHOST-V2] Alert broadcast to ${windows.length} window(s).`);
        } catch (err) {
            logger.error(`👻 [GHOST-V2] Broadcast failed: ${err.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  CORE SCAN CYCLE
    // ═══════════════════════════════════════════════════════════

    /**
     * Executes a single scan cycle:
     * 1. Capture screen
     * 2. Send to Vision AI for error detection
     * 3. If error found, broadcast alert (with dedup)
     */
    async _scan() {
        this.scanCount++;
        try {
            // Step 1: Capture
            const frame = await this._captureScreen();

            // Step 2: Analyze
            const result = await this._analyzeFrame(frame);
            if (!result) return;

            // Step 3: Alert (with deduplication)
            if (result.error_found && result.error_description) {
                const hash = result.error_description.substring(0, 60);

                if (hash === this.lastErrorHash) {
                    logger.info('👻 [GHOST-V2] Duplicate error — suppressing alert.');
                    return;
                }

                this.lastErrorHash = hash;
                this.errorsFound++;

                const alert = {
                    type: 'ghost_error',
                    message: `👻 Ghost Dev detected an error: "${result.error_description}"`,
                    error_description: result.error_description,
                    timestamp: new Date().toISOString(),
                    scanNumber: this.scanCount
                };

                this.recentAlerts.push(alert);
                if (this.recentAlerts.length > 20) this.recentAlerts.shift();

                logger.info(`👻 [GHOST-V2] ⚠️ Error detected: ${result.error_description}`);
                await this._broadcast(alert);
            } else {
                // Reset dedup hash when screen is clean
                this.lastErrorHash = '';
            }

        } catch (err) {
            if (err.message?.includes('No screen source')) {
                logger.warn('👻 [GHOST-V2] Screen capture unavailable (headless mode?).');
            } else {
                logger.error(`👻 [GHOST-V2] Scan cycle error: ${err.message}`);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  LIFECYCLE MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    /**
     * Starts the Ghost Developer background watcher.
     * @returns {{ status: string }}
     */
    start() {
        if (this.isRunning) {
            logger.warn('👻 [GHOST-V2] Already running.');
            return { status: 'already_running' };
        }

        this.isRunning = true;
        this.lastErrorHash = '';
        this.scanCount = 0;
        this.errorsFound = 0;

        // Run first scan after a short delay
        setTimeout(() => this._scan(), 2000);

        // Start interval
        this.intervalHandle = setInterval(() => this._scan(), SCAN_INTERVAL_MS);
        logger.info(`👻 [GHOST-V2] Ghost Developer ACTIVATED (scanning every ${SCAN_INTERVAL_MS / 1000}s)`);

        return { status: 'started', intervalMs: SCAN_INTERVAL_MS };
    }

    /**
     * Stops the Ghost Developer background watcher.
     * @returns {{ status: string, scans: number, errorsFound: number }}
     */
    stop() {
        if (!this.isRunning) {
            logger.warn('👻 [GHOST-V2] Not running.');
            return { status: 'not_running' };
        }

        this.isRunning = false;
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }

        logger.info(`👻 [GHOST-V2] Stopped. Total scans: ${this.scanCount}, Errors found: ${this.errorsFound}`);
        return { status: 'stopped', scans: this.scanCount, errorsFound: this.errorsFound };
    }

    /**
     * Returns the current status for IPC queries.
     * @returns {object}
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            scanCount: this.scanCount,
            errorsFound: this.errorsFound,
            recentAlerts: this.recentAlerts.slice(-5)
        };
    }
}

export default new GhostDeveloperEvolved();
