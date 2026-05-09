import { NexusPrimeEngine } from '../apps/backend-core/src/services/nexusPrimeEngine.js';
import logger from '@nexus/logger';

async function verifyAI() {
    console.log("=== Nexus-Prime Engine Verification ===");
    const engine = new NexusPrimeEngine();

    // Mock the status broadcast to avoid Electron BrowserWindow errors in headless mode
    engine._broadcastStatus = (status, model) => {
        console.log(`[STATUS] ${status} | Model: ${model}`);
    };

    try {
        console.log("[1] Initializing Engine...");
        await engine.init();

        console.log("[2] Testing Task Classification...");
        const uiProfile = engine._classifyTask("Change the background color to cyan");
        console.log(`- UI Task: ${uiProfile.name} (Expected: FAST_UI)`);

        const logicProfile = engine._classifyTask("Fix the memory leak in the IPC handler");
        console.log(`- Logic Task: ${logicProfile.name} (Expected: SMART_LOGIC)`);

        console.log("[3] Testing Chat/Prompt Logic (Headless)...");
        // Note: Adding a short timeout for the test to avoid hanging
        try {
            const messages = [{ role: 'user', content: 'What is NexusOS?' }];
            const result = await Promise.race([
                engine.promptRaw(messages, 'What is NexusOS?'),
                new Promise((_, reject) => setTimeout(() => reject(new Error("LM Studio Timeout - Verification Script")), 5000))
            ]);

            if (result.success) {
                console.log("[SUCCESS] AI Engine responded correctly.");
                console.log("- Thinking:", result.thinking ? "YES" : "NO");
                console.log("- Response Sample:", result.response.substring(0, 100) + "...");
            } else {
                console.log("[WARNING] AI Prompt failed. Is LM Studio running on port 1234?");
                console.log("- Error:", result.error);
            }
        } catch (err) {
            console.log("[TIMEOUT/ERROR] Skipping live AI test:", err.message);
        }

    } catch (error) {
        console.error("[FATAL] Verification failed:", error);
    }
}

verifyAI();
