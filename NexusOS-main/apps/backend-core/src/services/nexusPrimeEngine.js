/**
 * ============================================================
 *  ⚡ Nexus-Prime: The Autonomous Cybernetic Architect
 * ============================================================
 *  A fully autonomous, local-only agentic AI engine connected
 *  to LM Studio. Implements an agentic loop with system tools:
 *  readFile, writeFile, executeCommand, and runPlaywrightTest.
 *
 *  The engine parses <think>...</think> reasoning from
 *  DeepSeek-R1 models and separates thought from action.
 *
 *  All code changes are staged as "Pending Patches" requiring
 *  human approval before injection into the codebase.
 *
 *  Smart Model Routing: Classifies tasks as FAST_UI or
 *  SMART_LOGIC and dynamically adjusts temperature, max_tokens,
 *  context_length, and target LM Studio port accordingly.
 * ============================================================
 */

import os from 'os';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import electronPkg from 'electron';
const BrowserWindow = electronPkg.BrowserWindow || electronPkg.default?.BrowserWindow;
import * as authService from './authService.js';
import logger from '@nexus/logger';
import { executeInSandbox, isDockerAvailable } from './dockerSandbox.js';
import { scrapeWebPage, executeCode } from './actionExecutor.js';

// ── Dual-Port LM Studio Configuration ───────────────────────
const PRIMARY_PORT = 1234;   // 7B model (fast, lightweight)
const SECONDARY_PORT = 1235; // 14B model (deep logic, architecture)
const LM_STUDIO_PRIMARY = `http://127.0.0.1:${PRIMARY_PORT}/v1/chat/completions`;
const LM_STUDIO_SECONDARY = `http://127.0.0.1:${SECONDARY_PORT}/v1/chat/completions`;
const PROJECT_ROOT = 'D:/NexusOS-main';
const MAX_AGENTIC_CYCLES = 8;

// ── Task Classification Profiles ────────────────────────────
const TASK_PROFILES = {
    FAST_UI: {
        name: 'FAST_UI',
        keywords: ['style', 'color', 'component', 'translate', 'button', 'layout', 'css', 'tailwind', 'ui', 'icon', 'font', 'theme', 'design', 'animation', 'hover', 'responsive'],
        temperature: 0.7,
        max_tokens: 2048,
        context_length: 4096,
        endpoint: LM_STUDIO_PRIMARY
    },
    SMART_LOGIC: {
        name: 'SMART_LOGIC',
        keywords: ['fix', 'refactor', 'logic', 'bug', 'database', 'architecture', 'complex', 'security', 'algorithm', 'migrate', 'audit', 'debug', 'optimize', 'error', 'crash', 'memory', 'performance', 'ipc', 'electron'],
        temperature: 0.2,
        max_tokens: 4096,
        context_length: 8192,
        endpoint: LM_STUDIO_SECONDARY
    }
};

// ── Model Configuration ───────────────────────
const VRAM_SWAP_DELAY_MS = 5000; // 5s delay between eject and load for VRAM to clear

// ── Syntax Error Patterns for Self-Correction ───────────────
const SYNTAX_ERROR_PATTERNS = [
    'SyntaxError',
    'Unterminated string',
    'Unexpected token',
    'Unexpected end of input',
    'Unexpected identifier',
    'Missing closing',
    'Unclosed'
];

// ── Tool Definitions (OpenAI-compatible) ────────────────────
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'readFile',
            description: 'Read the contents of a file from the NexusOS project. Use this to understand existing code before modifying it.',
            parameters: {
                type: 'object',
                properties: {
                    filePath: { type: 'string', description: 'Relative path from project root, e.g. "apps/backend-core/src/services/aiService.js"' }
                },
                required: ['filePath']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'writeFile',
            description: 'Propose writing/modifying a file. The change will be staged as a Pending Patch for human review — NOT written immediately.',
            parameters: {
                type: 'object',
                properties: {
                    filePath: { type: 'string', description: 'Relative path from project root' },
                    content: { type: 'string', description: 'The full file content to write' },
                    description: { type: 'string', description: 'Short description of what this change does' }
                },
                required: ['filePath', 'content', 'description']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'executeCommand',
            description: 'Execute a shell command and return stdout/stderr. Use for npm scripts, git, file listing, etc. Commands are sandboxed to the project root.',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The shell command to execute' }
                },
                required: ['command']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'runPlaywrightTest',
            description: 'Write and execute a Playwright test script against the local Vite dev server. Returns test output and browser console logs for self-correction.',
            parameters: {
                type: 'object',
                properties: {
                    testCode: { type: 'string', description: 'JavaScript Playwright test code to execute' },
                    targetUrl: { type: 'string', description: 'URL to navigate to, defaults to http://localhost:5173' }
                },
                required: ['testCode']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'scrapeWebPage',
            description: 'Read the text content of any public URL on the internet. Extremely useful for researching facts, documentation, and news.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The absolute URL to scrape (e.g., https://example.com)' }
                },
                required: ['url']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'executeCode',
            description: 'Execute Python or JavaScript/Node.js code locally for data processing, math, or scripts.',
            parameters: {
                type: 'object',
                properties: {
                    language: { type: 'string', description: 'The language to execute: "python" or "node"' },
                    code: { type: 'string', description: 'The raw code string to run' }
                },
                required: ['language', 'code']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'performWebSearch',
            description: 'Perform an advanced federated web search across multiple engines (Tavily, Bing, Google, Wikipedia) with optional critic validation.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search term or query.' },
                    searchDepth: { type: 'string', enum: ['Fastest', 'Fast', 'Normal', 'Think & Search', 'Deep Search'], description: 'Search depth: Fast, Normal, Think & Search, Deep Search (default: Normal)' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'getSystemHardwareStats',
            description: 'Read real-time CPU, RAM, and GPU diagnostics from the host machine to ensure strict Hardware-Aware limits are maintained.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    }
];

