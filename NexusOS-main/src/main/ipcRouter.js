const { ipcMain } = require('electron');
const sysRouter = require('./services/sysRouter');
const settingsService = require('./services/settingsService');
const logger = require('./utils/logger');

function initIpcRouter() {
    logger.info('NexusOS', 'Initializing strict IPC Router channels...');

    // Mount Domain Services
    sysRouter.register('settings', settingsService);

    // Phase 17: Register Telemetry Service
    const { initTelemetry } = require('./services/telemetryService');
    initTelemetry();

    // Phase 7: Register Chat API replacement
    const chatService = require('./services/chatService');
    sysRouter.register('chat', chatService);

    // Phase 8: Register KnowledgeManager / DB API
    const knowledgeManager = require('./services/knowledgeManager');
    sysRouter.register('db', knowledgeManager);

    // Fix: Explicitly register chat:getModels
    ipcMain.removeHandler('chat:getModels');
    ipcMain.handle('chat:getModels', async () => {
        return await chatService.getModels();
    });

    // Phase 9: Register AI Services
    const ghostDeveloper = require('./services/ai/ghostDeveloper');
    const predictiveEngine = require('./services/ai/predictiveEngine');
    sysRouter.register('ghost', ghostDeveloper);
    sysRouter.register('predictive', predictiveEngine);

    // Phase 10: Register HiveMind Orchestrator
    const hiveMind = require('./services/ai/hiveMind');
    hiveMind.registerAgent('ghost', ghostDeveloper);
    hiveMind.registerAgent('predictive', predictiveEngine);
    sysRouter.register('hive', hiveMind);

    // Fix: Object.entries() in sysRouter cannot see class prototype methods.
    // Explicitly register the orchestrateTask handler.
    ipcMain.removeHandler('hive:orchestrateTask');
    ipcMain.handle('hive:orchestrateTask', async (event, payload) => {
        return await hiveMind.orchestrateTask(payload);
    });

    ipcMain.removeHandler('vault:command');
    ipcMain.handle('vault:command', async (event, payload) => {
        logger.debug('NexusIPC', 'vault:command triggered');
        const pythonOrchestrator = require('./pythonOrchestrator');
        // Forward directly to python via STDIN
        const sent = pythonOrchestrator.sendMessage(payload);
        return { status: sent ? 'forwarded' : 'failed' };
    });

    const eventBus = require('./utils/eventBus');
    ipcMain.removeAllListeners('app:launch');
    ipcMain.on('app:launch', (event, appName) => {
        logger.info('NexusOS', `Request to launch App: ${appName}`);
        eventBus.publish('os:launch-app', { appName });

        // Trigger OpenClaw Auto-Sync on main OS initialization
        if (appName === 'NexusOS_Core_Init') {
            try {
                const openClawBridge = require('../../apps/backend-core/src/services/openClawBridge.js').default;
                // Pass the main window event sender back for IPC broadcasts
                openClawBridge.autoUpdateCheck(event.sender);
            } catch (err) {
                logger.error('NexusOS', `OpenClawSync Boot Failed: ${err.message}`);
            }
        }
    });

    ipcMain.removeHandler('openclaw:spawn-test');
    ipcMain.handle('openclaw:spawn-test', async (event, payload) => {
        logger.info('NexusOS', `[IPC] openclaw:spawn-test triggered with ${payload}`);
        const openClawBridge = require('../../apps/backend-core/src/services/openClawBridge.js').default;
        return await openClawBridge.spawnLocalSubagent(payload);
    });

    // Phase 23: Localization IPC channel
    ipcMain.removeHandler('os:change-language');
    ipcMain.handle('os:change-language', async (event, lang) => {
        logger.info('NexusOS', `Global Language Change Requested: ${lang}`);
        try {
            const trayManager = require('./trayComponent');
            if (trayManager && trayManager.tray) {
                trayManager.rebuildMenu(lang);
            }
            return { status: 'success' };
        } catch (error) {
            logger.error('NexusOS', `Failed to change language: ${error.message}`);
            return { error: error.message };
        }
    });

    // Phase 25: Dedicated Cloud DB Routing (Koyeb/Atlas)
    ipcMain.removeHandler('cloud:request');
    ipcMain.handle('cloud:request', async (event, { endpoint, method, data, token }) => {
        logger.info('NexusOS', `Routing Cloud DB Request: ${method} ${endpoint}`);
        const cloudDb = require('./database/cloudDbConnection');
        try {
            const result = await cloudDb.queryCloud(endpoint, method, data, token);
            return { status: 'success', data: result };
        } catch (error) {
            logger.error('NexusOS', `Cloud DB Firewall Block: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    });

    // Phase 34: Register Nexus-Architect Daemon IPC Handlers
    // architectDaemon is ESM in apps/backend-core, loaded via dynamic import
    let _architectDaemon = null;
    const getArchitect = async () => {
        if (!_architectDaemon) {
            try {
                const mod = await import('../../apps/backend-core/src/services/architectDaemon.js');
                _architectDaemon = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load architectDaemon: ${err.message}`);
                return null;
            }
        }
        return _architectDaemon;
    };

    ipcMain.removeHandler('architect:status');
    ipcMain.handle('architect:status', async () => {
        const arch = await getArchitect();
        return arch ? arch.getStatus() : { isRunning: false, error: 'Architect not loaded' };
    });

    ipcMain.removeHandler('architect:start');
    ipcMain.handle('architect:start', async () => {
        const arch = await getArchitect();
        return arch ? arch.start() : { error: 'Architect not loaded' };
    });

    ipcMain.removeHandler('architect:stop');
    ipcMain.handle('architect:stop', async () => {
        const arch = await getArchitect();
        return arch ? arch.stop() : { error: 'Architect not loaded' };
    });

    ipcMain.removeHandler('architect:trigger');
    ipcMain.handle('architect:trigger', async () => {
        const arch = await getArchitect();
        return arch ? await arch.triggerIdea() : { error: 'Architect not loaded' };
    });

    ipcMain.removeHandler('architect:approve');
    ipcMain.handle('architect:approve', async () => {
        const arch = await getArchitect();
        return arch ? await arch.approveIdea() : { error: 'Architect not loaded' };
    });

    ipcMain.removeHandler('architect:dismiss');
    ipcMain.handle('architect:dismiss', async () => {
        const arch = await getArchitect();
        return arch ? arch.dismissIdea() : { error: 'Architect not loaded' };
    });

    // ════════════════════════════════════════════════════════════
    //  Phase 35.1: Register ALL remaining Backend-Core IPC Handlers
    //  Lazy dynamic imports to bridge ESM↔CJS boundary
    // ════════════════════════════════════════════════════════════

    // ── Sentinel Service (Self-Healing) ──────────────────────
    let _sentinelService = null;
    const getSentinel = async () => {
        if (!_sentinelService) {
            try {
                const mod = await import('../../apps/backend-core/src/services/sentinelService.js');
                _sentinelService = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load sentinelService: ${err.message}`);
                return null;
            }
        }
        return _sentinelService;
    };

    ipcMain.removeHandler('sentinel:heal-ui');
    ipcMain.handle('sentinel:heal-ui', async (event, payload) => {
        logger.info('NexusOS', `[IPC] sentinel:heal-ui triggered`);
        const sentinel = await getSentinel();
        if (!sentinel) return { success: false, message: 'Sentinel not loaded' };
        return await sentinel.handleUIIntercept(payload, event.sender);
    });

    // ── Nexus-Prime Engine ───────────────────────────────────
    let _nexusPrimeEngine = null;
    const getPrime = async () => {
        if (!_nexusPrimeEngine) {
            try {
                const mod = await import('../../apps/backend-core/src/services/nexusPrimeEngine.js');
                _nexusPrimeEngine = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load nexusPrimeEngine: ${err.message}`);
                return null;
            }
        }
        return _nexusPrimeEngine;
    };

    ipcMain.removeHandler('prime:chat');
    ipcMain.handle('prime:chat', async (event, message) => {
        const prime = await getPrime();
        if (!prime) return { thinking: '', response: 'Nexus-Prime Engine not loaded.', patches: [], toolCalls: [] };
        return await prime.chat(message);
    });

    ipcMain.removeHandler('prime:approve-patch');
    ipcMain.handle('prime:approve-patch', async (event, patchId) => {
        const prime = await getPrime();
        if (!prime) return { error: 'Not loaded' };
        return prime.approvePatch(patchId);
    });

    ipcMain.removeHandler('prime:reject-patch');
    ipcMain.handle('prime:reject-patch', async (event, patchId) => {
        const prime = await getPrime();
        if (!prime) return { error: 'Not loaded' };
        return prime.rejectPatch(patchId);
    });

    ipcMain.removeHandler('prime:get-patches');
    ipcMain.handle('prime:get-patches', async () => {
        const prime = await getPrime();
        if (!prime) return [];
        return prime.getPendingPatches();
    });

    ipcMain.removeHandler('prime:status');
    ipcMain.handle('prime:status', async () => {
        const prime = await getPrime();
        if (!prime) return { error: 'Not loaded' };
        return await prime.getGpuStatus();
    });

    // ── AI Service (Generic prompting) ──────────────────────
    let _aiService = null;
    const getAI = async () => {
        if (!_aiService) {
            try {
                const mod = await import('../../apps/backend-core/src/services/aiService.js');
                _aiService = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load aiService: ${err.message}`);
                return null;
            }
        }
        return _aiService;
    };

    ipcMain.removeHandler('ai:prompt');
    ipcMain.handle('ai:prompt', async (event, payload) => {
        const ai = await getAI();
        if (!ai) return { error: 'AI Service not loaded' };
        return await ai.prompt(payload.text, payload.options);
    });

    ipcMain.removeHandler('ai:refactor');
    ipcMain.handle('ai:refactor', async (event, payload) => {
        const ai = await getAI();
        if (!ai) return { error: 'AI Service not loaded' };
        return await ai.prompt(payload.code, { ...payload.options, task: 'refactor' });
    });

    ipcMain.removeHandler('ai:predict');
    ipcMain.handle('ai:predict', async (event, payload) => {
        const ai = await getAI();
        if (!ai) return { error: 'AI Service not loaded' };
        return await ai.prompt(payload.context, { ...payload.options, task: 'predict' });
    });

    // ── Autonomous Knowledge Vault (RAG) ─────────────────────
    let _knowledgeVault = null;
    const getKnowledgeVault = async () => {
        if (!_knowledgeVault) {
            try {
                const mod = await import('../../apps/backend-core/src/services/knowledgeManager.js');
                _knowledgeVault = mod;
            } catch (err) {
                logger.error('NexusOS', `Failed to load knowledgeManager: ${err.message}`);
            }
        }
        return _knowledgeVault;
    };

    ipcMain.removeHandler('vault:save-memory');
    ipcMain.handle('vault:save-memory', async (event, { aiContent, userContent, topic }) => {
        const vault = await getKnowledgeVault();
        return vault ? await vault.saveMemory(aiContent, userContent, topic) : null;
    });

    ipcMain.removeHandler('vault:retrieve');
    ipcMain.handle('vault:retrieve', async (event, { query, topK }) => {
        const vault = await getKnowledgeVault();
        return vault ? await vault.retrieveContext(query, topK) : { text: '', sources: [] };
    });

    ipcMain.removeHandler('vault:build-index');
    ipcMain.handle('vault:build-index', async () => {
        const vault = await getKnowledgeVault();
        return vault ? await vault.buildIndex() : 0;
    });

    // ── The Citadel (Psychometric Profiling) ──────────────────
    let _profileManager = null;
    const getProfileManager = async () => {
        if (!_profileManager) {
            try {
                const mod = await import('../../apps/backend-core/src/services/profileManager.js');
                _profileManager = mod;
            } catch (err) {
                logger.error('NexusOS', `Failed to load profileManager: ${err.message}`);
            }
        }
        return _profileManager;
    };

    ipcMain.removeHandler('profile:update');
    ipcMain.handle('profile:update', async (event, { messages, username }) => {
        const pm = await getProfileManager();
        return pm ? await pm.updatePsychometrics(messages, username) : null;
    });

    ipcMain.removeHandler('profile:get-active');
    ipcMain.handle('profile:get-active', async (event, username) => {
        const pm = await getProfileManager();
        return pm ? await pm.getActiveProfile(username) : '';
    });

    ipcMain.removeHandler('profile:get-vocab');
    ipcMain.handle('profile:get-vocab', async (event, username) => {
        const pm = await getProfileManager();
        return pm ? await pm.getVocabulary(username) : null;
    });

    ipcMain.removeHandler('profile:switch-user');
    ipcMain.handle('profile:switch-user', async (event, username) => {
        const pm = await getProfileManager();
        return pm ? await pm.switchUser(username) : 'DefaultUser';
    });

    ipcMain.removeHandler('profile:update-manual');
    ipcMain.handle('profile:update-manual', async (event, { username, content }) => {
        const pm = await getProfileManager();
        return pm ? await pm.updateManualProfile(username, content) : false;
    });

    // ── Animus Sequencer (Persistent Daemon) ──────────────────
    let _animusSequencer = null;
    const getAnimus = async () => {
        if (!_animusSequencer) {
            try {
                const mod = await import('../../apps/backend-core/src/services/animusSequencer.js');
                _animusSequencer = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load animusSequencer: ${err.message}`);
                return null;
            }
        }
        return _animusSequencer;
    };

    ipcMain.removeHandler('animus:status');
    ipcMain.handle('animus:status', async () => {
        const animus = await getAnimus();
        return animus ? animus.getStatus() : { error: 'Animus not loaded' };
    });

    ipcMain.removeHandler('animus:start-sequence');
    ipcMain.handle('animus:start-sequence', async (event, options) => {
        const animus = await getAnimus();
        return animus ? await animus.startSequence(options) : { error: 'Animus not loaded' };
    });

    ipcMain.removeHandler('animus:daemon-start');
    ipcMain.handle('animus:daemon-start', async (event, options) => {
        const animus = await getAnimus();
        return animus ? await animus.startDaemon(options) : { error: 'Animus not loaded' };
    });

    ipcMain.removeHandler('animus:daemon-stop');
    ipcMain.handle('animus:daemon-stop', async () => {
        const animus = await getAnimus();
        return animus ? animus.stopDaemon() : { error: 'Animus not loaded' };
    });

    ipcMain.removeHandler('animus:queue');
    ipcMain.handle('animus:queue', async (event, options) => {
        const animus = await getAnimus();
        return animus ? await animus.getQueue(options) : [];
    });

    ipcMain.removeHandler('animus:inject');
    ipcMain.handle('animus:inject', async (event, payload) => {
        const animus = await getAnimus();
        if (!animus) return { error: 'Animus not loaded' };
        // Frontend sends { itemId: "..." } — extract the raw string
        const id = typeof payload === 'string' ? payload : payload?.itemId;
        if (!id) return { error: 'Missing itemId' };
        return await animus.approveAndInject(id);
    });

    ipcMain.removeHandler('animus:reject');
    ipcMain.handle('animus:reject', async (event, payload) => {
        const animus = await getAnimus();
        if (!animus) return { error: 'Animus not loaded' };
        const id = typeof payload === 'string' ? payload : payload?.itemId;
        if (!id) return { error: 'Missing itemId' };
        return await animus.rejectItem(id);
    });

    // ── Chaos Guardian (Resilience) ──────────────────────────
    let _chaosGuardian = null;
    const getChaos = async () => {
        if (!_chaosGuardian) {
            try {
                const mod = await import('../../apps/backend-core/src/services/chaosGuardianEvolved.js');
                _chaosGuardian = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load chaosGuardian: ${err.message}`);
                return null;
            }
        }
        return _chaosGuardian;
    };

    ipcMain.removeHandler('chaos:run');
    ipcMain.handle('chaos:run', async (event, config) => {
        const chaos = await getChaos();
        return chaos ? await chaos.runChaos(config) : { error: 'Chaos Guardian not loaded' };
    });

    ipcMain.removeHandler('chaos:status');
    ipcMain.handle('chaos:status', async () => {
        const chaos = await getChaos();
        return chaos ? chaos.getStatus() : { error: 'Chaos Guardian not loaded' };
    });

    // ── Pantheon Gallery (Art Curation) ──────────────────────
    let _pantheonService = null;
    const getPantheon = async () => {
        if (!_pantheonService) {
            try {
                const mod = await import('../../apps/backend-core/src/services/pantheonService.js');
                _pantheonService = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load pantheonService: ${err.message}`);
                return null;
            }
        }
        return _pantheonService;
    };

    ipcMain.removeHandler('pantheon:scan');
    ipcMain.handle('pantheon:scan', async (event, options) => {
        const pantheon = await getPantheon();
        return pantheon ? await pantheon.scan(options) : { error: 'Pantheon not loaded' };
    });

    ipcMain.removeHandler('pantheon:getImages');
    ipcMain.handle('pantheon:getImages', async (event, options) => {
        const pantheon = await getPantheon();
        return pantheon ? pantheon.getImages(options) : [];
    });

    ipcMain.removeHandler('pantheon:analyze');
    ipcMain.handle('pantheon:analyze', async (event, params) => {
        const pantheon = await getPantheon();
        return pantheon ? await pantheon.analyzeImage(params) : { error: 'Pantheon not loaded' };
    });

    ipcMain.handle('pantheon:status', async () => {
        const pantheon = await getPantheon();
        return pantheon ? pantheon.getStatus() : { error: 'Pantheon not loaded' };
    });

    // ── Ghost Developer Evolved (Vision AI) ──────────────────
    let _ghostDeveloperEvolved = null;
    const getGhostEvolved = async () => {
        if (!_ghostDeveloperEvolved) {
            try {
                const mod = await import('../../apps/backend-core/src/services/ghostDeveloperEvolved.js');
                _ghostDeveloperEvolved = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load ghostDeveloperEvolved: ${err.message}`);
                return null;
            }
        }
        return _ghostDeveloperEvolved;
    };

    ipcMain.removeHandler('ghost:start');
    ipcMain.handle('ghost:start', async () => {
        const ghost = await getGhostEvolved();
        return ghost ? ghost.start() : { error: 'Ghost Evolved not loaded' };
    });

    ipcMain.removeHandler('ghost:stop');
    ipcMain.handle('ghost:stop', async () => {
        const ghost = await getGhostEvolved();
        return ghost ? ghost.stop() : { error: 'Ghost Evolved not loaded' };
    });

    ipcMain.removeHandler('ghost:status');
    ipcMain.handle('ghost:status', async () => {
        const ghost = await getGhostEvolved();
        return ghost ? ghost.getStatus() : { error: 'Ghost Evolved not loaded' };
    });

    // More routes will be wired up securely as Backend components are ported.

    // ── Docker Sandbox (Isolated Code Execution) ─────────────
    let _dockerSandbox = null;
    const getSandbox = async () => {
        if (!_dockerSandbox) {
            try {
                const mod = await import('../../apps/backend-core/src/services/dockerSandbox.js');
                _dockerSandbox = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load dockerSandbox: ${err.message}`);
                return null;
            }
        }
        return _dockerSandbox;
    };

    ipcMain.removeHandler('sandbox:execute');
    ipcMain.handle('sandbox:execute', async (event, { code, env }) => {
        const sandbox = await getSandbox();
        if (!sandbox) return { success: false, error: 'Sandbox not loaded' };
        return await sandbox.executeInSandbox(code, env);
    });

    ipcMain.removeHandler('sandbox:status');
    ipcMain.handle('sandbox:status', async () => {
        const sandbox = await getSandbox();
        if (!sandbox) return { dockerAvailable: false, error: 'Sandbox not loaded' };
        return await sandbox.getStatus();
    });

    // ── Thermal Sentinel (Hardware Temperature Monitor) ──────
    let _thermalSentinel = null;
    const getThermal = async () => {
        if (!_thermalSentinel) {
            try {
                const mod = await import('../../apps/backend-core/src/services/thermalSentinel.js');
                _thermalSentinel = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load thermalSentinel: ${err.message}`);
                return null;
            }
        }
        return _thermalSentinel;
    };

    ipcMain.removeHandler('thermal:start');
    ipcMain.handle('thermal:start', async (event, options) => {
        const thermal = await getThermal();
        return thermal ? thermal.start(options) : { error: 'Thermal Sentinel not loaded' };
    });

    ipcMain.removeHandler('thermal:stop');
    ipcMain.handle('thermal:stop', async () => {
        const thermal = await getThermal();
        return thermal ? thermal.stop() : { error: 'Thermal Sentinel not loaded' };
    });

    ipcMain.removeHandler('thermal:status');
    ipcMain.handle('thermal:status', async () => {
        const thermal = await getThermal();
        return thermal ? thermal.getStatus() : { error: 'Thermal Sentinel not loaded' };
    });

    ipcMain.removeHandler('thermal:set-thresholds');
    ipcMain.handle('thermal:set-thresholds', async (event, thresholds) => {
        const thermal = await getThermal();
        return thermal ? thermal.setThresholds(thresholds) : { error: 'Thermal Sentinel not loaded' };
    });

    // ── EventLogger (Global System Events) ──────────────────
    let _eventLogger = null;
    const getEventLogger = async () => {
        if (!_eventLogger) {
            try {
                const mod = await import('../../apps/backend-core/src/services/eventLogger.js');
                _eventLogger = mod.default;
            } catch (err) {
                logger.error('NexusOS', `Failed to load eventLogger: ${err.message}`);
                return null;
            }
        }
        return _eventLogger;
    };

    ipcMain.removeHandler('events:list');
    ipcMain.handle('events:list', async (event, filter) => {
        const evtLogger = await getEventLogger();
        return evtLogger ? await evtLogger.getEvents(filter) : [];
    });

    ipcMain.removeHandler('events:get');
    ipcMain.handle('events:get', async (event, eventId) => {
        const evtLogger = await getEventLogger();
        return evtLogger ? await evtLogger.getEvent(eventId) : null;
    });

    ipcMain.removeHandler('events:stats');
    ipcMain.handle('events:stats', async () => {
        const evtLogger = await getEventLogger();
        return evtLogger ? await evtLogger.getStats() : { total: 0, pending: 0, healing: 0, resolved: 0, failed: 0 };
    });

    ipcMain.removeHandler('profile:update'); // Added this line
    ipcMain.handle('profile:update', async (event, data) => {
        try {
            const result = profileManager.updateProfileFromInteraction(data.messages, data.username || 'User');
            return true;
        } catch (error) {
            console.error('[IPC ERROR] profile:update failed:', error);
            return false;
        }
    });

    // ─── Native Web Fetch (Bypass CORS) ───
    ipcMain.handle('search:fetchHtml', async (event, url, options) => {
        try {
            // Options can carry method, headers, body for fetch
            const res = await fetch(url, options || {});
            const text = await res.text();
            return { ok: res.ok, status: res.status, text };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });

    ipcMain.removeHandler('events:raw-logs');
    ipcMain.handle('events:raw-logs', async () => {
        try {
            const fs = require('fs');
            const fsP = require('fs/promises');
            const path = require('path');
            const { app } = require('electron');
            const userDataPath = app ? app.getPath('userData') : path.join(process.cwd(), '.nexus-logs');
            const logPath = path.join(userDataPath, 'logs', 'nexus_os.log');

            // Performance: Only read last 100KB of the file (the log can be 600MB+)
            const TAIL_BYTES = 100 * 1024; // 100KB
            const stat = await fsP.stat(logPath);
            const fileSize = stat.size;

            if (fileSize === 0) return 'Log file is empty.';

            const start = Math.max(0, fileSize - TAIL_BYTES);
            const fd = await fsP.open(logPath, 'r');
            const buffer = Buffer.alloc(Math.min(TAIL_BYTES, fileSize));
            await fd.read(buffer, 0, buffer.length, start);
            await fd.close();

            let content = buffer.toString('utf-8');
            // If we truncated, skip the first partial line
            if (start > 0) {
                const firstNewline = content.indexOf('\n');
                if (firstNewline > 0) content = content.substring(firstNewline + 1);
            }
            return content;
        } catch (e) {
            return `[Logger Error] Failed to read nexus_os.log: ${e.message}`;
        }
    });

    ipcMain.removeHandler('events:log-frontend');
    ipcMain.handle('events:log-frontend', async (event, payload) => {
        const { level, message } = payload;
        if (level === 'error') logger.error('frontend', message);
        else if (level === 'warn') logger.warn('frontend', message);
        else logger.info('frontend', message);
        return { success: true };
    });

    // ── File System Service (Phase 48) ───────────────────────
    const fsService = require('./services/fileSystemService');

    ipcMain.removeHandler('fs:list');
    ipcMain.handle('fs:list', async (event, targetPath) => {
        return await fsService.listDirectory(targetPath);
    });

    ipcMain.removeHandler('fs:read');
    ipcMain.handle('fs:read', async (event, payload) => {
        return await fsService.readFile(payload.path, payload.format);
    });

    ipcMain.removeHandler('fs:home');
    ipcMain.handle('fs:home', async () => {
        return await fsService.getHomeDir();
    });

    ipcMain.removeHandler('fs:write');
    ipcMain.handle('fs:write', async (event, payload) => {
        return await fsService.writeFile(payload.path, payload.content);
    });

    ipcMain.removeHandler('fs:stat');
    ipcMain.handle('fs:stat', async (event, path) => {
        return await fsService.getFileStat(path);
    });

    ipcMain.removeHandler('fs:drives');
    ipcMain.handle('fs:drives', async () => {
        return await fsService.getSystemDrives();
    });

    ipcMain.removeHandler('fs:storage-root');
    ipcMain.handle('fs:storage-root', async () => {
        return fsService.getStorageRoot();
    });

    ipcMain.removeHandler('fs:quick-access');
    ipcMain.handle('fs:quick-access', async () => {
        return fsService.getQuickAccess();
    });

    // ── Native OS Terminal (Phase 74: Legacy Terminal Forge) ─
    ipcMain.removeHandler('os:terminal');
    ipcMain.handle('os:terminal', async (event, command) => {
        const { exec } = require('child_process');
        return new Promise((resolve) => {
            exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
                if (error) {
                    resolve({ error: error.message, stderr: stderr || '' });
                } else {
                    resolve({ stdout: stdout || '', stderr: stderr || '' });
                }
            });
        });
    });

    // ── OmniShield Protocol (Phase 61) ───────────
    const omniShield = require('./services/omniShieldService');
    omniShield.initOmniShield();

    ipcMain.removeHandler('omnishield:get-status');
    ipcMain.handle('omnishield:get-status', async () => {
        return omniShield.getStatus();
    });

    ipcMain.removeHandler('omnishield:get-events');
    ipcMain.handle('omnishield:get-events', async () => {
        return omniShield.getEvents();
    });

    ipcMain.removeHandler('omnishield:run-prediction');
    ipcMain.handle('omnishield:run-prediction', async () => {
        await omniShield.runPrediction();
        return omniShield.getStatus();
    });

    // Backward compatibility for generic oracle calls
    ipcMain.removeHandler('oracle:get-prediction');
    ipcMain.handle('oracle:get-prediction', async () => {
        const status = omniShield.getStatus();
        return status.prediction;
    });

    // ── Neural Forge (Phase 48: AI Training Data Engine) ─────
    let _knowledgeController = null;
    const getForge = async () => {
        if (!_knowledgeController) {
            try {
                const mod = await import('../../apps/backend-core/src/controllers/knowledgeController.js');
                _knowledgeController = mod.default;
                await _knowledgeController.init();
            } catch (err) {
                logger.error('NexusOS', `Failed to load knowledgeController: ${err.message}`);
                return null;
            }
        }
        return _knowledgeController;
    };

    ipcMain.removeHandler('forge:ingest-memory');
    ipcMain.handle('forge:ingest-memory', async (event, payload) => {
        const forge = await getForge();
        return forge ? await forge.ingestMemory(event, payload) : { success: false, error: 'Neural Forge not loaded' };
    });

    ipcMain.removeHandler('forge:get-dataset');
    ipcMain.handle('forge:get-dataset', async (event, options) => {
        const forge = await getForge();
        return forge ? await forge.getDataset(event, options) : { success: false, data: [] };
    });

    ipcMain.removeHandler('forge:delete-pair');
    ipcMain.handle('forge:delete-pair', async (event, payload) => {
        const forge = await getForge();
        return forge ? await forge.deletePair(event, payload) : { success: false, error: 'Neural Forge not loaded' };
    });

    ipcMain.removeHandler('forge:get-stats');
    ipcMain.handle('forge:get-stats', async () => {
        const forge = await getForge();
        return forge ? await forge.getStats() : { success: false };
    });

    // ── Neural Forge V2: Vibelab Merge ──────────────

    ipcMain.removeHandler('forge:ingest-chat');
    ipcMain.handle('forge:ingest-chat', async (event, payload) => {
        const forge = await getForge();
        return forge ? await forge.ingestChatInteraction(event, payload) : { success: false };
    });

    ipcMain.removeHandler('forge:graph-ingest');
    ipcMain.handle('forge:graph-ingest', async (event, payload) => {
        const forge = await getForge();
        return forge ? await forge.ingestGraphTriples(event, payload) : { success: false };
    });

    ipcMain.removeHandler('forge:graph-query');
    ipcMain.handle('forge:graph-query', async (event, payload) => {
        const forge = await getForge();
        return forge ? await forge.queryGraph(event, payload) : { success: false, results: [] };
    });

    ipcMain.removeHandler('forge:graph-data');
    ipcMain.handle('forge:graph-data', async () => {
        const forge = await getForge();
        return forge ? await forge.getGraphData() : { success: false };
    });

    ipcMain.removeHandler('forge:export-dataset');
    ipcMain.handle('forge:export-dataset', async () => {
        const forge = await getForge();
        return forge ? await forge.exportDataset() : { success: false };
    });

    ipcMain.removeHandler('forge:trigger-evolution');
    ipcMain.handle('forge:trigger-evolution', async () => {
        const forge = await getForge();
        return forge ? await forge.triggerEvolution() : { success: false };
    });
}

module.exports = {
    initIpcRouter
};

