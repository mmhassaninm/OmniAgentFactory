/**
 * ============================================================
 *  🌡️ Thermal Sentinel: Hardware Temperature Monitor
 * ============================================================
 *  Polls CPU and GPU temperatures at a configurable interval
 *  using the `systeminformation` library. Emits IPC alerts
 *  to the renderer when thresholds are exceeded.
 *
 *  Designed for: AMD Ryzen 7 7435HS + NVIDIA RTX 4070
 * ============================================================
 */

import si from 'systeminformation';
import pkg from 'electron';
const { BrowserWindow } = pkg;
import logger from '@nexus/logger';

// ── Defaults ────────────────────────────────────────────────
const DEFAULT_POLL_MS = 5000;
const DEFAULT_THRESHOLDS = { cpuMax: 85, gpuMax: 80 };

class ThermalSentinel {
    constructor() {
        /** @type {NodeJS.Timeout|null} */
        this._interval = null;
        this._isRunning = false;
        this._pollMs = DEFAULT_POLL_MS;
        this._thresholds = { ...DEFAULT_THRESHOLDS };

        /** Last known readings */
        this._latest = {
            cpuTemp: 0,
            gpuTemp: 0,
            cpuName: 'CPU',
            gpuName: 'GPU',
            timestamp: null
        };

        /** Debounce: one alert per component per 60s */
        this._lastAlertTime = { cpu: 0, gpu: 0 };
        this._alertCooldownMs = 60_000;
    }

    // ═══════════════════════════════════════════════════════════
    //  CORE POLLING
    // ═══════════════════════════════════════════════════════════

    /**
     * Start the thermal polling loop.
     * @param {object} options - { pollMs?, thresholds?: { cpuMax, gpuMax } }
     */
    start(options = {}) {
        if (this._isRunning) return { status: 'already_running' };

        if (options.pollMs) this._pollMs = options.pollMs;
        if (options.thresholds) {
            this._thresholds = { ...this._thresholds, ...options.thresholds };
        }

        this._isRunning = true;
        logger.info(`[THERMAL] 🌡️ Sentinel ACTIVATED — polling every ${this._pollMs / 1000}s | CPU max: ${this._thresholds.cpuMax}°C | GPU max: ${this._thresholds.gpuMax}°C`);

        // Immediate first poll, then interval
        this._poll();
        this._interval = setInterval(() => this._poll(), this._pollMs);

        return { status: 'started', thresholds: this._thresholds };
    }

    /** Stop the polling loop. */
    stop() {
        if (!this._isRunning) return { status: 'not_running' };

        this._isRunning = false;
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        logger.info('[THERMAL] 🛑 Sentinel STOPPED.');
        return { status: 'stopped' };
    }

    /** Update alert thresholds at runtime. */
    setThresholds(thresholds) {
        if (thresholds.cpuMax !== undefined) this._thresholds.cpuMax = Number(thresholds.cpuMax);
        if (thresholds.gpuMax !== undefined) this._thresholds.gpuMax = Number(thresholds.gpuMax);
        logger.info(`[THERMAL] Thresholds updated → CPU: ${this._thresholds.cpuMax}°C | GPU: ${this._thresholds.gpuMax}°C`);
        return { thresholds: this._thresholds };
    }

    /** Get current status + last readings. */
    getStatus() {
        return {
            isRunning: this._isRunning,
            pollMs: this._pollMs,
            thresholds: this._thresholds,
            latest: this._latest
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  INTERNAL POLLING
    // ═══════════════════════════════════════════════════════════

    async _poll() {
        try {
            // Read CPU temp
            const cpuData = await si.cpuTemperature();
            const cpuTemp = cpuData.main || cpuData.avg || 0;

            // Read GPU temp (NVIDIA/AMD via si.graphics)
            const gfxData = await si.graphics();
            const gpuController = gfxData.controllers?.[0];
            const gpuTemp = gpuController?.temperatureGpu || 0;
            const gpuName = gpuController?.model || 'GPU';

            this._latest = {
                cpuTemp: Math.round(cpuTemp),
                gpuTemp: Math.round(gpuTemp),
                cpuName: 'CPU',
                gpuName,
                timestamp: new Date().toISOString()
            };

            // Check thresholds
            const now = Date.now();
            if (cpuTemp >= this._thresholds.cpuMax && (now - this._lastAlertTime.cpu) > this._alertCooldownMs) {
                this._lastAlertTime.cpu = now;
                this._broadcast('sentinel:thermal-alert', {
                    component: 'CPU',
                    temp: Math.round(cpuTemp),
                    threshold: this._thresholds.cpuMax
                });
                logger.warn(`[THERMAL] 🔥 CPU ALERT: ${Math.round(cpuTemp)}°C (threshold: ${this._thresholds.cpuMax}°C)`);
            }

            if (gpuTemp >= this._thresholds.gpuMax && (now - this._lastAlertTime.gpu) > this._alertCooldownMs) {
                this._lastAlertTime.gpu = now;
                this._broadcast('sentinel:thermal-alert', {
                    component: gpuName,
                    temp: Math.round(gpuTemp),
                    threshold: this._thresholds.gpuMax
                });
                logger.warn(`[THERMAL] 🔥 GPU ALERT: ${Math.round(gpuTemp)}°C (threshold: ${this._thresholds.gpuMax}°C)`);
            }
        } catch (err) {
            logger.error(`[THERMAL] Poll error: ${err.message}`);
        }
    }

    /** Broadcast an IPC event to all renderer windows. */
    _broadcast(channel, data) {
        try {
            const windows = BrowserWindow.getAllWindows();
            windows.forEach(win => {
                if (win.webContents) {
                    win.webContents.send(channel, data);
                }
            });
        } catch (err) {
            logger.warn(`[THERMAL] Broadcast failed: ${err.message}`);
        }
    }
}

export default new ThermalSentinel();
