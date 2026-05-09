import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const __dirname = path.resolve();
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'Project_Docs', 'Logs', 'vibelab_debug.log');
const MIDDLEWARE_DIR = path.join(PROJECT_ROOT, 'backend', 'middleware');
const LOCAL_LLM = 'http://127.0.0.1:1234/v1/chat/completions';
const MODEL = 'qwen2.5-coder-7b-instruct'; // Local LLM

// A local endpoint to attack. Update this if you have a specific test endpoint
const TARGET_API = 'http://localhost:5000/api/test';

async function getLogSize() {
    try {
        const stats = await fs.stat(LOG_FILE);
        return stats.size;
    } catch {
        return 0;
    }
}

async function getRecentLogs(startBytes, endBytes) {
    if (endBytes <= startBytes) return [];
    try {
        const content = await fs.readFile(LOG_FILE, 'utf8');
        const lines = content.split('\n');
        return lines.slice(-50);
    } catch {
        return [];
    }
}

async function runRedTeam() {
    console.log('🔴 [RED TEAM] Requesting malicious payload from Local LLM...');
    try {
        const payloadRes = await axios.post(LOCAL_LLM, {
            model: MODEL,
            messages: [{
                role: 'system',
                content: 'You are an elite Red Team Hacker. Generate a highly complex, malicious JSON payload designed to crash a Node.js Express server or cause NoSQL injection. Output ONLY the JSON. No markdown, no explanation.'
            }],
            max_tokens: 500,
            temperature: 0.7 // Higher temp for more creative attacks
        }, { timeout: 30000 });

        let maliciousJsonString = payloadRes.data?.choices?.[0]?.message?.content?.trim() || '';
        maliciousJsonString = maliciousJsonString.replace(/^```json\n/gm, '').replace(/^```\n/gm, '').replace(/```$/gm, '');

        const maliciousPayload = JSON.parse(maliciousJsonString);
        console.log('🔴 [RED TEAM] Payload acquired. Launching attack!');
        return maliciousPayload;
    } catch (err) {
        console.error(`🔴 [RED TEAM] Failed to generate payload: ${err.message}`);
        return null;
    }
}

async function runBlueTeam(attackPayload, errorLogs) {
    console.log('🔵 [BLUE TEAM] Server compromised. Analyzing logs and writing defense...');
    try {
        const prompt = `You are an elite Blue Team Security Engineer.
The Express.js server just failed or crashed against this attack payload:
${JSON.stringify(attackPayload, null, 2)}

The error log shows:
${errorLogs.join('\n')}

Write a robust Express.js middleware function to block this specific attack vector.
Output ONLY the raw JavaScript code for the middleware module (no markdown blocks, no explanations).`;

        const defenseRes = await axios.post(LOCAL_LLM, {
            model: MODEL,
            messages: [{ role: 'system', content: prompt }],
            max_tokens: 1500,
            temperature: 0.1
        }, { timeout: 60000 });

        let patchCode = defenseRes.data?.choices?.[0]?.message?.content?.trim() || '';
        patchCode = patchCode.replace(/^```[a-z]*\n/gm, '').replace(/```$/gm, '');

        if (patchCode) {
            await fs.mkdir(MIDDLEWARE_DIR, { recursive: true });
            const timestamp = Date.now();
            const patchFile = path.join(MIDDLEWARE_DIR, `auto_defense_${timestamp}.js`);
            await fs.writeFile(patchFile, patchCode, 'utf8');
            console.log(`🔵 [BLUE TEAM] Defense successful! Middleware saved to: ${patchFile}`);
            return patchFile;
        }
    } catch (error) {
        console.error(`🔵 [BLUE TEAM] Failed to write defense: ${error.message}`);
    }
    return null;
}

async function startWarfare() {
    console.log('⚔️  [BATTLE ARENA] Initializing Auto-Warfare Sequence...\n======================================================');

    // 1. Red Team Attack
    const attackPayload = await runRedTeam();
    if (!attackPayload) return;

    const preLogSize = await getLogSize();
    let crashed = false;
    let statusCode = null;

    console.log(`🚀 Firing payload at ${TARGET_API}...`);
    try {
        const response = await axios.post(TARGET_API, attackPayload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000,
            validateStatus: () => true
        });
        statusCode = response.status;
        console.log(`🛡️  Server responded with status: ${statusCode}`);
        if (statusCode >= 500) crashed = true;
    } catch (error) {
        console.error(`💀 Server connection died or timed out: ${error.message}`);
        crashed = true;
    }

    // Give logs a moment to write
    await new Promise(r => setTimeout(r, 1000));

    // 2. Assess Damage
    console.log('🕵️‍♂️ Analyzing battle logs...');
    const postLogSize = await getLogSize();
    const newLogs = await getRecentLogs(preLogSize, postLogSize);

    const isUnhandled = newLogs.some(line => line.includes('UnhandledPromiseRejection') || line.includes('TypeError') || line.includes('ReferenceError') || line.includes('SIGTERM') || line.includes('EADDRINUSE') || line.includes('FATAL'));

    // 3. Blue Team Defense
    if (crashed || isUnhandled) {
        console.log('🚨 [STATUS] Critical Vulnerability Detected!');
        const defenseFile = await runBlueTeam(attackPayload, newLogs);

        console.log('\n======================================================');
        console.log('📜 BATTLE REPORT: RED TEAM VICTORY (TEMPORARY)');
        console.log(`- Attack Payload: Deployed successfully.`);
        console.log(`- Server Status: Compromised (Crash or 5xx error).`);
        console.log(`- Blue Team Response: Auto-patch created at ${defenseFile}`);
    } else {
        console.log('\n======================================================');
        console.log('📜 BATTLE REPORT: BLUE TEAM VICTORY');
        console.log(`- Attack Payload: Blocked or handled gracefully.`);
        console.log(`- Server Status: Resilient (Status ${statusCode}).`);
        console.log(`- Action Required: None.`);
    }
}

// Execute the loop once per run
startWarfare();
