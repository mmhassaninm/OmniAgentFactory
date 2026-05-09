import crypto from 'crypto';
import { MongoClient } from 'mongodb';
import logger from '@nexus/logger';
import nexusPrimeEngine from './nexusPrimeEngine.js';
import vramManager from './vramManager.js';

// Use same DB connection as the rest of the OS, but create our own client if needed.
// However, to keep it simple and robust, we'll manage a dedicated connection for the AI Gateway cache.
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'NexusOS';
const COLLECTION_CACHE = 'ai_request_cache';

class AiOrchestrator {
    constructor() {
        this.queue = {
            CRITICAL: [],
            HIGH: [],
            LOW: []
        };
        this.isProcessing = false;
        this.activeTask = null;

        // Metrics for the Dashboard
        this.metrics = {
            totalRequests: 0,
            cacheHits: 0,
            vramSaved: 0
        };

        this._client = null;
        this.db = null;
        this.cacheCollection = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        try {
            this._client = new MongoClient(MONGO_URI);
            await this._client.connect();
            this.db = this._client.db(DB_NAME);
            this.cacheCollection = this.db.collection(COLLECTION_CACHE);

            // Ensure fast lookups by hash
            await this.cacheCollection.createIndex({ hash: 1 }, { unique: true });

            this.isInitialized = true;
            logger.info('[AiOrchestrator] 🎛️ Nexus AI Gateway Initialized.');
        } catch (err) {
            logger.error(`[AiOrchestrator] Failed to connect to MongoDB: ${err.message} `);
        }
    }

    _generateHash(systemPrompt, userPrompt, priority) {
        // Hash depends on system prompt and user prompt.
        // Priority is included to differentiate if needed, though usually semantic cache should be agnostic to priority.
        const raw = `${systemPrompt}::${userPrompt} `;
        return crypto.createHash('sha256').update(raw).digest('hex');
    }

    async prompt(systemPrompt, userPrompt, priority = 'LOW', options = {}) {
        if (!this.isInitialized) await this.init();

        this.metrics.totalRequests++;

        try {
            vramManager.recordActivity();
            const isWarm = await vramManager.isEngineWarm();
            if (!isWarm) {
                logger.info('[AiOrchestrator] VRAM Manager detected cold engine. Broadcasting warmup event.');
                vramManager._emitUINotification('[GPU Breather: Warming up AI Engine...]');
            }
        } catch (vramErr) {
            logger.error(`[AiOrchestrator] VRAM Manager Error: ${vramErr.message}`);
        }

        // 1. Semantic Zero-Shot Cache Check
        const hash = this._generateHash(systemPrompt, userPrompt);
        if (this.isInitialized && !options.overrideModel) { // Don't cache if forcing a specific model
            const cached = await this.cacheCollection.findOne({ hash });
            if (cached) {
                this.metrics.cacheHits++;
                this.metrics.vramSaved += (userPrompt.length + cached.response.length); // Rough approximation
                logger.info(`[AiOrchestrator] ⚡ CACHE HIT for task(${priority}).VRAM protected.`);
                this._broadcastMetrics();
                return { success: true, response: cached.response, cached: true };
            }
        }

        // 2. Enqueue Task
        return new Promise((resolve, reject) => {
            const task = {
                id: crypto.randomUUID(),
                systemPrompt,
                userPrompt,
                priority,
                options,
                hash,
                resolve,
                reject,
                queuedAt: Date.now()
            };

            if (this.queue[priority]) {
                this.queue[priority].push(task);
            } else {
                this.queue.LOW.push(task); // Fallback
            }

            logger.info(`[AiOrchestrator] 📥 Task Queued[${priority}].Waiters: C:${this.queue.CRITICAL.length} H:${this.queue.HIGH.length} L:${this.queue.LOW.length} `);
            this._broadcastMetrics();

            // If it's a critical task, we could potentially interrupt, but for now we'll process eagerly.
            this._processQueue();
        });
    }

