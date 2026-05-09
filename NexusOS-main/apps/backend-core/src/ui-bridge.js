import express from 'express';
import cors from 'cors';

const startBridge = async () => {
    try {
        const orchMod = await import('./services/aiOrchestrator.js');
        const aiOrchestrator = orchMod.default;

        await aiOrchestrator.init();
        console.log('[UI-Bridge] ✅ AiOrchestrator initialized.');

        const app = express();
        app.use(cors());

        app.use(express.text({ type: '*/*' }));

        app.post('/api/prime/chat', async (req, res) => {
            try {
                let message;
                try {
                    const parsed = JSON.parse(req.body);
                    message = parsed.message;
                } catch (e) {
                    message = req.body;
                }

                if (!message) return res.status(400).json({ error: 'Missing message' });

                console.log(`[UI-Bridge] 📥 Received chat: ${message}`);

                // Route directly to the OpenClaw subagent using God-Mode
                const bridgeMod = await import('./services/openClawBridge.js');
                const result = await bridgeMod.default.spawnLocalSubagent(message);

                res.json({
                    response: result.response || result,
                    thinking: "OpenClaw UI extraction path executed.",
                    toolCalls: result.toolCalls || []
                });
            } catch (err) {
                console.error('[UI-Bridge] ❌ Chat error:', err);
                res.status(500).json({ error: err.message });
            }
        });

        // The Omni-Action God-Mode router triggered by the UI
        app.post('/api/hive/orchestrateTask', async (req, res) => {
            try {
                let payload;
                try {
                    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
                } catch (e) {
                    payload = { text: req.body };
                }

                if (!payload.text) return res.status(400).json({ error: 'Missing text in payload' });

                console.log(`[UI-Bridge] 📥 Orchestrating task: ${payload.text}`);

                // Route directly to the OpenClaw subagent using Omni-Router
                const bridgeMod = await import('./services/openClawBridge.js');
                const result = await bridgeMod.default.spawnLocalSubagent(payload.text);

                // Emulate the IPC response format expected by NexusChat
                res.json({
                    success: true,
                    response: result.response || result,
                    thinking: result.thinking || "Omni-Action Engine executed task via Web Bridge.",
                    toolCalls: result.toolCalls || []
                });
            } catch (err) {
                console.error('[UI-Bridge] ❌ Orchestration error:', err);
                res.status(500).json({ success: false, error: err.message });
            }
        });

        // --- LIFYCYCLE ORCHESTRATOR API ---
        app.post('/api/power/shutdown', (req, res) => {
            console.log('[UI-Bridge] 🛑 Manual Shutdown triggered via API.');
            res.json({ success: true, message: 'Shutting down...' });
            setTimeout(() => {
                process.exit(0);
            }, 500);
        });

        app.post('/api/power/restart', async (req, res) => {
            console.log('[UI-Bridge] 🔄 Manual Restart triggered via API.');
            res.json({ success: true, message: 'Restarting NexusOS...' });

            setTimeout(async () => {
                const { spawn } = await import('child_process');
                const path = await import('path');
                // Path from backend-core/src/ui-bridge.js up to scripts/Nexus_Ignition.bat
                const batPath = path.resolve(process.cwd(), '..', '..', 'scripts', 'Nexus_Ignition.bat');
                try {
                    const child = spawn('cmd.exe', ['/c', batPath], {
                        detached: true,
                        stdio: 'ignore',
                        windowsHide: true
                    });
                    child.unref();
                } catch (e) {
                    console.error('[UI-Bridge] Error spanning restart:', e);
                }
                process.exit(0);
            }, 500);
        });

        // --- GHOST DEVELOPER (VISION AI) API ---
        app.get('/api/ghost/stream', async (req, res) => {
            const { addGhostClient } = await import('./services/ghostDeveloper.js');
            addGhostClient(res);
        });

        app.post('/api/ghost/start', async (req, res) => {
            const { startGhostDev } = await import('./services/ghostDeveloper.js');
            const result = startGhostDev();
            res.json(result);
        });

        app.post('/api/ghost/stop', async (req, res) => {
            const { stopGhostDev } = await import('./services/ghostDeveloper.js');
            const result = stopGhostDev();
            res.json(result);
        });

        app.get('/api/ghost/status', async (req, res) => {
            const { isGhostRunning } = await import('./services/ghostDeveloper.js');
            res.json({ running: isGhostRunning() });
        });

        // Catch-all to prevent 404s from triggering frontend circuit breakers
        app.all('*', (req, res) => {
            res.status(200).json({ status: 'ok', mocked: true });
        });

        const PORT = 3001;
        app.listen(PORT, () => {
            console.log(`[UI-Bridge] 🚀 Backend UI Bridge listening on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('[UI-Bridge] Fatal start error:', err);
    }
};

startBridge();
