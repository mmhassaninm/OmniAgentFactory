import aiOrchestrator from '../apps/backend-core/src/services/aiOrchestrator.js';

async function run() {
    await aiOrchestrator.init();

    console.log("=============================================================");
    console.log("   🚀 ESCALATION DIRECT BACKEND TEST (LEVEL 1) 🚀  ");
    console.log("=============================================================\n");

    const prompt = "قم بإنشاء مجلد باسم 'Nexus_Tests' على سطح المكتب، وبداخله مجلد آخر باسم 'Logs'، ثم أنشئ ملف نصي بداخله يكتب فيه 'نجح المستوى الأول'.";

    console.log(`[Test] Sending Prompt: ${prompt}\n`);

    const result = await aiOrchestrator.spawnSubagent(prompt, "Level-1-Chaos");
    console.log("\n[Test] FINAL RESULT SYNTHESIS:");
    console.log(JSON.stringify(result, null, 2));

    process.exit(0);
}

run();
