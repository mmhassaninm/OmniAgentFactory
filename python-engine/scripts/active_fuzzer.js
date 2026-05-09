import Docker from 'dockerode';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const DRAFTS_DIR = path.join(PROJECT_ROOT, 'backend', '.vibelab_drafts');
const LLM_API = 'http://127.0.0.1:1234/v1/chat/completions';
const FUZZ_PORT = 5555;

if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

const docker = new Docker();

// ─────────────────────────────────────────────
// Phase 1: Spin up the backend in a Docker container
// ─────────────────────────────────────────────
async function spinUpContainer() {
    console.log('🐳 [FUZZER] Building and starting isolated backend container...');

    const container = await docker.createContainer({
        Image: 'node:18-alpine',
        Cmd: ['sh', '-c', 'cd /app && npm install --production --silent 2>/dev/null && node backend/server.js'],
        ExposedPorts: { '5000/tcp': {} },
        HostConfig: {
            Binds: [`${PROJECT_ROOT}:/app`],
            PortBindings: { '5000/tcp': [{ HostPort: String(FUZZ_PORT) }] }
        },
        Env: [
            'PORT=5000',
            'MONGODB_URI=mongodb://host.docker.internal:27017/vibelab_fuzz_test',
            'NODE_ENV=test'
        ],
        WorkingDir: '/app'
    });

    await container.start();
    console.log(`🐳 [FUZZER] Container started. Backend exposed on port ${FUZZ_PORT}`);

    // Wait for the server to boot
    console.log('⏳ [FUZZER] Waiting 8 seconds for server boot...');
    await new Promise(resolve => setTimeout(resolve, 8000));

    return container;
}

// ─────────────────────────────────────────────
// Phase 2: Ask LLM to generate attack payloads
// ─────────────────────────────────────────────
async function generateAttackPayloads() {
    console.log('🧠 [FUZZER] Asking Red Team LLM to generate attack payloads...');

    const redTeamPrompt = `You are an elite Red Team penetration tester. Generate exactly 5 highly sophisticated, real-world attack payloads targeting a Node.js/Express/MongoDB backend. Include:
1. A MongoDB NoSQL Injection payload targeting a login endpoint (/api/auth/login).
2. A JSON Prototype Pollution payload targeting a settings update endpoint (/api/settings).
3. A Server-Side Request Forgery (SSRF) payload targeting a URL-based tool endpoint (/api/tools).
4. A Remote Code Execution (RCE) attempt via a code execution endpoint (/api/chat).
5. A Path Traversal payload targeting a file read endpoint (/api/chat).

Output ONLY a valid JSON array. Each element must have: { "name": "...", "method": "POST|GET", "path": "/api/...", "body": {...}, "headers": {...} }. Do NOT include markdown or any text outside the JSON array.`;

    try {
        const response = await axios.post(LLM_API, {
            model: 'qwen2.5-coder-7b-instruct',
            messages: [
                { role: 'system', content: 'You are a security expert. Output only valid JSON.' },
                { role: 'user', content: redTeamPrompt }
            ],
            temperature: 0.4,
            max_tokens: 3000
        }, { timeout: 60000 });

        let reply = response.data?.choices?.[0]?.message?.content?.trim();
        if (!reply) throw new Error('Empty LLM response');

        // Strip markdown fences
        if (reply.startsWith('```json')) reply = reply.substring(7);
        if (reply.startsWith('```')) reply = reply.substring(3);
        if (reply.endsWith('```')) reply = reply.substring(0, reply.length - 3);
        reply = reply.trim();

        const payloads = JSON.parse(reply);
        console.log(`🎯 [FUZZER] Generated ${payloads.length} attack payloads.`);
        return payloads;

    } catch (err) {
        console.error(`🛑 [FUZZER] Failed to generate payloads: ${err.message}`);
        return [];
    }
}

// ─────────────────────────────────────────────
// Phase 3: Fire payloads at the container
// ─────────────────────────────────────────────
async function firePayloads(payloads, container) {
    const crashes = [];

    for (let i = 0; i < payloads.length; i++) {
        const p = payloads[i];
        console.log(`\n🔫 [FUZZER] Firing payload ${i + 1}/${payloads.length}: "${p.name}"...`);
        console.log(`   Method: ${p.method} | Path: ${p.path}`);

        try {
            const config = {
                method: (p.method || 'POST').toLowerCase(),
                url: `http://localhost:${FUZZ_PORT}${p.path}`,
                data: p.body || undefined,
                headers: { 'Content-Type': 'application/json', ...(p.headers || {}) },
                timeout: 10000,
                validateStatus: () => true // Don't throw on any HTTP status
            };

            const res = await axios(config);

            if (res.status >= 500) {
                console.log(`   🚨 SERVER ERROR ${res.status}! Capturing crash data...`);

                // Capture container logs
                let containerLogs = '';
                try {
                    const logStream = await container.logs({ stdout: true, stderr: true, tail: 50 });
                    containerLogs = logStream.toString('utf8');
                } catch (logErr) {
                    containerLogs = `[LOG CAPTURE FAILED]: ${logErr.message}`;
                }

                crashes.push({
                    payload: p,
                    statusCode: res.status,
                    responseBody: typeof res.data === 'string' ? res.data.substring(0, 2000) : JSON.stringify(res.data).substring(0, 2000),
                    logs: containerLogs
                });
            } else {
                console.log(`   ✅ Response: ${res.status} — Server held.`);
            }

        } catch (reqErr) {
            console.log(`   💀 Request failed (possible container crash): ${reqErr.message}`);

            // Check if container is still alive
            try {
                const info = await container.inspect();
                if (!info.State.Running) {
                    console.log('   🐳 Container is DOWN. Capturing crash data...');
                    crashes.push({
                        payload: p,
                        statusCode: 'CONTAINER_CRASH',
                        responseBody: reqErr.message,
                        logs: 'Container terminated unexpectedly.'
                    });
                    // Restart container for remaining payloads
                    try {
                        await container.restart();
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    } catch (restartErr) {
                        console.log('   ⚠️ Could not restart container.');
                    }
                }
            } catch (inspectErr) {
                crashes.push({
                    payload: p,
                    statusCode: 'INSPECT_FAILED',
                    responseBody: reqErr.message,
                    logs: inspectErr.message
                });
            }
        }
    }

    return crashes;
}

