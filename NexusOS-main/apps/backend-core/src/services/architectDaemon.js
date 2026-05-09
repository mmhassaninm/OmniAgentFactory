/**
 * ============================================================
 *  🏛️ Nexus-Architect: Proactive Evolution Daemon
 * ============================================================
 *  A visionary AI daemon that proactively analyzes the NexusOS
 *  ecosystem — installed apps, IPC channels, user workflow
 *  focus — and autonomously invents new features by querying
 *  the Dual-Provider AI. When approved, it auto-generates
 *  React/Backend code and injects it into the codebase.
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import logger from '@nexus/logger';

const CYCLE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const PROJECT_ROOT = 'D:/NexusOS-main';

class ArchitectDaemon {
    constructor() {
        /** @type {NodeJS.Timeout | null} */
        this.intervalHandle = null;
        /** @type {boolean} */
        this.isRunning = false;
        /** @type {Array<object>} Ideas generated so far */
        this.ideaLog = [];
        /** @type {object | null} Latest pending idea awaiting approval */
        this.pendingIdea = null;
        /** @type {number} */
        this.cycleCount = 0;
    }

    // ═══════════════════════════════════════════════════════════
    //  CONTEXT GATHERING
    // ═══════════════════════════════════════════════════════════

    /**
     * Gathers the current system context for the AI to reason about.
     * Scans installed apps, registered IPC channels, and project structure.
     * @returns {string} Markdown-formatted system state
     */
    _gatherContext() {
        const lines = [];

        // 1. Registered Apps
        lines.push('## Installed NexusOS Applications');
        const apps = [
            { id: 'cortex', name: 'Cortex AI', purpose: 'LLM Chat & RAG pipeline' },
            { id: 'netguard', name: 'NetGuard Monitoring', purpose: 'Network traffic & telemetry' },
            { id: 'monitor', name: 'System Monitor', purpose: 'CPU/RAM/FPS sparklines' },
            { id: 'vault', name: 'Gemini Vault', purpose: 'Encrypted knowledge store' },
            { id: 'forge', name: 'Nexus Forge', purpose: 'AI Art prompt sculptor + Fooocus Bridge' },
            { id: 'animus', name: 'Animus Vault', purpose: 'Legacy code evolution daemon with DNA queue' },
            { id: 'settings', name: 'Settings', purpose: 'System configuration' },
        ];
        for (const app of apps) {
            lines.push(`- **${app.name}** (${app.id}): ${app.purpose}`);
        }

        // 2. Active IPC Channels
        lines.push('\n## Registered IPC Channels');
        const channels = [
            'ai:prompt', 'ai:refactor', 'ai:predict',
            'forge:health', 'forge:generate',
            'animus:daemon-start', 'animus:queue', 'animus:inject',
            'ghost:start', 'ghost:stop', 'ghost:status',
            'chaos:run', 'chaos:status',
            'sentinel:heal-ui',
            'db:saveMemory', 'db:searchMemory',
            'vault:saveNote', 'vault:listNotes',
        ];
        lines.push(channels.map(c => `\`${c}\``).join(', '));

        // 3. User Workflow Focus
        lines.push('\n## User Workflow Focus');
        lines.push('The primary user is a **Researcher & Artist** focused on:');
        lines.push('- High-Fidelity AI Art Research (Greco-Roman classical art, photorealism)');
        lines.push('- Fooocus / Stable Diffusion XL local image generation');
        lines.push('- LM Studio local LLM inference');
        lines.push('- Privacy-first, local-only architecture');
        lines.push('- Self-healing OS with Sentinel error recovery');

        // 4. Existing Services (scan directory)
        lines.push('\n## Backend Services');
        try {
            const servicesDir = path.join(PROJECT_ROOT, 'apps/backend-core/src/services');
            const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js'));
            lines.push(serviceFiles.map(f => `\`${f}\``).join(', '));
        } catch { lines.push('(unavailable)'); }

        // 5. Frontend Components
        lines.push('\n## Frontend Components');
        try {
            const appsDir = path.join(PROJECT_ROOT, 'apps/nexus-desktop/src/components/Apps');
            const appFiles = fs.readdirSync(appsDir).filter(f => f.endsWith('.jsx'));
            lines.push(appFiles.map(f => `\`${f}\``).join(', '));
        } catch { lines.push('(unavailable)'); }

        // 6. Recently dismissed ideas (to avoid repeats)
        if (this.ideaLog.length > 0) {
            lines.push('\n## Previously Proposed Ideas (AVOID REPEATING)');
            for (const idea of this.ideaLog.slice(-10)) {
                lines.push(`- "${idea.featureName}" — ${idea.status}`);
            }
        }

        return lines.join('\n');
    }

    // ═══════════════════════════════════════════════════════════
    //  AI IDEA GENERATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Queries the AI to invent a new feature based on the gathered context.
     * @returns {Promise<object | null>} The proposed feature
     */
    async _generateIdea() {
        try {
            const context = this._gatherContext();
            const aiServiceModule = await import('./aiService.js');
            const aiService = aiServiceModule.default;

            const prompt = `Act as a visionary OS Architect and Senior Product Designer for NexusOS — a premium, privacy-first desktop operating system built with Electron + React + Glassmorphism UI.

CURRENT SYSTEM STATE:
${context}

YOUR MISSION:
Invent ONE highly innovative, MISSING feature or micro-app that would significantly enhance the user's AI Art Research workflow or the OS experience. Think beyond the obvious. Consider features like:
- Prompt versioning / A-B comparison tools for art generation
- AI-powered image analysis/critique of generated art
- Color palette extraction and mood board generators
- Reference image management with AI tagging
- Workflow automation / batch generation pipelines
- Advanced model comparison dashboards
- Style transfer experimentation tools
- Live canvas / collaborative editing
- AI art gallery with metadata search
- Generation parameter optimization (auto-tuning)

DO NOT propose something already in the installed apps list.
DO NOT repeat previously proposed ideas.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "featureName": "Short catchy name",
  "appId": "lowercase_id",
  "pitch": "Two persuasive sentences explaining why this feature is essential.",
  "technicalBlueprint": {
    "type": "ui_app | backend_service | both",
    "frontendFile": "ComponentName.jsx",
    "backendFile": "serviceName.js (or null)",
    "ipcChannels": ["channel:name"],
    "keyFeatures": ["feature1", "feature2", "feature3"],
    "dependencies": ["existing services it integrates with"]
  }
}`;

            const result = await aiService.prompt(null, {
                text: prompt,
                type: 'code_analysis',
                urgency: 'high'
            });

            if (!result?.success || !result?.response) {
                logger.warn('🏛️ [ARCHITECT] AI returned no response.');
                return null;
            }

            // Parse JSON from response
            let text = result.response.trim();
            // Strip markdown fences
            text = text.replace(/^```[\w]*\n?/gm, '').replace(/```\s*$/gm, '').trim();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                logger.warn(`🏛️ [ARCHITECT] Could not parse JSON from AI response.`);
                return null;
            }

            const idea = JSON.parse(jsonMatch[0]);
            idea.generatedAt = new Date().toISOString();
            idea.status = 'pending';

            logger.info(`🏛️ [ARCHITECT] 💡 New idea: "${idea.featureName}"`);
            return idea;
        } catch (err) {
            logger.error(`🏛️ [ARCHITECT] Idea generation failed: ${err.message}`);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  AUTO-BUILDER
    // ═══════════════════════════════════════════════════════════

    /**
     * Takes an approved idea and auto-generates the code for it.
     * @param {object} idea - The approved idea with technicalBlueprint
     * @returns {Promise<{ success: boolean, files: string[], message: string }>}
     */
    async buildIdea(idea) {
        if (!idea || !idea.technicalBlueprint) {
            return { success: false, files: [], message: 'No blueprint provided.' };
        }

        logger.info(`🏛️ [ARCHITECT] 🔨 Auto-building: "${idea.featureName}"...`);
        const bp = idea.technicalBlueprint;
        const generatedFiles = [];

        try {
            const aiServiceModule = await import('./aiService.js');
            const aiService = aiServiceModule.default;

            // Generate Frontend Component
            if (bp.type === 'ui_app' || bp.type === 'both') {
                const uiPrompt = `You are building a Premium Glassmorphism React component for NexusOS.

FEATURE: ${idea.featureName}
PITCH: ${idea.pitch}
KEY FEATURES: ${bp.keyFeatures?.join(', ')}
IPC CHANNELS: ${bp.ipcChannels?.join(', ')}
INTEGRATES WITH: ${bp.dependencies?.join(', ')}

Write a COMPLETE, production-ready React component using:
- React hooks (useState, useEffect, useCallback)
- Tailwind CSS v4 classes (dark mode, glassmorphism)
- lucide-react icons
- Import nexusBridge from '../../services/bridge' for IPC calls
- Premium dark UI with gradients, micro-animations, rounded corners
- Full interactivity — not a skeleton

Output ONLY the JavaScript/JSX code. No markdown fences, no explanations.`;

                const uiResult = await aiService.prompt(null, { text: uiPrompt, type: 'code_analysis', urgency: 'high' });
                if (uiResult?.success && uiResult?.response) {
                    let code = uiResult.response.trim().replace(/^```[\w]*\n?/gm, '').replace(/```\s*$/gm, '').trim();
                    const filePath = path.join(PROJECT_ROOT, 'apps/nexus-desktop/src/components/Apps', bp.frontendFile || `${idea.appId}.jsx`);

                    if (!fs.existsSync(filePath)) {
                        const dir = path.dirname(filePath);
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                        fs.writeFileSync(filePath, code, 'utf-8');
                        generatedFiles.push(filePath);
                        logger.info(`🏛️ [ARCHITECT] 📦 Frontend injected: ${bp.frontendFile}`);
                    } else {
                        logger.warn(`🏛️ [ARCHITECT] Frontend file already exists, skipping.`);
                    }
                }
            }

            // Generate Backend Service
            if ((bp.type === 'backend_service' || bp.type === 'both') && bp.backendFile) {
                const backendPrompt = `You are building an ESM backend service for NexusOS (Electron + Node.js).

FEATURE: ${idea.featureName}
PITCH: ${idea.pitch}
KEY FEATURES: ${bp.keyFeatures?.join(', ')}
IPC CHANNELS: ${bp.ipcChannels?.join(', ')}

Write a COMPLETE, production-ready ESM service class using:
- ESM import/export
- import logger from '@nexus/logger'
- Comprehensive error handling with try/catch
- JSDoc documentation
- Export default as a singleton instance

Output ONLY the JavaScript code. No markdown fences, no explanations.`;

                const beResult = await aiService.prompt(null, { text: backendPrompt, type: 'code_analysis', urgency: 'high' });
                if (beResult?.success && beResult?.response) {
                    let code = beResult.response.trim().replace(/^```[\w]*\n?/gm, '').replace(/```\s*$/gm, '').trim();
                    const filePath = path.join(PROJECT_ROOT, 'apps/backend-core/src/services', bp.backendFile);

                    if (!fs.existsSync(filePath)) {
                        fs.writeFileSync(filePath, code, 'utf-8');
                        generatedFiles.push(filePath);
                        logger.info(`🏛️ [ARCHITECT] ⚙️ Backend injected: ${bp.backendFile}`);
                    } else {
                        logger.warn(`🏛️ [ARCHITECT] Backend file already exists, skipping.`);
                    }
                }
            }

            // Mark idea as built
            idea.status = 'built';
            idea.builtAt = new Date().toISOString();

            return {
                success: generatedFiles.length > 0,
                files: generatedFiles,
                message: generatedFiles.length > 0
                    ? `Built ${generatedFiles.length} file(s). Restart or HMR to activate.`
                    : 'No new files generated (may already exist).'
            };
        } catch (err) {
            logger.error(`🏛️ [ARCHITECT] Auto-build failed: ${err.message}`);
            return { success: false, files: [], message: err.message };
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  DAEMON LIFECYCLE
    // ═══════════════════════════════════════════════════════════

    /**
     * Runs a single ideation cycle.
     */
    async _cycle() {
        this.cycleCount++;
        logger.info(`🏛️ [ARCHITECT] Cycle #${this.cycleCount} — Generating new idea...`);

        const idea = await this._generateIdea();
        if (idea) {
            this.pendingIdea = idea;
            this.ideaLog.push(idea);
            if (this.ideaLog.length > 50) this.ideaLog.shift();

            // Broadcast to frontend via all windows
            try {
                const { BrowserWindow } = await import('electron');
                const windows = BrowserWindow.getAllWindows();
                for (const win of windows) {
                    if (!win.isDestroyed()) {
                        win.webContents.send('architect:new-idea', idea);
                    }
                }
                logger.info(`🏛️ [ARCHITECT] 💡 Idea broadcast to ${windows.length} window(s).`);
            } catch (err) {
                logger.warn(`🏛️ [ARCHITECT] Broadcast failed: ${err.message}`);
            }
        }
    }

    /** Start the background daemon. */
    start(options = {}) {
        if (this.isRunning) return { status: 'already_running' };

        this.isRunning = true;
        const interval = options.intervalMs || CYCLE_INTERVAL_MS;

        // First cycle after 5 seconds
        setTimeout(() => this._cycle(), 5000);
        this.intervalHandle = setInterval(() => this._cycle(), interval);

        logger.info(`🏛️ [ARCHITECT] Daemon ACTIVATED (cycle every ${interval / 1000}s).`);
        return { status: 'started', intervalMs: interval };
    }

    /** Stop the daemon. */
    stop() {
        if (!this.isRunning) return { status: 'not_running' };
        this.isRunning = false;
        if (this.intervalHandle) { clearInterval(this.intervalHandle); this.intervalHandle = null; }
        logger.info('🏛️ [ARCHITECT] Daemon STOPPED.');
        return { status: 'stopped', cycleCount: this.cycleCount };
    }

    /** Manually trigger a single idea cycle. */
    async triggerIdea() {
        await this._cycle();
        return { pendingIdea: this.pendingIdea };
    }

    /** Dismiss the current pending idea. */
    dismissIdea() {
        if (this.pendingIdea) {
            this.pendingIdea.status = 'dismissed';
            this.pendingIdea = null;
        }
        return { success: true };
    }

    /** Approve and build the current pending idea. */
    async approveIdea() {
        if (!this.pendingIdea) return { success: false, message: 'No pending idea.' };
        const result = await this.buildIdea(this.pendingIdea);
        this.pendingIdea = null;
        return result;
    }

    /** Get status for IPC queries. */
    getStatus() {
        return {
            isRunning: this.isRunning,
            cycleCount: this.cycleCount,
            pendingIdea: this.pendingIdea,
            totalIdeas: this.ideaLog.length,
            recentIdeas: this.ideaLog.slice(-5)
        };
    }
}

export default new ArchitectDaemon();
