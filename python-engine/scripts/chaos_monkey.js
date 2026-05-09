import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const __dirname = path.resolve();
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'Project_Docs', 'Logs', 'vibelab_debug.log');
const DRAFTS_DIR = path.join(PROJECT_ROOT, '.vibelab_drafts');
const LOCAL_LLM = 'http://127.0.0.1:1234/v1/chat/completions';
const MODEL = 'qwen2.5-coder-7b-instruct'; // Fallback local model

// Add your local VibeLab API endpoint here. 
// Assuming chat endpoint for testing, requiring a valid chat ID if needed, 
// but we'll try a generic or malformed route to see how the server handles it.
// We'll target the main API root or a known route. 
const TARGET_API = 'http://localhost:5000/api/chat/12345/message';

// We need a dummy token if auth is enforced, or we test public endpoints
// For chaos, we'll try sending bad payloads.
const ATTACKS = [
    { name: 'Massive Payload (20k chars)', payload: { message: 'A'.repeat(20000) } },
    { name: 'Invalid JSON', payload: '{"message": "broken JSON' }, // Axios will stringify this if set as string, but let's force bad headers later
    { name: 'SQL Injection String', payload: { message: "'; DROP TABLE users; --" } },
    { name: 'NoSQL Injection Object', payload: { message: { $ne: null } } },
    { name: 'XSS Script Injection', payload: { message: "<script>alert('xss')</script>" } }
];

async function runChaos() {
    console.log('🐒 [CHAOS MONKEY] Waking up... starting resilience test.');

    const preLogSize = await getLogSize();
    let crashed = false;
    let failedAttack = null;

    for (const attack of ATTACKS) {
        console.log(`🧨 [CHAOS MONKEY] Sending attack: ${attack.name}`);
        try {
            // We set validateStatus to always resolve so we don't throw on 400/500
            // We want to see how the server handles it (ideally 400 or 403, not a crash/timeout)
            await axios.post(TARGET_API, attack.payload, {
                headers: {
                    'Content-Type': typeof attack.payload === 'string' ? 'text/plain' : 'application/json',
                    'Authorization': 'Bearer CHAOS_MONKEY_TOKEN'
                },
                timeout: 5000,
                validateStatus: () => true
            });
            console.log(`🛡️  Server responded to ${attack.name}.`);
        } catch (error) {
            console.error(`💀 [CHAOS MONKEY] Server failed to respond to ${attack.name}: ${error.message}`);
            crashed = true;
            failedAttack = attack;
            break; // Stop if the server completely died
        }

        // Brief pause between attacks
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('🕵️‍♂️ [CHAOS MONKEY] Analyzing logs for unhandled exceptions...');
    const postLogSize = await getLogSize();
    const newLogs = await getRecentLogs(preLogSize, postLogSize);

    const isUnhandled = newLogs.some(line => line.includes('UnhandledPromiseRejection') || line.includes('TypeError') || line.includes('ReferenceError') || line.includes('SIGTERM') || line.includes('EADDRINUSE') || line.includes('FATAL'));

    if (crashed || isUnhandled) {
        const trigger = failedAttack ? failedAttack.name : 'Multiple Attacks';
        console.log(`🚨 [CHAOS MONKEY] Vulnerability detected! Trigger: ${trigger}`);
        console.log(`🧠 [CHAOS MONKEY] Consulting local Security Engineer LLM for a patch...`);

        await generateSecurityPatch(trigger, newLogs.slice(-20).join('\n'));
    } else {
        console.log('✅ [CHAOS MONKEY] Server is resilient. No critical crashes detected in logs.');
    }
}

async function getLogSize() {
    try {
        const stats = await fs.stat(LOG_FILE);
        return stats.size;
    } catch {
        return 0; // Log doesn't exist yet
    }
}

async function getRecentLogs(startBytes, endBytes) {
    if (endBytes <= startBytes) return [];
    try {
        const content = await fs.readFile(LOG_FILE, 'utf8');
        // A very naive way to get recent logs. A robust way would use streams and bytes.
        // For this script, reading the whole file and tailing it is okay if it's not huge.
        const lines = content.split('\n');
        return lines.slice(-50); // Just check the last 50 lines for errors
    } catch {
        return [];
    }
}

async function generateSecurityPatch(attackName, errorLogs) {
    try {
        const prompt = `You are an elite Node.js Security Engineer. 
The VibeLab Express server failed or threw an exception when hit with the following attack: [${attackName}].
Recent error logs show:
${errorLogs}

Write a robust Node.js middleware or specific patch to completely block this vulnerability. 
Ensure the middleware gracefully returns a 400 or 403 error instead of crashing.
Output ONLY the JavaScript code (no markdown blocks, no explanations, just the raw code) so it can be saved directly.`;

        const payload = {
            model: MODEL,
            messages: [{ role: 'system', content: prompt }],
            max_tokens: 1500,
            temperature: 0.2
        };

        const response = await axios.post(LOCAL_LLM, payload, {
            timeout: 60000,
            headers: { 'Content-Type': 'application/json' }
        });

        let patchCode = response.data?.choices?.[0]?.message?.content?.trim() || '';

        // Strip markdown blocks if the LLM ignored the instruction
        patchCode = patchCode.replace(/^```[a-z]*\n/gm, '').replace(/```$/gm, '');

        if (patchCode) {
            await fs.mkdir(DRAFTS_DIR, { recursive: true });
            const patchFile = path.join(DRAFTS_DIR, 'SECURITY_PATCH.tmp');
            await fs.writeFile(patchFile, patchCode, 'utf8');
            console.log(`🛡️ [CHAOS MONKEY] Security patch generated and saved to: ${patchFile}`);
            console.log(`👉 Please review the draft and implement it in server.js or your middleware folder.`);
        } else {
            console.log(`⚠️ [CHAOS MONKEY] LLM failed to generate a patch.`);
        }
    } catch (error) {
        console.error(`❌ [CHAOS MONKEY] Failed to generate patch via LLM: ${error.message}`);
    }
}

// Execute
runChaos();
