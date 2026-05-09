/**
 * ============================================================
 *  🧬 Nexus-Animus V3: Persistent Evolution Daemon
 * ============================================================
 *  A continuously running background daemon that mines legacy
 *  codebases, extracts micro-components via deep heuristics,
 *  evolves them through the Dual-Provider AI, and stores
 *  results in a MongoDB-backed evolution queue for manual
 *  approval and injection.
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MongoClient, ObjectId } from 'mongodb';
import logger from '@nexus/logger';

// ── Constants ───────────────────────────────────────────────
const SUPPORTED_EXTENSIONS = ['.js', '.jsx', '.py', '.css'];
const MAX_FILE_SIZE = 100 * 1024;
const MAX_CONTEXT_CHARS = 6000;
const DEFAULT_LEGACY_PATH = 'G:\\My Drive\\my-projects-nexus-vibelab-2026\\old-project';
const DAEMON_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes per cycle

// ── MongoDB Configuration ───────────────────────────────────
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'NexusOS';
const COLLECTION_LEDGER = 'animus_ledger';
const COLLECTION_EVOLUTIONS = 'animus_evolutions';

// ── Heuristic Patterns ──────────────────────────────────────
const HEURISTIC_PATTERNS = [
    { pattern: /React\.|useState|useEffect|jsx|<div|className/i, category: 'ui_component', label: 'React UI Component' },
    { pattern: /express|app\.(get|post|put|delete)|router\./i, category: 'backend_route', label: 'Express Route/Controller' },
    { pattern: /mongoose|Schema|model\(|\.find\(|\.save\(/i, category: 'data_model', label: 'Database Model/Schema' },
    { pattern: /fetch\(|axios|XMLHttpRequest|\.json\(\)/i, category: 'api_client', label: 'API Client/Fetcher' },
    { pattern: /crypto|encrypt|decrypt|hash|bcrypt|jwt/i, category: 'security', label: 'Security/Crypto Utility' },
    { pattern: /child_process|spawn|exec|fork/i, category: 'system_tool', label: 'System/Process Tool' },
    { pattern: /socket|WebSocket|io\(|\.on\('connect/i, category: 'realtime', label: 'Real-time/WebSocket Service' },
    { pattern: /import.*css|@apply|@tailwind|background|color:|font-/i, category: 'stylesheet', label: 'CSS Stylesheet' },
    { pattern: /sys\.|os\.|subprocess|argparse|import json/i, category: 'python_tool', label: 'Python Automation Tool' },
    { pattern: /class\s+\w+|module\.exports|export\s+(default|class|function)/i, category: 'service', label: 'Service/Utility Module' },
    { pattern: /telegram|bot|discord|webhook/i, category: 'integration', label: 'External Integration (Bot/Webhook)' },
    { pattern: /test\(|describe\(|expect\(|jest|mocha/i, category: 'test', label: 'Test Suite' },
];

// ── Micro-Extraction Patterns (for sub-file analysis) ───────
const MICRO_PATTERNS = [
    { regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g, type: 'function' },
    { regex: /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g, type: 'arrow_function' },
    { regex: /(?:export\s+)?const\s+use(\w+)\s*=\s*\(/g, type: 'react_hook' },
    { regex: /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*\{[^}]{20,}\}/gs, type: 'config_object' },
    { regex: /(?:const|let|var)\s+(\w+)\s*=\s*\/[^/]+\/[gimsuy]*/g, type: 'regex_pattern' },
    { regex: /(?:export\s+)?class\s+(\w+)/g, type: 'class' },
    { regex: /@keyframes\s+(\w+)/g, type: 'css_animation' },
    { regex: /--([\\w-]+)\s*:\s*[^;]+;/g, type: 'css_variable' },
    { regex: /def\s+(\w+)\s*\([^)]*\)\s*(?:->|:)/g, type: 'python_function' },
];

class AnimusSequencer {
    constructor() {
        this.legacyPath = DEFAULT_LEGACY_PATH;
        /** @type {import('mongodb').MongoClient|null} */
        this._client = null;
        /** @type {import('mongodb').Db|null} */
        this.db = null;
        /** @type {import('mongodb').Collection|null} */
        this._ledger = null;
        /** @type {import('mongodb').Collection|null} */
        this._evolutions = null;
        this.daemonHandle = null;
        this.isDaemonRunning = false;
        this.isProcessing = false;
        this.pendingFiles = [];
        this.currentFileIndex = 0;
        this.stats = { scanned: 0, extracted: 0, evolved: 0, queued: 0, injected: 0, skipped: 0, errors: 0 };
        this.liveLog = [];
    }

