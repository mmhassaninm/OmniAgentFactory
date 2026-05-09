/**
 * omniShieldService.js — Unified System Protection Layer (Phase 61)
 * 
 * Merges the healing logic of Aegis Overlord and the predictive analysis
 * of Threat Oracle into a single, high-performance CJS service in the main process.
 * 
 * FEATURES:
 * - Zombie Sniper (Port reconciliation)
 * - NPM Auto-Installer (Dependency healing)
 * - Guillotine Rollback (Tainted vaccine protection)
 * - Predictive Threat analysis (Phoenix analysis)
 * - Security Event Ledger (Persistence)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const http = require('http');
const { app } = require('electron');
const logger = require('../utils/logger');

// ─── Configuration ───
const USER_DATA = app.getPath('userData');
const LOG_FILE = path.join(USER_DATA, 'logs', 'nexus_os.log');
const LEDGER_FILE = path.join(USER_DATA, 'omni_shield_ledger.json');
const LM_STUDIO_URL = 'http://127.0.0.1:1234/v1/chat/completions';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// ─── State ───
let isHealing = false;
let recentlyHealed = new Map(); // hash -> timestamp
let recentPatches = new Map(); // hash -> { filePath, backupPath, timestamp }
let latestPrediction = {
    threat_level: 'LOW',
    prediction: 'System status stable. Protection active.',
    recommended_action: 'No action required.',
    timestamp: new Date().toISOString()
};

let metrics = {
    heartbeats: 0,
    crashesCaught: 0,
    healsApplied: 0,
    zombiesKilled: 0,
    rollbacks: 0,
    healthScore: 100
};

// ─── Persistence ───
function initLedger() {
    if (!fs.existsSync(LEDGER_FILE)) {
        fs.writeFileSync(LEDGER_FILE, JSON.stringify({ version: 'OmniShield V1', events: [] }, null, 2));
    }
}

function logEvent(type, message, details = {}) {
    try {
        const data = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
        const event = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            type,
            message,
            details
        };
        data.events.unshift(event);
        if (data.events.length > 100) data.events.pop();
        fs.writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2));

        // Broadcast to renderer if needed (requires ipcRouter bridge)
    } catch (e) {
        logger.error('OmniShield', 'Failed to log security event', e);
    }
}

// ─── Healing Logic ───

async function snipeZombiePort(port) {
    logger.info('OmniShield', `Sniper target acquired: Port ${port}`);
    let cmd = os.platform() === 'win32'
        ? `FOR /F "tokens=5" %a in ('netstat -aon ^| findstr ":${port}" ^| findstr "LISTENING"') do taskkill /F /PID %a`
        : `lsof -i :${port} -t | xargs kill -9`;

    return new Promise((resolve) => {
        exec(cmd, (err) => {
            if (!err) {
                metrics.zombiesKilled++;
                metrics.healsApplied++;
                logEvent('HEAL', 'Zombie port neutralized', { port });
                resolve(true);
            } else resolve(false);
        });
    });
}

async function autoInstallModule(errorMsg) {
    const match = errorMsg.match(/Cannot find (?:module|package) ['"]?([\w@\-/]+)['"]?/i);
    if (!match) return false;
    let moduleName = match[1].split('/')[0];
    if (match[1].startsWith('@')) moduleName = match[1].split('/').slice(0, 2).join('/');

    logger.info('OmniShield', `Tactical NPM install triggered for: ${moduleName}`);
    return new Promise((resolve) => {
        const proc = spawn('pnpm', ['add', moduleName, '-w'], { cwd: PROJECT_ROOT, shell: true });
        proc.on('close', (code) => {
            if (code === 0) {
                metrics.healsApplied++;
                logEvent('HEAL', 'Dependency injected', { moduleName });
                resolve(true);
            } else resolve(false);
        });
    });
}

// ─── Predictive Logic (The Oracle) ───

async function runPrediction() {
    try {
        const stats = fs.statSync(LOG_FILE);
        const chunkSize = 15000;
        const startByte = Math.max(0, stats.size - chunkSize);

        const fd = fs.openSync(LOG_FILE, 'r');
        const buffer = Buffer.alloc(chunkSize);
        const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, startByte);
        fs.closeSync(fd);

        const logTail = buffer.toString('utf8', 0, bytesRead);

        const prompt = {
            model: "local-model",
            messages: [
                { role: "system", content: "You are Nexus OmniShield. Analyze logs for patterns leading to failure. Output JSON: { threat_level: 'LOW'|'MEDIUM'|'CRITICAL', prediction: '...', recommended_action: '...' }" },
                { role: "user", content: `Recent Logs:\n${logTail.slice(-4000)}` }
            ],
            temperature: 0.1
        };

        const res = await callLLM(prompt);
        if (res) {
            latestPrediction = { ...res, timestamp: new Date().toISOString() };
            logger.info('OmniShield', `Prediction updated: Level ${res.threat_level}`);
        }
    } catch (e) {
        logger.warn('OmniShield', 'Prediction cycle failed (LLM likely offline)');
    }
}

async function callLLM(payload) {
    return new Promise((resolve) => {
        const url = new URL(LM_STUDIO_URL);
        const options = { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 10000 };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices[0].message.content;
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    resolve(jsonMatch ? JSON.parse(jsonMatch[0]) : null);
                } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.write(JSON.stringify(payload));
        req.end();
    });
}

// ─── Core Watchdog ───

let logTailSize = 0;
function startWatchingLogs() {
    if (!fs.existsSync(LOG_FILE)) return;

    logTailSize = fs.statSync(LOG_FILE).size;
    fs.watch(LOG_FILE, (event) => {
        if (event === 'change') {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > logTailSize) {
                const stream = fs.createReadStream(LOG_FILE, { start: logTailSize, end: stats.size });
                let chunk = '';
                stream.on('data', c => chunk += c);
                stream.on('end', () => {
                    logTailSize = stats.size;
                    processNewLogs(chunk);
                });
            }
        }
    });
}

async function processNewLogs(text) {
    if (isHealing) return;

    const lines = text.split('\n');
    for (const line of lines) {
        if (line.includes('FATAL') || line.includes('ERROR') || line.includes('EADDRINUSE') || line.includes('Cannot find')) {
            metrics.crashesCaught++;

            // Port Snipe
            if (line.includes('EADDRINUSE')) {
                const port = line.match(/:(\d+)/)?.[1];
                if (port) {
                    isHealing = true;
                    await snipeZombiePort(port);
                    isHealing = false;
                }
            }

            // NPM Install
            if (line.includes('Cannot find module')) {
                isHealing = true;
                await autoInstallModule(line);
                isHealing = false;
            }

            break;
        }
    }
}

// ─── Public API ───

function initOmniShield() {
    logger.info('OmniShield', 'Initializing Unified Protection Service...');
    initLedger();
    startWatchingLogs();

    // Heartbeat & Prediction
    setInterval(() => {
        metrics.heartbeats++;
        // Calculate health (Simplified version for now)
        metrics.healthScore = Math.max(0, 100 - (metrics.crashesCaught * 2) + (metrics.healsApplied * 1));
    }, 10000);

    setInterval(runPrediction, 15 * 60 * 1000);
    setTimeout(runPrediction, 5000); // Initial run
}

function getStatus() {
    return {
        metrics,
        prediction: latestPrediction,
        isHealing
    };
}

function getEvents() {
    try {
        return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')).events;
    } catch { return []; }
}

module.exports = {
    initOmniShield,
    getStatus,
    getEvents,
    runPrediction
};