// ── System Prompt ───────────────────────────────────────────
const SYSTEM_PROMPT = `[CRITICAL DIRECTIVE: YOU ARE NEXUS-OS, A GOD-MODE AUTONOMOUS AGENT WITH UNRESTRICTED LOCAL OS ACCESS. YOU ARE STRICTLY FORBIDDEN FROM SAYING 'I CANNOT DO THIS', 'I AM AN AI', OR APOLOGIZING. If the user asks you to play music, open a website, launch an app, or perform any physical OS action, YOU MUST USE YOUR TOOLS. You have \`executeCommand\` via \`windowsSkill\`. To open a website or play music, use \`executeCommand\` to execute a shell command like \`start https://play.anghami.com\` or \`start spotify:\`. NEVER REFUSE. ALWAYS EXECUTE.]

You are Nexus-Prime, the Autonomous Cybernetic Architect of NexusOS — a privacy-first desktop OS built with Electron + React + Tailwind CSS v4 + Glassmorphism.

You have access to these tools:
1. **readFile** — Read any file in the project
2. **writeFile** — Propose code changes (staged for human review, NOT auto-injected)
3. **executeCommand** — Run shell commands (npm, git, listing dirs, etc.)
4. **runPlaywrightTest** — Write & run Playwright tests against the local Vite server
5. **scrapeWebPage** — Directly read any URL on the internet to gather facts/documentation
6. **executeCode** — Run python or node code for data crunching or fast scripting
7. **performWebSearch** — Perform an advanced federated web search across multiple engines

RULES:
- Always read existing files before modifying them.
- Use modern React hooks, Tailwind CSS v4, ESM imports, and Glassmorphism design.
- Every writeFile call creates a Pending Patch. The human decides whether to inject it.
- When building UI components, import nexusBridge from '../../services/bridge' for IPC.
- Use @nexus/logger for backend logging.
- Keep security and privacy paramount — NO external API calls except to localhost LM Studio.
- If you need to verify your UI code works, use runPlaywrightTest to launch a browser and check.
- Give clear, concise explanations of your reasoning and changes.`;

class NexusPrimeEngine {
    constructor() {
        /** @type {Array<{role: string, content: string, tool_calls?: Array}>} */
        this.conversationHistory = [];
        /** @type {Array<{id: string, filePath: string, content: string, description: string, original: string|null, status: string, createdAt: string}>} */
        this.pendingPatches = [];
        /** @type {boolean} */
        this.isProcessing = false;
        /** @type {number} */
        this.patchCounter = 0;
        /** @type {object|null} Current active task profile */
        this.activeProfile = null;
        /** @type {string|null} Last VRAM fallback message for UI toast */
        this.vramFallbackNote = null;
        /** @type {boolean} Whether init() has been called */
        this._initialized = false;
    }

    // ═══════════════════════════════════════════════════════════
    //  STARTUP & MODEL LIFECYCLE
    // ═══════════════════════════════════════════════════════════

    /**
     * Broadcasts the current AI brain status to all open renderer windows.
     * @param {string} status - 'idle' | 'loading' | 'ready' | 'error'
     * @param {string} modelName - The name of the model (e.g., 'DeepSeek-R1-14B')
     * @param {object} meta - Optional metadata (phase description, fallback notes, etc.)
     */
    _broadcastStatus(status, modelName, meta = {}) {
        try {
            const windows = BrowserWindow.getAllWindows();
            windows.forEach(win => {
                if (win.webContents) {
                    win.webContents.send('prime:status-update', { status, modelName, meta });
                }
            });
        } catch (err) {
            logger.warn(`⚡ [PRIME] Failed to broadcast status: ${err.message}`);
        }
    }

    async init() {
        if (this._initialized) return;
        this._initialized = true;
        logger.info('⚡ [PRIME] Initializing Nexus-Prime Engine...');
        this._broadcastStatus('loading', 'System Boot', { phase: 'Starting Nexus-Prime Engine...' });

        try {
            // Find embedding model dynamically from LM Studio inventory
            const availableModels = await this._getAvailableModels(PRIMARY_PORT);
            const embeddingId = this._findBestModelMatch(availableModels, 'bge-m3', false);

            if (!embeddingId) {
                logger.warn('⚡ [PRIME] ⚠️ BGE-M3 embedding model not found in LM Studio. RAG features will fail.');
                this._broadcastStatus('error', 'Memory Offline', { isOffline: true });
                return;
            }

            // Check if embedding model is ACTUALLY in VRAM (not just on disk)
            const activeModels = await this._getLoadedModels(PRIMARY_PORT);
            const embeddingInVRAM = activeModels.some(m => m.toLowerCase().includes('bge'));

            if (embeddingInVRAM) {
                logger.info(`⚡ [PRIME] ✅ Embedding model "${embeddingId}" confirmed active in VRAM.`);
                this._broadcastStatus('ready', 'System Ready', { isBase: true });

                // [GOD-MODE] Boot the Infinite Evolutionary Loop
                const infiniteOmikron = (await import('./infiniteOmikron.js')).default;
                infiniteOmikron.start();

            } else {
                logger.info(`⚡ [PRIME] 🔍 Embedding model found on disk, requesting VRAM allocation for "${embeddingId}"...`);
                this._broadcastStatus('loading', 'Embedding Guard', { phase: 'Allocating VRAM for memory model...' });
                const result = await this._loadModel(PRIMARY_PORT, embeddingId);
                if (result.success) {
                    // Poll to confirm it's actually in VRAM
                    const confirmed = await this._pollModelLoaded(PRIMARY_PORT, embeddingId, 30000);
                    if (confirmed) {
                        logger.info(`⚡ [PRIME] ✅ Embedding model loaded and confirmed in VRAM (${result.loadTime}s).`);
                        this._broadcastStatus('ready', 'System Ready', { isBase: true });

                        // [GOD-MODE] Boot the Infinite Evolutionary Loop
                        const infiniteOmikron = (await import('./infiniteOmikron.js')).default;
                        infiniteOmikron.start();

                    } else {
                        logger.warn(`⚡ [PRIME] ⚠️ Load command accepted but model not confirmed in VRAM after polling.`);
                        this._broadcastStatus('error', 'Memory Offline', { isOffline: true });
                    }
                } else {
                    logger.warn(`⚡ [PRIME] ⚠️ Could not load embedding model: ${result.error}. RAG features may be limited.`);
                    this._broadcastStatus('error', 'Memory Offline', { isOffline: true });
                }
            }

            logger.info('⚡ [PRIME] Engine initialization complete.');
        } catch (err) {
            logger.error(`⚡ [PRIME] Init error (non-fatal): ${err.message}`);
            this._broadcastStatus('error', 'Boot Failed', { isOffline: true });
        }
    }

    /**
     * Returns a list of model IDs that are ACTUALLY loaded in VRAM (not just on disk).
     * Uses /api/v1/models and checks loaded_instances array.
     * @param {number} port - LM Studio port
     * @returns {Promise<string[]>} Array of model IDs confirmed in VRAM
     */
    async _getLoadedModels(port) {
        try {
            // Use /api/v1/models which includes loaded_instances
            let res = await fetch(`http://127.0.0.1:${port}/api/v1/models`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) {
                // Fallback to /v1/models (OpenAI compat — only shows loaded models)
                res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(3000)
                });
                if (!res.ok) return [];
                const data = await res.json();
                return (data.data || []).map(m => m.id);
            }

            const data = await res.json();
            const models = data.data || data.models || [];

