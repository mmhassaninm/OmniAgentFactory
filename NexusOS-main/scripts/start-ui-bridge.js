import express from 'express';
import cors from 'cors';

const startBridge = async () => {
    try {
        const orchMod = await import('../apps/backend-core/src/services/aiOrchestrator.js');
        const aiOrchestrator = orchMod.default;

        await aiOrchestrator.init();
        console.log('[UI-Bridge] ✅ AiOrchestrator initialized.');

        const app = express();
        app.use(cors());
        app.use(express.json());

        app.post('/api/prime/chat', async (req, res) => {
            try {
                const { message } = req.body;
                console.log(`[UI-Bridge] 📥 Received chat: ${message}`);

                // Route directly to the OpenClaw subagent using God-Mode
                // Note: since this is a specific physical UI test, we bypass classification
                // and force the test task to spawnLocalSubagent for guaranteed interception.
                const bridgeMod = await import('../apps/backend-core/src/services/openClawBridge.js');
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

        const PORT = 3001;
        app.listen(PORT, () => {
            console.log(`[UI-Bridge] 🚀 Backend UI Bridge listening on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('[UI-Bridge] Fatal start error:', err);
    }
};

startBridge();
