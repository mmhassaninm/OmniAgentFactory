const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const logger = require('./utils/logger');

// V2 Sentinel Bridge: Prefix for Python intercepts
const SENTINEL_PY_PREFIX = '[SENTINEL_PY_INTERCEPT]';

class PythonOrchestrator {
    constructor() {
        this.pythonProcess = null;
        this.scriptPath = '';
        this.venvPath = '';
        const { app } = require('electron');
        this.isProd = app.isPackaged;

        // Determine Paths based on Dev or Prod mode
        if (!this.isProd) {
            this.scriptPath = path.join(__dirname, '..', '..', 'src', 'python-daemons', 'kernel', 'main.py');
            this.venvPath = 'python'; // Phase 31.2: Rely on system PATH (Conda) during development
        } else {
            // Phase 30: ASAR Unpack Path Resolution
            // When asarUnpack is used, binaries are moved to 'app.asar.unpacked'
            this.scriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'python-daemons', 'dist', 'main.exe');

            // Fallback to extraResources path if direct unpacked fails (Standard Electron-Builder behavior)
            if (!fs.existsSync(this.scriptPath)) {
                this.scriptPath = path.join(process.resourcesPath, 'main.exe');
            }

            this.venvPath = this.scriptPath; // The executable IS the runner
        }
    }

    init() {
        logger.info('PythonOrchestrator', 'Booting Python Core Interface...');
        this.spawnPython();
    }

    spawnPython() {
        logger.debug('PythonOrchestrator', `Spawning Python Interface...`);

        if (this.isProd) {
            logger.debug('PythonOrchestrator', `Executing standalone binary: ${this.venvPath}`);
            // In Prod, the venvPath IS the executable main.exe, we don't pass a script path to it.
            this.pythonProcess = spawn(this.venvPath, [], {
                detached: false,
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } else {
            logger.debug('PythonOrchestrator', `Target Script: ${this.scriptPath}`);
            // In Dev, we run python.exe [script.py]
            this.pythonProcess = spawn(this.venvPath, [this.scriptPath], {
                detached: false,
                stdio: ['pipe', 'pipe', 'pipe']
            });
        }

        // Handle Standard Output from Python (Valid responses, data, streams)
        this.pythonProcess.stdout.on('data', (data) => {
            // Phase 23 + Encoding Fix: Ensure UTF-8 parsing to prevent garbage text in Arabic
            const output = data.toString('utf8').trim();

            // V2 Sentinel Bridge: Check for Python intercept payloads
            const lines = output.split('\n');
            for (const line of lines) {
                if (line.startsWith(SENTINEL_PY_PREFIX)) {
                    const jsonStr = line.slice(SENTINEL_PY_PREFIX.length);
                    try {
                        const payload = JSON.parse(jsonStr);
                        logger.info('PythonOrchestrator', `[Sentinel Bridge] Python intercept detected: ${payload.type}`);
                        this._routeToSentinel(payload);
                    } catch (parseErr) {
                        logger.warn('PythonOrchestrator', `[Sentinel Bridge] Failed to parse intercept: ${parseErr.message}`);
                    }
                    continue; // Don't forward sentinel payloads to the UI
                }
            }

            logger.info('PythonCore', `STDOUT Blob`, { length: output.length });
            this.dispatchToReact('python:stdout', { output });
        });

        // Handle Standard Errors from Python (Tracebacks, crashes, internal logs)
        this.pythonProcess.stderr.on('data', (data) => {
            const errorStr = data.toString('utf8').trim();
            logger.error('PythonCore', `STDERR: ${errorStr}`);

            // Phase 18 Logger integration sent to React
            this.dispatchToReact('python:stderr', { error: errorStr });
        });

        // Handle sudden exits
        this.pythonProcess.on('close', (code) => {
            logger.warn('PythonOrchestrator', `Python process exited with code ${code}`);
            this.pythonProcess = null;
            // Optional: Logic to auto-restart the core if it crashes unexpectedly
        });
    }

    // Send a direct message to Python's stdin (IPC Replacement)
    sendMessage(payload) {
        if (this.pythonProcess && !this.pythonProcess.killed) {
            const msgStr = JSON.stringify(payload);
            // We append a newline because python's sys.stdin.readline() expects it
            this.pythonProcess.stdin.write(msgStr + '\\n');
            logger.debug('PythonOrchestrator', 'Sent Payload to Python');
            return true;
        } else {
            logger.error('PythonOrchestrator', 'Cannot send message. Python is not running.');
            return false;
        }
    }

    // Gracefully kill the Python core
    stop() {
        if (this.pythonProcess && !this.pythonProcess.killed) {
            logger.info('PythonOrchestrator', 'Terminating Python Core...');
            this.pythonProcess.kill('SIGTERM');
        }
    }

    // Helper to send data to the React UI
    dispatchToReact(channel, data) {
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send(channel, data);
        });
    }

    // V2 Sentinel Bridge: Route Python intercepts to the Sentinel service
    async _routeToSentinel(payload) {
        try {
            // Lazy-load sentinelService to avoid circular dependency at CJS boot
            const sentinelPath = require('path').resolve(__dirname, '..', '..', 'apps', 'backend-core', 'src', 'services', 'sentinelService.js');
            const sentinelModule = await import(sentinelPath);
            const sentinel = sentinelModule.default;
            if (sentinel && typeof sentinel.handlePythonIntercept === 'function') {
                await sentinel.handlePythonIntercept(payload);
            } else {
                logger.warn('PythonOrchestrator', '[Sentinel Bridge] sentinelService not available. Payload dropped.');
            }
        } catch (err) {
            logger.error('PythonOrchestrator', `[Sentinel Bridge] Failed to route to Sentinel: ${err.message}`);
        }
    }
}

module.exports = new PythonOrchestrator();