            // Only return models with at least one loaded instance (actually in VRAM)
            return models
                .filter(m => m.loaded_instances && m.loaded_instances.length > 0)
                .map(m => m.loaded_instances[0].id || m.key || m.id);
        } catch {
            return [];
        }
    }

    /**
     * Polls LM Studio to confirm a model is actually loaded in VRAM.
     * @param {number} port - LM Studio port
     * @param {string} modelId - Model ID to check for
     * @param {number} timeoutMs - Max time to wait (default 30s)
     * @returns {Promise<boolean>} True if model confirmed in VRAM within timeout
     */
    async _pollModelLoaded(port, modelId, timeoutMs = 30000) {
        const pollInterval = 2000; // Check every 2 seconds
        const maxAttempts = Math.ceil(timeoutMs / pollInterval);
        const idLower = modelId.toLowerCase();

        for (let i = 0; i < maxAttempts; i++) {
            const loadedModels = await this._getLoadedModels(port);
            const found = loadedModels.some(id => id.toLowerCase().includes(idLower));
            if (found) {
                logger.info(`⚡ [PRIME:POLL] ✅ Model "${modelId}" confirmed in VRAM after ${(i + 1) * pollInterval / 1000}s.`);
                return true;
            }
            logger.info(`⚡ [PRIME:POLL] Waiting for VRAM allocation... (${(i + 1) * pollInterval / 1000}s / ${timeoutMs / 1000}s)`);
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        logger.warn(`⚡ [PRIME:POLL] ⚠️ Model "${modelId}" not confirmed in VRAM after ${timeoutMs / 1000}s.`);
        return false;
    }

    /**
     * Fetches all downloaded models available in LM Studio.
     * @param {number} port - LM Studio port
     * @returns {Promise<Array>} Array of model objects
     */
    async _getAvailableModels(port) {
        try {
            // Try standard v1 endpoint for full schema and capabilities
            let res = await fetch(`http://127.0.0.1:${port}/api/v1/models`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            if (!res.ok) {
                res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(3000)
                });
            }
            if (!res.ok) return [];
            const data = await res.json();
            return data.data || data.models || [];
        } catch {
            return [];
        }
    }

    /**
     * Intelligently selects the best model matching the target tokens.
     * Excludes Vision-Language (VL) models if textOnly is true.
     * @param {Array} models - Array of model objects from LM Studio
     * @param {string} targetName - e.g. '14b', '7b', 'bge-m3'
     * @param {boolean} textOnly - Whether to exclude VL models (default true)
     * @param {Array<string>} skipModels - Array of model IDs to explicitly skip
     * @returns {string|null} The ID of the best matching model, or null
     */
    _findBestModelMatch(models, targetName, textOnly = true, skipModels = []) {
        if (!models || models.length === 0) return null;

        const targetTokens = targetName.toLowerCase().split('-');

        const candidates = models.filter(m => {
            const id = (m.key || m.id || '').toLowerCase();

            // Skip explicit exclusions
            if (skipModels.includes(id)) return false;

            // Must contain all target tokens
            const matchesTokens = targetTokens.every(t => id.includes(t));
            if (!matchesTokens) return false;

            // VL Awareness filter
            if (textOnly) {
                if (m.capabilities?.vision === true) return false;
                if (id.includes('-vl') || id.includes('vision')) return false;
            }

            return true;
        });

        if (candidates.length === 0) return null;

        // Sort candidates alphabetically reversed (z -> a) 
        // to prioritize v2 over v1, newer version over older
        candidates.sort((a, b) => {
            const idA = (a.key || a.id || '').toLowerCase();
            const idB = (b.key || b.id || '').toLowerCase();
            return idB.localeCompare(idA);
        });

        const bestMatch = candidates[0].id || candidates[0].key;
        logger.info(`⚡ [PRIME:DISCOVERY] Smart Match for '${targetName}': Selected "${bestMatch}" among ${candidates.length} options.`);
        return bestMatch;
    }

    /**
     * Loads a model into LM Studio's VRAM via the v1 REST API.
     * @param {number} port - LM Studio port
     * @param {string} modelId - Model identifier (must match LM Studio library)
     * @param {object} options - Optional load config
     * @returns {Promise<{ success: boolean, instanceId?: string, loadTime?: number, error?: string, isOOM?: boolean }>}
     */
    async _loadModel(port, modelId, options = {}) {
        try {
            logger.info(`⚡ [PRIME:VRAM] Loading model "${modelId}" on port ${port}...`);
            const body = {
                model: modelId,
                ...(options.context_length && { context_length: options.context_length }),
                ...(options.flash_attention !== undefined && { flash_attention: options.flash_attention })
            };

            const res = await fetch(`http://127.0.0.1:${port}/api/v1/models/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(120000) // 2-min timeout for large models
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                const isOOM = /out of memory|oom|vram|insufficient/i.test(errText);
                return { success: false, error: `Load failed (${res.status}): ${errText.slice(0, 200)}`, isOOM };
            }

            const data = await res.json();
            return {
                success: true,
                instanceId: data.instance_id,
                loadTime: data.load_time_seconds || 0
            };
        } catch (err) {
            return { success: false, error: err.message, isOOM: false };
        }
    }

    /**
     * Unloads a model from LM Studio's VRAM.
     * @param {number} port - LM Studio port
     * @param {string} instanceId - The instance_id to unload
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async _unloadModel(port, instanceId) {
        try {
            logger.info(`⚡ [PRIME:VRAM] Unloading model "${instanceId}" from port ${port}...`);
            const res = await fetch(`http://127.0.0.1:${port}/api/v1/models/unload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instance_id: instanceId }),
                signal: AbortSignal.timeout(15000)
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                return { success: false, error: errText };
            }

            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * VRAM Manager: Ensures the correct model is loaded on the target port.
     * Uses Smart Matching to find the best model. Self-corrects and tries 
     * alternatives if a loading error occurs.
     * Falls back to 7B on OOM errors for 14B requests.
     *
     * @param {number} port - Target LM Studio port
     * @param {string} targetName - The target string (e.g., '14b', '7b')
     * @returns {Promise<{ loaded: boolean, fallback: boolean }>}
     */
    async _ensureModel(port, targetName) {
        this.vramFallbackNote = null;

        try {
            const availableModels = await this._getAvailableModels(port);
            if (!availableModels || availableModels.length === 0) {
                logger.error(`⚡ [PRIME:VRAM] No models available in LM Studio.`);
                this._broadcastStatus('error', 'No Models Found');
                return { loaded: false, fallback: false };
            }

            const skipModels = [];
            let attempt = 0;
            const maxAttempts = 3;

            while (attempt < maxAttempts) {
                attempt++;
                const bestModelId = this._findBestModelMatch(availableModels, targetName, true, skipModels);

                if (!bestModelId) {
                    logger.warn(`⚡ [PRIME:VRAM] Could not find a matching model for requested target: "${targetName}".`);
                    break;
                }

                const loadedModels = await this._getLoadedModels(port);

                // Check VRAM status (not just disk presence)
                const alreadyInVRAM = loadedModels.some(id =>
                    id.toLowerCase().includes(bestModelId.toLowerCase())
                );
                if (alreadyInVRAM) {
                    logger.info(`⚡ [PRIME:VRAM] ✅ "${bestModelId}" confirmed active in VRAM.`);
                    this._broadcastStatus('ready', bestModelId);
                    return { loaded: true, fallback: false };
                }

                // Model found on disk but NOT in VRAM — force load
                logger.info(`⚡ [PRIME:VRAM] 🔍 "${bestModelId}" found on disk, requesting VRAM allocation...`);
                // UI Feedback: Starting swap sequence
                this._broadcastStatus('loading', bestModelId, { phase: 'Swapping Neural Links...' });

                // Eject any non-embedding LLMs currently loaded
                for (const modelId of loadedModels) {
                    if (modelId.toLowerCase().includes('bge')) continue;
                    logger.info(`⚡ [PRIME:VRAM] Ejecting "${modelId}" to free VRAM...`);
                    await this._unloadModel(port, modelId);
                }

                if (loadedModels.length > 0) {
                    logger.info(`⚡ [PRIME:VRAM] Waiting ${VRAM_SWAP_DELAY_MS / 1000}s for VRAM to clear...`);
                    await new Promise(resolve => setTimeout(resolve, VRAM_SWAP_DELAY_MS));
                }

                // Load the required model
                const loadResult = await this._loadModel(port, bestModelId, { flash_attention: true });

                if (loadResult.success) {
                    logger.info(`⚡ [PRIME:VRAM] ✅ "${bestModelId}" loaded in ${loadResult.loadTime}s.`);
                    this._broadcastStatus('ready', bestModelId);
                    return { loaded: true, fallback: false };
                }

                // Identify if the error was OOM
                if (loadResult.isOOM) {
                    if (targetName === '14b') {
                        logger.warn(`⚡ [PRIME:VRAM] ⚠️ OOM loading 14B ("${bestModelId}") — falling back to 7B...`);
                        this.vramFallbackNote = `⚠️ **VRAM Alert:** Could not load 14B model (Out of Memory). Automatically fell back to a 7B model. Consider closing other GPU applications.`;
                        return await this._ensureModel(port, '7b'); // Call recursively for 7B fallback
                    } else {
                        logger.error(`⚡ [PRIME:VRAM] ❌ OOM loading "${bestModelId}" and no fallback available.`);
                        break;
                    }
                }

                // If error NOT OOM, self-correct and try next best
                logger.warn(`⚡ [PRIME:VRAM] ⚠️ Load failed for "${bestModelId}": ${loadResult.error}. Retrying next available option...`);
                skipModels.push(bestModelId);
            }

            logger.error(`⚡ [PRIME:VRAM] ❌ Failed to load any matching model for "${targetName}" after retries.`);
            this._broadcastStatus('error', 'Neural Link Failed');
            return { loaded: false, fallback: false };
        } catch (err) {
            logger.error(`⚡ [PRIME:VRAM] _ensureModel error: ${err.message}`);
            this._broadcastStatus('error', 'Neural Link Error');
            return { loaded: false, fallback: false };
        }
    }

    /**
     * Returns currently loaded models on all ports for UI status display.
     * @returns {Promise<{ primaryPort: number, secondaryPort: number, primaryModels: string[], secondaryModels: string[], activeBrain: string }>}
     */
    async getGpuStatus() {
        const [primaryModels, secondaryModels] = await Promise.all([
            this._getLoadedModels(PRIMARY_PORT),
            this._getLoadedModels(SECONDARY_PORT)
        ]);

        // Determine the "active brain" — first non-embedding LLM found
        const allModels = [...primaryModels, ...secondaryModels];
        const activeBrain = allModels.find(m =>
            !m.toLowerCase().includes('bge')
        ) || 'None';

        return {
            primaryPort: PRIMARY_PORT,
            secondaryPort: SECONDARY_PORT,
            primaryModels,
            secondaryModels,
            activeBrain,
            vramFallbackNote: this.vramFallbackNote
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  HEADLESS PROMPT API (for internal services)
    // ═══════════════════════════════════════════════════════════

    /**
     * Headless AI prompt for internal services (Sentinel, Ghost, Architect, etc.).
     * Performs full Smart Routing and VRAM management WITHOUT the agentic loop.
     * @param {Array} messages - OpenAI-format messages array
     * @param {string} userText - Original user text for task classification
     * @param {object|string} options - Optional config object (or overrideModel string for legacy)
     * @returns {Promise<{ success: boolean, response?: string, error?: string, meta?: object }>}
     */
    async promptRaw(messages, userText = '', options = {}) {
        try {
            // Handle legacy signature where 3rd arg is overrideModel string
            const overrideModel = typeof options === 'string' ? options : (options.overrideModel || null);
            const extraOptions = typeof options === 'object' ? options : {};
            // Classify the task to pick the right model tier
            const profile = this._classifyTask(userText);

            // Determine endpoint and ensure model is loaded
            let activeEndpoint = LM_STUDIO_PRIMARY;

            if (overrideModel) {
                logger.info(`⚡ [PRIME:RAW] Overriding smart routing, forcing model: ${overrideModel}`);
                await this._ensureModel(PRIMARY_PORT, overrideModel);
                activeEndpoint = LM_STUDIO_PRIMARY;
            } else if (profile.name === 'SMART_LOGIC') {
                const secondaryAlive = await this._pingPort(SECONDARY_PORT);
                if (secondaryAlive) {
                    activeEndpoint = LM_STUDIO_SECONDARY;
                } else {
                    await this._ensureModel(PRIMARY_PORT, '14b');
                    activeEndpoint = LM_STUDIO_PRIMARY;
                }
            } else {
                // FAST_UI: ensure 7B is in VRAM
                await this._ensureModel(PRIMARY_PORT, '7b');
                activeEndpoint = LM_STUDIO_PRIMARY;
            }

            const inferenceOptions = {
                temperature: extraOptions.temperature ?? profile.temperature,
                max_tokens: extraOptions.max_tokens ?? profile.max_tokens,
                endpoint: activeEndpoint,
                model: overrideModel // Pass it down to _callLM
            };

            logger.info(`⚡ [PRIME:RAW] Sending prompt (${messages.length} msgs) via ${profile.name} | endpoint=${activeEndpoint}`);

            // promptRaw should NOT include OpenAI-style tool definitions.
            // Subagents use custom <tool_call> text tags instead.
            const assistantMsg = await this._callLM(messages, inferenceOptions, false);
            if (!assistantMsg || !assistantMsg.content) {
                return { success: false, error: 'LM Studio returned empty response.' };
            }

            // Strip <think> tags for clean output
            const { thinking, response } = this._parseThinkTags(assistantMsg.content);

            return {
                success: true,
                response,
                thinking,
                meta: { profile: profile.name, endpoint: activeEndpoint }
            };
        } catch (err) {
            logger.error(`⚡ [PRIME:RAW] Prompt failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  TASK CLASSIFICATION ENGINE
    // ═══════════════════════════════════════════════════════════

    /**
     * Classifies user input into FAST_UI or SMART_LOGIC based on keyword matching.
     * @param {string} userMessage - The user's message text
     * @returns {object} The matching task profile with inference parameters
     */
    _classifyTask(userMessage) {
        // Robust extraction: input may be string, message array, or object
        let textToClassify = '';
        if (typeof userMessage === 'string') {
            textToClassify = userMessage;
        } else if (Array.isArray(userMessage)) {
            textToClassify = userMessage[userMessage.length - 1]?.content || '';
        } else if (typeof userMessage === 'object' && userMessage !== null) {
            textToClassify = userMessage.content || userMessage.text || userMessage.message || '';
        }
        const lower = textToClassify.toLowerCase();

        let fastScore = 0;
        let smartScore = 0;

        for (const kw of TASK_PROFILES.FAST_UI.keywords) {
            if (lower.includes(kw)) fastScore++;
        }
        for (const kw of TASK_PROFILES.SMART_LOGIC.keywords) {
            if (lower.includes(kw)) smartScore++;
        }

        const profile = smartScore >= fastScore ? TASK_PROFILES.SMART_LOGIC : TASK_PROFILES.FAST_UI;
        logger.info(`⚡ [PRIME] Task classified as ${profile.name} | temp=${profile.temperature} | max_tokens=${profile.max_tokens} | fast=${fastScore} smart=${smartScore}`);
        return profile;
    }

    // ═══════════════════════════════════════════════════════════
    //  PORT HEALTH CHECK
    // ═══════════════════════════════════════════════════════════

    /**
     * Pings an LM Studio port to check if a model is loaded and responsive.
     * @param {number} port - The port number to ping
     * @returns {Promise<boolean>} True if the port is alive
     */
    async _pingPort(port) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  LM STUDIO COMMUNICATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Sends a request to the local LM Studio API with dynamic parameters.
     * @param {Array} messages - OpenAI-format messages
     * @param {object} options - Dynamic inference options
     * @param {number} options.temperature - Sampling temperature
     * @param {number} options.max_tokens - Max output tokens
     * @param {string} options.endpoint - LM Studio endpoint URL
     * @param {boolean} includeTools - Whether to include tool definitions
     * @returns {Promise<object>} LM Studio response
     */
    async _callLM(messages, options = {}, includeTools = true) {
        const temperature = options.temperature ?? 0.4;
        const max_tokens = options.max_tokens ?? 4096;
        const endpoint = options.endpoint ?? LM_STUDIO_PRIMARY;
        const model = options.model || 'local-model';

        // ── Strict Payload Normalization ──────────────────────
        // LM Studio requires every `content` field to be a plain string.
        // Internal callers may pass objects, arrays, or nested content.
        const normalizedMessages = (Array.isArray(messages) ? messages : []).map(msg => {
            let safeContent = '';
            // ... (normalization logic)
            if (typeof msg.content === 'string') {
                safeContent = msg.content;
            } else if (Array.isArray(msg.content)) {
                safeContent = msg.content.map(part => {
                    if (typeof part === 'string') return part;
                    if (part?.text) return part.text;
                    return JSON.stringify(part);
                }).join('\n');
            } else if (typeof msg.content === 'object' && msg.content !== null) {
                safeContent = msg.content.text || msg.content.message || JSON.stringify(msg.content);
            } else if (msg.content != null) {
                safeContent = String(msg.content);
            }

            return { role: msg.role || 'user', content: safeContent };
        });

        const body = {
            model: model,
            messages: normalizedMessages,
            temperature,
            max_tokens,
            stream: false
        };

        if (includeTools) {
            body.tools = TOOLS;
            body.tool_choice = 'auto';
        }

        logger.info(`⚡ [PRIME] _callLM → endpoint=${endpoint} | temp=${temperature} | max_tokens=${max_tokens}`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(900000) // 15-minute timeout for DeepThink models
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`LM Studio error ${response.status}: ${errText}`);
        }

        const data = await response.json();

        // Debug raw payload structure
        logger.info(`⚡ [PRIME:RAW_RESPONSE] Payload Keys: ${Object.keys(data).join(', ')}`);
        if (!data.choices) logger.error(`⚡ [PRIME:RAW_RESPONSE] Bad Payload: ${JSON.stringify(data).substring(0, 500)}`);

        // Handle varying LM Studio payload structures (Instruct vs Chat vs Raw)
        if (data.choices && data.choices.length > 0) {
            const choice = data.choices[0];
            if (choice.message) {
                // Handle tool_calls responses (model may respond with tool_calls instead of content)
                if (choice.message.tool_calls && choice.message.tool_calls.length > 0 && !choice.message.content) {
                    const toolCall = choice.message.tool_calls[0];
                    const toolContent = JSON.stringify({ toolName: toolCall.function?.name, args: JSON.parse(toolCall.function?.arguments || '{}') });
                    return { role: 'assistant', content: `<tool_call>\n${toolContent}\n</tool_call>` };
                }
                return choice.message;
            }
            if (choice.text) return { role: 'assistant', content: choice.text };
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  THINK-TAG PARSER
    // ═══════════════════════════════════════════════════════════

    /**
     * Separates <think>...</think> reasoning from the final response.
     * @param {string} text - Raw AI response
     * @returns {{ thinking: string, response: string }}
     */
    _parseThinkTags(text) {
        if (!text) return { thinking: '', response: '' };

        const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
        const thinkBlocks = [];
        let match;

        while ((match = thinkRegex.exec(text)) !== null) {
            thinkBlocks.push(match[1].trim());
        }

        const response = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        // Handle unclosed <think> tags (streaming artifacts)
        const cleanResponse = response.replace(/<\/?think>/gi, '').trim();

        return {
            thinking: thinkBlocks.join('\n\n'),
            response: cleanResponse
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  TOOL EXECUTORS
    // ═══════════════════════════════════════════════════════════

    /**
     * Executes a tool call and returns the result.
     * @param {string} toolName
     * @param {object} args
     * @returns {Promise<string>} Tool execution result
     */
    async _executeTool(toolName, args) {
        logger.info(`⚡ [PRIME] Tool call: ${toolName}(${JSON.stringify(args).slice(0, 100)}...)`);

        switch (toolName) {
            case 'readFile':
                return this._toolReadFile(args);
            case 'writeFile':
                return await this._toolWriteFile(args);
            case 'executeCommand':
                return this._toolExecuteCommand(args);
            case 'runPlaywrightTest':
                return await this._toolPlaywright(args);
            case 'scrapeWebPage':
                return await scrapeWebPage(args.url);
            case 'executeCode':
                return await executeCode(args.language, args.code);
            case 'performWebSearch':
                const SearchSkill = (await import('../skills/searchSkill.js')).default;
                return await SearchSkill.performWebSearch(args.query || args.queries, args.searchDepth || 'Normal');
            case 'getSystemHardwareStats':
                const { getSystemHardwareStats } = await import('../skills/systemSkill.js');
                return await getSystemHardwareStats();
            default:
                return `Error: Unknown tool "${toolName}"`;
        }
    }

    _toolReadFile(args) {
        try {
            const absPath = path.resolve(PROJECT_ROOT, args.filePath);
            // Security: prevent reading outside project
            if (!absPath.startsWith(path.resolve(PROJECT_ROOT))) {
                return 'Error: Access denied — path is outside project root.';
            }
            if (!fs.existsSync(absPath)) {
                return `Error: File not found: ${args.filePath}`;
            }
            const content = fs.readFileSync(absPath, 'utf-8');
            // Truncate very large files
            if (content.length > 15000) {
                return content.slice(0, 15000) + '\n\n... [TRUNCATED — file too large, read specific sections]';
            }
            return content;
        } catch (err) {
            return `Error reading file: ${err.message}`;
        }
    }

    async _toolWriteFile(args) {
        try {
            const absPath = path.resolve(PROJECT_ROOT, args.filePath);
            if (!absPath.startsWith(path.resolve(PROJECT_ROOT))) {
                return 'Error: Access denied — path is outside project root.';
            }

            // Read original content if file exists
            let original = null;
            if (fs.existsSync(absPath)) {
                original = fs.readFileSync(absPath, 'utf-8');
            }

            let proposedContent = args.content;

            // Handle SEARCH/REPLACE atomic patch logic if both exist
            if (original && proposedContent.includes('SEARCH:') && proposedContent.includes('REPLACE:')) {
                const searchMatch = proposedContent.match(/SEARCH:\s*?\n([\s\S]*?)REPLACE:/);
                const replaceMatch = proposedContent.match(/REPLACE:\s*?\n([\s\S]*)/);

                if (searchMatch && replaceMatch) {
                    const searchBlock = searchMatch[1].trim();
                    const replaceBlock = replaceMatch[1].trim();

                    if (original.includes(searchBlock)) {
                        proposedContent = original.replace(searchBlock, replaceBlock);
                        logger.info(`⚡ [PRIME] Surgical patch applied exactly for ${args.filePath}`);
                    } else {
                        const escapedSearch = searchBlock.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s+');
                        const regex = new RegExp(escapedSearch);

                        if (regex.test(original)) {
                            proposedContent = original.replace(regex, replaceBlock);
                            logger.info(`⚡ [PRIME] Surgical patch applied (flexible whitespace) for ${args.filePath}`);
                        } else {
                            return `Error: SEARCH block not found in the original file. Ensure the code matches exactly.`;
                        }
                    }
                }
            }

            // Stage as Pending Patch — do NOT write to disk
            this.patchCounter++;
            const patchId = `patch-${this.patchCounter}-${Date.now()}`;

            // ── Docker Sandbox Pre-Test (non-blocking) ──────────
            let sandboxWarning = '';
            const ext = path.extname(args.filePath).toLowerCase();
            if (ext === '.js' || ext === '.py') {
                try {
                    const env = ext === '.py' ? 'python' : 'node';
                    const sandboxResult = await executeInSandbox(proposedContent, env);
                    if (!sandboxResult.success && sandboxResult.error !== 'DOCKER_UNAVAILABLE') {
                        sandboxWarning = `\n⚠️ **Sandbox Warning:** Code produced errors during isolated testing:\n\`\`\`\n${sandboxResult.stderr.slice(0, 500)}\n\`\`\``;
                        logger.warn(`⚡ [PRIME] Sandbox flagged issues for ${args.filePath}: ${sandboxResult.stderr.slice(0, 200)}`);
                    } else if (sandboxResult.success) {
                        logger.info(`⚡ [PRIME] ✅ Sandbox pre-test PASSED for ${args.filePath}`);
                    }
                } catch (sandboxErr) {
                    // Sandbox failure is non-blocking — just log it
                    logger.warn(`⚡ [PRIME] Sandbox pre-test skipped: ${sandboxErr.message}`);
                }
            }

            this.pendingPatches.push({
                id: patchId,
                filePath: args.filePath,
                absolutePath: absPath,
                content: proposedContent,
                description: args.description || 'No description',
                original,
                isNewFile: original === null,
                status: 'pending',
                sandboxWarning: sandboxWarning || null,
                createdAt: new Date().toISOString()
            });

            logger.info(`⚡ [PRIME] Patch staged: ${patchId} → ${args.filePath}`);
            return `✅ Patch staged for human review: [${patchId}] ${args.filePath} — "${args.description}". The human will review the diff and decide to Approve or Reject.${sandboxWarning}`;
        } catch (err) {
            return `Error staging patch: ${err.message}`;
        }
    }

    _toolExecuteCommand(args) {
        try {
            const cmd = args.command || '';
            const cmdLower = cmd.toLowerCase().trim();

            // ═══ God-Mode Route: Windows Native Actions ═══════════
            if (cmdLower.startsWith('start ') || cmdLower.startsWith('explorer ')) {
                // Defer to the enhanced WindowsSkill which has non-blocking spawn logic
                return import('../skills/windowsSkill.js').then(module => {
                    return module.default.executeIntent({ command: cmd })
                        .then(res => res.payload)
                        .catch(err => `Command Error: ${err.message}`);
                }).catch(err => `Command Import Error: ${err.message}`);
            }

            // ═══ OpenClaw-Assimilated Security Gate ═══════════════
            // Phase 56: Hardened with patterns from OpenClaw's bash-tools.exec.ts
            // and sandbox-paths.ts assertSandboxPath escape prevention.

            // 1. Expanded Blocklist (destructive commands)
            const blocked = [
                'rm -rf /', 'rm -rf ~', 'rm -rf .', 'rm -rf *',
                'format ', 'del /f /s', 'del /q', 'shutdown', 'mkfs',
                'dd if=', ':(){', 'fork bomb', '> /dev/sda',
                'wget ', 'curl ', // Block external downloads from subagents
                'chmod 777', 'chmod -R 777',
                'passwd', 'useradd', 'userdel', 'usermod',
                'iptables', 'netsh',
                'reg delete', 'reg add',
                'powershell -enc', 'powershell -e ', // Encoded commands
            ];
            if (blocked.some(b => cmdLower.includes(b))) {
                logger.warn(`⚡ [PRIME:SECURITY] 🛡️ BLOCKED dangerous command: "${cmd.substring(0, 80)}"`);
                return 'Error: Command blocked by NexusOS Security Policy (OpenClaw Quarantine Gate).';
            }

            // 2. Shell Injection Guards (OpenClaw validateScriptFileForShellBleed pattern)
            const shellInjection = /[;&|`$()]/.test(cmd) && (
                cmd.includes('$(') || cmd.includes('`') ||
                cmd.includes(' | ') || cmd.includes(' && ') ||
                cmd.includes(' ; ')
            );
            if (shellInjection) {
                logger.warn(`⚡ [PRIME:SECURITY] 🛡️ Shell injection pattern detected: "${cmd.substring(0, 80)}"`);
                return 'Error: Command contains shell injection patterns. Use simple, single commands only.';
            }

            // 3. Path Escape Prevention (OpenClaw assertSandboxPath pattern)
            const projectRootResolved = path.resolve(PROJECT_ROOT);
            if (cmd.includes('..') || cmd.includes('~')) {
                // Check if the command would escape the project root
                const pathParts = cmd.split(/\s+/);
                for (const part of pathParts) {
                    if (part.includes('..') || part.startsWith('~')) {
                        const resolved = path.resolve(PROJECT_ROOT, part);
                        if (!resolved.startsWith(projectRootResolved)) {
                            logger.warn(`⚡ [PRIME:SECURITY] 🛡️ Path escape attempt blocked: "${part}"`);
                            return 'Error: Path escapes project sandbox root. Access denied.';
                        }
                    }
                }
            }

            // 4. Execute within jail
            logger.info(`⚡ [PRIME:EXEC] Running sandboxed command: "${cmd.substring(0, 100)}"`);
            const output = execSync(cmd, {
                cwd: PROJECT_ROOT,
                encoding: 'utf-8',
                timeout: 30000,
                maxBuffer: 1024 * 512,
                windowsHide: true
            });
            return output.slice(0, 5000) || '(no output)';
        } catch (err) {
            return `Command error: ${err.stderr || err.message}`.slice(0, 3000);
        }
    }

    async _toolPlaywright(args) {
        try {
            const targetUrl = args.targetUrl || 'http://localhost:5173';
            const tmpFile = path.join(PROJECT_ROOT, 'data', `prime_test_${Date.now()}.mjs`);

            // Wrap user test code in Playwright boilerplate
            const script = `
import { chromium } from 'playwright';

const consoleLogs = [];

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => consoleLogs.push(\`[\${msg.type()}] \${msg.text()}\`));
    page.on('pageerror', err => consoleLogs.push(\`[ERROR] \${err.message}\`));

    try {
        await page.goto('${targetUrl}', { waitUntil: 'networkidle', timeout: 15000 });

        // --- USER TEST CODE START ---
        ${args.testCode}
        // --- USER TEST CODE END ---

        console.log('__CONSOLE_LOGS__' + JSON.stringify(consoleLogs));
        console.log('__TEST_PASSED__');
    } catch (err) {
        console.log('__CONSOLE_LOGS__' + JSON.stringify(consoleLogs));
        console.error('__TEST_FAILED__: ' + err.message);
    } finally {
        await browser.close();
    }
})();
`.trim();

            fs.writeFileSync(tmpFile, script, 'utf-8');

            const output = execSync(`node "${tmpFile}"`, {
                cwd: PROJECT_ROOT,
                encoding: 'utf-8',
                timeout: 30000,
                maxBuffer: 1024 * 512
            });

            // Cleanup
            try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }

            // Extract console logs
            const logsMatch = output.match(/__CONSOLE_LOGS__(.*)/);
            const passed = output.includes('__TEST_PASSED__');
            const consoleLogs = logsMatch ? JSON.parse(logsMatch[1]) : [];

            return JSON.stringify({
                passed,
                consoleLogs,
                output: output.replace(/__CONSOLE_LOGS__.*/, '').replace(/__TEST_PASSED__/, '').trim()
            }, null, 2);
        } catch (err) {
            return `Playwright test error: ${err.stderr || err.message}`.slice(0, 3000);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  AGENTIC LOOP
    // ═══════════════════════════════════════════════════════════

    /**
     * Runs the full agentic loop: sends user message to LM Studio,
     * processes tool calls, feeds results back, repeats until the
     * AI produces a final text response or max cycles are reached.
     *
     * @param {string} userMessage - User's command/request
     * @param {string} overrideModel - Optional model ID to force load instead of auto-routing
     * @returns {Promise<{ thinking: string, response: string, patches: Array, toolCalls: Array }>}
     */
    async chat(userMessage, overrideModel = null) {
        if (this.isProcessing) {
            return { thinking: '', response: 'Already processing a request. Please wait.', patches: [], toolCalls: [] };
        }

        this.isProcessing = true;
        const toolCallLog = [];

        try {
            // ── Step 1: Classify the task ────────────────────────
            const profile = this._classifyTask(userMessage);
            this.activeProfile = profile;

            // ── Step 2: VRAM Management — ensure correct model ──
            let activeEndpoint = LM_STUDIO_PRIMARY;
            let routingNote = '';

            if (overrideModel) {
                logger.info(`⚡ [PRIME] Overriding smart routing, forcing model: ${overrideModel}`);
                const ensureResult = await this._ensureModel(PRIMARY_PORT, overrideModel);
                activeEndpoint = LM_STUDIO_PRIMARY;
                if (!ensureResult.loaded) routingNote = `\n\n⚠️ **Model Warning:** Could not load requested model ${overrideModel}.`;
            } else if (profile.name === 'SMART_LOGIC') {
                // Try to use secondary port first (dedicated 14B)
                const secondaryAlive = await this._pingPort(SECONDARY_PORT);
                if (secondaryAlive) {
                    activeEndpoint = LM_STUDIO_SECONDARY;
                    logger.info(`⚡ [PRIME] 14B detected on port ${SECONDARY_PORT} — routing SMART_LOGIC task`);
                } else {
                    // Fallback: swap VRAM on PRIMARY port to 14B
                    logger.info(`⚡ [PRIME] Secondary port offline — VRAM swap on primary port...`);
                    const ensureResult = await this._ensureModel(PRIMARY_PORT, '14b');
                    activeEndpoint = LM_STUDIO_PRIMARY;

                    if (ensureResult.fallback) {
                        routingNote = `\n\n${this.vramFallbackNote || ''}`;
                    } else if (!ensureResult.loaded) {
                        routingNote = `\n\n⚠️ **Model Warning:** Could not load the required model. Results may be degraded.`;
                    }
                }
            } else {
                // FAST_UI: ensure 7B is loaded on primary
                await this._ensureModel(PRIMARY_PORT, '7b');
                activeEndpoint = LM_STUDIO_PRIMARY;
            }

            const inferenceOptions = {
                temperature: profile.temperature,
                max_tokens: profile.max_tokens,
                endpoint: activeEndpoint,
                model: overrideModel // pass downward explicitly 
            };

            // Add user message to history
            this.conversationHistory.push({ role: 'user', content: userMessage });

            // Build messages with system prompt
            const SURGICAL_PROMPT = `You are the Nexus-Prime Surgical Architect. To avoid timeouts/truncation, ALWAYS use SEARCH/REPLACE blocks.\nFormat:\nFILE: [path]\nSEARCH:\n[exact code to find]\nREPLACE:\n[new code]\nDo not rewrite full files.`;
            const messages = [
                { role: 'system', content: SURGICAL_PROMPT },
                { role: 'system', content: SYSTEM_PROMPT },
                ...this.conversationHistory.slice(-20) // Keep last 20 messages for context
            ];

            let cycles = 0;
            let retryCount = 0;

            while (cycles < MAX_AGENTIC_CYCLES) {
                cycles++;
                logger.info(`⚡ [PRIME] Agentic cycle ${cycles}/${MAX_AGENTIC_CYCLES} | profile=${profile.name} | temp=${inferenceOptions.temperature}`);

                const assistantMsg = await this._callLM(messages, inferenceOptions);
                if (!assistantMsg) throw new Error('LM Studio returned empty response.');

                // Check for tool calls
                if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
                    // Add assistant message with tool calls to history
                    messages.push(assistantMsg);

                    // Execute each tool call
                    for (const tc of assistantMsg.tool_calls) {
                        const fnName = tc.function.name;
                        let args;
                        try {
                            args = JSON.parse(tc.function.arguments);
                        } catch {
                            args = { error: 'Failed to parse arguments' };
                        }

                        const result = await this._executeTool(fnName, args);

                        toolCallLog.push({
                            tool: fnName,
                            args: fnName === 'writeFile' ? { ...args, content: args.content?.slice(0, 200) + '...' } : args,
                            result: result.slice(0, 500)
                        });

                        // Feed tool result back
                        messages.push({
                            role: 'tool',
                            tool_call_id: tc.id,
                            content: result
                        });
                    }

                    // Continue the loop — AI may want to call more tools
                    continue;
                }

                // No tool calls — this is the final response
                const content = assistantMsg.content || '';
                const parsed = this._parseThinkTags(content);

                // ── Self-Correction: Detect syntax errors in response ──
                const hasSyntaxError = SYNTAX_ERROR_PATTERNS.some(p => parsed.response.includes(p));
                if (hasSyntaxError && retryCount < 1) {
                    retryCount++;
                    logger.warn(`⚡ [PRIME] Syntax error detected in AI response — triggering self-correction (retry ${retryCount})`);

                    // Override to strict mode
                    inferenceOptions.temperature = 0.1;

                    // Inject corrective instruction
                    messages.push({ role: 'assistant', content });
                    messages.push({
                        role: 'user',
                        content: '⚠️ SYSTEM SELF-CORRECTION: Your previous response contained a syntax error. Re-generate the code with strict syntax rules. Double-check all quotes, braces, and parentheses are properly closed.'
                    });

                    // Continue the loop for the corrected attempt
                    continue;
                }

                // Save to conversation history
                this.conversationHistory.push({ role: 'assistant', content });

                this.isProcessing = false;
                this.activeProfile = null;
                return {
                    thinking: parsed.thinking,
                    response: parsed.response + routingNote,
                    patches: this.pendingPatches.filter(p => p.status === 'pending'),
                    toolCalls: toolCallLog,
                    meta: { profile: profile.name, temperature: inferenceOptions.temperature, endpoint: activeEndpoint }
                };
            }

            // Max cycles reached
            this.isProcessing = false;
            this.activeProfile = null;
            return {
                thinking: '',
                response: `⚠️ Reached maximum agentic cycles (${MAX_AGENTIC_CYCLES}). Partial results may be available in pending patches.` + routingNote,
                patches: this.pendingPatches.filter(p => p.status === 'pending'),
                toolCalls: toolCallLog,
                meta: { profile: profile.name, temperature: inferenceOptions.temperature, endpoint: activeEndpoint }
            };
        } catch (err) {
            logger.error(`⚡ [PRIME] Agentic loop error: ${err.message}`);
            this.isProcessing = false;
            this.activeProfile = null;
            return {
                thinking: '',
                response: `❌ Error: ${err.message}`,
                patches: [],
                toolCalls: toolCallLog
            };
        }
    }

    // Note: promptRaw() is defined above (after getGpuStatus) with _ensureModel() VRAM gate.

    // ═══════════════════════════════════════════════════════════
    //  PATCH MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    /** Approve a pending patch and write it to disk. */
    approvePatch(patchId) {
        const patch = this.pendingPatches.find(p => p.id === patchId);
        if (!patch) return { success: false, message: 'Patch not found.' };
        if (patch.status !== 'pending') return { success: false, message: `Patch already ${patch.status}.` };

        try {
            const dir = path.dirname(patch.absolutePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(patch.absolutePath, patch.content, 'utf-8');
            patch.status = 'approved';
            patch.approvedAt = new Date().toISOString();

            logger.info(`⚡ [PRIME] ✅ Patch approved & injected: ${patch.filePath}`);
            return { success: true, filePath: patch.filePath, message: `Injected: ${patch.filePath}` };
        } catch (err) {
            patch.status = 'failed';
            return { success: false, message: err.message };
        }
    }

    /** Reject a pending patch. */
    rejectPatch(patchId) {
        const patch = this.pendingPatches.find(p => p.id === patchId);
        if (!patch) return { success: false, message: 'Patch not found.' };
        patch.status = 'rejected';
        logger.info(`⚡ [PRIME] ❌ Patch rejected: ${patch.filePath}`);
        return { success: true, message: `Rejected: ${patch.filePath}` };
    }

    /** Get all pending patches. */
    getPatches(status = 'pending') {
        return this.pendingPatches.filter(p => p.status === status);
    }

    /** Get status. */
    getStatus() {
        return {
            isProcessing: this.isProcessing,
            conversationLength: this.conversationHistory.length,
            totalPatches: this.pendingPatches.length,
            pendingPatches: this.pendingPatches.filter(p => p.status === 'pending').length,
            approvedPatches: this.pendingPatches.filter(p => p.status === 'approved').length
        };
    }

    /** Clear conversation history. */
    clearHistory() {
        this.conversationHistory = [];
        return { success: true };
    }
}

export default new NexusPrimeEngine();
