const { exec } = require('child_process');
const fs = require('fs').promises;
const settingsService = require('../settingsService');

class HiveMind {
    constructor() {
        this.activeAgents = new Map();
    }

    // Restore registerAgent for backward compatibility in ipcRouter
    registerAgent(name, agentInstance) {
        this.activeAgents.set(name, agentInstance);
        console.log('[HiveMind] Orchestrator registered agent: ' + name);
    }

    async orchestrateTask(payload) {
        console.log('[HiveMind] Received Omni-Action orchestration request, routing to AiOrchestrator.');
        const { text, context, model } = payload;

        // Dynamically import the ESM aiOrchestrator
        const aiOrchestratorModule = await import('../../../../apps/backend-core/src/services/aiOrchestrator.js');
        const aiOrchestrator = aiOrchestratorModule.default;

        try {
            // Add user's context directly to the task
            const fullTask = context ? `[Context: ${context}]\n\n${text}` : text;

            // Send directly to the OpenClaw Omni-Router pipeline
            const result = await aiOrchestrator.spawnSubagent(fullTask, 'Chat-Omni-Router');

            if (result && typeof result === 'object' && result.success) {
                return result;
            } else if (typeof result === 'string') {
                return { success: true, response: result };
            } else {
                return { success: false, error: 'Omni-Action Engine returned an invalid format.' };
            }
        } catch (error) {
            console.error('[HiveMind] Omni-Router execution failed:', error);
            return { success: false, error: `Omni-Router execution failed: ${error.message}` };
        }
    }
}

module.exports = new HiveMind();