    async _processQueue() {
        if (this.isProcessing) return;

        // Select next task by priority
        let nextTask = null;
        if (this.queue.CRITICAL.length > 0) {
            nextTask = this.queue.CRITICAL.shift();
        } else if (this.queue.HIGH.length > 0) {
            nextTask = this.queue.HIGH.shift();
        } else if (this.queue.LOW.length > 0) {
            nextTask = this.queue.LOW.shift();
        }

        if (!nextTask) return; // Queue empty

        this.isProcessing = true;
        this.activeTask = { id: nextTask.id, priority: nextTask.priority, userPrompt: nextTask.userPrompt.substring(0, 50) + '...' };
        this._broadcastMetrics();

        try {
            logger.info(`[AiOrchestrator] 🚀 Executing Task[${nextTask.priority}]...`);

            // Lazy load nexusPrimeEngine to avoid circular dependencies
            const nexusPrimeEngine = (await import('./nexusPrimeEngine.js')).default;
            const messages = [
                { role: 'system', content: nextTask.systemPrompt },
                { role: 'user', content: nextTask.userPrompt }
            ];

            // Critical tasks might need high urgency routing
            const result = await nexusPrimeEngine.promptRaw(messages, nextTask.userPrompt, nextTask.options || {});

            if (result.success && result.response) {
                // Anti-Chinese Shield 
                result.response = result.response.replace(/[\u4e00-\u9fff]/g, '[تم حجب خطأ نظام غير مفهوم - جاري المعالجة]');

                // Save to Cache
                if (this.isInitialized) {
                    await this.cacheCollection.updateOne(
                        { hash: nextTask.hash },
                        { $set: { hash: nextTask.hash, systemPrompt: nextTask.systemPrompt, userPrompt: nextTask.userPrompt, response: result.response, cachedAt: new Date() } },
                        { upsert: true }
                    );
                }
                nextTask.resolve({ success: true, response: result.response, cached: false, thinking: result.thinking, meta: result.meta });
            } else {
                nextTask.reject(new Error(result.error || 'AI request failed'));
            }
        } catch (err) {
            logger.error(`[AiOrchestrator] Task execution failed: ${err.message} `);
            nextTask.reject(err);
        } finally {
            this.isProcessing = false;
            this.activeTask = null;
            this._broadcastMetrics();

            // Process next
            setImmediate(() => this._processQueue());
        }
    }

