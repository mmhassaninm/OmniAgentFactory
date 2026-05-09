import electronPkg from 'electron';
const BrowserWindow = electronPkg.BrowserWindow || electronPkg.default?.BrowserWindow;
import fetch from 'node-fetch';
import logger from '@nexus/logger';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Temporarily importing the legacy CJS settingsService until it's migrated
const settingsService = require('../../../../src/main/services/settingsService.js');

class AIService {
    constructor() {
        this.models = {
            default: 'gemini-1.5-pro',
            fast: 'gemini-1.5-flash',
            reasoning: 'gemini-1.5-pro'
        };
    }

    // Helper: Push proactive UI notification from Main to Renderer
    notifyUI(channel, data) {
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send(channel, data);
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  CENTRAL DISPATCHER
    // ═══════════════════════════════════════════════════════════

    /**
     * Central AI prompt dispatcher.
     * Routes to NexusPrime Engine (local) or Google Gemini (cloud).
     * OpenAI has been deprecated and removed.
     */
    async prompt(event, payload) {
        const settings = await settingsService.getSettings();
        const provider = settings?.aiProvider || 'local';

        if (provider === 'google') {
            return this._promptGoogle(event, payload, settings);
        }

        // Default: route ALL local inference through Nexus-Prime Engine
        return this._promptLocal(event, payload, settings);
    }

    // ═══════════════════════════════════════════════════════════
    //  LOCAL: Nexus-Prime Engine (Smart Routing)
    // ═══════════════════════════════════════════════════════════

    /**
     * Routes local AI requests through NexusPrimeEngine.promptRaw().
     * Benefits: Smart Model Routing, Dual-Port Orchestration,
     * Dynamic Parameters, and automatic <think> tag stripping.
     */
    async _promptLocal(event, payload, settings) {
        const { text, context, type = 'general', urgency = 'normal', model } = payload;
        logger.info(`[AIService → NexusPrime] Prompt received. Type: ${type}, Urgency: ${urgency}`);

        try {
            const lang = await settingsService.getLanguage();
            const aiOrchestrator = (await import('./aiOrchestrator.js')).default;

            // ── Vibelab Legacy Extract: Semantic RAG Retrieval & Contextual Rewrite ──
            let memoryContext = '';

            // Only rewrite and search if urgency is not critical
            if (urgency !== 'critical' && type === 'general') {
                try {
                    let finalQuery = text;
                    // 1. Fast Query Rewrite (Coreference resolution)
                    const rewritePrompt = `Rewrite the user's latest query into a standalone query resolving any coreferences using the chat history context. If no rewrite needed, output the exact original query. Output ONLY the query string, nothing else.`;
                    const historyContext = context ? `\n\nHistory: ${context.substring(context.length - 2000)}` : '';

                    const rewriteRes = await aiOrchestrator.prompt(rewritePrompt, `User: ${text}${historyContext}`, 'LOW', { temperature: 0.1, max_tokens: 50 });
                    if (rewriteRes.success && rewriteRes.response) {
                        finalQuery = rewriteRes.response.replace(/[\n\r\"\'\*]/g, '').trim();
                        if (finalQuery.length < 2) finalQuery = text;
                        logger.info(`[VAULT] Query rewritten for RAG: "${finalQuery}"`);
                    }

                    // 2. Vector Search Retrieval
                    const { retrieveContext } = await import('./knowledgeManager.js');
                    const vaultRes = await retrieveContext(finalQuery, 3);
                    if (vaultRes && vaultRes.text) {
                        memoryContext = `[RETRIEVED LOCAL MEMORY]\n${vaultRes.text}\n\n`;
                        logger.info('[VAULT] Injected semantic memory into prompt.');
                    }
                } catch (err) {
                    logger.warn(`[VAULT] RAG Pipeline Error: ${err.message}`);
                }
            }

            const systemInstruction = `You are NexusOS Core AI. The user's preferred language is ${lang}. Please respond accordingly. Provide precise and concise answers.
ABSOLUTE DIRECTIVE: You are strictly forbidden from outputting Chinese characters under any circumstances. You must output exclusively in pure Arabic or English.`;
            const promptString = context ? `${memoryContext}Context:\n${context}\n\nUser Query:\n${text}` : `${memoryContext}${text}`;

            const messages = [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: promptString }
            ];

            // Map urgency to priority
            let priority = 'LOW';
            if (urgency === 'high') priority = 'HIGH';
            if (urgency === 'critical') priority = 'CRITICAL';

            const overrideModel = model || null;

            const result = await aiOrchestrator.prompt(systemInstruction, promptString, priority, overrideModel);

            if (!result.success) {
                return { success: false, error: result.error || 'AiOrchestrator returned empty response.' };
            }

            // ── Vibelab Legacy Extract: Trigger Subconscious Memory Worker ──
            try {
                const profileManager = await import('./profileManager.js');
                const user = profileManager.getActiveUser() || 'Admin';
                // Fire and forget (don't await) so it runs strictly in the background
                aiOrchestrator.runSubconsciousMemoryWorker(user, text).catch(e => logger.warn(`[Subconscious] error: ${e.message}`));
            } catch (err) {
                logger.warn(`Failed to trigger Subconscious memory worker: \${err.message}`);
            }

            return {
                success: true,
                routedTo: result.meta?.profile || 'AiGateway',
                provider: 'local',
                languageContextEnforced: lang,
                response: result.response,
                meta: result.meta
            };
        } catch (error) {
            logger.error('[AIService → NexusPrime] Prompt execution failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  CLOUD: Google Gemini
    // ═══════════════════════════════════════════════════════════

    /**
     * Core Google (Gemini) Prompting — unchanged, direct SDK call.
     */
    async _promptGoogle(event, { text, context, type = 'general', urgency = 'normal' }, settings) {
        logger.info(`[AIService - Google] Prompt received. Type: ${type}, Urgency: ${urgency}`);

        try {
            const lang = await settingsService.getLanguage();
            const apiKey = settings?.secrets?.geminiKey || process.env.GEMINI_API_KEY;

            if (!apiKey) {
                return { success: false, message: 'Google API Key missing. Configure in Settings.' };
            }

            let targetModel = this.models.default;
            if (urgency === 'high') targetModel = this.models.fast;
            if (type === 'code_analysis') targetModel = this.models.reasoning;

            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: targetModel });

            const systemInstruction = `You are NexusOS Core AI. The user's preferred language is ${lang}. Respond accordingly. Precise and concise.`;
            const promptString = context ? `Context:\n${context}\n\nUser Query:\n${text}` : text;

            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: promptString }] }],
                systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] }
            });

            return {
                success: true,
                routedTo: targetModel,
                provider: 'google',
                response: result.response.text()
            };
        } catch (error) {
            logger.error('[AIService - Google] Error:', error);
            return { success: false, error: error.message };
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  SPECIALIZED AI ENDPOINTS
    // ═══════════════════════════════════════════════════════════

    // 2. GhostDeveloper (Codebase Analysis & Refactoring)
    async refactor(event, { path, code, objective }) {
        logger.info(`[GhostDeveloper] Analyzing context at: ${path || 'workspace'}`);

        try {
            const lang = await settingsService.getLanguage();
            const notificationMsg = lang === 'ar'
                ? 'المطور الشبح يقوم الآن بتحليل الكود لإعادة الهيكلة...'
                : 'GhostDeveloper is analyzing the code for refactoring...';

            this.notifyUI('ghost:status', { message: notificationMsg, level: 'info' });

            const aiResult = await this.prompt(event, {
                text: `Refactor this code. Objective: ${objective}\n\nCode:\n${code}`,
                type: 'code_analysis'
            });

            if (aiResult.success) {
                const successMsg = lang === 'ar'
                    ? 'اكتملت عملية الإعاده الهيكلة الشبحية.'
                    : 'Ghost refactoring complete.';
                this.notifyUI('ghost:status', { message: successMsg, level: 'success' });
                return { success: true, refactoredCode: aiResult.response };
            }

            return { success: false, message: 'Refactoring failed via API.' };

        } catch (error) {
            logger.error('[GhostDeveloper] Refactoring Error:', error);
            return { success: false, error: error.message };
        }
    }

    // 3. PredictiveEngine (Context Streaming & Predictions)
    async predict(event, context) {
        logger.info('[PredictiveEngine] Evaluating user context stream for predictions.');

        try {
            const lang = await settingsService.getLanguage();

            const aiResult = await this.prompt(event, {
                text: `Analyze this UI context and predict what the user wants to do next. Output a one sentence suggestion.\n\nContext:\n${context}`,
                urgency: 'high'
            });

            let predictionMsg = aiResult.success ? aiResult.response : (lang === 'ar'
                ? 'اقتراح ذكي: بناءً على سياقك الحالي، هل ترغب في فتح وحدة التحكم (Terminal)؟'
                : 'Smart Suggestion: Based on your context, would you like to spawn a Terminal?');

            predictionMsg = predictionMsg.replace(/^["']|["']$/g, '').trim();

            this.notifyUI('predictive:suggestion', { suggestion: predictionMsg });

            return { success: true, suggestion: predictionMsg };
        } catch (error) {
            logger.error('[PredictiveEngine] Prediction Error:', error);
            return { success: false, error: error.message };
        }
    }
}

export default new AIService();