    // ═══════════════════════════════════════════════════════════
    //  DATABASE: MONGODB LEDGER & EVOLUTION STORE
    // ═══════════════════════════════════════════════════════════

    /**
     * Initialize the MongoDB connection, database, and collections.
     * Creates indexes for performant lookups.
     */
    async _initDB() {
        if (this.db) return;
        try {
            this._client = new MongoClient(MONGO_URI);
            await this._client.connect();
            this.db = this._client.db(DB_NAME);

            // Get collection handles
            this._ledger = this.db.collection(COLLECTION_LEDGER);
            this._evolutions = this.db.collection(COLLECTION_EVOLUTIONS);

            // Create indexes for performant queries
            await this._ledger.createIndex({ file_hash: 1 }, { unique: true, sparse: true });
            await this._ledger.createIndex({ snippet_hash: 1 }, { sparse: true });
            await this._evolutions.createIndex({ status: 1 });
            await this._evolutions.createIndex({ created_at: -1 });

            logger.info(`[Animus] 🗄️ MongoDB connected → ${DB_NAME} (${MONGO_URI})`);
        } catch (err) {
            logger.error(`[Animus] DB init failed: ${err.message}`);
            // Reset handles so we can retry on next call
            this.db = null;
            this._client = null;
            this._ledger = null;
            this._evolutions = null;
        }
    }

    /**
     * Check if a specific snippet has already been processed.
     * @param {string} hash - The file_hash or snippet_hash to check.
     * @returns {Promise<boolean>}
     */
    async _isProcessed(hash) {
        if (!this._ledger) return false;
        try {
            const row = await this._ledger.findOne({
                $or: [{ file_hash: hash }, { snippet_hash: hash }]
            });
            return !!row;
        } catch (err) {
            logger.warn(`[Animus] Ledger read failed: ${err.message}`);
            return false;
        }
    }

    /**
     * Mark a snippet as processed in the ledger.
     * Uses upsert to avoid duplicates.
     */
    async _markProcessed(fileHash, filePath, fileName, snippetHash, snippetName, snippetType, category, label) {
        if (!this._ledger) return;
        try {
            await this._ledger.updateOne(
                { file_hash: fileHash },
                {
                    $set: {
                        file_hash: fileHash,
                        file_path: filePath,
                        file_name: fileName,
                        snippet_hash: snippetHash,
                        snippet_name: snippetName,
                        snippet_type: snippetType,
                        category,
                        label,
                        processed_at: new Date().toISOString(),
                        status: 'processed'
                    }
                },
                { upsert: true }
            );
        } catch (err) {
            logger.warn(`[Animus] Ledger write failed: ${err.message}`);
        }
    }

