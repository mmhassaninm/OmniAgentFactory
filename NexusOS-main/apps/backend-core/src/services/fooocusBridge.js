/**
 * ============================================================
 *  🔥 Fooocus Bridge Service
 * ============================================================
 *  Sends HTTP POST requests to the local Fooocus API for
 *  AI image generation. Supports text-to-image with advanced
 *  parameters (style, aspect ratio, negative prompt, etc.)
 * ============================================================
 */

import logger from '@nexus/logger';

const DEFAULT_FOOOCUS_URL = 'http://127.0.0.1:7865';

class FooocusBridge {
    constructor() {
        this.apiUrl = DEFAULT_FOOOCUS_URL;
        this.isAvailable = false;
    }

    /**
     * Configure the Fooocus API URL.
     * @param {string} url
     */
    setApiUrl(url) {
        this.apiUrl = url || DEFAULT_FOOOCUS_URL;
        logger.info(`[FooocusBridge] API URL set to: ${this.apiUrl}`);
    }

    /**
     * Check if the Fooocus API is reachable.
     * @returns {Promise<{ available: boolean, message: string }>}
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this.apiUrl}/`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            this.isAvailable = response.ok;
            return { available: this.isAvailable, message: this.isAvailable ? 'Fooocus API is online.' : 'API responded with error.' };
        } catch (err) {
            this.isAvailable = false;
            return { available: false, message: `Fooocus API unreachable: ${err.message}` };
        }
    }

    /**
     * Send a text-to-image generation request to the Fooocus API.
     * @param {object} payload
     * @param {string} payload.prompt - The positive prompt.
     * @param {string} [payload.negativePrompt] - The negative prompt.
     * @param {string} [payload.style] - Fooocus style preset (e.g., 'Fooocus V2', 'Cinematic').
     * @param {string} [payload.aspectRatio] - Aspect ratio (e.g., '1024×1024', '1152×896').
     * @param {number} [payload.seed] - RNG seed (-1 for random).
     * @param {number} [payload.sharpness] - Sharpness value (0-30).
     * @param {number} [payload.guidanceScale] - CFG guidance scale.
     * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
     */
    async generateImage(payload) {
        logger.info(`[FooocusBridge] 🎨 Sending generation request...`);
        logger.info(`[FooocusBridge] Prompt: "${payload.prompt?.slice(0, 100)}..."`);

        try {
            // Fooocus API v2 endpoint for text-to-image
            const body = {
                prompt: payload.prompt || '',
                negative_prompt: payload.negativePrompt || '(worst quality, low quality, normal quality, lowres, low details, oversaturated, undersaturated, overexposed)',
                style_selections: payload.style ? [payload.style] : ['Fooocus V2', 'Fooocus Enhance', 'Fooocus Sharp'],
                performance_selection: 'Quality',
                aspect_ratios_selection: payload.aspectRatio || '1152×896',
                image_number: 1,
                image_seed: payload.seed ?? -1,
                sharpness: payload.sharpness ?? 2,
                guidance_scale: payload.guidanceScale ?? 4,
                base_model_name: 'juggernautXL_v8Rundiffusion.safetensors',
                refiner_model_name: 'None',
                refiner_switch: 0.5,
                require_base64: true,
                async_process: true
            };

            const response = await fetch(`${this.apiUrl}/v1/generation/text-to-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(120000)
            });

            if (!response.ok) {
                const errBody = await response.text();
                logger.error(`[FooocusBridge] API error ${response.status}: ${errBody.slice(0, 200)}`);
                return { success: false, error: `Fooocus API Error: ${response.status}` };
            }

            const data = await response.json();
            logger.info(`[FooocusBridge] ✅ Generation request accepted.`);
            return { success: true, data };
        } catch (err) {
            logger.error(`[FooocusBridge] ❌ Generation failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Check the status of an async generation job.
     * @param {string} jobId
     * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
     */
    async checkJobStatus(jobId) {
        try {
            const response = await fetch(`${this.apiUrl}/v1/generation/query-job`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                return { success: false, error: `Status check failed: ${response.status}` };
            }

            const data = await response.json();
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

export default new FooocusBridge();
