/**
 * ============================================================
 *  🛡️ Nexus-Sentinel V4: Omniscient Self-Learning Architecture
 * ============================================================
 *  V1: Intercepts runtime crashes, analyzes AST, queries AI,
 *      hot-swaps fixes, and saves to Memory Vault.
 *  V2: Warning-level healing, Python cross-runtime bridge,
 *      BackgroundHealingQueue for next-boot patches.
 *  V3: Smart Context Sniping (80-line windows), Terminator
 *      Loop (3-retry self-correction), Self-Healing IPC
 *      registration, and per-error cooldown.
 *  V4: MongoDB EventLogger integration, RAG-style historical
 *      context injection, persistent RCA + patch storage.
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { execSync, fork } from 'child_process';
import logger from '@nexus/logger';
import crypto from 'crypto';
import eventLogger from './eventLogger.js';

// ── Constants ───────────────────────────────────────────────
const MAX_RETRIES = 3; // V3: Terminator Loop retries
const VERIFY_TIMEOUT_MS = 5000;
const SNIPE_RADIUS = 40; // V3: Lines before/after error for context sniping
const UNKNOWN_HEAD = 100; // V3: Lines from top when error line unknown
const UNKNOWN_TAIL = 50;  // V3: Lines from bottom when error line unknown
const COOLDOWN_MS = 5000; // V3: Per-error cooldown to prevent infinite loops
const SENTINEL_PY_PREFIX = '[SENTINEL_PY_INTERCEPT]';
const HEALING_QUEUE_INTERVAL_MS = 30000;
const IPC_ROUTER_PATH = 'D:/NexusOS-main/src/main/ipcRouter.js';

class SentinelService {
    constructor() {
        /** @type {Map<string, { patch: string, appliedAt: string }>} In-memory vault of known fixes */
        this.memoryVault = new Map();
        this.isActive = false;
        this.patchLog = [];
        /** @type {Array<{ type: string, message: string, file: string, line: number, category?: string }>} */
        this.backgroundHealingQueue = [];
        this._queueProcessorId = null;
        this._originalConsoleWarn = console.warn;
        this._originalConsoleError = console.error;
        /** @type {Map<string, number>} V3: Cooldown timestamps per error hash */
        this._cooldownMap = new Map();
    }

    // ── 1. INTERCEPTOR ──────────────────────────────────────
    /**
     * Activates global error interception.
     * Must be called BEFORE any other module initialization.
     */
    activate() {
        if (this.isActive) return;
        this.isActive = true;
        logger.info('[Sentinel] 🛡️ Omnipotent Nuclear Architecture V3 ACTIVATED.');

        // ── V1: Fatal crash interceptors ──
        process.on('uncaughtException', (error) => {
            logger.error(`[Sentinel] ⚡ Uncaught Exception Intercepted: ${error.message}`);
            this._handleCrash(error).catch(healErr => {
                logger.error(`[Sentinel] ❌ Self-healing pipeline itself failed: ${healErr.message}`);
            });
        });

        process.on('unhandledRejection', (reason) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            logger.error(`[Sentinel] ⚡ Unhandled Rejection Intercepted: ${error.message}`);
            this._handleCrash(error).catch(healErr => {
                logger.error(`[Sentinel] ❌ Self-healing pipeline itself failed: ${healErr.message}`);
            });
        });

        // ── V2: Warning-level interception ──
        process.on('warning', (warning) => {
            logger.warn(`[Sentinel] ⚠️ Node Warning Intercepted: ${warning.name} - ${warning.message}`);
            this._enqueueWarning({
                type: 'node_warning',
                message: `${warning.name}: ${warning.message}`,
                file: warning.stack?.split('\n')[1]?.match(/\((.+?):\d+:\d+\)/)?.[1] || '<unknown>',
                line: 0,
                category: warning.name
            });
        });

        // ── V2: Monkey-patch console.warn ──
        console.warn = (...args) => {
            this._originalConsoleWarn.apply(console, args);
            const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
            if (this._isHealableWarning(msg)) {
                this._enqueueWarning({
                    type: 'console_warn',
                    message: msg,
                    file: '<console>',
                    line: 0,
                    category: 'ConsoleWarning'
                });
            }
        };

        // ── V2: Monkey-patch console.error (non-fatal) ──
        console.error = (...args) => {
            this._originalConsoleError.apply(console, args);
            const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
            if (this._isHealableWarning(msg)) {
                this._enqueueWarning({
                    type: 'console_error',
                    message: msg,
                    file: '<console>',
                    line: 0,
                    category: 'ConsoleError'
                });
            }
        };

        // ── V2: Start background healing queue processor ──
        this._queueProcessorId = setInterval(() => this._processHealingQueue(), HEALING_QUEUE_INTERVAL_MS);
        logger.info(`[Sentinel] 📱 BackgroundHealingQueue active. Cycle: ${HEALING_QUEUE_INTERVAL_MS / 1000}s`);
    }

    // ── 2. CONTEXT BUILDER (The Detective) ──────────────────
    /**
     * Parses a stack trace to extract the failing file, line, and column.
     * @param {Error} error
     * @returns {{ filePath: string, line: number, column: number, fnName: string } | null}
     */
    _parseStackTrace(error) {
        if (!error.stack) return null;

        const lines = error.stack.split('\n');
        // Skip the first line (error message) and find the first project-relative frame
        for (const frame of lines.slice(1)) {
            // Match patterns like "at functionName (file:///D:/path/to/file.js:42:10)"
            // or "at file:///D:/path/to/file.js:42:10"
            const match = frame.match(/at\s+(?:(.+?)\s+)?\(?(?:file:\/\/\/)?(.+?):(\d+):(\d+)\)?/);
            if (match) {
                const filePath = match[2];
                // Only target files within our project scope
                if (filePath.includes('NexusOS-main') && !filePath.includes('node_modules')) {
                    return {
                        fnName: match[1] || '<anonymous>',
                        filePath: filePath.replace(/\//g, path.sep),
                        line: parseInt(match[3], 10),
                        column: parseInt(match[4], 10)
                    };
                }
            }
        }
        return null;
    }

    // ── V3: SMART CONTEXT SNIPING ────────────────────────────
    /**
     * Surgical context extraction — NEVER reads full file.
     * @param {string} filePath - Absolute path to the file
     * @param {number} errorLine - 1-indexed line number (0 = unknown)
     * @returns {{ snippet: string, startLine: number, endLine: number } | null}
     */
    extractErrorChunk(filePath, errorLine = 0) {
        try {
            if (!fs.existsSync(filePath)) return null;
            const source = fs.readFileSync(filePath, 'utf-8');
            const allLines = source.split('\n');

            let selectedLines;
            let startLine;

            if (errorLine > 0) {
                // Known line: snipe ±SNIPE_RADIUS (80-line window)
                const start = Math.max(0, errorLine - SNIPE_RADIUS - 1);
                const end = Math.min(allLines.length, errorLine + SNIPE_RADIUS);
                selectedLines = allLines.slice(start, end);
                startLine = start + 1;
            } else {
                // Unknown line: head (imports/declarations) + tail (exports/main logic)
                const head = allLines.slice(0, Math.min(UNKNOWN_HEAD, allLines.length));
                const tailStart = Math.max(UNKNOWN_HEAD, allLines.length - UNKNOWN_TAIL);
                const tail = allLines.slice(tailStart);

                if (tailStart <= UNKNOWN_HEAD) {
                    // File is small enough to include entirely
                    selectedLines = allLines;
                    startLine = 1;
                } else {
                    // Splice head + separator + tail
                    selectedLines = [
                        ...head,
                        `... [LINES ${UNKNOWN_HEAD + 1}-${tailStart} OMITTED — ${tailStart - UNKNOWN_HEAD} lines] ...`,
                        ...tail
                    ];
                    startLine = 1;
                }
            }

            const snippet = selectedLines.map((l, i) => {
                const lineNum = (errorLine > 0)
                    ? (Math.max(0, errorLine - SNIPE_RADIUS - 1) + i + 1)
                    : (i < UNKNOWN_HEAD ? i + 1 : (l.startsWith('...') ? 0 : (allLines.length - (selectedLines.length - 1 - i))));
                return lineNum > 0 ? `${lineNum}: ${l}` : l;
            }).join('\n');

            return { snippet, startLine, endLine: startLine + selectedLines.length - 1 };
        } catch (err) {
            logger.warn(`[Sentinel] extractErrorChunk failed: ${err.message}`);
            return null;
        }
    }

    /** @deprecated Use extractErrorChunk instead */
    _extractContext(filePath, errorLine) {
        return this.extractErrorChunk(filePath, errorLine);
    }

    /**
     * Fetches last 3 git commits for a given file (for AI context).
     * @param {string} filePath
     * @returns {string}
     */
    _getGitHistory(filePath) {
        try {
            const log = execSync(
                `git log -3 --oneline -- "${filePath}"`,
                { cwd: path.resolve('D:/NexusOS-main'), encoding: 'utf-8', timeout: 5000 }
            );
            return log.trim() || 'No git history found.';
        } catch {
            return 'Git history unavailable.';
        }
    }

    // ── 3. MEMORY VAULT (Self-Evolution) ────────────────────
    /**
     * Generates a unique hash for a crash signature.
     * @param {string} errorMessage
     * @param {string} filePath
     * @param {number} line
     * @returns {string}
     */
    _generateCrashHash(errorMessage, filePath, line) {
        const raw = `${errorMessage}::${filePath}::${line}`;
        return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
    }

    /**
     * Checks if a known fix exists for this crash signature.
     * @param {string} crashHash
     * @returns {{ patch: string, appliedAt: string } | undefined}
     */
    _queryVault(crashHash) {
        return this.memoryVault.get(crashHash);
    }

    /**
     * Saves a successful fix to the memory vault.
     * @param {string} crashHash
     * @param {string} patch - The JSON stringified patch array
     */
    _saveToVault(crashHash, patch) {
        this.memoryVault.set(crashHash, {
            patch,
            appliedAt: new Date().toISOString()
        });
        logger.info(`[Sentinel] 💾 Solution saved to Memory Vault. Hash: ${crashHash}`);
    }

    // ── V3: COMPACT AI PROMPTING ────────────────────────────
    /**
     * Queries AI with an ultra-compact prompt. Never sends full files.
     * @param {{ errorMessage: string, filePath: string, line: number, snippet: string }} context
     * @returns {Promise<Array<{ line: number, replaceWith: string }>>}
     */
    async _queryAI(context) {
        try {
            const nexusPrimeModule = await import('./nexusPrimeEngine.js');
            const engine = nexusPrimeModule.default;

            // V4: RAG — query MongoDB for similar past errors
            let historyBlock = '';
            try {
                const similar = await eventLogger.findSimilar(context.errorMessage, 10); // Fetch more for prioritization
                if (similar.length > 0) {
                    const prioritized = this._prioritizeContext(similar);
                    historyBlock = `\nPRIORITIZED HISTORICAL CONTEXT (Summarized from ${similar.length} related events):\n${prioritized}`;
                    logger.info(`[Sentinel] 📚 RAG: Prioritized context from ${similar.length} events for AI.`);
                }
            } catch (ragErr) {
                logger.warn(`[Sentinel] RAG lookup failed (non-fatal): ${ragErr.message}`);
            }

            // V4: Enhanced prompt with optimized history
            const prompt = `ROLE: Nexus-Sentinel surgical repair AI.
RESPOND WITH ONLY a valid JSON array. No markdown, no explanation.

ERROR: ${context.errorMessage}
FILE: ${context.filePath}  LINE: ${context.line}
${historyBlock}
CODE CHUNK:
${(context.snippet || '').slice(0, 10000)}

FIX: Return [{"line": <number>, "replaceWith": "<fixed line>"}] or [] if unfixable.
RULES: Fix ONLY the root cause. Surgical. Minimal. Line numbers must match code chunk above. Learn from HISTORICAL CONTEXT if provided.`;

            const aiOrchestrator = (await import('./aiOrchestrator.js')).default;

            const result = await aiOrchestrator.prompt(
                'You are a surgical code repair AI. Respond with ONLY valid JSON arrays.',
                prompt,
                'CRITICAL'
            );

            if (!result.success || !result.response) {
                logger.warn('[Sentinel] AI returned no actionable response.');
                return [];
            }

            let cleaned = result.response.trim();
            // Strip markdown fences if present
            cleaned = cleaned.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
            // Extract JSON array if AI wrapped it in extra text
            const jsonMatch = cleaned.match(/\[.*\]/s);
            if (jsonMatch) cleaned = jsonMatch[0];

            const patches = JSON.parse(cleaned);
            if (!Array.isArray(patches)) return [];

            return patches.filter(p =>
                typeof p.line === 'number' &&
                typeof p.replaceWith === 'string'
            );
        } catch (err) {
            logger.error(`[Sentinel] AI query failed: ${err.message}`);
            return [];
        }
    }

    /**
     * V4: RAG Context Prioritization
     * Filters, deduplicates, and summarizes historical events to maximize intelligence density.
     * @param {Array} events - Raw events from MongoDB
     * @returns {string} Highly summarized context
     */
    _prioritizeContext(events) {
        if (!events || events.length === 0) return '';

        // 1. Group by specialized clusters (e.g., repeating RCA or status)
        const groups = {
            resolved: events.filter(e => e.status === 'resolved'),
            failed: events.filter(e => e.status === 'failed'),
            repeatPatterns: {}
        };

        // 2. Identify repeating error signatures to reduce bloat
        events.forEach(e => {
            const shortMsg = e.message.slice(0, 40);
            groups.repeatPatterns[shortMsg] = (groups.repeatPatterns[shortMsg] || 0) + 1;
        });

        // 3. Select top 2 successful solutions and top 1 failure for negative reinforcement
        const topResolved = groups.resolved.slice(0, 2);
        const topFailed = groups.failed.slice(0, 1);

        let summary = '';

        if (topResolved.length > 0) {
            summary += 'SUCCESSFUL SOLUTIONS:\n' + topResolved.map(e =>
                `- RCA: ${e.rca}\n  PATCH: ${JSON.stringify(e.patchApplied).slice(0, 300)}...`
            ).join('\n');
        }

        if (topFailed.length > 0) {
            summary += '\n\nKNOWN DEAD ENDS (Do not repeat):\n' + topFailed.map(e =>
                `- Failure RCA: ${e.rca}`
            ).join('\n');
        }

        const repeats = Object.entries(groups.repeatPatterns)
            .filter(([_, count]) => count > 1)
            .map(([msg, count]) => `"${msg}" encountered ${count} times`).join(', ');

        if (repeats) {
            summary += `\n\nFREQUENCY ALERT: ${repeats}. This is a recurring instability.`;
        }

        return summary.slice(0, 4000); // Guard against overflow
    }

    // ── V3: TERMINATOR LOOP ──────────────────────────────────
    /**
     * Self-correcting retry loop. Each failure feeds its new error back into the next attempt.
     * @param {string} filePath - Absolute path to fix
     * @param {number} errorLine - Line number (0 = unknown)
     * @param {string} errorMessage - The error message
     * @param {string} crashHash - For vault storage
     * @param {boolean} isJSX - If true, skip node --check verification
     * @returns {Promise<{ success: boolean, patches: Array }>}
     */
    async _terminatorLoop(filePath, errorLine, errorMessage, crashHash, isJSX = false) {
        let currentError = errorMessage;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            logger.info(`[Sentinel] 🤖 Terminator Loop ${attempt}/${MAX_RETRIES} | Error: ${currentError.slice(0, 100)}`);

            // Re-snipe context each attempt (file may have changed from previous patch attempt)
            const context = this.extractErrorChunk(filePath, errorLine);
            if (!context) {
                logger.warn(`[Sentinel] Cannot read source: ${filePath}`);
                return { success: false, patches: [] };
            }

            const patches = await this._queryAI({
                errorMessage: attempt > 1
                    ? `[RETRY ${attempt}] Previous patch failed. New error: ${currentError}`
                    : currentError,
                filePath,
                line: errorLine,
                snippet: context.snippet
            });

            if (patches.length === 0) {
                logger.warn(`[Sentinel] AI returned no patches on attempt ${attempt}.`);
                continue;
            }

            const original = this._applyPatch(filePath, patches);

            // Verify: for JSX files skip node --check (Vite HMR handles it)
            if (isJSX) {
                logger.info(`[Sentinel] ✅ JSX patch applied (Vite HMR will verify). Attempt ${attempt}.`);
                this._saveToVault(crashHash, JSON.stringify(patches));
                this._logHealing({ filePath, line: errorLine, errorMessage, patches, success: true });
                return { success: true, patches };
            }

            const valid = await this._verifyPatch(filePath);
            if (valid) {
                logger.info(`[Sentinel] ✅ Patch verified on attempt ${attempt}!`);
                this._saveToVault(crashHash, JSON.stringify(patches));
                this._logHealing({ filePath, line: errorLine, errorMessage, patches, success: true });
                return { success: true, patches };
            }

            // Patch failed verification — rollback and feed new error into next attempt
            this._rollback(filePath, original);
            currentError = `Previous patch at ${filePath}:${errorLine} failed syntax verification after applying: ${JSON.stringify(patches.slice(0, 2))}`;
            logger.warn(`[Sentinel] Attempt ${attempt} failed. Self-correcting...`);
        }

        logger.error(`[Sentinel] ❌ Terminator Loop exhausted (${MAX_RETRIES} attempts) for ${path.basename(filePath)}`);
        this._logHealing({ filePath, line: errorLine, errorMessage, patches: [], success: false });
        return { success: false, patches: [] };
    }

    // ── 5. HOT-SWAPPER & VERIFIER ───────────────────────────
    /**
     * Applies a patch array to a file.
     * @param {string} filePath
     * @param {Array<{ line: number, replaceWith: string }>} patches
     * @returns {string} The original file content (for rollback)
     */
    _applyPatch(filePath, patches) {
        const original = fs.readFileSync(filePath, 'utf-8');
        const lines = original.split('\n');

        for (const patch of patches) {
            const idx = patch.line - 1;
            if (idx >= 0 && idx < lines.length) {
                logger.info(`[Sentinel] 🔧 Patching line ${patch.line}: "${lines[idx].trim()}" → "${patch.replaceWith.trim()}"`);
                lines[idx] = patch.replaceWith;
            }
        }

        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
        return original;
    }

    /**
     * Rolls back a file to its original content.
     * @param {string} filePath
     * @param {string} originalContent
     */
    _rollback(filePath, originalContent) {
        fs.writeFileSync(filePath, originalContent, 'utf-8');
        logger.warn(`[Sentinel] ⏪ Rolled back ${path.basename(filePath)} to pre-patch state.`);
    }

    /**
     * Spawns a child process to dry-run (syntax check) the patched file.
     * @param {string} filePath
     * @returns {Promise<boolean>}
     */
    _verifyPatch(filePath) {
        return new Promise((resolve) => {
            try {
                // Use Node's --check flag for a syntax-only verification
                execSync(`node --check "${filePath}"`, {
                    timeout: VERIFY_TIMEOUT_MS,
                    encoding: 'utf-8',
                    stdio: 'pipe'
                });
                resolve(true);
            } catch (err) {
                logger.warn(`[Sentinel] ❌ Patch verification failed: ${err.message}`);
                resolve(false);
            }
        });
    }

    /**
     * Appends a healing event to the DEVLOG.
     * @param {{ filePath: string, line: number, errorMessage: string, patches: Array, success: boolean }} event
     */
    _logHealing(event) {
        const timestamp = new Date().toISOString().replace('T', ' | ').slice(0, 18);
        const entry = `**${timestamp}** - **Task:** Sentinel Auto-Heal - **Files:** \`${path.basename(event.filePath)}\` - **Logic:** ${event.success ? 'Successfully' : 'Failed to'} auto-patched line ${event.line} for error: "${event.errorMessage}". Patches applied: ${JSON.stringify(event.patches)} - **Phase:** Autonomous Self-Healing\n---\n`;

        try {
            const devlogPath = path.resolve('D:/NexusOS-main/Project_Docs/Logs/DEVLOG.md');
            fs.appendFileSync(devlogPath, entry, 'utf-8');
        } catch {
            logger.warn('[Sentinel] Could not append to DEVLOG.md');
        }

        this.patchLog.push({ ...event, timestamp });
    }

    // ── V4: MAIN PIPELINE (with MongoDB EventLogger + RAG) ──
    /**
     * The core self-healing pipeline. Orchestrates snipe → vault → RAG → terminator.
     * V4: Logs all crashes to MongoDB, queries historical fixes, saves RCA.
     * @param {Error} error
     */
    async _handleCrash(error) {
        const location = this._parseStackTrace(error);
        if (!location) {
            logger.warn('[Sentinel] Could not parse stack trace. Crash is outside project scope.');
            return;
        }

        const crashHash = this._generateCrashHash(error.message, location.filePath, location.line);

        // V3: Cooldown — prevent infinite heal loops on the same error
        const lastAttempt = this._cooldownMap.get(crashHash) || 0;
        if (Date.now() - lastAttempt < COOLDOWN_MS) {
            logger.warn(`[Sentinel] ⏳ Cooldown active for ${crashHash}. Skipping.`);
            return;
        }
        this._cooldownMap.set(crashHash, Date.now());

        logger.info(`[Sentinel] 🔍 Crash located: ${path.basename(location.filePath)}:${location.line} in ${location.fnName}`);

        // V4: LOG CRASH TO MONGODB
        let eventId = null;
        try {
            eventId = await eventLogger.logEvent({
                source: 'backend',
                level: 'error',
                message: error.message,
                stackTrace: error.stack || '',
                filePath: location.filePath,
                line: location.line,
                metadata: { crashHash, fnName: location.fnName }
            });
        } catch (logErr) {
            logger.warn(`[Sentinel] EventLogger write failed: ${logErr.message}`);
        }

        // V3: Detect IPC self-healing targets
        const ipcMatch = error.message.match(/No handler registered for '([^']+)'/) ||
            error.message.match(/Unauthorized IPC invoke channel:\s*(.+)/);
        if (ipcMatch) {
            const channel = ipcMatch[1].trim();
            logger.info(`[Sentinel] 🔌 IPC Self-Healing triggered for channel: ${channel}`);
            const ipcContext = this.extractErrorChunk(IPC_ROUTER_PATH, 0);
            if (ipcContext) {
                const ipcHash = this._generateCrashHash(`ipc:${channel}`, IPC_ROUTER_PATH, 0);
                await this._terminatorLoop(
                    IPC_ROUTER_PATH, 0,
                    `Missing IPC handler: The channel '${channel}' is called from the renderer but has no ipcMain.handle() registered. Write a handler for it following the pattern of existing handlers in this file.`,
                    ipcHash, false
                );
            }
            if (eventId) await eventLogger.updateEvent(eventId, { status: 'resolved', rca: `IPC handler missing for channel: ${channel}` }).catch(() => { });
            return;
        }

        // Check Memory Vault
        const knownFix = this._queryVault(crashHash);
        if (knownFix) {
            logger.info(`[Sentinel] ♻️ Known fix found (Hash: ${crashHash}). Replaying...`);
            const patches = JSON.parse(knownFix.patch);
            const original = this._applyPatch(location.filePath, patches);
            const valid = await this._verifyPatch(location.filePath);
            if (valid) {
                logger.info(`[Sentinel] ✅ Historical patch applied successfully.`);
                this._logHealing({ filePath: location.filePath, line: location.line, errorMessage: error.message, patches, success: true });
                if (eventId) await eventLogger.updateEvent(eventId, { status: 'resolved', rca: 'Historical patch replayed from Memory Vault.', patchApplied: patches }).catch(() => { });
                return;
            }
            this._rollback(location.filePath, original);
            this.memoryVault.delete(crashHash);
            logger.warn('[Sentinel] Historical patch is stale → entering Terminator Loop...');
        }

        // V4: Mark as healing
        if (eventId) await eventLogger.updateEvent(eventId, { status: 'healing' }).catch(() => { });

        // V4: Terminator Loop (now with RAG context from _queryAI)
        const result = await this._terminatorLoop(location.filePath, location.line, error.message, crashHash, false);

        // V4: Save final outcome to MongoDB
        if (eventId) {
            await eventLogger.updateEvent(eventId, {
                status: result.success ? 'resolved' : 'failed',
                rca: result.success ? 'AI-generated patch applied and verified.' : 'Terminator loop exhausted — no valid patch found.',
                patchApplied: result.patches.length > 0 ? result.patches : null,
                resolvedAt: result.success ? new Date().toISOString() : null
            }).catch(() => { });
        }
    }

    /**
     * Returns a status report of the Sentinel.
     * @returns {{ isActive: boolean, vaultSize: number, patchLog: Array }}
     */
    getStatus() {
        return {
            isActive: this.isActive,
            vaultSize: this.memoryVault.size,
            patchLog: this.patchLog,
            healingQueueSize: this.backgroundHealingQueue.length
        };
    }

    // ══════════════════════════════════════════════════════════
    //  V2: BACKGROUND HEALING QUEUE
    // ══════════════════════════════════════════════════════════

    /**
     * Checks if a warning message is healable (not noise).
     * @param {string} msg
     * @returns {boolean}
     */
    _isHealableWarning(msg) {
        const healablePatterns = [
            /deprecat/i,
            /missing\s+path/i,
            /failed\s+to\s+load/i,
            /not\s+found/i,
            /cannot\s+find/i,
            /ENOENT/i,
            /MODULE_NOT_FOUND/i,
            /experimental/i
        ];
        return healablePatterns.some(p => p.test(msg));
    }

    /**
     * Adds a warning to the background healing queue.
     * @param {{ type: string, message: string, file: string, line: number, category?: string }} entry
     */
    _enqueueWarning(entry) {
        // Deduplicate by message hash
        const hash = this._generateCrashHash(entry.message, entry.file, entry.line);
        const isDuplicate = this.backgroundHealingQueue.some(
            w => this._generateCrashHash(w.message, w.file, w.line) === hash
        );
        if (!isDuplicate) {
            this.backgroundHealingQueue.push(entry);
            logger.info(`[Sentinel] 📥 Warning queued for background healing: "${entry.message.slice(0, 80)}..."`);
        }
    }

    /**
     * Processes the background healing queue silently.
     * Attempts to identify the source and generate patches for the next boot.
     */
    async _processHealingQueue() {
        if (this.backgroundHealingQueue.length === 0) return;

        logger.info(`[Sentinel] 🔄 Processing BackgroundHealingQueue (${this.backgroundHealingQueue.length} items)...`);

        const batch = this.backgroundHealingQueue.splice(0, 5); // Process max 5 at a time

        for (const warning of batch) {
            try {
                // If file is identifiable, try to extract context and patch
                if (warning.file && warning.file !== '<console>' && warning.file !== '<unknown>') {
                    const context = this._extractContext(warning.file, warning.line || 1);
                    if (context) {
                        const patches = await this._queryAI({
                            errorMessage: `[WARNING] ${warning.category}: ${warning.message}`,
                            filePath: warning.file,
                            line: warning.line || 1,
                            snippet: context.snippet,
                            gitHistory: this._getGitHistory(warning.file)
                        });

                        if (patches.length > 0) {
                            const original = this._applyPatch(warning.file, patches);
                            const valid = await this._verifyPatch(warning.file);
                            if (valid) {
                                const hash = this._generateCrashHash(warning.message, warning.file, warning.line);
                                this._saveToVault(hash, JSON.stringify(patches));
                                this._logHealing({
                                    filePath: warning.file,
                                    line: warning.line || 0,
                                    errorMessage: warning.message,
                                    patches,
                                    success: true
                                });
                                logger.info(`[Sentinel] ✅ Background warning healed: ${warning.message.slice(0, 60)}`);
                            } else {
                                this._rollback(warning.file, original);
                            }
                        }
                    }
                }
                // Log the warning analysis regardless
                logger.debug(`[Sentinel] 📊 Analyzed warning: [${warning.category}] ${warning.message.slice(0, 100)}`);
            } catch (err) {
                logger.warn(`[Sentinel] Background healing failed for warning: ${err.message}`);
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  V2: PYTHON CROSS-RUNTIME BRIDGE
    // ══════════════════════════════════════════════════════════

    /**
     * Handles a Python intercept payload routed from pythonOrchestrator.
     * @param {{ type: string, message: string, file: string, line: number, category?: string, exception_type?: string, traceback?: string }} payload
     */
    async handlePythonIntercept(payload) {
        logger.info(`[Sentinel] 🐍 Python ${payload.type} intercepted: ${payload.message}`);

        if (payload.type === 'status') {
            logger.info(`[Sentinel] 🐍 Python Hook Status: ${payload.message}`);
            return;
        }

        if (payload.type === 'exception') {
            // Treat Python exceptions as crashes
            logger.error(`[Sentinel] 🐍⚡ Python CRASH: ${payload.exception_type}: ${payload.message}`);
            await this._handlePythonCrash(payload);
        } else if (payload.type === 'warning') {
            // Queue Python warnings for background healing
            this._enqueueWarning({
                type: 'python_warning',
                message: `[Python ${payload.category}] ${payload.message}`,
                file: payload.file,
                line: payload.line,
                category: payload.category
            });
        }
    }

    /**
     * Handles a Python crash by extracting context from the Python file and querying AI.
     * @param {{ message: string, file: string, line: number, exception_type: string, traceback: string }} payload
     */
    async _handlePythonCrash(payload) {
        const crashHash = this._generateCrashHash(payload.message, payload.file, payload.line);

        // Check Memory Vault first
        const knownFix = this._queryVault(crashHash);
        if (knownFix) {
            logger.info(`[Sentinel] ♻️ Known Python fix found (Hash: ${crashHash}). Replaying...`);
            const patches = JSON.parse(knownFix.patch);
            this._applyPatch(payload.file, patches);
            this._logHealing({ filePath: payload.file, line: payload.line, errorMessage: payload.message, patches, success: true });
            return;
        }

        // Extract Python source context
        const context = this._extractContext(payload.file, payload.line);
        if (!context) {
            logger.warn(`[Sentinel] Cannot read Python source: ${payload.file}`);
            return;
        }

        // Query AI with Python traceback context
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            logger.info(`[Sentinel] 🧠 Python AI Patch Attempt ${attempt}/${MAX_RETRIES}...`);

            const patches = await this._queryAI({
                errorMessage: `[Python ${payload.exception_type}] ${payload.message}\n\nTraceback:\n${payload.traceback}`,
                filePath: payload.file,
                line: payload.line,
                snippet: context.snippet,
                gitHistory: this._getGitHistory(payload.file)
            });

            if (patches.length === 0) continue;

            const original = this._applyPatch(payload.file, patches);
            // For Python files, verify by running python --check (syntax only)
            const valid = await this._verifyPythonPatch(payload.file);

            if (valid) {
                logger.info(`[Sentinel] ✅ Python patch verified and applied!`);
                this._saveToVault(crashHash, JSON.stringify(patches));
                this._logHealing({ filePath: payload.file, line: payload.line, errorMessage: payload.message, patches, success: true });
                return;
            }

            this._rollback(payload.file, original);
        }

        logger.error(`[Sentinel] ❌ All Python healing attempts failed for ${path.basename(payload.file)}:${payload.line}`);
        this._logHealing({ filePath: payload.file, line: payload.line, errorMessage: payload.message, patches: [], success: false });
    }

    /**
     * Verifies a Python file patch by running `python -m py_compile`.
     * @param {string} filePath
     * @returns {Promise<boolean>}
     */
    _verifyPythonPatch(filePath) {
        return new Promise((resolve) => {
            try {
                execSync(`python -m py_compile "${filePath}"`, {
                    timeout: VERIFY_TIMEOUT_MS,
                    encoding: 'utf-8',
                    stdio: 'pipe'
                });
                resolve(true);
            } catch (err) {
                logger.warn(`[Sentinel] ❌ Python patch verification failed: ${err.message}`);
                resolve(false);
            }
        });
    }

    // ══════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════
    //  V3: FRONTEND UI BOUNDARY (REACT / VITE HMR)
    // ══════════════════════════════════════════════════════════

    /**
     * Handles an intercepted React UI crash from the ErrorBoundary.
     * V3: Uses Smart Context Sniping + Terminator Loop.
     * @param {{ message: string, stack: string, componentStack: string }} payload
     * @param {Electron.WebContents} webContents
     * @returns {Promise<{ success: boolean, message: string }>}
     */
    async handleUIIntercept(payload, webContents = null) {
        logger.info(`[Sentinel] 🎨 UI Renderer Crash Intercepted: ${payload.message}`);

        const combinedStack = `${payload.stack || ''}\n${payload.componentStack || ''}`;
        const sourceMatch = combinedStack.match(/\/(src\/[^?:]+\.jsx?)(?:[?:]\d+)?/i);

        if (!sourceMatch) {
            logger.warn(`[Sentinel] Could not determine React source file from UI stack.`);
            return { success: false, message: 'Could not locate source file in stack trace.' };
        }

        const relativePath = sourceMatch[1];
        const absolutePath = path.resolve('D:/NexusOS-main/apps/nexus-desktop', relativePath);

        if (!fs.existsSync(absolutePath)) {
            logger.warn(`[Sentinel] React source file not found on disk: ${absolutePath}`);
            return { success: false, message: 'Source file not found on disk.' };
        }

        logger.info(`[Sentinel] 🔍 Located UI fault in: ${relativePath}`);

        const crashHash = this._generateCrashHash(payload.message, absolutePath, 0);

        // V3: Cooldown
        const lastAttempt = this._cooldownMap.get(crashHash) || 0;
        if (Date.now() - lastAttempt < COOLDOWN_MS) {
            logger.warn(`[Sentinel] ⏳ UI cooldown active for ${crashHash}. Skipping.`);
            return { success: false, message: 'Cooldown active — too many attempts.' };
        }
        this._cooldownMap.set(crashHash, Date.now());

        // Check Vault
        const knownFix = this._queryVault(crashHash);
        if (knownFix) {
            logger.info(`[Sentinel] ♻️ Known UI fix found (Hash: ${crashHash}). Replaying...`);
            const patches = JSON.parse(knownFix.patch);
            this._applyPatch(absolutePath, patches);
            this._logHealing({ filePath: absolutePath, line: 0, errorMessage: payload.message, patches, success: true });
            if (webContents) webContents.send('sentinel:heal-complete', { success: true, message: 'Historical patch applied.' });
            return { success: true, message: 'Historical patch applied (Vite HMR triggered).' };
        }

        // V3: Terminator Loop with JSX mode (skips node --check)
        const errorMsg = `[React UI Crash] ${payload.message}\n\nComponent Stack:\n${(payload.componentStack || '').slice(0, 2000)}`;
        const result = await this._terminatorLoop(absolutePath, 0, errorMsg, crashHash, true);

        if (webContents) {
            webContents.send('sentinel:heal-complete', {
                success: result.success,
                message: result.success ? 'AI patch applied.' : 'AI failed to determine a patch.'
            });
        }
        return {
            success: result.success,
            message: result.success ? 'AI patch applied (Vite HMR triggered).' : 'AI failed to determine a patch.'
        };
    }
}

export default new SentinelService();
