    /**
     * Add an evolved item to the approval queue (animus_evolutions collection).
     * @param {object} item - The evolution data to enqueue.
     */
    async _enqueue(item) {
        if (!this._evolutions) return;
        try {
            await this._evolutions.insertOne({
                source_file: item.sourceFile,
                source_name: item.sourceName,
                snippet_name: item.snippetName,
                snippet_type: item.snippetType,
                category: item.category,
                label: item.label,
                original_snippet: item.originalSnippet,
                evolved_code: item.evolvedCode,
                suggested_name: item.suggestedName,
                target_dir: item.targetDir,
                status: 'pending',
                created_at: new Date().toISOString(),
                approved_at: null
            });
            this.stats.queued++;
        } catch (err) {
            logger.warn(`[Animus] Queue write failed: ${err.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  DEEP CRAWLER
    // ═══════════════════════════════════════════════════════════

    _crawl(dirPath, accumulated = []) {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    if (['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', 'venv', '.vibelab_drafts'].includes(entry.name)) continue;
                    this._crawl(fullPath, accumulated);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (SUPPORTED_EXTENSIONS.includes(ext)) {
                        try {
                            const stat = fs.statSync(fullPath);
                            if (stat.size <= MAX_FILE_SIZE && stat.size > 50) accumulated.push(fullPath);
                        } catch { /* skip unreadable */ }
                    }
                }
            }
        } catch (err) {
            logger.warn(`[Animus] Crawl error at ${dirPath}: ${err.message}`);
        }
        return accumulated;
    }

    // ═══════════════════════════════════════════════════════════
    //  MICRO-EXTRACTION ENGINE
    // ═══════════════════════════════════════════════════════════

    /**
     * Extracts micro-components (functions, hooks, config objects, etc.)
     * from a single source file using deep regex patterns.
     * @param {string} filePath
     * @returns {Array<{ name: string, type: string, startLine: number, snippet: string, hash: string }>}
     */
    _extractMicros(filePath) {
        const micros = [];
        try {
            const source = fs.readFileSync(filePath, 'utf-8');
            const lines = source.split('\n');

            for (const mp of MICRO_PATTERNS) {
                const ext = path.extname(filePath);
                // Skip CSS patterns for JS files and vice versa
                if ((mp.type === 'css_animation' || mp.type === 'css_variable') && ext !== '.css') continue;
                if ((mp.type === 'python_function') && ext !== '.py') continue;

                const regex = new RegExp(mp.regex.source, mp.regex.flags);
                let match;
                while ((match = regex.exec(source)) !== null) {
                    const name = match[1] || 'anonymous';
                    const startIdx = match.index;

                    // Find the line number
                    const beforeMatch = source.substring(0, startIdx);
                    const startLine = beforeMatch.split('\n').length;

                    // Extract a context window (up to 40 lines from the match start)
                    const endLine = Math.min(startLine + 39, lines.length);
                    const snippet = lines.slice(startLine - 1, endLine).map((l, i) => `${startLine + i}: ${l}`).join('\n');

                    const hash = crypto.createHash('md5').update(`${filePath}:${name}:${mp.type}:${startLine}`).digest('hex');

                    micros.push({ name, type: mp.type, startLine, snippet, hash });
                }
            }
        } catch (err) {
            logger.warn(`[Animus] Micro-extraction failed for ${filePath}: ${err.message}`);
        }
        return micros;
    }

    /**
     * File-level heuristic analysis (same as V1).
     */
    _analyzeFile(filePath) {
        try {
            const source = fs.readFileSync(filePath, 'utf-8');
            const ext = path.extname(filePath);
            const fileName = path.basename(filePath);
            let bestMatch = { category: 'unknown', label: 'Generic Module' };
            let maxScore = 0;
            for (const h of HEURISTIC_PATTERNS) {
                const matches = source.match(new RegExp(h.pattern.source, 'gi'));
                const score = matches ? matches.length : 0;
                if (score > maxScore) { maxScore = score; bestMatch = h; }
            }
            return { filePath, fileName, ext, category: bestMatch.category, label: bestMatch.label, size: source.length };
        } catch { return null; }
    }

    // ═══════════════════════════════════════════════════════════
    //  AI EVOLUTION ENGINE
    // ═══════════════════════════════════════════════════════════

    async _evolve(dna) {
        try {
            const isUI = ['ui_component', 'stylesheet'].includes(dna.category);
            const isPython = dna.ext === '.py';
            const isBackend = ['backend_route', 'data_model', 'security', 'system_tool', 'service', 'api_client', 'realtime', 'integration'].includes(dna.category);

            const targetDir = isUI ? 'apps/nexus-desktop/src/components/LegacyEvolved'
                : isBackend ? 'apps/backend-core/src/services'
                    : isPython ? 'src/python-daemons/evolved'
                        : 'apps/backend-core/src/utils';

            const microContext = dna.microName ? `\nFOCUS ON THIS SPECIFIC ${dna.microType}: "${dna.microName}" (starting at line ${dna.microLine})` : '';

            const prompt = `You are Nexus-Animus, a Legacy DNA Sequencer AI. Analyze this legacy code and EVOLVE it into a highly advanced, production-ready module for NexusOS.

LEGACY FILE: ${dna.fileName}
DETECTED CATEGORY: ${dna.label}
FILE TYPE: ${dna.ext}${microContext}

SOURCE CODE (with line numbers):
${dna.snippet}

EVOLUTION RULES:
1. Extract the CORE IDEAS, functions, and important details.
2. Re-write and EVOLVE into an ESM-compliant module.
3. UI → Premium Glassmorphism React with Tailwind CSS v4, lucide-react, modern hooks.
4. Backend → ESM imports, error handling, @nexus/logger integration.
5. Python → type hints, dataclasses, async where beneficial.
6. CSS → modern CSS variables, glassmorphism patterns.
7. Remove ALL hardcoded secrets/API keys.
8. Add JSDoc/docstring documentation.
9. The code must be COMPLETE and RUNNABLE.

RESPOND WITH ONLY THE EVOLVED CODE. No markdown fences, no explanations.`;

            const aiOrchestrator = (await import('./aiOrchestrator.js')).default;
            const systemPrompt = "You are Nexus-Animus, a Legacy DNA Sequencer AI. EVOLVE code into a highly advanced, production-ready module.";

            const result = await aiOrchestrator.prompt(systemPrompt, prompt, 'LOW');
            if (!result.success || !result.response) return null;

            let evolvedCode = result.response.trim().replace(/^```[\w]*\n?/gm, '').replace(/```\s*$/gm, '').trim();
            const baseName = path.basename(dna.fileName, dna.ext);
            const suffix = dna.microName ? `_${dna.microName}` : '';
            const evolvedExt = isPython ? '.py' : dna.ext === '.css' ? '.css' : '.js';
            const suggestedName = `${baseName}${suffix}Evolved${evolvedExt}`;

            return { evolvedCode, suggestedName, targetDir };
        } catch (err) {
            logger.error(`[Animus] Evolution failed for ${dna.fileName}: ${err.message}`);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  INJECTION (Manual Approval)
    // ═══════════════════════════════════════════════════════════

    _inject(targetDir, fileName, code) {
        try {
            const absoluteDir = path.resolve('D:/NexusOS-main', targetDir);
            if (!fs.existsSync(absoluteDir)) fs.mkdirSync(absoluteDir, { recursive: true });

            const absolutePath = path.join(absoluteDir, fileName);
            if (fs.existsSync(absolutePath)) {
                logger.warn(`[Animus] ⚠️ File exists, skipping: ${absolutePath}`);
                return { success: false, absolutePath };
            }

            fs.writeFileSync(absolutePath, code, 'utf-8');
            logger.info(`[Animus] 💉 Injected: ${targetDir}/${fileName}`);
            return { success: true, absolutePath };
        } catch (err) {
            logger.error(`[Animus] Injection failed for ${fileName}: ${err.message}`);
            return { success: false, absolutePath: '' };
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  BACKGROUND DAEMON
    // ═══════════════════════════════════════════════════════════

    /**
     * Starts the endless background daemon.
     * Processes one file per cycle, extracting all micro-components.
     */
    async startDaemon(options = {}) {
        if (this.isDaemonRunning) return { status: 'already_running', stats: this.stats };

        await this._initDB();
        this.isDaemonRunning = true;
        this.legacyPath = options.targetFolder || DEFAULT_LEGACY_PATH;
        const intervalMs = options.intervalMs || DAEMON_INTERVAL_MS;

        this._log('status', '🧬 Animus Persistent Daemon ACTIVATED');
        this._log('status', `📂 Legacy root: ${this.legacyPath}`);
        this._log('status', `⏱️ Cycle interval: ${intervalMs / 1000}s`);

        // Initial crawl to build the file queue
        this.pendingFiles = this._crawl(this.legacyPath);
        this.currentFileIndex = 0;
        this.stats.scanned = this.pendingFiles.length;
        this._log('status', `🔍 Initial crawl: ${this.pendingFiles.length} files queued.`);

        // Start the daemon loop
        this._runCycle(); // Run first cycle immediately
        this.daemonHandle = setInterval(() => this._runCycle(), intervalMs);

        return { status: 'started', filesQueued: this.pendingFiles.length, stats: this.stats };
    }

    /** Stops the background daemon. */
    stopDaemon() {
        if (!this.isDaemonRunning) return { status: 'not_running' };

        this.isDaemonRunning = false;
        if (this.daemonHandle) { clearInterval(this.daemonHandle); this.daemonHandle = null; }
        this._log('status', '🛑 Animus Daemon STOPPED.');
        return { status: 'stopped', stats: this.stats };
    }

    /** Single daemon cycle: process one file. */
    async _runCycle() {
        if (this.isProcessing) return; // Guard against overlap
        if (this.currentFileIndex >= this.pendingFiles.length) {
            this._log('status', '🏁 All files processed. Daemon idling (re-crawl on next start).');
            return;
        }

        this.isProcessing = true;
        const filePath = this.pendingFiles[this.currentFileIndex];
        const relativePath = path.relative(this.legacyPath, filePath);
        this.currentFileIndex++;

        this._log('progress', `[${this.currentFileIndex}/${this.pendingFiles.length}] Processing: ${relativePath}`);

        // File-level analysis
        const analysis = this._analyzeFile(filePath);
        if (!analysis) { this.stats.skipped++; this.isProcessing = false; return; }

        // Generate file-level hash
        const fileHash = crypto.createHash('md5').update(filePath + ':' + analysis.size).digest('hex');

        // Skip test files
        if (analysis.category === 'test') {
            await this._markProcessed(fileHash, filePath, analysis.fileName, null, null, 'test', analysis.category, analysis.label);
            this.stats.skipped++;
            this._log('info', `  ⏭️ Skipping test file.`);
            this.isProcessing = false;
            return;
        }

        // Micro-extract sub-components
        const micros = this._extractMicros(filePath);
        this._log('info', `  🔬 ${micros.length} micro-components found in ${analysis.fileName}`);

        if (micros.length === 0) {
            // Process the file as a whole (V1 behavior)
            if (await this._isProcessed(fileHash)) {
                this._log('info', `  📋 Already in Ledger. Skipping.`);
                this.stats.skipped++;
                this.isProcessing = false;
                return;
            }

            const source = fs.readFileSync(filePath, 'utf-8');
            const lines = source.split('\n');
            const snippet = lines.map((l, i) => `${i + 1}: ${l}`).join('\n').slice(0, MAX_CONTEXT_CHARS);

            this._log('info', `  🧠 Evolving entire file via AI...`);
            const evolved = await this._evolve({
                fileName: analysis.fileName, ext: analysis.ext,
                category: analysis.category, label: analysis.label,
                snippet
            });

            if (evolved) {
                await this._enqueue({
                    sourceFile: filePath, sourceName: analysis.fileName,
                    snippetName: null, snippetType: 'full_file',
                    category: analysis.category, label: analysis.label,
                    originalSnippet: snippet.slice(0, 2000), evolvedCode: evolved.evolvedCode,
                    suggestedName: evolved.suggestedName, targetDir: evolved.targetDir
                });
                await this._markProcessed(fileHash, filePath, analysis.fileName, null, null, 'full_file', analysis.category, analysis.label);
                this.stats.evolved++;
                this._log('success', `  ✅ Queued: ${evolved.suggestedName}`);
            } else {
                this.stats.errors++;
                this._log('error', `  ❌ Evolution failed.`);
            }
        } else {
            // Process each micro-component individually
            for (const micro of micros) {
                if (await this._isProcessed(micro.hash)) {
                    this.stats.skipped++;
                    continue;
                }

                this._log('info', `  🧠 Evolving micro [${micro.type}]: ${micro.name}...`);
                const evolved = await this._evolve({
                    fileName: analysis.fileName, ext: analysis.ext,
                    category: analysis.category, label: analysis.label,
                    snippet: micro.snippet,
                    microName: micro.name, microType: micro.type, microLine: micro.startLine
                });

                if (evolved) {
                    await this._enqueue({
                        sourceFile: filePath, sourceName: analysis.fileName,
                        snippetName: micro.name, snippetType: micro.type,
                        category: analysis.category, label: analysis.label,
                        originalSnippet: micro.snippet.slice(0, 2000), evolvedCode: evolved.evolvedCode,
                        suggestedName: evolved.suggestedName, targetDir: evolved.targetDir
                    });
                    await this._markProcessed(fileHash, filePath, analysis.fileName, micro.hash, micro.name, micro.type, analysis.category, analysis.label);
                    this.stats.evolved++;
                    this._log('success', `  ✅ Queued micro: ${micro.name} → ${evolved.suggestedName}`);
                } else {
                    this.stats.errors++;
                }

                this.stats.extracted++;
            }
        }

        this.isProcessing = false;
    }

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API (IPC Handlers)
    // ═══════════════════════════════════════════════════════════

    /**
     * Get the evolution queue for the dashboard.
     * @param {object} options - { limit?: number, status?: string }
     * @returns {Promise<Array>}
     */
    async getQueue(options = {}) {
        await this._initDB();
        if (!this._evolutions) return [];
        const limit = options.limit || 50;
        const status = options.status || 'pending';
        try {
            const items = await this._evolutions
                .find({ status })
                .sort({ _id: -1 })
                .limit(limit)
                .toArray();
            // Map MongoDB _id to string id for frontend compatibility
            return items.map(item => ({ ...item, id: item._id.toString() }));
        } catch (err) {
            logger.warn(`[Animus] Queue read failed: ${err.message}`);
            return [];
        }
    }

    /**
     * Approve and inject a specific queue item.
     * @param {string} itemId - MongoDB ObjectId string
     * @returns {Promise<object>}
     */
    async approveAndInject(itemId) {
        await this._initDB();
        if (!this._evolutions) return { success: false, message: 'Database not initialized.' };

        try {
            const item = await this._evolutions.findOne({ _id: new ObjectId(itemId) });
            if (!item) return { success: false, message: 'Item not found in queue.' };
            if (item.status !== 'pending') return { success: false, message: `Item already ${item.status}.` };

            const result = this._inject(item.target_dir, item.suggested_name, item.evolved_code);
            if (result.success) {
                await this._evolutions.updateOne(
                    { _id: new ObjectId(itemId) },
                    { $set: { status: 'injected', approved_at: new Date().toISOString() } }
                );
                this.stats.injected++;
                this._log('success', `💉 Approved & Injected: ${item.suggested_name} → ${result.absolutePath}`);
                return { success: true, absolutePath: result.absolutePath };
            } else {
                await this._evolutions.updateOne(
                    { _id: new ObjectId(itemId) },
                    { $set: { status: 'failed' } }
                );
                return { success: false, message: 'Injection failed (file may already exist).' };
            }
        } catch (err) {
            logger.error(`[Animus] Approve/Inject failed: ${err.message}`);
            return { success: false, message: err.message };
        }
    }

    /**
     * Reject a queue item.
     * @param {string} itemId - MongoDB ObjectId string
     * @returns {Promise<object>}
     */
    async rejectItem(itemId) {
        await this._initDB();
        if (!this._evolutions) return { success: false };
        try {
            await this._evolutions.updateOne(
                { _id: new ObjectId(itemId) },
                { $set: { status: 'rejected' } }
            );
            return { success: true };
        } catch (err) {
            logger.warn(`[Animus] Reject failed: ${err.message}`);
            return { success: false };
        }
    }

    /** Get daemon status for the dashboard. */
    getStatus() {
        return {
            isDaemonRunning: this.isDaemonRunning,
            isProcessing: this.isProcessing,
            currentFileIndex: this.currentFileIndex,
            totalFiles: this.pendingFiles.length,
            stats: this.stats,
            recentLog: this.liveLog.slice(-20)
        };
    }

    /** One-shot sequence runner (V1 compat). */
    async startSequence(options = {}) {
        await this._initDB();
        const scanDir = options.targetFolder || this.legacyPath;
        const maxFiles = options.maxFiles || 10;
        this.pendingFiles = this._crawl(scanDir).slice(0, maxFiles);
        this.currentFileIndex = 0;
        this.stats = { scanned: this.pendingFiles.length, extracted: 0, evolved: 0, queued: 0, injected: 0, skipped: 0, errors: 0 };

        for (let i = 0; i < this.pendingFiles.length; i++) {
            this.currentFileIndex = i;
            await this._runCycle();
        }

        return { stats: this.stats, log: this.liveLog };
    }

    _log(type, message) {
        const entry = { type, message, timestamp: new Date().toISOString() };
        this.liveLog.push(entry);
        if (this.liveLog.length > 200) this.liveLog.shift(); // Ring buffer
        logger.info(`[Animus] ${message}`);
    }
}

export default new AnimusSequencer();
