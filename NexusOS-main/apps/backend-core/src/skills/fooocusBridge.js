import fs from 'fs';
import path from 'path';
import logger from '@nexus/logger';

class FooocusBridge {
    constructor() {
        // Fooocus often uses Gradio API on port 7865 or a custom REST API
        this.apiUrl = 'http://127.0.0.1:7865';
        this.targetFolder = 'C:\\Users\\Mostafa\\Desktop\\Amira Emad';
    }

    async ensureFolder() {
        if (!fs.existsSync(this.targetFolder)) {
            fs.mkdirSync(this.targetFolder, { recursive: true });
        }
    }

    async ping() {
        logger.info(`[FooocusBridge] Pinging local Fooocus Engine at ${this.apiUrl}...`);
        try {
            // A simple GET to check if the Gradio root is up
            const response = await fetch(this.apiUrl, { timeout: 3000 });
            if (response.ok) {
                logger.info('[FooocusBridge] Fooocus API is online and responding.');
                return { online: true };
            } else {
                return { online: false, status: response.status };
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.type === 'request-timeout') {
                logger.warn('[FooocusBridge] 🖼️ Waiting for Fooocus Engine to be started by the user. (Connection Refused/Timeout)');
                return { online: false, error: 'ECONNREFUSED' };
            }
            logger.error(`[FooocusBridge] Ping error: ${error.message}`);
            return { online: false, error: error.message };
        }
    }

    async executeIntent(task) {
        logger.info(`[FooocusBridge] Executing Image Generation Intent: ${task.prompt}`);

        try {
            const status = await this.ping();
            if (!status.online) {
                return { success: false, error: 'Fooocus Engine offline. Waiting for user to start it.' };
            }

            // Fallback for actual image generation if Fooocus is running.
            // This assumes a standard `/run/predict` Gradio endpoint or similar custom API.
            // Adjust payload strictly to the user's Fooocus API wrapper.
            const payload = {
                data: [
                    task.prompt,
                    "", // Negative prompt
                    "Quality", // Performance
                    "1152×896", // Aspect ratio
                    1, // Image count
                    "JPEG", // Image format
                ]
            };

            const response = await fetch(`${this.apiUrl}/run/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Fooocus API Error: ${response.statusText}`);
            }

            const data = await response.json();

            // Extract the generated image (usually base64 or path depending on API wrapper)
            // Assuming base64 array in standard gradio wrapper:
            if (data && data.data && data.data[0]) {
                const imageBase64 = data.data[0].replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(imageBase64, 'base64');
                const filename = `Fooocus_${Date.now()}.jpg`;

                await this.ensureFolder();
                const savePath = path.join(this.targetFolder, filename);
                fs.writeFileSync(savePath, buffer);

                logger.info(`[FooocusBridge] 🖼️ Image successfully generated and saved to ${savePath}`);
                return { success: true, payload: `Image saved at ${savePath}` };
            } else {
                throw new Error("No image data returned from Fooocus API.");
            }

        } catch (error) {
            logger.error(`[FooocusBridge] Image generation failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

export default new FooocusBridge();
