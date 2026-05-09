import vramManager from './src/services/vramManager.js';
import logger from '@nexus/logger';

async function verifyBreather() {
    console.log("--- 🧠 Testing GPU Breather Protocol ---");

    console.log("\n1. Generating mock prompt sequence (Warm/Cold Status Check)...");

    // Simulate checking if warm
    const isWarm = await vramManager.isEngineWarm();
    console.log(`[Diagnostic] Is Engine Warm? ${isWarm}`);

    if (!isWarm) {
        console.log(`[Diagnostic] Emitting UI Event: [GPU Breather: Warming up AI Engine...]`);
        vramManager._emitUINotification('[GPU Breather: Warming up AI Engine...]');
    }

    console.log("\n2. Simulating backend activity trigger (Resetting Idle Timer)...");
    vramManager.recordActivity();

    console.log("\n3. Waiting 65 seconds for VRAM Idle cleanup execution. Do not close this script...");
    setTimeout(async () => {
        console.log("\n4. Timeout completed. Verifying LM Studio VRAM Status...");
        const warmAfterWait = await vramManager.isEngineWarm();
        console.log(`[Diagnostic] Is Engine Warm After Timeout? ${warmAfterWait}`);

        console.log("\n✅ GPU Breather Local Diagnostic Complete.");
        process.exit(0);
    }, 65000); // Wait 65 seconds
}

verifyBreather();
