const { spawn } = require('child_process');
const path = require('path');
const settingsService = require('./settingsService');
const pythonOrchestrator = require('../pythonOrchestrator');

class ChatService {
    constructor() { }

    // Phase 14 / Phase 15 overlap: Verifying the Python Core link
    async startPythonCore() {
        console.log('[ChatService] Initializing Python AI Core Link via Orchestrator...');
        // pythonOrchestrator is booted in app.js, so here we just acknowledge readiness
        return { status: 'ready', message: 'Linked to Python Orchestrator stream' };
    }

    // Proxy LM Studio models to bypass Vite CORS restrictions
    async getModels() {
        try {
            const res = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(3000) });
            if (!res.ok) return { models: [] };
            const data = await res.json();
            return { models: (data.data || []).map(m => m.id) };
        } catch (e) {
            console.warn('[ChatService] LM Studio check failed:', e.message);
            return { models: [] };
        }
    }

    // Handle incoming messages from the React Renderer
    async sendMessage({ message, sessionId }) {
        const lang = await settingsService.getLanguage();

        // Phase 23: Injecting Localization context metadata into the AI prompt
        const systemLangContext = lang === 'ar' ? 'arabic' : 'english';

        console.log(`[ChatService] Dispatching payload to AI Orchestrator (Lang: \${lang})`);

        const payload = {
            command: 'inference_request',
            session_id: sessionId || 'default',
            query: message,
            target_language: systemLangContext
        };

        const success = pythonOrchestrator.sendMessage(payload);

        if (!success) {
            return {
                status: 'error',
                reply: 'Python Inference Engine is currently disconnected or offline.',
                timestamp: new Date().toISOString()
            };
        }

        // We return an immediate HTTP-like ACK. The actual text response 
        // streams asynchronously via pythonOrchestrator's STDOUT to Preload.
        return {
            status: 'success',
            reply: '[System] Request piped to Inference Engine. Awaiting stream...',
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new ChatService();
