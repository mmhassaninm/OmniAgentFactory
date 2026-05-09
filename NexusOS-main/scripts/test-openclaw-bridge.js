/**
 * ═══════════════════════════════════════════════════════════════════════
 * NexusOS — OpenClaw Sniper Protocol Test
 * Phase 59: Backend-only verification of the full OpenClaw pipeline
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Execution Trace:
 * test-openclaw-bridge.js
 *   → openClawBridge.spawnLocalSubagent(task)
 *     → aiOrchestrator.spawnSubagent(task, label)
 *       → aiOrchestrator.prompt(systemPrompt, task, 'HIGH', {temperature: 0})
 *         → nexusPrimeEngine.promptRaw(systemPrompt, task, options)
 *           → nexusPrimeEngine._callLM(endpoint, payload)
 *             → LM Studio API (localhost:1234)
 *       → <tool_call> interception
 *         → nexusPrimeEngine._executeTool(toolName, args)
 *           → _toolExecuteCommand / _toolReadFile / etc.
 *       → Follow-up synthesis with tool results
 *     → Return final response
 */

const startTime = Date.now();

function elapsed() {
    return `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
}

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  🎯 NEXUSOS — OPENCLAW SNIPER PROTOCOL TEST (Phase 59)');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  ▸ Timestamp: ${new Date().toISOString()}`);
console.log(`  ▸ Node: ${process.version}`);
console.log(`  ▸ CWD: ${process.cwd()}`);
console.log('');

async function runSniperTest() {
    // ── STAGE 1: Import verification ──
    console.log(`[${elapsed()}] ── STAGE 1: MODULE IMPORT ──────────────────────)`);

    let openClawBridge, aiOrchestrator;

    try {
        const bridgeMod = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/apps/backend-core/src/services/openClawBridge.js');
        openClawBridge = bridgeMod.default;
        console.log(`[${elapsed()}] ✅ openClawBridge loaded | quarantinePath: ${openClawBridge.quarantinePath}`);
        console.log(`[${elapsed()}]    currentVersion: ${openClawBridge.currentVersion}`);
    } catch (err) {
        console.error(`[${elapsed()}] ❌ FATAL: Failed to import openClawBridge: ${err.message}`);
        process.exit(1);
    }

    try {
        const orchMod = await import('file:///' + process.cwd().replace(/\\/g, '/') + '/apps/backend-core/src/services/aiOrchestrator.js');
        aiOrchestrator = orchMod.default;
        console.log(`[${elapsed()}] ✅ aiOrchestrator loaded | initialized: ${aiOrchestrator.isInitialized}`);
    } catch (err) {
        console.error(`[${elapsed()}] ❌ FATAL: Failed to import aiOrchestrator: ${err.message}`);
        process.exit(1);
    }

    // ── STAGE 2: Orchestrator init verification ──
    console.log('');
    console.log(`[${elapsed()}] ── STAGE 2: ORCHESTRATOR INIT ─────────────────)`);

    try {
        await aiOrchestrator.init();
        console.log(`[${elapsed()}] ✅ AiOrchestrator initialized | MongoDB cache: ${aiOrchestrator.cache ? 'ACTIVE' : 'NONE'}`);
        console.log(`[${elapsed()}]    Queue state: C:${aiOrchestrator.queues?.CRITICAL?.length || 0} H:${aiOrchestrator.queues?.HIGH?.length || 0} L:${aiOrchestrator.queues?.LOW?.length || 0}`);
    } catch (err) {
        console.error(`[${elapsed()}] ⚠️ Orchestrator init error (non-fatal for test): ${err.message}`);
    }

    // ── STAGE 3: Direct spawnSubagent test ──
    console.log('');
    console.log(`[${elapsed()}] ── STAGE 3: SUBAGENT SPAWN (DIRECT) ───────────)`);

    const testTask = 'Use the executeCommand tool to list all .js files in the apps/backend-core/src/services/ directory. Run: dir /b apps\\backend-core\\src\\services\\*.js';
    console.log(`[${elapsed()}] 📤 Task: "${testTask}"`);
    console.log(`[${elapsed()}] 🔗 Route: openClawBridge.spawnLocalSubagent → aiOrchestrator.spawnSubagent → LM Studio`);
    console.log('');

    try {
        const result = await openClawBridge.spawnLocalSubagent(testTask);

        console.log('');
        console.log(`[${elapsed()}] ── STAGE 4: RESULT ANALYSIS ───────────────────)`);

        if (!result) {
            console.error(`[${elapsed()}] ❌ FAIL: Result is null/undefined`);
            process.exit(1);
        }

        // Analyze result structure
        console.log(`[${elapsed()}] 📦 Result type: ${typeof result}`);
        console.log(`[${elapsed()}] 📦 Result keys: ${Object.keys(result).join(', ')}`);

        if (result.response) {
            console.log(`[${elapsed()}] ✅ response field present (${result.response.length} chars)`);
            console.log(`[${elapsed()}] 📝 Response excerpt:`);
            console.log('─────────────────────────────────────────────────────');
            console.log(result.response.substring(0, 500));
            console.log('─────────────────────────────────────────────────────');
        } else {
            console.error(`[${elapsed()}] ❌ FAIL: No .response field in result`);
        }

        if (result.thinking) {
            console.log(`[${elapsed()}] 🧠 Thinking present (${result.thinking.length} chars)`);
        }

        if (result.toolCalls && result.toolCalls.length > 0) {
            console.log(`[${elapsed()}] 🔧 Tool calls executed: ${result.toolCalls.length}`);
            result.toolCalls.forEach((tc, i) => {
                console.log(`[${elapsed()}]    [${i}] ${tc.tool}(${JSON.stringify(tc.args).substring(0, 100)})`);
            });
        }

        if (result.cached) {
            console.log(`[${elapsed()}] ⚡ CACHE HIT — zero VRAM cost`);
        }

        console.log('');
        console.log(`[${elapsed()}] ═══ SNIPER TEST COMPLETE ═══`);
        console.log(`[${elapsed()}] ✅ Pipeline: openClawBridge → aiOrchestrator → LM Studio → Tool Execution → Synthesis`);
        console.log(`[${elapsed()}] ⏱️ Total execution time: ${elapsed()}`);

    } catch (err) {
        console.error(`[${elapsed()}] ❌ CRITICAL FAILURE in spawnLocalSubagent:`);
        console.error(`[${elapsed()}]    ${err.message}`);
        console.error(`[${elapsed()}]    Stack: ${err.stack?.split('\n').slice(0, 3).join(' | ')}`);
        process.exit(1);
    }
}

runSniperTest().then(() => {
    console.log(`\n[${elapsed()}] Process exiting cleanly.`);
    setTimeout(() => process.exit(0), 500);
}).catch(err => {
    console.error(`\n[${elapsed()}] Unhandled error: ${err.message}`);
    process.exit(1);
});