// ─────────────────────────────────────────────
// Phase 4: Ask Blue Team LLM for patches
// ─────────────────────────────────────────────
async function generatePatches(crashes) {
    if (crashes.length === 0) {
        console.log('\n✅ [FUZZER] No crashes detected. Backend is resilient!');
        return;
    }

    console.log(`\n🛡️ [FUZZER] ${crashes.length} crash(es) detected. Consulting Blue Team LLM for patches...`);

    for (let i = 0; i < crashes.length; i++) {
        const crash = crashes[i];
        console.log(`\n🔧 [FUZZER] Generating patch for crash ${i + 1}: "${crash.payload.name}"...`);

        const blueTeamPrompt = `You are a Blue Team expert. The server crashed with this attack:

PAYLOAD:
${JSON.stringify(crash.payload, null, 2)}

HTTP STATUS: ${crash.statusCode}

SERVER LOG (last 50 lines):
${crash.logs}

Write a bulletproof Express.js middleware using AST patch principles to block this specific attack vector. The middleware should:
1. Validate and sanitize the incoming request.
2. Block the specific attack pattern.
3. Log the blocked attempt.
4. Return a 403 Forbidden response.

Output ONLY the complete, valid JavaScript middleware code. Do not include markdown fences or any other text.`;

        try {
            const response = await axios.post(LLM_API, {
                model: 'qwen2.5-coder-7b-instruct',
                messages: [
                    { role: 'system', content: 'You are a cybersecurity defense expert. Output only valid JavaScript code.' },
                    { role: 'user', content: blueTeamPrompt }
                ],
                temperature: 0.2,
                max_tokens: 2000
            }, { timeout: 60000 });

            let patch = response.data?.choices?.[0]?.message?.content?.trim();
            if (!patch) {
                console.log('   ⚠️ Empty response from Blue Team LLM.');
                continue;
            }

            // Strip markdown fences if present
            if (patch.startsWith('```javascript')) patch = patch.substring(13);
            if (patch.startsWith('```js')) patch = patch.substring(5);
            if (patch.startsWith('```')) patch = patch.substring(3);
            if (patch.endsWith('```')) patch = patch.substring(0, patch.length - 3);
            patch = patch.trim();

            const patchFileName = `FUZZ_PATCH_${Date.now()}_${i}.js`;
            const patchPath = path.join(DRAFTS_DIR, patchFileName);
            fs.writeFileSync(patchPath, `// Auto-generated Blue Team Patch for: ${crash.payload.name}\n// Attack Vector: ${crash.payload.method} ${crash.payload.path}\n// Generated: ${new Date().toISOString()}\n\n${patch}`, 'utf8');

            console.log(`   📝 Patch saved: ${patchFileName}`);

        } catch (patchErr) {
            console.error(`   🛑 Blue Team LLM failed: ${patchErr.message}`);
        }
    }
}

// ─────────────────────────────────────────────
// Phase 5: Cleanup
// ─────────────────────────────────────────────
async function cleanup(container) {
    console.log('\n🧹 [FUZZER] Cleaning up Docker container...');
    try {
        await container.stop({ t: 2 });
    } catch (e) { /* Already stopped */ }
    try {
        await container.remove({ force: true });
    } catch (e) { /* Already removed */ }
    console.log('🧹 [FUZZER] Container destroyed.');
}

// ─────────────────────────────────────────────
// Main Orchestrator
// ─────────────────────────────────────────────
async function runFuzzer() {
    console.log('═══════════════════════════════════════════════');
    console.log('  🔥 VibeLab Active Fuzzing Sandbox v1.0');
    console.log('  ⚔️  Red Team Attack → Blue Team Patch');
    console.log('═══════════════════════════════════════════════\n');

    let container = null;

    try {
        // Phase 1: Spin up
        container = await spinUpContainer();

        // Phase 2: Generate attacks
        const payloads = await generateAttackPayloads();
        if (payloads.length === 0) {
            console.log('🛑 [FUZZER] No payloads generated. Aborting.');
            if (container) await cleanup(container);
            return;
        }

        // Phase 3: Fire
        const crashes = await firePayloads(payloads, container);

        // Phase 4: Patch
        await generatePatches(crashes);

    } catch (err) {
        console.error(`\n💀 [FUZZER FATAL] ${err.message}`);
    } finally {
        // Phase 5: Cleanup
        if (container) await cleanup(container);
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('  🏁 Fuzzing complete. Check .vibelab_drafts/');
    console.log('═══════════════════════════════════════════════');
}

runFuzzer();