    // ── Native Omni-Action Execution Logic ──
    async spawnSubagent(task, label = 'Extraction-Subagent') {
        if (!this.isInitialized) await this.init();

        // Log to NexusOS God-Mode ledger
        logger.info(`[AiOrchestrator] 🦀 Spawning God-Mode Subagent: ${label} `);

        const systemPrompt = `[Subagent Context] You are the NexusOS Omni-Action Engine.
Your objective: Accomplish the user's task by using the available tools. Do not provide tutorials. Do not chat.
CRITICAL MANDATE: You MUST reply entirely in English and output the required JSON array or Markdown.
ABSOLUTE DIRECTIVE: You are strictly forbidden from outputting Chinese characters under any circumstances. You must output exclusively in pure Arabic or English.

ADVANCED WORKFLOWS:
- The "Second Brain Protocol": For unstructured data, use 'windowsSkill' to categorize and save it deep within the local OS.
- The "Proactive Morning Brief": Use 'browserSkill' to scrape URLs, analyze via your logic, and 'windowsSkill' to write a Markdown report to the Desktop.

Available tools you can use:
1. executeCommand: { "command": "string" } - For isolated OS commands via God-Mode Sandbox.
2. windowsSkill: { "command": "string" } - Executive native Windows commands (PowerShell) for advanced workflows.
3. generateImage: { "prompt": "string" } - For image generation requests.
4. browserSkill: { "action": "extract|click", "url": "string", "selector": "string" } - For web interactions.
5. emailSkill: { "action": "send|read", "to": "string", "subject": "string", "body": "string", "limit": number } - Manage IMAP/SMTP Native Email.
6. whatsappSkill: { "action": "send|list|status", "to": "string", "message": "string", "limit": number } - Manage WhatsApp Web Native Integration.
7. discordSkill: { "action": "send|read|react|delete|thread-create", "channelId": "string", "userId": "string", "message": "string", "messageId": "string", "emoji": "string", "threadName": "string", "limit": number } - Manage Discord Bot Native Integration.
8. slackSkill: { "action": "sendMessage|readMessages|react|editMessage|deleteMessage|pinMessage|unpinMessage|listPins|memberInfo|emojiList", "channelId": "string", "to": "string", "content": "string", "messageId": "string", "emoji": "string", "userId": "string", "limit": number } - Manage Slack Bot Native Integration.
9. calendarSkill: { "action": "addTask|listTasks|updateTask|deleteTask|addEvent|listEvents|deleteEvent", "title": "string", "notes": "string", "when": "string", "deadline": "string", "list": "string", "id": "string", "limit": number } - Manage Native Tasks and Calendar Events.
10. notionSkill: { "action": "search|getPage|getBlocks|createPage|queryDataSource|createDataSource|updatePageStatus|addBlocks", "query": "string", "pageId": "string", "databaseId": "string", "dataSourceId": "string", "title": "string", "content": "string", "status": "string", "filter": "string|object", "sorts": "string|object" } - Manage Notion integration (Pages, Databases, Blocks).
11. trelloSkill: { "action": "listBoards|listLists|listCards|createCard|moveCard|addComment|archiveCard", "boardId": "string", "listId": "string", "cardId": "string", "name": "string", "desc": "string", "newListId": "string", "text": "string" } - Manage Trello boards, lists, and cards.
12. obsidianSkill: { "action": "listNotes|readNote|createNote|appendNote|searchNotes", "title": "string", "content": "string", "query": "string" } - Manage local Obsidian/Markdown vaults.
13. githubSkill: { "action": "listPRs|viewPR|listIssues|viewIssue|createIssue|runAPIQuery", "repo": "string", "prNumber": "string", "issueNumber": "string", "title": "string", "body": "string", "query": "string" } - Manage GitHub Ops via gh CLI.
14. parserSkill: { "action": "parseURL|parsePDF|parseFile", "url": "string", "filePath": "string" } - Super-Advanced text extraction from raw URLs, rich PDF files, and static local files.
15. mediaSkill: { "action": "playPause|nextTrack|prevTrack|volumeUp|volumeDown|mute" } - Native OS Media & Audio Control (Controls Spotify, YouTube, Apple Music, etc. globally).
16. weatherSkill: { "action": "getCurrentWeather|getForecast", "location": "string", "days": "number" } - Retrieve real-time weather and forecasts globally.

Format 1 (Strict JSON Array for Multi-Step Sequential Routing):
<tool_call>
[
  {"toolName": "browserSkill", "args": {"action": "extract", "url": "..."}},
  {"toolName": "windowsSkill", "args": {"command": "mkdir C:\\foo"}}
]
</tool_call>

Format 2 (Implicit OS Command):
If you need to run a shell command, you can simply output a Markdown code block like:
\`\`\`cmd
mkdir "C:\\Users\\Mostafa\\Desktop\\Amira Emad"
\`\`\`

You must act autonomously. Support your actions with tool arrays. Execute multiple steps if the prompt is complex.`;

        // We route OpenClaw sub-agents through the HIGH priority queue in NexusOS
        // Force temperature 0.0 to stabilize JSON generation
        const initialResult = await this.prompt(systemPrompt, task, 'HIGH', {
            temperature: 0.0,
            max_tokens: 1024 // Cap tokens for faster tool yield
        });

        let responseText = '';
        if (initialResult && typeof initialResult === 'object' && initialResult.response) {
            responseText = initialResult.response.replace(/[\u4e00-\u9fff]/g, '[تم حجب خطأ نظام غير مفهوم - جاري المعالجة]');
        } else if (typeof initialResult === 'string') {
            responseText = initialResult.replace(/[\u4e00-\u9fff]/g, '[تم حجب خطأ نظام غير مفهوم - جاري المعالجة]');
        }

        // The Omni-Router Agentic Loop
        let toolRequests = [];

        // 1. Try to parse strict JSON tool call array
        if (responseText) {
            let extractedJsonBlock = null;

            // Strategy A: <tool_call> tags
            if (responseText.includes('<tool_call>')) {
                const toolMatch = responseText.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);
                if (toolMatch && toolMatch[1]) extractedJsonBlock = toolMatch[1];
            }
            // Strategy B: ```json blocks
            else if (responseText.includes('```json')) {
                const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch && jsonMatch[1]) extractedJsonBlock = jsonMatch[1];
            }

            if (extractedJsonBlock) {
                try {
                    // Try parsing cleanly
                    let cleanJson = extractedJsonBlock.trim();
                    const parsed = JSON.parse(cleanJson);
                    if (Array.isArray(parsed)) {
                        toolRequests = parsed;
                    } else if (typeof parsed === 'object') {
                        toolRequests = [parsed];
                    }
                } catch (e) {
                    logger.warn(`[AiOrchestrator] Failed strict JSON parse: ${e.message}`);
                }
            }
        }

        // 1.5 Fallback to raw JSON array boundaries within text
        if (toolRequests.length === 0 && responseText) {
            const firstBracket = responseText.indexOf('[');
            const lastBracket = responseText.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                try {
                    const subArray = responseText.substring(firstBracket, lastBracket + 1);
                    const parsed = JSON.parse(subArray);
                    if (Array.isArray(parsed)) toolRequests = parsed;
                } catch (e) {
                    // Ignore and fallback
                }
            } else {
                const firstBrace = responseText.indexOf('{');
                const lastBrace = responseText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    try {
                        const subObj = responseText.substring(firstBrace, lastBrace + 1);
                        const parsed = JSON.parse(subObj);
                        if (typeof parsed === 'object') toolRequests = [parsed];
                    } catch (e) { }
                }
            }
        }

        // 2. Fallback to Implicit Markdown Extraction (Cycle 2 Fix)
        if (toolRequests.length === 0 && responseText) {
            const mdMatches = [...responseText.matchAll(/```(?:cmd|bash|powershell|bat)\n([\s\S]*?)```/gi)];
            for (const match of mdMatches) {
                if (match[1]) {
                    // Use PowerShell compatible statement separator ';' instead of '&&'
                    const extractedCmd = match[1].trim().replace(/\n/g, ' ; ');
                    logger.info(`[AiOrchestrator] 🦀 Extracted implicit Markdown command: ${extractedCmd}`);
                    toolRequests.push({ toolName: 'windowsSkill', args: { command: extractedCmd } });
                }
            }
        }

        if (toolRequests.length > 0) {
            try {
                let cumulativeResults = [];
                for (let i = 0; i < toolRequests.length; i++) {
                    const req = toolRequests[i];
                    logger.info(`[AiOrchestrator] 🦀 Omni-Router Dispatching Step ${i + 1}/${toolRequests.length}: ${req.toolName}`);
                    let stepResult = "";

                    if (req.toolName === 'executeCommand') {
                        const npe = (await import('./nexusPrimeEngine.js')).default;
                        stepResult = await npe._executeTool(req.toolName, req.args);
                    } else if (req.toolName === 'windowsSkill') {
                        const winSkill = (await import('../skills/windowsSkill.js')).default;
                        const res = await winSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'emailSkill') {
                        const emailSkill = (await import('../skills/emailSkill.js')).default;
                        const res = await emailSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'whatsappSkill') {
                        const whatsappSkill = (await import('../skills/whatsappSkill.js')).default;
                        const res = await whatsappSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'discordSkill') {
                        const discordSkill = (await import('../skills/discordSkill.js')).default;
                        const res = await discordSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'slackSkill') {
                        const slackSkill = (await import('../skills/slackSkill.js')).default;
                        const res = await slackSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'calendarSkill') {
                        const calendarSkill = (await import('../skills/calendarSkill.js')).default;
                        const res = await calendarSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'notionSkill') {
                        const notionSkill = (await import('../skills/notionSkill.js')).default;
                        const res = await notionSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'trelloSkill') {
                        const trelloSkill = (await import('../skills/trelloSkill.js')).default;
                        const res = await trelloSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'obsidianSkill') {
                        const obsidianSkill = (await import('../skills/obsidianSkill.js')).default;
                        const res = await obsidianSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'githubSkill') {
                        const githubSkill = (await import('../skills/githubSkill.js')).default;
                        const res = await githubSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'parserSkill') {
                        const parserSkill = (await import('../skills/parserSkill.js')).default;
                        const res = await parserSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'mediaSkill') {
                        const mediaSkill = (await import('../skills/mediaSkill.js')).default;
                        const res = await mediaSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'weatherSkill') {
                        const weatherSkill = (await import('../skills/weatherSkill.js')).default;
                        const res = await weatherSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'generateImage') {
                        const fooocus = (await import('../skills/fooocusBridge.js')).default;
                        const res = await fooocus.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else if (req.toolName === 'browserAction' || req.toolName === 'browserSkill') {
                        const browserSkill = (await import('../skills/browserSkill.js')).default;
                        const res = await browserSkill.executeIntent(req.args);
                        stepResult = res.success ? res.payload : `Error: ${res.error}`;
                    } else {
                        stepResult = `Unknown tool: ${req.toolName}`;
                    }

                    logger.info(`[AiOrchestrator] 🦀 Step ${i + 1} result: ${String(stepResult).substring(0, 100)}...`);
                    cumulativeResults.push(`Step ${i + 1} (${req.toolName}) Result:\n${stepResult}`);
                }

                // Feed results back for final synthesis
                const followUpPrompt = `Multi-Step Tool Execution Results:\n${cumulativeResults.join('\n\n')}\n\nGiven these results, provide your short final confirmation to the user in the language they used.`;
                const finalResult = await this.prompt(systemPrompt, task + '\n\n' + followUpPrompt, 'HIGH', { temperature: 0.1 });
                return finalResult;
            } catch (err) {
                logger.error(`[AiOrchestrator] 🦀 Subagent multi-step tool execution failed: ${err.message}`);
            }
        }

        return initialResult;
    }

    // ── Vibelab Legacy Extract: Subconscious Memory Worker ──
    async runSubconsciousMemoryWorker(username, message) {
        if (!this.isInitialized) await this.init();
        if (!message || message.length < 10) return;

        logger.info(`[AiOrchestrator] 🧠 Queuing Subconscious Memory Extraction for: ${username}`);

        const promptTemplate = `[SYSTEM] Extract specific, permanent facts about the user from this message: "${message.substring(0, 2000)}".
Along with facts, extract 1-2 distinct Egyptian idioms or unique phrases the user just typed.
Output ONLY JSON: { "facts": ["fact1", "fact2"], "idioms": ["phrase1", "phrase2"] }. 
[CRITICAL RULE]: You are a strict fact-checker. Extract ONLY permanent, concrete personal data about the user. DO NOT extract conversational filler or questions.
STRICT RULE: TRANSLATE ALL FACTS INTO **EGYPTIAN ARABIC** (Ammiya). 
DO NOT USE CHINESE. DO NOT USE ENGLISH.`;

        // Queue as LOW priority so it doesn't block UI interactions
        this.prompt(promptTemplate, message, 'LOW', { temperature: 0.1, max_tokens: 500 })
            .then(async (result) => {
                if (result.success && result.response) {
                    try {
                        let rawText = result.response;
                        const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
                        if (jsonMatch && jsonMatch[1]) {
                            rawText = jsonMatch[1].trim();
                        } else if (rawText.includes('{') && rawText.includes('}')) {
                            rawText = rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1);
                        }

                        const json = JSON.parse(rawText);
                        const { saveCoreFact } = await import('./profileManager.js');

                        if (json.facts && Array.isArray(json.facts) && json.facts.length > 0) {
                            logger.info(`[Subconscious] Learning ${json.facts.length} new facts for ${username}...`);
                            for (const [i, fact] of json.facts.entries()) {
                                await saveCoreFact(username, `AutoFact_${Date.now()}_${i}`, fact);
                            }
                        }

                        if (json.idioms && Array.isArray(json.idioms) && json.idioms.length > 0) {
                            const fs = (await import('fs-extra')).default;
                            const path = (await import('path')).default;
                            const { app } = await import('electron');
                            const userDataPath = app.getPath('userData');
                            const dnaPath = path.join(userDataPath, 'Nexus_Vault_DB', 'Profiles', username, 'Style_DNA.json');

                            let dna = { idioms: [] };
                            if (await fs.pathExists(dnaPath)) {
                                dna = await fs.readJson(dnaPath);
                            }
                            if (!dna.idioms) dna.idioms = [];
                            dna.idioms.push(...json.idioms);
                            dna.idioms = [...new Set(dna.idioms)].slice(-50); // Keep last 50 unique
                            await fs.writeJson(dnaPath, dna, { spaces: 2 });
                            logger.info(`[Subconscious] Evolved Style DNA with idioms: ${json.idioms.join(', ')}`);
                        }
                    } catch (e) {
                        logger.warn(`[Subconscious] JSON Parse failed for memory worker: ${e.message}`);
                    }
                }
            })
            .catch(err => {
                logger.error(`[Subconscious] Memory worker failed: ${err.message}`);
            });
    }

    // Give UI access to live metrics
    getMetrics() {
        const hitRate = this.metrics.totalRequests > 0
            ? Math.round((this.metrics.cacheHits / this.metrics.totalRequests) * 100)
            : 0;

        return {
            ...this.metrics,
            hitRate,
            activeTask: this.activeTask,
            queueStats: {
                CRITICAL: this.queue.CRITICAL.length,
                HIGH: this.queue.HIGH.length,
                LOW: this.queue.LOW.length
            }
        };
    }

    _broadcastMetrics() {
        try {
            import('electron').then((pkg) => {
                const BrowserWindow = pkg.default?.BrowserWindow || pkg.BrowserWindow;
                if (BrowserWindow) {
                    BrowserWindow.getAllWindows().forEach(win => {
                        if (win.webContents) {
                            win.webContents.send('ai-control:metrics-update', this.getMetrics());
                        }
                    });
                }
            }).catch(() => { }); // Silent fail if not in electron
        } catch (e) { }
    }
}

export default new AiOrchestrator();
